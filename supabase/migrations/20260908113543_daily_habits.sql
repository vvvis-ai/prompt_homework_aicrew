create table public.daily_missions (
  id bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges(id),
  mission_date date not null,
  title text not null check (length(title) between 1 and 120),
  prompt text not null check (length(prompt) between 1 and 3000),
  operator_id bigint not null references public.operators(id),
  created_at timestamptz not null default now(),
  unique(challenge_id, mission_date)
);
create index daily_missions_operator_idx on public.daily_missions(operator_id);
create table public.push_reminders (
  id uuid primary key,
  participant_id bigint not null references public.participants(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2048),
  token_hash text not null,
  reminder_time text not null check (reminder_time ~ '^(0[8-9]|1[0-9]|2[0-2]):(00|15|30|45)$'),
  last_sent_date date,
  created_at timestamptz not null default now()
);
create index push_reminders_participant_idx on public.push_reminders(participant_id);
alter table public.daily_missions enable row level security;
alter table public.push_reminders enable row level security;
revoke all on public.daily_missions, public.push_reminders from public, anon, authenticated;
revoke all on sequence public.daily_missions_id_seq from public, anon, authenticated;
grant select, insert, update, delete on public.daily_missions, public.push_reminders to service_role;
grant usage, select on sequence public.daily_missions_id_seq to service_role;
