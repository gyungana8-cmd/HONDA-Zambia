-- TWENDE ride-hailing extension
-- Run this script in Supabase SQL Editor for project obgteeruczqlebllrafr.
-- Cash-only payments. Driver accounts require manual administrator approval.
create extension if not exists pgcrypto;

create table if not exists public.driver_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  driver_name text not null,
  phone text not null,
  vehicle_type text not null check (vehicle_type in ('motorcycle','car')),
  vehicle_make text not null,
  vehicle_model text not null,
  plate_number text not null,
  licence_number text not null,
  operating_area text not null,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  is_online boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ride_requests (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users(id) on delete cascade,
  driver_id uuid references auth.users(id) on delete set null,
  passenger_name text not null,
  passenger_phone text not null,
  service_type text not null check (service_type in ('motorcycle','car')),
  pickup_text text not null,
  destination_text text not null,
  payment_method text not null default 'cash' check (payment_method = 'cash'),
  status text not null default 'pending' check (status in ('pending','accepted','completed','cancelled')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz
);

create index if not exists ride_requests_rider_created_idx on public.ride_requests(rider_id, created_at desc);
create index if not exists ride_requests_driver_status_idx on public.ride_requests(driver_id, status);
create index if not exists ride_requests_service_status_idx on public.ride_requests(service_type, status);

alter table public.driver_profiles enable row level security;
alter table public.ride_requests enable row level security;

drop policy if exists "Drivers can read own profile" on public.driver_profiles;
create policy "Drivers can read own profile" on public.driver_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users can register as drivers" on public.driver_profiles;
create policy "Users can register as drivers" on public.driver_profiles for insert to authenticated
with check (user_id = auth.uid() and approval_status = 'pending' and is_online = false);
drop policy if exists "Passengers and assigned drivers can read rides" on public.ride_requests;
create policy "Passengers and assigned drivers can read rides" on public.ride_requests for select to authenticated using (
  rider_id = auth.uid() or driver_id = auth.uid() or
  (status = 'pending' and exists (
    select 1 from public.driver_profiles d
    where d.user_id = auth.uid() and d.approval_status = 'approved'
      and d.is_online = true and d.vehicle_type = ride_requests.service_type
  ))
);
drop policy if exists "Passengers can request rides" on public.ride_requests;
create policy "Passengers can request rides" on public.ride_requests for insert to authenticated
with check (rider_id = auth.uid() and driver_id is null and status = 'pending' and payment_method = 'cash');

create or replace function public.set_twende_driver_online(p_online boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.driver_profiles where user_id=auth.uid() and approval_status='approved') then
    raise exception 'Driver account is not approved';
  end if;
  update public.driver_profiles set is_online=p_online where user_id=auth.uid();
end; $$;

create or replace function public.accept_twende_ride(p_ride_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_type text;
begin
  select vehicle_type into v_type from public.driver_profiles
  where user_id=auth.uid() and approval_status='approved' and is_online=true;
  if v_type is null then raise exception 'Approved online driver account required'; end if;
  update public.ride_requests set driver_id=auth.uid(), status='accepted', accepted_at=now()
  where id=p_ride_id and status='pending' and service_type=v_type;
  if not found then raise exception 'Ride is no longer available or vehicle type does not match'; end if;
end; $$;

create or replace function public.complete_twende_ride(p_ride_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.ride_requests set status='completed', completed_at=now()
  where id=p_ride_id and driver_id=auth.uid() and status='accepted';
  if not found then raise exception 'Only the assigned driver can complete this active ride'; end if;
end; $$;

revoke all on function public.set_twende_driver_online(boolean) from public;
revoke all on function public.accept_twende_ride(uuid) from public;
revoke all on function public.complete_twende_ride(uuid) from public;
grant execute on function public.set_twende_driver_online(boolean) to authenticated;
grant execute on function public.accept_twende_ride(uuid) to authenticated;
grant execute on function public.complete_twende_ride(uuid) to authenticated;
