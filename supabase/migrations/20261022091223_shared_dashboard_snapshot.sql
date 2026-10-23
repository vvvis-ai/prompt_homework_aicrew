-- Version matches the migration applied through Supabase MCP.
-- One replaceable snapshot, not a history of snapshots. No uploaded HTML or
-- password hashes are included; only the server role can read/write this table.
create table public.dashboard_snapshot (
  id boolean primary key default true check (id),
  revision uuid not null default gen_random_uuid(),
  format_version integer not null default 0,
  payload jsonb,
  valid_until timestamptz,
  built_at timestamptz
);
alter table public.dashboard_snapshot enable row level security;
revoke all on public.dashboard_snapshot from public, anon, authenticated;
grant select, update on public.dashboard_snapshot to service_role;
insert into public.dashboard_snapshot(id) values (true);

create function public.invalidate_dashboard_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.dashboard_snapshot
    set revision = gen_random_uuid(), payload = null, valid_until = null, built_at = null
    where id = true;
  return null;
end;
$$;
revoke all on function public.invalidate_dashboard_snapshot() from public, anon, authenticated;

-- Statement triggers also cover bulk admin edits, cascades and direct SQL.
-- Invalidation commits or rolls back atomically with the source change.
create trigger dashboard_changed after insert or update or delete or truncate on public.challenges
for each statement execute function public.invalidate_dashboard_snapshot();
create trigger dashboard_changed after insert or update or delete or truncate on public.participants
for each statement execute function public.invalidate_dashboard_snapshot();
create trigger dashboard_changed after insert or update or delete or truncate on public.submissions
for each statement execute function public.invalidate_dashboard_snapshot();
create trigger dashboard_changed after insert or update or delete or truncate on public.exemptions
for each statement execute function public.invalidate_dashboard_snapshot();
create trigger dashboard_changed after insert or update or delete or truncate on public.excluded_dates
for each statement execute function public.invalidate_dashboard_snapshot();
create trigger dashboard_changed after insert or update or delete or truncate on public.notices
for each statement execute function public.invalidate_dashboard_snapshot();
create trigger dashboard_changed after insert or update or delete or truncate on public.penalty_rates
for each statement execute function public.invalidate_dashboard_snapshot();
