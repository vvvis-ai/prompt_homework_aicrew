alter table public.participants add column paid_at date;

alter table public.participants
  add constraint participants_paid_at_amount_check
  check (paid_at is null or paid_amount > 0);

comment on column public.participants.paid_at is '실제 납부를 확인한 날짜. null이면 납부 확인 전이며 기존 데이터는 백필하지 않는다.';
