-- TWENDE booking reliability fix: run once in Supabase SQL Editor.
-- Adds idempotency to passenger submissions and assigns each request only to
-- the exact vehicle selected by the passenger.

alter table public.ride_requests
  add column if not exists request_key uuid;

create unique index if not exists ride_requests_rider_request_key_uidx
  on public.ride_requests (rider_id, request_key)
  where request_key is not null;

drop policy if exists "Passengers and assigned drivers can read rides" on public.ride_requests;
create policy "Passengers and assigned drivers can read rides"
  on public.ride_requests for select to authenticated
  using (
    rider_id = auth.uid()
    or driver_id = auth.uid()
    or (
      status = 'pending'
      and driver_vehicle_id is not null
      and exists (
        select 1 from public.driver_vehicles v
        where v.id = ride_requests.driver_vehicle_id
          and v.user_id = auth.uid()
          and v.approval_status = 'approved'
          and v.is_online = true
      )
    )
  );

create or replace function public.accept_twende_ride(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_ride public.ride_requests%rowtype;
  v_vehicle public.driver_vehicles%rowtype;
begin
  select * into v_ride
  from public.ride_requests
  where id = p_ride_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Ride is no longer available';
  end if;

  if v_ride.driver_vehicle_id is null then
    raise exception 'This request has no selected vehicle. Ask the passenger to submit a new request.';
  end if;

  select * into v_vehicle
  from public.driver_vehicles
  where id = v_ride.driver_vehicle_id
    and user_id = auth.uid()
    and approval_status = 'approved'
    and is_online = true
    and vehicle_type = v_ride.service_type;

  if not found then
    raise exception 'This booking is assigned to a different vehicle or your vehicle is offline.';
  end if;

  update public.ride_requests
  set driver_id = auth.uid(),
      driver_vehicle_id = v_vehicle.id,
      status = 'accepted',
      accepted_at = now()
  where id = p_ride_id and status = 'pending';

  if not found then
    raise exception 'Ride was accepted by another driver or is no longer available';
  end if;
end;
$$;

revoke all on function public.accept_twende_ride(uuid) from public;
grant execute on function public.accept_twende_ride(uuid) to authenticated;
