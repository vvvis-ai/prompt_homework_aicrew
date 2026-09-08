alter table public.participants
  add column affiliation text not null default ''
  constraint participants_affiliation_length check (char_length(affiliation) <= 120);

comment on column public.participants.affiliation is '참가자 명단에 공개하는 소속. 미입력 시 빈 문자열.';
