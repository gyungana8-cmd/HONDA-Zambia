-- Enforce verified passenger registration at the database boundary.
-- Apply this migration in the Supabase SQL Editor before releasing the updated passenger app.
create or replace function public.twende_passenger_is_registered()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = auth.uid()
      and u.phone is not null
      and u.phone_confirmed_at is not null
      and nullif(trim(p.full_name), '') is not null
      and p.phone = u.phone
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
