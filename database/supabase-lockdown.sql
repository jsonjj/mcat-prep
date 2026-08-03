-- Take the learner schema out of reach of Supabase's auto-generated REST API.
--
-- Only needed when the authority schema lives in a Supabase project (local dev).
-- Aurora has no PostgREST in front of it, so this is a no-op there.
--
-- Supabase exposes the `public` schema over PostgREST to the `anon` and
-- `authenticated` roles, and the anon/publishable key is designed to ship inside
-- the browser bundle. Our migrations create unqualified tables, so without this
-- every learner row -- progress in `learner_streams`, session hashes in
-- `guest_sessions` -- is readable and writable by anyone who opens devtools.
--
-- The learner API does not go through PostgREST. It connects as the owning role
-- over a normal Postgres connection, so revoking these grants costs us nothing.
--
-- Safe to re-run.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke usage on schema public from anon, authenticated;

-- Migrations run later would otherwise arrive with the default grants restored,
-- silently reopening what this file just closed.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- Defence in depth. Should the grants above ever be restored -- by Supabase
-- tooling, a dashboard action, or a careless migration -- row-level security
-- with no policy attached still denies every non-superuser. The API is
-- unaffected because it connects as the table owner.
do $$
declare
  target record;
begin
  for target in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', target.tablename);
  end loop;
end
$$;
