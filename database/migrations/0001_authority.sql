-- MCAT Mastery authoritative data baseline.
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.

create table learners (
  learner_id uuid primary key,
  account_state text not null check (account_state in ('guest', 'linked', 'recovering')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (updated_at >= created_at)
);

create table linked_identities (
  linked_identity_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  provider text not null,
  provider_subject text not null,
  linked_at timestamptz not null,
  last_authenticated_at timestamptz,
  unique (provider, provider_subject),
  unique (learner_id, provider),
  check (last_authenticated_at is null or last_authenticated_at >= linked_at)
);

create index linked_identities_learner_id_idx
  on linked_identities (learner_id);

create table guest_sessions (
  guest_session_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  session_hash text not null unique check (session_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null,
  last_seen_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  rotated_to_session_id uuid references guest_sessions (guest_session_id) on delete set null,
  check (last_seen_at >= created_at),
  check (expires_at > created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create index guest_sessions_learner_id_idx
  on guest_sessions (learner_id);
create index guest_sessions_active_expiry_idx
  on guest_sessions (expires_at)
  where revoked_at is null;
create index guest_sessions_rotated_to_session_id_idx
  on guest_sessions (rotated_to_session_id)
  where rotated_to_session_id is not null;

create table consents (
  consent_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  purpose text not null,
  document_version text not null,
  status text not null check (status in ('granted', 'withdrawn')),
  recorded_at timestamptz not null,
  source text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (learner_id, purpose, document_version, recorded_at)
);

create index consents_learner_purpose_recorded_idx
  on consents (learner_id, purpose, recorded_at desc);

create table goals (
  goal_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  goal_type text not null check (goal_type in ('rolling', 'scheduled')),
  target_date date,
  target_score integer check (target_score between 472 and 528),
  weekly_minutes integer not null check (weekly_minutes between 0 and 10080),
  timezone text not null,
  created_at timestamptz not null,
  superseded_at timestamptz,
  check (
    (goal_type = 'scheduled' and target_date is not null)
    or (goal_type = 'rolling' and target_date is null)
  ),
  check (superseded_at is null or superseded_at >= created_at)
);

create unique index goals_one_current_per_learner_idx
  on goals (learner_id)
  where superseded_at is null;
create index goals_learner_created_idx
  on goals (learner_id, created_at desc);

create table learner_streams (
  learner_id uuid primary key references learners (learner_id) on delete cascade,
  current_sequence bigint not null default 0 check (current_sequence >= 0),
  projection_version text not null,
  state_json jsonb not null check (jsonb_typeof(state_json) = 'object'),
  updated_at timestamptz not null
);

create table accepted_events (
  event_id uuid not null,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 1 and 256),
  sequence bigint not null check (sequence > 0),
  accepted_at timestamptz not null,
  event_type text not null,
  content_release text not null,
  policy_versions jsonb not null check (jsonb_typeof(policy_versions) = 'object'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  unique (event_id),
  unique (learner_id, idempotency_key),
  unique (learner_id, sequence)
);

create index accepted_events_learner_accepted_idx
  on accepted_events (learner_id, accepted_at desc);
create index accepted_events_content_release_idx
  on accepted_events (content_release);

create table attempt_results (
  attempt_result_id uuid primary key,
  event_id uuid not null references accepted_events (event_id) on delete cascade,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  task_instance_id uuid not null,
  content_version_id text not null,
  item_family_id text not null,
  assistance_level text not null check (assistance_level in ('A0', 'A1', 'A2', 'A3')),
  is_correct boolean not null,
  eligible_for_mastery boolean not null,
  conditions jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions) = 'object'),
  recorded_at timestamptz not null,
  unique (event_id),
  unique (learner_id, task_instance_id, event_id)
);

create index attempt_results_learner_recorded_idx
  on attempt_results (learner_id, recorded_at desc);
create index attempt_results_content_version_idx
  on attempt_results (content_version_id);
create index attempt_results_item_family_idx
  on attempt_results (item_family_id);

create table checkpoints (
  checkpoint_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  task_instance_id uuid not null,
  content_release text not null,
  checkpoint_version text not null,
  state_json jsonb not null check (jsonb_typeof(state_json) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz,
  unique (learner_id, task_instance_id),
  check (updated_at >= created_at),
  check (completed_at is null or completed_at >= created_at)
);

create index checkpoints_learner_unfinished_idx
  on checkpoints (learner_id, updated_at desc)
  where completed_at is null;

create table evidence_dispositions (
  evidence_disposition_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  source_event_id uuid not null references accepted_events (event_id) on delete cascade,
  disposition text not null check (disposition in ('eligible', 'ineligible', 'superseded', 'corrected')),
  reason_code text not null,
  content_release text not null,
  policy_version text not null,
  recorded_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (source_event_id, disposition, reason_code, policy_version)
);

create index evidence_dispositions_learner_recorded_idx
  on evidence_dispositions (learner_id, recorded_at desc);
create index evidence_dispositions_source_event_id_idx
  on evidence_dispositions (source_event_id);

create table mastery_projections (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  skill_id text not null,
  mastery_state text not null check (
    mastery_state in ('not_assessed', 'foundation_needed', 'learning', 'independent', 'retained', 'strong')
  ),
  refresh_needed boolean not null default false,
  last_consumed_sequence bigint not null check (last_consumed_sequence >= 0),
  projection_version text not null,
  state_json jsonb not null check (jsonb_typeof(state_json) = 'object'),
  updated_at timestamptz not null,
  primary key (learner_id, skill_id)
);

create index mastery_projections_skill_state_idx
  on mastery_projections (skill_id, mastery_state);

create table plan_projections (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  plan_date date not null,
  last_consumed_sequence bigint not null check (last_consumed_sequence >= 0),
  projection_version text not null,
  plan_json jsonb not null check (jsonb_typeof(plan_json) = 'object'),
  updated_at timestamptz not null,
  primary key (learner_id, plan_date)
);

create index plan_projections_plan_date_idx
  on plan_projections (plan_date);

create table review_projections (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  review_key text not null,
  due_at timestamptz not null,
  last_consumed_sequence bigint not null check (last_consumed_sequence >= 0),
  projection_version text not null,
  state_json jsonb not null check (jsonb_typeof(state_json) = 'object'),
  updated_at timestamptz not null,
  primary key (learner_id, review_key)
);

create index review_projections_learner_due_idx
  on review_projections (learner_id, due_at);

create table error_projections (
  learner_id uuid not null references learners (learner_id) on delete cascade,
  error_key text not null,
  status text not null check (status in ('open', 'weakened', 'closed')),
  last_consumed_sequence bigint not null check (last_consumed_sequence >= 0),
  projection_version text not null,
  state_json jsonb not null check (jsonb_typeof(state_json) = 'object'),
  updated_at timestamptz not null,
  primary key (learner_id, error_key)
);

create index error_projections_learner_status_idx
  on error_projections (learner_id, status);

create table content_releases (
  release_id text primary key,
  environment text not null check (environment in ('dev', 'staging', 'production')),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  lifecycle text not null check (lifecycle in ('candidate', 'active', 'superseded', 'suspended', 'rolled_back')),
  created_at timestamptz not null,
  activated_at timestamptz,
  synthetic_only boolean not null default false,
  unique (environment, release_id),
  unique (release_id, manifest_hash),
  check (activated_at is null or activated_at >= created_at),
  check (environment <> 'production' or synthetic_only = false)
);

create unique index content_releases_one_active_per_environment_idx
  on content_releases (environment)
  where lifecycle = 'active';
create index content_releases_environment_created_idx
  on content_releases (environment, created_at desc);

create table content_objects (
  content_version_id text primary key,
  logical_id text not null,
  release_id text not null references content_releases (release_id) on delete restrict,
  schema_version text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  protection_class text not null check (
    protection_class in ('public_safe', 'learner_safe', 'authorized_delivery', 'protected', 'server_admin_only')
  ),
  lifecycle text not null check (lifecycle in ('draft', 'reviewed', 'active', 'retired', 'suspended')),
  storage_key text not null,
  created_at timestamptz not null,
  unique (logical_id, content_version_id),
  unique (content_version_id, content_hash),
  unique (release_id, storage_key)
);

create index content_objects_release_id_idx
  on content_objects (release_id);
create index content_objects_logical_id_idx
  on content_objects (logical_id);

create table delivery_grants (
  delivery_grant_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  content_version_id text not null references content_objects (content_version_id) on delete restrict,
  task_instance_id uuid not null,
  granted_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  unique (learner_id, task_instance_id, content_version_id),
  check (expires_at > granted_at),
  check (consumed_at is null or consumed_at >= granted_at)
);

create index delivery_grants_learner_expiry_idx
  on delivery_grants (learner_id, expires_at);
create index delivery_grants_content_version_id_idx
  on delivery_grants (content_version_id);

create table publication_runs (
  publication_run_id uuid primary key,
  release_id text not null references content_releases (release_id) on delete restrict,
  environment text not null check (environment in ('dev', 'staging', 'production')),
  status text not null check (status in ('queued', 'validating', 'awaiting_approval', 'activating', 'succeeded', 'failed')),
  requested_by text not null,
  requested_at timestamptz not null,
  completed_at timestamptz,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  result_json jsonb not null default '{}'::jsonb check (jsonb_typeof(result_json) = 'object'),
  check (completed_at is null or completed_at >= requested_at)
);

create index publication_runs_release_id_idx
  on publication_runs (release_id);
create index publication_runs_environment_status_idx
  on publication_runs (environment, status, requested_at desc);

create table review_attestations (
  review_attestation_id uuid primary key,
  content_version_id text not null references content_objects (content_version_id) on delete restrict,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  reviewer_id text not null,
  reviewer_role text not null check (
    reviewer_role in ('blind_solver', 'science', 'item_quality', 'copy_accessibility_rights', 'psychometric', 'publisher')
  ),
  disposition text not null check (disposition in ('approved', 'rejected', 'withdrawn')),
  attested_at timestamptz not null,
  unique (content_version_id, content_hash, reviewer_id, reviewer_role)
);

create index review_attestations_content_version_id_idx
  on review_attestations (content_version_id);

create table outbox (
  outbox_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  topic text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null,
  published_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  unique (learner_id, sequence, topic),
  check (published_at is null or published_at >= created_at)
);

create index outbox_unpublished_created_idx
  on outbox (created_at, outbox_id)
  where published_at is null;
create index outbox_learner_sequence_idx
  on outbox (learner_id, sequence);

create table inbox_deduplication (
  consumer_name text not null,
  message_id text not null,
  learner_id uuid references learners (learner_id) on delete cascade,
  sequence bigint check (sequence is null or sequence > 0),
  consumed_at timestamptz not null,
  primary key (consumer_name, message_id)
);

create index inbox_deduplication_learner_sequence_idx
  on inbox_deduplication (learner_id, sequence)
  where learner_id is not null;

create table privacy_jobs (
  privacy_job_id uuid primary key,
  learner_id uuid references learners (learner_id) on delete set null,
  learner_reference_hash text not null check (learner_reference_hash ~ '^[0-9a-f]{64}$'),
  job_type text not null check (job_type in ('export', 'delete')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  requested_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  artifact_key text,
  error_code text,
  check (started_at is null or started_at >= requested_at),
  check (completed_at is null or completed_at >= requested_at),
  check (job_type = 'export' or artifact_key is null)
);

create index privacy_jobs_learner_requested_idx
  on privacy_jobs (learner_id, requested_at desc);
create index privacy_jobs_pending_idx
  on privacy_jobs (requested_at)
  where status in ('queued', 'running');

create table deletion_ledger (
  deletion_ledger_id uuid primary key,
  learner_reference_hash text not null unique check (learner_reference_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null,
  completed_at timestamptz not null,
  backup_reapply_required boolean not null default true,
  live_data_erased boolean not null,
  analytics_identity_removed boolean not null,
  check (completed_at >= requested_at)
);

create index deletion_ledger_completed_at_idx
  on deletion_ledger (completed_at desc);

create table push_subscriptions (
  push_subscription_id uuid primary key,
  learner_id uuid not null references learners (learner_id) on delete cascade,
  endpoint_hash text not null unique check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  encrypted_subscription jsonb not null check (jsonb_typeof(encrypted_subscription) = 'object'),
  created_at timestamptz not null,
  last_validated_at timestamptz,
  revoked_at timestamptz,
  check (last_validated_at is null or last_validated_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create index push_subscriptions_learner_active_idx
  on push_subscriptions (learner_id, created_at desc)
  where revoked_at is null;

create table audit_log (
  audit_id bigint generated always as identity primary key,
  occurred_at timestamptz not null,
  actor_type text not null check (actor_type in ('learner', 'staff', 'service', 'operator')),
  actor_id text not null,
  learner_id uuid references learners (learner_id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  request_id text,
  outcome text not null check (outcome in ('succeeded', 'denied', 'failed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index audit_log_occurred_at_idx
  on audit_log (occurred_at desc);
create index audit_log_actor_idx
  on audit_log (actor_type, actor_id, occurred_at desc);
create index audit_log_learner_idx
  on audit_log (learner_id, occurred_at desc)
  where learner_id is not null;
create index audit_log_resource_idx
  on audit_log (resource_type, resource_id, occurred_at desc);
