alter table public.push_reminders
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_delivery_status text check (
    last_delivery_status in ('sending', 'sent', 'failed', 'expired', 'test_sent', 'legacy_claimed')
  ),
  add column if not exists last_response_status integer check (
    last_response_status is null or last_response_status between 100 and 599
  ),
  add column if not exists last_error text check (last_error is null or length(last_error) <= 500),
  add column if not exists consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  add column if not exists disabled_at timestamptz;

update public.push_reminders
set last_delivery_status = 'legacy_claimed'
where last_sent_date is not null
  and last_delivery_status is null;

create index if not exists push_reminders_dispatch_idx
  on public.push_reminders (reminder_time, last_sent_date, last_attempt_at)
  where disabled_at is null;

comment on column public.push_reminders.last_sent_date is
  'KST date of the most recent push service success response.';
comment on column public.push_reminders.last_delivery_status is
  'Most recent delivery attempt state; legacy_claimed predates verified delivery tracking.';
comment on column public.push_reminders.disabled_at is
  'Set when the push service reports an expired subscription.';
