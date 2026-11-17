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


-- Owner account verification and owner/assigned-driver operational controls.
create table if not exists public.twende_owner_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_name text not null,
  phone text not null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.twende_owner_profiles enable row level security;

drop policy if exists "Owners can read own owner profile" on public.twende_owner_profiles;
create policy "Owners can read own owner profile"
  on public.twende_owner_profiles for select to authenticated
  using (user_id=auth.uid());

drop policy if exists "Admins can read owner applications" on public.twende_owner_profiles;
create policy "Admins can read owner applications"
  on public.twende_owner_profiles for select to authenticated
  using (exists(select 1 from public.twende_admins a where a.user_id=auth.uid()));

insert into public.twende_owner_profiles(user_id,owner_name,phone,approval_status)
select v.user_id, max(v.driver_name), max(v.phone),
       case when bool_or(v.approval_status='approved') then 'approved' else 'pending' end
from public.driver_vehicles v
group by v.user_id
on conflict(user_id) do nothing;

create or replace function public.twende_sync_owner_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.twende_owner_profiles(user_id,owner_name,phone,approval_status)
  values(new.user_id,new.driver_name,new.phone,'pending')
  on conflict(user_id) do update
    set owner_name=excluded.owner_name, phone=excluded.phone;
  return new;
end;
$$;

drop trigger if exists twende_create_owner_profile on public.driver_vehicles;
create trigger twende_create_owner_profile
  after insert on public.driver_vehicles
  for each row execute function public.twende_sync_owner_profile();

drop policy if exists "Assigned drivers can read assigned vehicles" on public.driver_vehicles;
create policy "Assigned drivers can read assigned vehicles"
  on public.driver_vehicles for select to authenticated
  using (assigned_driver_id=auth.uid());

create or replace function public.twende_admin_review_owner(p_owner_id uuid,p_decision text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.twende_admins where user_id=auth.uid()) then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  update public.twende_owner_profiles
    set approval_status=p_decision, reviewed_at=now()
    where user_id=p_owner_id and approval_status<>p_decision;
  if not found then raise exception 'Pending owner application not found'; end if;
  if p_decision='rejected' then
    update public.driver_vehicles
      set is_online=false, assigned_driver_online=false
      where user_id=p_owner_id;
  end if;
end;
$$;

create or replace function public.twende_set_vehicle_online(p_vehicle_id uuid,p_online boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from public.driver_vehicles v
    join public.twende_owner_profiles o on o.user_id=v.user_id
    where v.id=p_vehicle_id and v.user_id=auth.uid()
      and v.approval_status='approved' and o.approval_status='approved'
      and v.assigned_driver_id is null
  ) then
    raise exception 'Only an approved owner with an approved unassigned vehicle can drive it';
  end if;
  update public.driver_vehicles set is_online=p_online where id=p_vehicle_id;
end;
$$;

create or replace function public.twende_set_assigned_driver_online(p_vehicle_id uuid,p_online boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from public.driver_vehicles v
    join public.driver_profiles d on d.user_id=v.assigned_driver_id
    join public.twende_owner_profiles o on o.user_id=v.user_id
    where v.id=p_vehicle_id and v.assigned_driver_id=auth.uid()
      and v.approval_status='approved' and d.approval_status='approved'
      and o.approval_status='approved'
  ) then
    raise exception 'The owner, vehicle and assigned driver must all be approved';
  end if;
  update public.driver_vehicles
    set assigned_driver_online=p_online,is_online=p_online
    where id=p_vehicle_id and assigned_driver_id=auth.uid();
end;
$$;

create or replace function public.accept_twende_ride(p_ride_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_ride public.ride_requests%rowtype;
  v_vehicle public.driver_vehicles%rowtype;
begin
  select * into v_ride from public.ride_requests
    where id=p_ride_id and status='pending' for update;
  if not found then raise exception 'Ride is no longer available'; end if;

  select v.* into v_vehicle from public.driver_vehicles v
    join public.twende_owner_profiles o on o.user_id=v.user_id
    where v.vehicle_type=v_ride.service_type
      and v.approval_status='approved' and o.approval_status='approved'
      and v.is_online=true
      and (
        (v.assigned_driver_id is null and v.user_id=auth.uid())
        or (v.assigned_driver_id=auth.uid() and v.assigned_driver_online=true
          and exists(select 1 from public.driver_profiles d
            where d.user_id=auth.uid() and d.approval_status='approved'))
      )
    order by v.created_at limit 1;
  if not found then
    raise exception 'You must be the approved owner-driver or the approved assigned driver of an online matching vehicle';
  end if;

  update public.ride_requests set driver_id=auth.uid(),
    driver_vehicle_id=v_vehicle.id,status='accepted',accepted_at=now()
    where id=p_ride_id and status='pending';
  if not found then raise exception 'Ride is no longer available'; end if;
end;
$$;

drop policy if exists "Owners and assigned drivers can monitor rides" on public.ride_requests;
create policy "Owners and assigned drivers can monitor rides"
  on public.ride_requests for select to authenticated
  using (exists(select 1 from public.driver_vehicles v
    where v.id=ride_requests.driver_vehicle_id
      and (v.user_id=auth.uid() or v.assigned_driver_id=auth.uid())));

drop policy if exists "Assigned drivers can see matching pending rides" on public.ride_requests;
create policy "Assigned drivers can see matching pending rides"
  on public.ride_requests for select to authenticated
  using (status='pending' and exists(select 1 from public.driver_vehicles v
    join public.driver_profiles d on d.user_id=v.assigned_driver_id
    join public.twende_owner_profiles o on o.user_id=v.user_id
    where v.assigned_driver_id=auth.uid() and v.vehicle_type=ride_requests.service_type
      and v.approval_status='approved' and v.is_online=true
      and v.assigned_driver_online=true and d.approval_status='approved'
      and o.approval_status='approved'));

revoke all on function public.twende_admin_review_owner(uuid,text) from public;
grant execute on function public.twende_admin_review_owner(uuid,text) to authenticated;
revoke all on function public.twende_set_vehicle_online(uuid,boolean) from public;
revoke all on function public.twende_set_assigned_driver_online(uuid,boolean) from public;
revoke all on function public.accept_twende_ride(uuid) from public;
grant execute on function public.twende_set_vehicle_online(uuid,boolean) to authenticated;
grant execute on function public.twende_set_assigned_driver_online(uuid,boolean) to authenticated;
grant execute on function public.accept_twende_ride(uuid) to authenticated;


-- Safe directory for owners to select an approved driver without exposing
-- licence numbers or other private driver application fields.
create or replace function public.twende_list_approved_drivers()
returns table(driver_id uuid, driver_name text, phone text)
language sql stable security definer set search_path=public as $$
  select d.user_id,d.driver_name,d.phone
  from public.driver_profiles d
  where d.approval_status='approved'
  order by d.driver_name;
$$;
revoke all on function public.twende_list_approved_drivers() from public;
grant execute on function public.twende_list_approved_drivers() to authenticated;


-- Allow administrators to suspend/reject previously approved driver accounts
-- when their licence, conduct or TWENDE compliance status changes.
create or replace function public.twende_admin_review_driver(p_driver_id uuid,p_decision text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.twende_admins where user_id=auth.uid()) then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  update public.driver_profiles
    set approval_status=p_decision,is_online=false
    where user_id=p_driver_id and approval_status<>p_decision;
  if not found then raise exception 'Driver application not found or already has this decision'; end if;
  if p_decision='rejected' then
    update public.driver_vehicles
      set is_online=false,assigned_driver_online=false
      where assigned_driver_id=p_driver_id;
  end if;
end;
$$;
revoke all on function public.twende_admin_review_driver(uuid,text) from public;
grant execute on function public.twende_admin_review_driver(uuid,text) to authenticated;


create or replace function public.twende_assign_vehicle_driver(p_vehicle_id uuid,p_driver_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from public.driver_vehicles v
    join public.twende_owner_profiles o on o.user_id=v.user_id
    where v.id=p_vehicle_id and v.user_id=auth.uid()
      and v.approval_status='approved' and o.approval_status='approved'
  ) then
    raise exception 'Only an approved owner can assign a driver to an approved vehicle';
  end if;
  if p_driver_id is not null and not exists (
    select 1 from public.driver_profiles d
    where d.user_id=p_driver_id and d.approval_status='approved'
  ) then
    raise exception 'The selected driver must have an approved TWENDE driver account';
  end if;
  update public.driver_vehicles
    set assigned_driver_id=p_driver_id,assigned_driver_online=false,is_online=false
    where id=p_vehicle_id and user_id=auth.uid();
end;
$$;

create or replace function public.twende_admin_review_vehicle(p_vehicle_id uuid,p_decision text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.twende_admins where user_id=auth.uid()) then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  update public.driver_vehicles
    set approval_status=p_decision,is_online=false,assigned_driver_online=false
    where id=p_vehicle_id and approval_status<>p_decision;
  if not found then raise exception 'Vehicle application not found or already has this decision'; end if;
end;
$$;
revoke all on function public.twende_assign_vehicle_driver(uuid,uuid) from public;
revoke all on function public.twende_admin_review_vehicle(uuid,text) from public;
grant execute on function public.twende_assign_vehicle_driver(uuid,uuid) to authenticated;
grant execute on function public.twende_admin_review_vehicle(uuid,text) to authenticated;
