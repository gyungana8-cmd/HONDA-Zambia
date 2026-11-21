-- Temporary OTP-free passenger registration while TWENDE SMS compliance is pending.
-- Passenger phone numbers are collected as contact details but are NOT verified by this migration.
create or replace function public.twende_passenger_is_registered()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and nullif(trim(p.full_name), '') is not null
      and nullif(trim(p.phone), '') is not null
      and coalesce(p.role, 'rider') = 'rider'
  );
$$;

revoke all on function public.twende_passenger_is_registered() from public;
grant execute on function public.twende_passenger_is_registered() to authenticated;

drop policy if exists "Passengers can request rides" on public.ride_requests;
create policy "Passengers can request rides"
on public.ride_requests
for insert
to authenticated
with check (
  rider_id = auth.uid()
  and driver_id is null
  and status = 'pending'
  and payment_method = 'cash'
  and public.twende_passenger_is_registered()
);
