-- AI data is server-only. Name selection is deliberately NOT authorization (see AI-REQUIREMENTS).
create table public.ai_settings (
 id boolean primary key default true check (id),
 enabled boolean not null default true,
 recommend_limit integer not null default 3 check (recommend_limit between 0 and 100),
 chat_limit integer not null default 5 check (chat_limit between 0 and 100),
 daily_cap integer not null default 100 check (daily_cap between 0 and 100000),
 minute_cap integer not null default 5 check (minute_cap between 0 and 1000)
);
insert into public.ai_settings(id) values(true);
create table public.ai_states (
 participant_id bigint primary key references public.participants(id) on delete cascade,
 version integer not null default 0,
 document jsonb not null default '{"rooms":[],"saved":[],"drafts":[],"recommendations":[],"interests":[],"excluded":[],"scores":{},"exploration":0,"purposes":[],"feedback":{}}'
);
create table public.ai_requests (
 id uuid primary key,
 participant_id bigint not null references public.participants(id) on delete cascade,
 kind text not null check (kind in ('chat','recommend')),
 status text not null default 'running' check (status in ('running','success','cancelled','failed')),
 day date not null default (now() at time zone 'Asia/Seoul')::date,
 started_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '90 seconds',
 result_id uuid
);
create unique index ai_requests_one_running on public.ai_requests(participant_id) where status='running';
create index ai_requests_usage on public.ai_requests(participant_id,day,kind,status);
create table public.ai_calls (id bigint generated always as identity primary key, request_id uuid not null references public.ai_requests(id) on delete cascade, called_at timestamptz not null default now());
create index ai_calls_time on public.ai_calls(called_at);
create index ai_calls_request on public.ai_calls(request_id);
create table public.ai_settings_audit (id bigint generated always as identity primary key, operator_id bigint not null references public.operators(id), settings jsonb not null, created_at timestamptz not null default now());
create index ai_settings_audit_operator on public.ai_settings_audit(operator_id);
alter table public.ai_settings enable row level security;
alter table public.ai_states enable row level security;
alter table public.ai_requests enable row level security;
alter table public.ai_calls enable row level security;
alter table public.ai_settings_audit enable row level security;
revoke all on public.ai_settings,public.ai_states,public.ai_requests,public.ai_calls,public.ai_settings_audit from public,anon,authenticated;
grant all on public.ai_settings,public.ai_states,public.ai_requests,public.ai_calls,public.ai_settings_audit to service_role;
grant usage,select on sequence public.ai_calls_id_seq,public.ai_settings_audit_id_seq to service_role;

create function public.ai_begin(p_participant bigint, p_id uuid, p_kind text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.ai_settings; used integer; existing public.ai_requests;
begin
 select * into cfg from public.ai_settings where id=true for update;
 if not cfg.enabled then raise exception 'AI_DISABLED'; end if;
 if p_kind not in ('chat','recommend') then raise exception 'INVALID_KIND'; end if;
 if not exists(select 1 from public.participants where id=p_participant and is_active) then raise exception 'PARTICIPANT'; end if;
 insert into public.ai_states(participant_id) values(p_participant) on conflict do nothing;
 perform 1 from public.ai_states where participant_id=p_participant for update;
 update public.ai_requests set status='failed' where participant_id=p_participant and status='running' and expires_at<=now();
 select * into existing from public.ai_requests where id=p_id;
 if found then
   if existing.participant_id<>p_participant or existing.kind<>p_kind then raise exception 'REQUEST_CONFLICT'; end if;
   return to_jsonb(existing) || jsonb_build_object('replay',true);
 end if;
 if exists(select 1 from public.ai_requests where participant_id=p_participant and status='running') then raise exception 'BUSY'; end if;
 select count(*) into used from public.ai_requests where participant_id=p_participant and kind=p_kind and status='success' and day=(now() at time zone 'Asia/Seoul')::date;
 if used >= (case when p_kind='chat' then cfg.chat_limit else cfg.recommend_limit end) then raise exception 'PERSONAL_LIMIT'; end if;
 insert into public.ai_requests(id,participant_id,kind) values(p_id,p_participant,p_kind) returning * into existing;
 return to_jsonb(existing);
end $$;

create function public.ai_attempt(p_participant bigint,p_id uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare cfg public.ai_settings; req public.ai_requests; total integer;
begin
 select * into cfg from public.ai_settings where id=true for update;
 if not cfg.enabled then raise exception 'AI_DISABLED'; end if;
 select * into req from public.ai_requests where id=p_id and participant_id=p_participant for update;
 if not found or req.status<>'running' or req.expires_at<=now() then raise exception 'CANCELLED'; end if;
 select count(*) into total from public.ai_calls where called_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 if total>=cfg.daily_cap then raise exception 'GLOBAL_DAY_LIMIT'; end if;
 select count(*) into total from public.ai_calls where called_at>now()-interval '60 seconds';
 if total>=cfg.minute_cap then raise exception 'GLOBAL_MINUTE_LIMIT'; end if;
 insert into public.ai_calls(request_id) values(p_id);
end $$;

create function public.ai_write(p_participant bigint,p_version integer,p_document jsonb,p_finish uuid default null,p_result uuid default null) returns integer
language plpgsql security invoker set search_path='' as $$
declare v integer;
begin
 select version into v from public.ai_states where participant_id=p_participant for update;
 if v is null or v<>p_version then raise exception 'VERSION_CONFLICT'; end if;
 if p_finish is not null then
   perform 1 from public.ai_requests where id=p_finish and participant_id=p_participant and status='running' and expires_at>now() for update;
   if not found then raise exception 'CANCELLED'; end if;
 end if;
 if jsonb_array_length(p_document->'saved')>100 then raise exception 'LIBRARY_FULL'; end if;
 update public.ai_states set document=p_document,version=version+1 where participant_id=p_participant;
 if p_finish is not null then update public.ai_requests set status='success',result_id=p_result where id=p_finish; end if;
 return v+1;
end $$;

create function public.ai_cancel(p_participant bigint,p_id uuid,p_status text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('cancelled','failed') then raise exception 'INVALID_STATUS'; end if;
 -- Same lock order as ai_write prevents cancellation/success deadlocks.
 perform 1 from public.ai_states where participant_id=p_participant for update;
 update public.ai_requests set status=p_status where id=p_id and participant_id=p_participant and status='running';
end $$;

create function public.ai_configure(p_operator bigint,p_settings jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.operators where id=p_operator and is_active) then raise exception 'UNAUTHORIZED'; end if;
 update public.ai_settings set enabled=(p_settings->>'enabled')::boolean,
 recommend_limit=(p_settings->>'recommendLimit')::integer,chat_limit=(p_settings->>'chatLimit')::integer,
 daily_cap=(p_settings->>'dailyCap')::integer,minute_cap=(p_settings->>'minuteCap')::integer where id=true;
 insert into public.ai_settings_audit(operator_id,settings) values(p_operator,p_settings);
end $$;

create function public.ai_prune(d jsonb, t timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare rooms jsonb='[]'; r jsonb; msgs jsonb; sums jsonb; live_ids jsonb;
begin
 for r in select value from jsonb_array_elements(d->'rooms') loop
  select coalesce(jsonb_agg(value),'[]') into msgs from jsonb_array_elements(r->'messages') where (value->>'expiresAt')::timestamptz>t;
  if jsonb_array_length(msgs)=0 then continue; end if;
  select coalesce(jsonb_agg(value->'id'),'[]') into live_ids from jsonb_array_elements(msgs);
  select coalesce(jsonb_agg(value),'[]') into sums from jsonb_array_elements(r->'summaries')
   where (value->>'expiresAt')::timestamptz>t and (value->'sources') <@ live_ids;
  rooms=rooms || jsonb_build_array(r || jsonb_build_object('title',left(msgs->0->>'text',50),'messages',msgs,'summaries',sums));
 end loop;
 d=jsonb_set(d,'{rooms}',rooms);
 select jsonb_set(d,'{drafts}',coalesce(jsonb_agg(value),'[]')) into d from jsonb_array_elements(d->'drafts') where (value->>'expiresAt')::timestamptz>t;
 select jsonb_set(d,'{recommendations}',coalesce(jsonb_agg(value),'[]')) into d from jsonb_array_elements(d->'recommendations') where (value->>'expiresAt')::timestamptz>t;
 select jsonb_set(d,'{purposes}',coalesce(jsonb_agg(value),'[]')) into d from jsonb_array_elements(d->'purposes') where (value->>'at')::timestamptz>t-interval '30 days';
 return d;
end $$;
create function public.ai_cleanup() returns void
language plpgsql security invoker set search_path='' as $$
begin
 update public.ai_states set document=public.ai_prune(document,now()),version=version+1 where document is distinct from public.ai_prune(document,now());
 update public.ai_requests set status='failed' where status='running' and expires_at<=now();
 delete from public.ai_requests where started_at<now()-interval '30 days';
end $$;
revoke all on function public.ai_begin(bigint,uuid,text), public.ai_attempt(bigint,uuid), public.ai_write(bigint,integer,jsonb,uuid,uuid), public.ai_cancel(bigint,uuid,text),public.ai_configure(bigint,jsonb),public.ai_prune(jsonb,timestamptz),public.ai_cleanup() from public,anon,authenticated;
grant execute on function public.ai_begin(bigint,uuid,text), public.ai_attempt(bigint,uuid), public.ai_write(bigint,integer,jsonb,uuid,uuid), public.ai_cancel(bigint,uuid,text),public.ai_configure(bigint,jsonb),public.ai_prune(jsonb,timestamptz),public.ai_cleanup() to service_role;


create function public.ai_statistics() returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object(
 'requests',(select count(*) from public.ai_requests where started_at>now()-interval '30 days'),
 'success',(select count(*) from public.ai_requests where started_at>now()-interval '30 days' and status='success'),
 'calls',(select count(*) from public.ai_calls where called_at>now()-interval '30 days'));
$$;
revoke all on function public.ai_statistics() from public,anon,authenticated;
grant execute on function public.ai_statistics() to service_role;
