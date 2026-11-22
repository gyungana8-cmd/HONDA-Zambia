-- TWENDE passenger booking policy for the temporary no-SMS-OTP registration flow.
-- Apply AFTER passenger_mandatory_phone_registration.sql if that older migration was run.
-- This permits an authenticated anonymous passenger session to book only when the
-- submitted name and phone exactly match that session's saved rider profile.
-- IMPORTANT: without SMS OTP, the phone number is collected but NOT verified.

create or replace function public.twende_passenger_profile_matches(
  p_passenger_name text,
  p_passenger_phone text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.role, 'rider') = 'rider'
      and nullif(trim(p.full_name), '') is not null
      and nullif(trim(p.phone), '') is not null
      and p.full_name = p_passenger_name
      and p.phone = p_passenger_phone
  );
$$;

revoke all on function public.twende_passenger_profile_matches(text,text) from public;
grant execute on function public.twende_passenger_profile_matches(text,text) to authenticated;

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
  and public.twende_passenger_profile_matches(passenger_name, passenger_phone)
);

comment on function public.twende_passenger_profile_matches(text,text) is
'Checks that a passenger ride request matches the signed-in rider profile. This temporary flow does not verify phone ownership by SMS OTP.';
