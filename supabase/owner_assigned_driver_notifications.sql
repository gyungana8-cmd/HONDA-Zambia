-- TWENDE owner / assigned-driver operations and notification recipients
-- Apply after multi_vehicle_driver_phase1.sql and multi_vehicle_driver_phase2.sql.
-- Existing user_id remains the vehicle owner. A null assigned_driver_id means
-- the owner may drive the vehicle themselves.

alter table public.driver_vehicles
  add column if not exists assigned_driver_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_driver_online boolean not null default false;

create index if not exists driver_vehicles_assigned_driver_idx
  on public.driver_vehicles(assigned_driver_id, approval_status, assigned_driver_online);

-- Owners can see rides linked to their vehicles; assigned drivers can see
-- requests for vehicles assigned to them.
drop policy if exists "Owners and assigned drivers can monitor rides" on public.ride_requests;
create policy "Owners and assigned drivers can monitor rides"
  on public.ride_requests for select to authenticated
  using (
    exists (
      select 1 from public.driver_vehicles v
      where v.id = ride_requests.driver_vehicle_id
        and (v.user_id = auth.uid() or v.assigned_driver_id = auth.uid())
    )
  );

-- Vehicle owners can assign only an already-approved driver account.
create or replace function public.twende_assign_vehicle_driver(
  p_vehicle_id uuid,
  p_driver_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from public.driver_vehicles
    where id=p_vehicle_id and user_id=auth.uid()
      and approval_status='approved'
  ) then
    raise exception 'Only the owner of an approved vehicle can assign its driver';
  end if;

  if p_driver_id is not null and not exists (
    select 1 from public.driver_profiles
    where user_id=p_driver_id and approval_status='approved'
  ) then
    raise exception 'The selected driver must have an approved TWENDE driver account';
  end if;

  update public.driver_vehicles
    set assigned_driver_id=p_driver_id,
        assigned_driver_online=false,
        is_online=false
    where id=p_vehicle_id and user_id=auth.uid();
end;
$$;

-- Assigned driver controls their availability. Owner-drivers continue to use
-- twende_set_vehicle_online for vehicles with no assigned_driver_id.
create or replace function public.twende_set_assigned_driver_online(
  p_vehicle_id uuid,
  p_online boolean
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from public.driver_vehicles v
    join public.driver_profiles d on d.user_id=v.assigned_driver_id
    where v.id=p_vehicle_id
      and v.assigned_driver_id=auth.uid()
      and v.approval_status='approved'
      and d.approval_status='approved'
  ) then
    raise exception 'Only the approved driver assigned to this vehicle can change driver availability';
  end if;

  update public.driver_vehicles
    set assigned_driver_online=p_online,
        is_online=p_online
    where id=p_vehicle_id and assigned_driver_id=auth.uid();
end;
$$;

-- An owner can accept as the driver only when no separate driver is assigned.
-- If a driver is assigned, only that driver can accept the ride.
create or replace function public.accept_twende_ride(p_ride_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
declare
  v_ride public.ride_requests%rowtype;
  v_vehicle public.driver_vehicles%rowtype;
begin
  select * into v_ride
    from public.ride_requests
    where id=p_ride_id and status='pending'
    for update;

  if not found then raise exception 'Ride is no longer available'; end if;

  select * into v_vehicle
    from public.driver_vehicles v
    where v.vehicle_type=v_ride.service_type
      and v.approval_status='approved'
      and v.is_online=true
      and (
        (v.assigned_driver_id is null and v.user_id=auth.uid())
        or
        (v.assigned_driver_id=auth.uid() and v.assigned_driver_online=true)
      )
    order by v.created_at
    limit 1;

  if not found then
    raise exception 'You must be the approved owner-driver or the approved assigned driver of an online matching vehicle';
  end if;

  update public.ride_requests
    set driver_id=auth.uid(),
        driver_vehicle_id=v_vehicle.id,
        status='accepted',
        accepted_at=now()
    where id=p_ride_id and status='pending';

  if not found then raise exception 'Ride is no longer available'; end if;
end;
$$;

revoke all on function public.twende_assign_vehicle_driver(uuid,uuid) from public;
revoke all on function public.twende_set_assigned_driver_online(uuid,boolean) from public;
revoke all on function public.accept_twende_ride(uuid) from public;
grant execute on function public.twende_assign_vehicle_driver(uuid,uuid) to authenticated;
grant execute on function public.twende_set_assigned_driver_online(uuid,boolean) to authenticated;
grant execute on function public.accept_twende_ride(uuid) to authenticated;

-- Quick schema verification
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='driver_vehicles'
  and column_name in ('user_id','assigned_driver_id','assigned_driver_online','is_online');
