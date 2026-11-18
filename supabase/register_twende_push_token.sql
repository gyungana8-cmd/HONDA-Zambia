-- TWENDE: safely associate the current device token with the signed-in account.
-- Run this migration in Supabase SQL Editor after deploying the matching app build.
create or replace function public.register_twende_push_token(
  p_token text,
  p_platform text default 'android'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Sign in before registering a push token';
  end if;
  if p_token is null or length(trim(p_token)) < 20 then
    raise exception 'A valid device token is required';
  end if;
  if p_platform not in ('android', 'ios', 'web') then
    raise exception 'Unsupported device platform';
  end if;

  insert into public.device_push_tokens
    (user_id, token, platform, created_at, updated_at, last_seen_at)
  values
    (v_user_id, trim(p_token), p_platform, now(), now(), now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        updated_at = now(),
        last_seen_at = now();
end;
$$;

revoke all on function public.register_twende_push_token(text, text) from public;
grant execute on function public.register_twende_push_token(text, text) to authenticated;
