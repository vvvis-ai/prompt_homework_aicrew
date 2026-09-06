-- AI Learning Crew initial schema
-- All application access is server-side. Browser roles receive no table access.

create schema if not exists private;

create table public.challenges (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) between 1 and 100),
  start_date date not null,
  end_date date not null,
  default_fee bigint not null default 80000 check (default_fee >= 0),
  default_penalty bigint not null default 2000 check (default_penalty >= 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint challenges_date_order_check check (start_date <= end_date)
);

create unique index challenges_one_active_idx
  on public.challenges (is_active)
  where is_active;

create table public.operators (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(trim(name)) between 1 and 60),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.participants (
  id bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 60),
  joined_at date not null,
  left_at date,
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_left_date_check check (left_at is null or left_at >= joined_at),
  constraint participants_id_challenge_unique unique (id, challenge_id),
  constraint participants_challenge_name_unique unique (challenge_id, name)
);

create index participants_challenge_active_idx
  on public.participants (challenge_id, is_active);

create table public.submissions (
  id bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges(id) on delete restrict,
  participant_id bigint not null,
  title text check (title is null or char_length(title) <= 120),
  url text not null check (char_length(url) <= 2048),
  normalized_url text not null check (char_length(normalized_url) <= 2048),
  description text check (description is null or char_length(description) <= 1000),
  edit_password_hash text not null,
  submitted_at timestamptz not null default now(),
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_participant_challenge_fk
    foreign key (participant_id, challenge_id)
    references public.participants(id, challenge_id)
    on delete restrict,
  constraint submissions_participant_url_unique unique (participant_id, normalized_url)
);

create index submissions_challenge_submitted_idx
  on public.submissions (challenge_id, submitted_at desc);
create index submissions_participant_submitted_idx
  on public.submissions (participant_id, submitted_at desc);
create index submissions_featured_idx
  on public.submissions (challenge_id, submitted_at desc)
  where is_featured;

create table public.exemptions (
  id bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges(id) on delete restrict,
  participant_id bigint not null,
  exemption_date date not null,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  operator_id bigint not null references public.operators(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint exemptions_participant_challenge_fk
    foreign key (participant_id, challenge_id)
    references public.participants(id, challenge_id)
    on delete restrict,
  constraint exemptions_participant_date_unique unique (participant_id, exemption_date)
);

create index exemptions_challenge_date_idx
  on public.exemptions (challenge_id, exemption_date);
create index exemptions_operator_idx on public.exemptions (operator_id);

create table public.excluded_dates (
  id bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges(id) on delete restrict,
  excluded_date date not null,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  source text not null check (source in ('holiday', 'admin')),
  operator_id bigint references public.operators(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint excluded_dates_challenge_date_unique unique (challenge_id, excluded_date),
  constraint excluded_dates_admin_operator_check
    check (source <> 'admin' or operator_id is not null)
);

create index excluded_dates_operator_idx
  on public.excluded_dates (operator_id)
  where operator_id is not null;

create table public.penalty_rates (
  id bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges(id) on delete restrict,
  amount bigint not null check (amount >= 0),
  effective_from date not null,
  operator_id bigint references public.operators(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint penalty_rates_challenge_date_unique unique (challenge_id, effective_from)
);

create index penalty_rates_challenge_effective_idx
  on public.penalty_rates (challenge_id, effective_from desc);
create index penalty_rates_operator_idx
  on public.penalty_rates (operator_id)
  where operator_id is not null;

create table public.notices (
  id bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 120),
  content text not null check (char_length(trim(content)) between 1 and 5000),
  is_pinned boolean not null default false,
  operator_id bigint not null references public.operators(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notices_challenge_pinned_idx
  on public.notices (challenge_id, is_pinned desc, created_at desc);
create index notices_operator_idx on public.notices (operator_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  challenge_id bigint not null references public.challenges(id) on delete restrict,
  operator_id bigint not null references public.operators(id) on delete restrict,
  action text not null check (char_length(trim(action)) between 1 and 80),
  entity_type text not null check (char_length(trim(entity_type)) between 1 and 80),
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_challenge_created_idx
  on public.audit_logs (challenge_id, created_at desc);
create index audit_logs_operator_created_idx
  on public.audit_logs (operator_id, created_at desc);
create index audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger challenges_touch_updated_at
before update on public.challenges
for each row execute function private.touch_updated_at();

create trigger participants_touch_updated_at
before update on public.participants
for each row execute function private.touch_updated_at();

create trigger submissions_touch_updated_at
before update on public.submissions
for each row execute function private.touch_updated_at();

create trigger notices_touch_updated_at
before update on public.notices
for each row execute function private.touch_updated_at();

create or replace function private.create_initial_penalty_rate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.penalty_rates (challenge_id, amount, effective_from)
  values (new.id, new.default_penalty, new.start_date);
  return new;
end;
$$;

create trigger challenges_create_initial_penalty_rate
after insert on public.challenges
for each row execute function private.create_initial_penalty_rate();

create or replace function private.keep_submission_time_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.submitted_at is distinct from old.submitted_at then
    raise exception 'submitted_at is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable';
  end if;
  return new;
end;
$$;

create trigger submissions_keep_original_time
before update on public.submissions
for each row execute function private.keep_submission_time_immutable();

alter table public.challenges enable row level security;
alter table public.operators enable row level security;
alter table public.participants enable row level security;
alter table public.submissions enable row level security;
alter table public.exemptions enable row level security;
alter table public.excluded_dates enable row level security;
alter table public.penalty_rates enable row level security;
alter table public.notices enable row level security;
alter table public.audit_logs enable row level security;

revoke all on schema public from public;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
