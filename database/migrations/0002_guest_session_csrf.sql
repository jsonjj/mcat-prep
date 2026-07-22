-- Durable guest-session CSRF binding and rotation invariants.
-- Nullable preserves legacy repository-created sessions; the learner API treats
-- those rows as invalid because they cannot prove an independent CSRF secret.

alter table guest_sessions
  add column csrf_token_hash text;

alter table guest_sessions
  add constraint guest_sessions_csrf_token_hash_format
  check (csrf_token_hash is null or csrf_token_hash ~ '^[0-9a-f]{64}$');

alter table guest_sessions
  add constraint guest_sessions_rotation_state
  check (
    rotated_to_session_id is null
    or (
      revoked_at is not null
      and rotated_to_session_id <> guest_session_id
    )
  );

create index guest_sessions_active_learner_created_idx
  on guest_sessions (learner_id, created_at desc)
  where revoked_at is null;

create table api_rate_limits (
  rate_key text not null check (rate_key ~ '^[0-9a-f]{24,64}$'),
  route text not null check (length(route) between 2 and 128),
  method text not null check (method in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null,
  primary key (rate_key, route, method, window_started_at),
  check (updated_at >= window_started_at)
);

create index api_rate_limits_window_started_at_idx
  on api_rate_limits (window_started_at);
