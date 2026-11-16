-- TWENDE passenger SMS OTP storage
-- Run this once in Supabase SQL Editor. OTP records are server-only.
create table if not exists public.passenger_phone_otps (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  attempt_count integer not null default 0
);
alter table public.passenger_phone_otps enable row level security;
revoke all on public.passenger_phone_otps from anon, authenticated;
grant all on public.passenger_phone_otps to service_role;
