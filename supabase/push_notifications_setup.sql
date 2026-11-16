-- TWENDE push notification device-token registry
-- Run this file in the Supabase SQL Editor for project obgteeruczqlebllrafr.

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android'
    check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_id_idx
  on public.device_push_tokens(user_id);

alter table public.device_push_tokens enable row level security;

drop policy if exists "Users can view their own push tokens"
  on public.device_push_tokens;
create policy "Users can view their own push tokens"
  on public.device_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can register their own push tokens"
  on public.device_push_tokens;
create policy "Users can register their own push tokens"
  on public.device_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own push tokens"
  on public.device_push_tokens;
create policy "Users can update their own push tokens"
  on public.device_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own push tokens"
  on public.device_push_tokens;
create policy "Users can delete their own push tokens"
  on public.device_push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.device_push_tokens is
  'TWENDE FCM device tokens, scoped to the authenticated account. Never expose service-account credentials in this table.';
