-- Function-execution lockdown and bounded rate-limit retention.
-- Runtime principals trigger cleanup through INSERT but never receive DELETE
-- or direct EXECUTE on the SECURITY DEFINER function.

revoke execute on all functions in schema public from public;
alter default privileges revoke execute on functions from public;

create function public.prune_expired_api_rate_limits()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  cutoff_reference timestamptz;
  newest_window timestamptz;
begin
  -- A non-blocking transaction lock allows one request to prune at a time.
  -- Other rate-limit writes continue instead of queueing behind maintenance.
  if pg_catalog.pg_try_advisory_xact_lock(72004005) then
    select pg_catalog.max(window_started_at)
    into newest_window
    from public.api_rate_limits;

    -- Live requests use database-current windows. Capping by the newest
    -- accepted window also keeps deterministic replay and clock-skewed writes
    -- from deleting the window they are incrementing.
    cutoff_reference := pg_catalog.statement_timestamp();
    if newest_window < cutoff_reference then
      cutoff_reference := newest_window;
    end if;

    delete from public.api_rate_limits
    where window_started_at < cutoff_reference - interval '24 hours';
  end if;

  return null;
end
$function$;

revoke all privileges on function public.prune_expired_api_rate_limits() from public;

-- Fresh databases create runtime roles after forward migrations. Upgrade
-- databases may already have them, so remove direct execution in either order.
do $revoke_runtime_execution$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'mcat_learner_api') then
    execute 'revoke all privileges on function public.prune_expired_api_rate_limits() from mcat_learner_api';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'mcat_workers') then
    execute 'revoke all privileges on function public.prune_expired_api_rate_limits() from mcat_workers';
  end if;
end
$revoke_runtime_execution$;

create trigger api_rate_limits_prune_expired
after insert on api_rate_limits
for each statement
execute function public.prune_expired_api_rate_limits();
