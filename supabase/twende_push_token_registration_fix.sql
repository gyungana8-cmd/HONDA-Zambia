-- TWENDE push token registration: idempotent setup for driver and passenger Android apps.
create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android','ios','web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists device_push_tokens_user_id_idx on public.device_push_tokens(user_id);
alter table public.device_push_tokens enable row level security;

drop policy if exists "Users can view their own push tokens" on public.device_push_tokens;
create policy "Users can view their own push tokens" on public.device_push_tokens
 for select to authenticated using (auth.uid()=user_id);
drop policy if exists "Users can register their own push tokens" on public.device_push_tokens;
create policy "Users can register their own push tokens" on public.device_push_tokens
 for insert to authenticated with check (auth.uid()=user_id);
drop policy if exists "Users can update their own push tokens" on public.device_push_tokens;
create policy "Users can update their own push tokens" on public.device_push_tokens
 for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "Users can delete their own push tokens" on public.device_push_tokens;
create policy "Users can delete their own push tokens" on public.device_push_tokens
 for delete to authenticated using (auth.uid()=user_id);

create or replace function public.register_twende_push_token(
 p_token text, p_platform text default 'android'
) returns void language plpgsql security definer set search_path=public as $$
declare v_user_id uuid:=auth.uid();
begin
 if v_user_id is null then raise exception 'Sign in before registering a push token'; end if;
 if p_token is null or length(trim(p_token))<20 then raise exception 'A valid device token is required'; end if;
 if p_platform not in ('android','ios','web') then raise exception 'Unsupported device platform'; end if;
 insert into public.device_push_tokens(user_id,token,platform,created_at,updated_at,last_seen_at)
 values(v_user_id,trim(p_token),p_platform,now(),now(),now())
 on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,
 updated_at=now(),last_seen_at=now();
end; $$;
revoke all on function public.register_twende_push_token(text,text) from public;
grant execute on function public.register_twende_push_token(text,text) to authenticated;
