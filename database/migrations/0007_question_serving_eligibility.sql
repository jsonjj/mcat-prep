-- Fail-closed v7 question eligibility, deterministic selection, and exposure.
-- PostgreSQL 17 / Aurora PostgreSQL compatible.
--
-- No row from 0006 becomes eligible merely because it exists or validates.
-- A question is selectable only after an exact immutable serving version,
-- mappings, protected answer version, and all required review approvals are
-- materialized here and pass the repository's contextual policy gates.

create function question_choices_are_cue_safe(payload jsonb)
returns boolean
language plpgsql
immutable
strict
as $$
declare
  choice_key text;
begin
  if jsonb_typeof(payload) <> 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(payload)) <> 4 then
    return false;
  end if;
  foreach choice_key in array array['A', 'B', 'C', 'D']
  loop
    if jsonb_typeof(payload -> choice_key) <> 'string'
       or length(trim(payload ->> choice_key)) = 0 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create function question_explanations_are_complete(payload jsonb)
returns boolean
language plpgsql
immutable
strict
as $$
declare
  choice_key text;
begin
  if jsonb_typeof(payload) <> 'object' then
    return false;
  end if;
  if (select count(*) from jsonb_object_keys(payload)) <> 4 then
    return false;
  end if;
  foreach choice_key in array array['A', 'B', 'C', 'D']
  loop
    if jsonb_typeof(payload -> choice_key) <> 'string'
       or length(trim(payload ->> choice_key)) = 0 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create function question_assets_are_cue_safe(payload jsonb)
returns boolean
language plpgsql
immutable
strict
as $$
declare
  asset jsonb;
begin
  if jsonb_typeof(payload) <> 'array' then
    return false;
  end if;
  for asset in select value from jsonb_array_elements(payload)
  loop
    if jsonb_typeof(asset) <> 'object'
       or (select count(*) from jsonb_object_keys(asset)) <> 3
       or not (asset ?& array['url', 'alt_text', 'media_type'])
       or jsonb_typeof(asset -> 'url') <> 'string'
       or jsonb_typeof(asset -> 'alt_text') <> 'string'
       or jsonb_typeof(asset -> 'media_type') <> 'string'
       or length(trim(asset ->> 'url')) = 0
       or length(trim(asset ->> 'alt_text')) = 0
       or length(trim(asset ->> 'media_type')) = 0 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table question_serving_versions (
  question_id text not null references questions (question_id) on delete restrict,
  item_version integer not null check (item_version > 0),
  content_version integer not null check (content_version > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  content_release text not null check (length(trim(content_release)) > 0),
  content_published_at timestamptz not null,
  mapping_version integer not null check (mapping_version > 0),
  mapping_hash text not null check (mapping_hash ~ '^[0-9a-f]{64}$'),
  calibration_version integer check (calibration_version is null or calibration_version > 0),
  calibration_status text not null check (
    calibration_status in (
      'NOT_REVIEWED',
      'NOT_REQUIRED',
      'PROVISIONAL',
      'OPERATIONAL',
      'VALIDATED',
      'REJECTED'
    )
  ),
  primary_construct_type text not null check (
    primary_construct_type in ('KC', 'SKILL', 'LESSON', 'REASONING_OPERATION', 'TOPIC')
  ),
  primary_construct_id text not null check (length(trim(primary_construct_id)) > 0),
  joint_scoring_semantics text not null check (
    joint_scoring_semantics in ('PRIMARY_ONLY', 'PRIMARY_AND_REQUIRED_SECONDARIES')
  ),
  family_id text not null check (length(trim(family_id)) > 0),
  family_version integer not null check (family_version > 0),
  semantic_family_decision text not null check (
    semantic_family_decision in ('CONFIRMED', 'SPLIT_REQUIRED', 'NOT_REVIEWED')
  ),
  semantic_family_decision_version integer not null check (
    semantic_family_decision_version > 0
  ),
  stimulus_id text,
  stimulus_version integer check (stimulus_version is null or stimulus_version > 0),
  testlet_id text,
  testlet_version integer check (testlet_version is null or testlet_version > 0),
  local_dependence text not null check (
    local_dependence in ('INDEPENDENT', 'SHARED_STIMULUS', 'TESTLET')
  ),
  representation text not null check (length(trim(representation)) > 0),
  context_domain text not null check (length(trim(context_domain)) > 0),
  allowed_activity_roles text[] not null,
  allowed_evidence_modes text[] not null,
  rights_status text not null check (
    rights_status in ('NOT_REVIEWED', 'PENDING', 'CLEARED', 'RESTRICTED', 'REJECTED')
  ),
  model_processing_rights text not null check (
    model_processing_rights in ('NOT_REVIEWED', 'ALLOWED', 'PROHIBITED')
  ),
  rights_review_version integer not null check (rights_review_version > 0),
  accessibility_status text not null check (
    accessibility_status in (
      'NOT_REVIEWED',
      'PENDING',
      'EQUIVALENT',
      'REVIEWED_NO_ADAPTATION',
      'BLOCKED'
    )
  ),
  accessibility_equivalence_version integer not null check (
    accessibility_equivalence_version > 0
  ),
  accessibility_equivalence_hash text not null check (
    accessibility_equivalence_hash ~ '^[0-9a-f]{64}$'
  ),
  certification_state text not null check (
    certification_state in ('DRAFT', 'IN_REVIEW', 'CERTIFIED', 'REVOKED')
  ),
  publication_state text not null check (
    publication_state in ('UNPUBLISHED', 'PUBLISHED', 'WITHDRAWN')
  ),
  retirement_state text not null check (
    retirement_state in ('ACTIVE', 'RETIRED', 'QUARANTINED')
  ),
  asset_manifest_digest text not null check (asset_manifest_digest ~ '^[0-9a-f]{64}$'),
  asset_readiness text not null check (
    asset_readiness in ('NOT_REQUIRED', 'PENDING', 'READY', 'BLOCKED')
  ),
  source_ledger_digest text not null check (source_ledger_digest ~ '^[0-9a-f]{64}$'),
  review_report_digest text not null check (review_report_digest ~ '^[0-9a-f]{64}$'),
  learner_stem text not null check (length(trim(learner_stem)) > 0),
  learner_passage text not null,
  learner_choices jsonb not null check (question_choices_are_cue_safe(learner_choices)),
  learner_assets jsonb not null default '[]'::jsonb check (
    question_assets_are_cue_safe(learner_assets)
  ),
  materialized_at timestamptz not null default clock_timestamp(),
  primary key (question_id, item_version),
  unique (question_id, content_version),
  check (
    (
      calibration_status in ('NOT_REVIEWED', 'NOT_REQUIRED')
      and calibration_version is null
    )
    or (
      calibration_status in ('PROVISIONAL', 'OPERATIONAL', 'VALIDATED', 'REJECTED')
      and calibration_version is not null
    )
  ),
  check ((stimulus_id is null) = (stimulus_version is null)),
  check ((testlet_id is null) = (testlet_version is null)),
  check (
    (local_dependence = 'TESTLET' and testlet_id is not null)
    or (local_dependence <> 'TESTLET' and testlet_id is null)
  ),
  check (local_dependence <> 'SHARED_STIMULUS' or stimulus_id is not null),
  check (
    cardinality(allowed_activity_roles) > 0
    and array_position(allowed_activity_roles, null) is null
    and allowed_activity_roles <@ array[
      'INSTRUCTION',
      'GUIDED_PRACTICE',
      'INDEPENDENT_PRACTICE',
      'DIAGNOSTIC',
      'TRANSFER_CHECK',
      'REHEARSAL'
    ]::text[]
  ),
  check (
    cardinality(allowed_evidence_modes) > 0
    and array_position(allowed_evidence_modes, null) is null
    and allowed_evidence_modes <@ array[
      'NONE',
      'FORMATIVE',
      'MASTERY',
      'DIAGNOSTIC',
      'CALIBRATION',
      'REHEARSAL_ONLY'
    ]::text[]
  )
);

create index question_serving_versions_construct_idx
  on question_serving_versions (
    primary_construct_type,
    primary_construct_id,
    content_release,
    content_published_at
  );
create index question_serving_versions_family_idx
  on question_serving_versions (family_id, family_version);
create index question_serving_versions_stimulus_idx
  on question_serving_versions (stimulus_id, stimulus_version)
  where stimulus_id is not null;
create index question_serving_versions_testlet_idx
  on question_serving_versions (testlet_id, testlet_version)
  where testlet_id is not null;

create table question_version_mappings (
  question_id text not null,
  item_version integer not null,
  mapping_role text not null check (
    mapping_role in ('REQUIRED_SECONDARY', 'INCIDENTAL')
  ),
  construct_type text not null check (
    construct_type in ('KC', 'SKILL', 'LESSON', 'REASONING_OPERATION', 'TOPIC')
  ),
  construct_id text not null check (length(trim(construct_id)) > 0),
  joint_scored boolean not null,
  materialized_at timestamptz not null default clock_timestamp(),
  primary key (
    question_id,
    item_version,
    mapping_role,
    construct_type,
    construct_id
  ),
  foreign key (question_id, item_version)
    references question_serving_versions (question_id, item_version)
    on delete restrict,
  check (mapping_role <> 'REQUIRED_SECONDARY' or construct_type = 'KC'),
  check (mapping_role <> 'INCIDENTAL' or joint_scored = false)
);

create index question_version_mappings_construct_idx
  on question_version_mappings (construct_type, construct_id, mapping_role);

create table question_version_review_approvals (
  question_id text not null,
  item_version integer not null,
  review_scope text not null check (
    review_scope in (
      'CONTENT',
      'MAPPING',
      'FAMILY',
      'RIGHTS',
      'ACCESSIBILITY',
      'CERTIFICATION',
      'ASSETS',
      'SOURCE_PROVENANCE',
      'CALIBRATION'
    )
  ),
  reviewer_id text not null check (length(trim(reviewer_id)) > 0),
  approval_version integer not null check (approval_version > 0),
  approved_at timestamptz not null,
  approval_digest text not null check (approval_digest ~ '^[0-9a-f]{64}$'),
  materialized_at timestamptz not null default clock_timestamp(),
  primary key (question_id, item_version, review_scope),
  foreign key (question_id, item_version)
    references question_serving_versions (question_id, item_version)
    on delete restrict
);

create table question_protected_versions (
  question_id text not null,
  item_version integer not null,
  answer_version integer not null check (answer_version > 0),
  answer_hash text not null check (answer_hash ~ '^[0-9a-f]{64}$'),
  correct_answer text not null check (correct_answer in ('A', 'B', 'C', 'D')),
  explanations jsonb not null check (
    question_explanations_are_complete(explanations)
  ),
  materialized_at timestamptz not null default clock_timestamp(),
  primary key (question_id, item_version),
  foreign key (question_id, item_version)
    references question_serving_versions (question_id, item_version)
    on delete restrict
);

-- Appending one of these records immediately voids future selection, scoring,
-- and evidence use. Existing exposure records are deliberately untouched.
create table question_version_invalidations (
  invalidation_id uuid primary key,
  question_id text not null,
  item_version integer not null,
  invalidation_kind text not null check (
    invalidation_kind in ('INVALID', 'QUARANTINE')
  ),
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  report_digest text not null check (report_digest ~ '^[0-9a-f]{64}$'),
  invalidated_by text not null check (length(trim(invalidated_by)) > 0),
  invalidated_at timestamptz not null,
  unique (question_id, item_version, report_digest),
  foreign key (question_id, item_version)
    references question_serving_versions (question_id, item_version)
    on delete restrict
);

create index question_version_invalidations_version_idx
  on question_version_invalidations (question_id, item_version);

create table question_selection_requests (
  request_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  session_id uuid not null,
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  request_snapshot jsonb not null check (jsonb_typeof(request_snapshot) = 'object'),
  content_release text not null,
  content_cutoff timestamptz not null,
  policy_cutoff timestamptz not null,
  eligibility_policy_version text not null,
  selection_policy_version text not null,
  exposure_policy_version text not null,
  requested_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp()
);

create index question_selection_requests_learner_idx
  on question_selection_requests (learner_id, requested_at desc);

create table question_selection_receipts (
  receipt_id uuid primary key,
  request_id uuid not null unique references question_selection_requests (request_id)
    on delete cascade,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  request_digest text not null check (request_digest ~ '^[0-9a-f]{64}$'),
  candidate_set_digest text not null check (candidate_set_digest ~ '^[0-9a-f]{64}$'),
  decision_digest text not null check (decision_digest ~ '^[0-9a-f]{64}$'),
  selected_question_id text not null,
  selected_item_version integer not null,
  selected_content_version integer not null,
  selected_content_hash text not null check (selected_content_hash ~ '^[0-9a-f]{64}$'),
  selected_mapping_version integer not null,
  selected_mapping_hash text not null check (selected_mapping_hash ~ '^[0-9a-f]{64}$'),
  selected_family_id text not null,
  selected_family_version integer not null,
  selected_stimulus_id text,
  selected_stimulus_version integer,
  selected_testlet_id text,
  selected_testlet_version integer,
  exposure_mode text not null check (
    exposure_mode in ('FRESH_EVIDENCE', 'REHEARSAL_REUSE')
  ),
  selected_at timestamptz not null,
  foreign key (selected_question_id, selected_item_version)
    references question_serving_versions (question_id, item_version)
    on delete restrict,
  check ((selected_stimulus_id is null) = (selected_stimulus_version is null)),
  check ((selected_testlet_id is null) = (selected_testlet_version is null))
);

create index question_selection_receipts_learner_selected_idx
  on question_selection_receipts (learner_id, selected_at desc);

-- One permanent first-exposure reservation per learner and semantic family.
-- This is never deleted when an item is invalidated.
create table learner_question_family_reservations (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  family_id text not null,
  family_version integer not null check (family_version > 0),
  first_request_id uuid not null unique references question_selection_requests (request_id)
    on delete cascade,
  reserved_at timestamptz not null,
  primary key (learner_id, family_id)
);

-- Testlet/shared-stimulus identity is reserved independently of family identity
-- so local dependence cannot be bypassed by assigning sibling items new families.
create table learner_question_dependence_reservations (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  dependence_kind text not null check (
    dependence_kind in ('SHARED_STIMULUS', 'TESTLET')
  ),
  dependence_id text not null,
  dependence_version integer not null check (dependence_version > 0),
  first_request_id uuid not null references question_selection_requests (request_id)
    on delete cascade,
  reserved_at timestamptz not null,
  primary key (learner_id, dependence_kind, dependence_id)
);

create table question_presentations (
  presentation_id uuid primary key,
  request_id uuid not null unique references question_selection_requests (request_id)
    on delete cascade,
  receipt_id uuid not null unique references question_selection_receipts (receipt_id)
    on delete cascade,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  question_id text not null,
  item_version integer not null,
  family_id text not null,
  family_version integer not null check (family_version > 0),
  exposure_mode text not null check (
    exposure_mode in ('FRESH_EVIDENCE', 'REHEARSAL_REUSE')
  ),
  authorized_at timestamptz not null,
  foreign key (question_id, item_version)
    references question_serving_versions (question_id, item_version)
    on delete restrict
);

create index question_presentations_learner_authorized_idx
  on question_presentations (learner_id, authorized_at desc);

-- An authorization commits its exposure before any learner view can be returned.
create table question_family_exposures (
  exposure_id uuid primary key,
  presentation_id uuid not null unique references question_presentations (presentation_id)
    on delete cascade,
  receipt_id uuid not null unique references question_selection_receipts (receipt_id)
    on delete cascade,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  question_id text not null,
  item_version integer not null,
  family_id text not null,
  family_version integer not null check (family_version > 0),
  exposure_mode text not null check (
    exposure_mode in ('FRESH_EVIDENCE', 'REHEARSAL_REUSE')
  ),
  exposed_at timestamptz not null,
  foreign key (question_id, item_version)
    references question_serving_versions (question_id, item_version)
    on delete restrict
);

create index question_family_exposures_learner_family_idx
  on question_family_exposures (learner_id, family_id, exposed_at desc);

create function reject_immutable_question_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'immutable question-version records cannot be updated or deleted'
    using errcode = '55000';
end;
$$;

create trigger question_serving_versions_immutable
before update or delete on question_serving_versions
for each row execute function reject_immutable_question_version_mutation();

create trigger question_version_mappings_immutable
before update or delete on question_version_mappings
for each row execute function reject_immutable_question_version_mutation();

create trigger question_version_review_approvals_immutable
before update or delete on question_version_review_approvals
for each row execute function reject_immutable_question_version_mutation();

create trigger question_protected_versions_immutable
before update or delete on question_protected_versions
for each row execute function reject_immutable_question_version_mutation();

create function reject_mapping_insert_after_review()
returns trigger
language plpgsql
as $$
begin
  perform 1
  from question_serving_versions serving_version
  where serving_version.question_id = new.question_id
    and serving_version.item_version = new.item_version
  for update;

  if exists (
    select 1
    from question_version_review_approvals approval
    where approval.question_id = new.question_id
      and approval.item_version = new.item_version
      and approval.review_scope = 'MAPPING'
  ) then
    raise exception 'reviewed question mappings are closed to further inserts'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger question_version_mappings_close_after_review
before insert on question_version_mappings
for each row execute function reject_mapping_insert_after_review();

create function serialize_mapping_review_approval()
returns trigger
language plpgsql
as $$
begin
  if new.review_scope = 'MAPPING' then
    perform 1
    from question_serving_versions serving_version
    where serving_version.question_id = new.question_id
      and serving_version.item_version = new.item_version
    for update;
  end if;
  return new;
end;
$$;

create trigger question_mapping_review_approval_serialized
before insert on question_version_review_approvals
for each row execute function serialize_mapping_review_approval();

comment on table question_serving_versions is
  'Exact immutable reviewed serving projection; absence means ineligible.';
comment on table question_protected_versions is
  'SERVER-ONLY immutable answer material bound to question_id + item_version.';
comment on table question_selection_receipts is
  'Authority-private deterministic selection audit receipt; contains no answer material.';
comment on table question_family_exposures is
  'Append-only presentation exposure history retained across item invalidation.';
