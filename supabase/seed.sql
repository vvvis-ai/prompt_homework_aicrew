-- Local development data. Applied only by `supabase db reset`.
insert into public.operators (name) values
  ('이나윤'),
  ('운영자');

insert into public.challenges (
  name,
  start_date,
  end_date,
  default_fee,
  default_penalty,
  is_active
) values (
  'AI 러닝크루 1기',
  '2026-09-01',
  '2026-12-31',
  80000,
  2000,
  true
);

insert into public.participants (challenge_id, name, joined_at, paid_amount)
select id, participant.name, start_date, 80000
from public.challenges
cross join (values ('김하늘'), ('박지민'), ('최유진')) as participant(name)
where challenges.name = 'AI 러닝크루 1기';

insert into public.excluded_dates (
  challenge_id,
  excluded_date,
  reason,
  source,
  operator_id
)
select challenge.id, holiday.day, holiday.reason, 'holiday', null
from public.challenges as challenge
cross join (
  values
    ('2026-09-24'::date, '추석 연휴'),
    ('2026-09-25'::date, '추석'),
    ('2026-09-26'::date, '추석 연휴'),
    ('2026-10-03'::date, '개천절'),
    ('2026-10-05'::date, '개천절 대체공휴일'),
    ('2026-10-09'::date, '한글날'),
    ('2026-12-25'::date, '기독탄신일')
) as holiday(day, reason)
where challenge.name = 'AI 러닝크루 1기';

insert into public.notices (challenge_id, title, content, is_pinned, operator_id)
select challenge.id,
  'AI 러닝크루에 오신 것을 환영합니다',
  '평일 오후 11시까지 오늘 활용한 AI 프롬프트 링크를 등록해 주세요.',
  true,
  operator.id
from public.challenges as challenge
cross join public.operators as operator
where challenge.name = 'AI 러닝크루 1기'
  and operator.name = '이나윤';
