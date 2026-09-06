create or replace function public.activate_challenge(p_challenge_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.challenges where id = p_challenge_id) then
    raise exception 'challenge not found';
  end if;

  update public.challenges
  set is_active = (id = p_challenge_id)
  where is_active or id = p_challenge_id;
end;
$$;

revoke all on function public.activate_challenge(bigint) from public, anon, authenticated;
grant execute on function public.activate_challenge(bigint) to service_role;
