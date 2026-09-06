create index submissions_participant_challenge_idx
  on public.submissions (participant_id, challenge_id);

create index exemptions_participant_challenge_idx
  on public.exemptions (participant_id, challenge_id);
