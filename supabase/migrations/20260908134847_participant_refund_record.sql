alter table public.participants add column refunded_amount bigint
  check (refunded_amount is null or refunded_amount >= 0);
comment on column public.participants.refunded_amount is '실제 환급 완료 금액. null은 환급 완료 미기록. 송금 실행 기능이 아님.';
