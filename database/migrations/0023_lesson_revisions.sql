-- MCAT Mastery — canonical lesson revisions (build-a handoff import). Forward-only.
-- PostgreSQL 17 / Aurora PostgreSQL compatible. All timestamps are UTC instants.
--
-- WHY: the 111 canonical lessons arrive as an immutable, content-addressed handoff
-- (build-a). Their bytes live in content_objects (public + protected, keyed by
-- sha256 + protection_class under a candidate content_releases row); this migration
-- adds the RELATIONAL revision metadata the handoff carries so the deployed provider
-- can resolve a lesson to its objects, ordered KC membership, prerequisites,
-- attachments, and authored mastery definitions — never touching immutable bytes in
-- place.
--
-- IMMUTABILITY + IDEMPOTENCY (per IMPORT-RUNBOOK.md):
--   lesson revision idempotent key = (lesson_id, content_sha256)
--   content object idempotent key   = (sha256, protection_class), release-scoped
--   lesson receipt idempotent key   = (lesson_id, receipt_sha256)
-- On conflict the importer verifies identical bytes/identity and aborts on any
-- difference; nothing here is ever updated in place (all FKs on delete restrict).
--
-- PROTECTION: protected authority (answers/rationales/rejection/feedback) rides in
-- content_objects rows with protection_class 'protected'/'server_admin_only' and the
-- protected-authority archive; it is server-only. The learner-safe provider path
-- selects only is_protected = false objects (mirrors questions / question_protected).
--
-- content_objects / content_releases already exist (0001_authority.sql) and are
-- REUSED unchanged, except for one release-scoped idempotency index added below.

-- Release-scoped object idempotency: within a candidate release the same bytes at the
-- same protection class are one object (verify-or-abort). Release-scoped so a future
-- release can re-register identical bytes under its own release_id.
create unique index if not exists content_objects_release_hash_class_uidx
  on content_objects (release_id, content_hash, protection_class);

-- One immutable lesson revision. Keyed by (lesson_id, content_sha256) — the canonical
-- provider address — and bound to the candidate release it was imported under.
create table if not exists lesson_revisions (
  lesson_id text not null check (length(lesson_id) > 0),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  lesson_revision_id text not null check (length(lesson_revision_id) > 0),
  release_id text not null references content_releases (release_id) on delete restrict,
  cluster text not null check (length(cluster) > 0),
  section text,
  artifact_version text not null check (length(artifact_version) > 0),
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (lesson_id, content_sha256),
  unique (lesson_id, lesson_revision_id)
);

create index if not exists lesson_revisions_release_idx on lesson_revisions (release_id);
create index if not exists lesson_revisions_lesson_idx on lesson_revisions (lesson_id);

-- Each revision's content-addressed objects (16 public + 1 protected per lesson =
-- 17 x 111 = 1,887). Every object is a content_objects row; this maps it to its
-- lesson revision, package artifact path, and protection class.
create table if not exists lesson_revision_objects (
  lesson_id text not null,
  content_sha256 text not null,
  content_version_id text not null references content_objects (content_version_id) on delete restrict,
  artifact_path text not null check (length(artifact_path) > 0),
  package_path text not null check (length(package_path) > 0),
  protection_class text not null check (
    protection_class in ('public_safe', 'learner_safe', 'authorized_delivery', 'protected', 'server_admin_only')
  ),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size bigint not null check (size >= 0),
  mode text not null check (mode ~ '^[0-7]{4}$'),
  is_protected boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (lesson_id, content_sha256, artifact_path),
  foreign key (lesson_id, content_sha256)
    references lesson_revisions (lesson_id, content_sha256) on delete restrict,
  unique (content_version_id)
);

create index if not exists lesson_revision_objects_revision_idx
  on lesson_revision_objects (lesson_id, content_sha256);
-- Learner-safe listing path: never surface protected objects to the browser.
create index if not exists lesson_revision_objects_public_idx
  on lesson_revision_objects (lesson_id, content_sha256)
  where is_protected = false;

-- Ordered KC membership (definition metadata only; shares the mastery engine KC id space).
create table if not exists lesson_kc_membership (
  lesson_id text not null,
  content_sha256 text not null,
  position integer not null check (position >= 0),
  kc_id text not null check (length(kc_id) > 0),
  primary key (lesson_id, content_sha256, position),
  foreign key (lesson_id, content_sha256)
    references lesson_revisions (lesson_id, content_sha256) on delete restrict,
  unique (lesson_id, content_sha256, kc_id)
);

-- Hard (37) + helpful (19) prerequisite edges.
create table if not exists lesson_prerequisites (
  lesson_id text not null,
  content_sha256 text not null,
  prerequisite_lesson_id text not null check (length(prerequisite_lesson_id) > 0),
  kind text not null check (kind in ('hard', 'helpful')),
  primary key (lesson_id, content_sha256, prerequisite_lesson_id, kind),
  foreign key (lesson_id, content_sha256)
    references lesson_revisions (lesson_id, content_sha256) on delete restrict,
  check (prerequisite_lesson_id <> lesson_id)
);

-- Attachments / external bindings (154 rows). Two independent axes from the reviewed
-- attachment audit: required_delivery (71 required / 83 optional) and behavior (e.g.
-- explicit handoff / external binding). No answer bytes — provenance/binding metadata only.
create table if not exists lesson_attachments (
  lesson_id text not null,
  content_sha256 text not null,
  attachment_id text not null check (length(attachment_id) > 0),
  behavior text not null check (length(behavior) > 0),
  required_delivery boolean not null,
  authored_binding_count integer not null default 0 check (authored_binding_count >= 0),
  status text not null check (length(status) > 0),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (lesson_id, content_sha256, attachment_id),
  foreign key (lesson_id, content_sha256)
    references lesson_revisions (lesson_id, content_sha256) on delete restrict
);

-- Authored mastery/evidence DEFINITION metadata ONLY — never learner mastery/BKT/attempts.
create table if not exists lesson_mastery_definitions (
  lesson_id text not null,
  content_sha256 text not null,
  ordered_kc_count integer not null check (ordered_kc_count >= 0),
  mapped_count integer not null check (mapped_count >= 0),
  rejected_count integer not null check (rejected_count >= 0),
  write_semantics text not null check (length(write_semantics) > 0),
  definition jsonb not null default '{}'::jsonb check (jsonb_typeof(definition) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (lesson_id, content_sha256),
  foreign key (lesson_id, content_sha256)
    references lesson_revisions (lesson_id, content_sha256) on delete restrict
);

-- Provenance receipts. Idempotent key (lesson_id, receipt_sha256).
create table if not exists lesson_receipts (
  lesson_id text not null,
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  content_sha256 text not null,
  receipt jsonb not null default '{}'::jsonb check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (lesson_id, receipt_sha256),
  foreign key (lesson_id, content_sha256)
    references lesson_revisions (lesson_id, content_sha256) on delete restrict
);
