alter table public.challenges
  add column penalty_start_date date not null default current_date;

update public.challenges set penalty_start_date = start_date;

alter table public.challenges
  alter column penalty_start_date drop default;

alter table public.challenges
  add constraint challenges_penalty_start_range_check
  check (start_date <= penalty_start_date and penalty_start_date <= end_date);

comment on column public.challenges.penalty_start_date is '차감 집계를 시작하는 날짜. 이 날짜 이전 평일은 운영 제외일 등록과 무관하게 미제출로 판정하지 않는다.';

update public.challenges
set penalty_start_date = '2026-09-14'
where name = '2기'
  and start_date <= '2026-09-14'
  and '2026-09-14' <= end_date;
