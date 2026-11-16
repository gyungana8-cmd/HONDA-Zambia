-- TWENDE GPS and automatic fare foundation (phase 2)
-- Apply after ride_hailing_setup.sql. GPS updates are only accepted from the signed-in approved driver.
alter table public.ride_requests
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision,
  add column if not exists route_distance_km numeric(8,2),
  add column if not exists estimated_fare numeric(10,2),
  add column if not exists fare_currency text not null default 'ZMW';

create table if not exists public.driver_locations (
  driver_id uuid primary key references auth.users(id) on delete cascade,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_m numeric(9,2),
  heading numeric(6,2),
  speed_mps numeric(8,2),
  updated_at timestamptz not null default now()
);
alter table public.driver_locations enable row level security;
drop policy if exists "Approved online drivers location visible to matching riders" on public.driver_locations;
create policy "Approved online drivers location visible to matching riders"
on public.driver_locations for select to authenticated
using (
  exists(select 1 from public.driver_profiles d
    where d.user_id=driver_locations.driver_id
      and d.approval_status='approved' and d.is_online=true)
  and exists(select 1 from public.ride_requests r
    where r.rider_id=auth.uid() and r.driver_id=driver_locations.driver_id
      and r.status in ('accepted'))
);
-- No direct INSERT/UPDATE policy: location writes go through this checked RPC.
create or replace function public.update_twende_driver_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null,
  p_heading numeric default null,
  p_speed_mps numeric default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid GPS coordinates';
  end if;
  if not exists(select 1 from public.driver_profiles
    where user_id=auth.uid() and approval_status='approved' and is_online=true) then
    raise exception 'Only approved online drivers can share GPS location';
  end if;
  insert into public.driver_locations(driver_id,latitude,longitude,accuracy_m,heading,speed_mps,updated_at)
  values(auth.uid(),p_latitude,p_longitude,p_accuracy_m,p_heading,p_speed_mps,now())
  on conflict(driver_id) do update set
    latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,
    heading=excluded.heading,speed_mps=excluded.speed_mps,updated_at=now();
end; $$;
revoke all on function public.update_twende_driver_location(double precision,double precision,numeric,numeric,numeric) from public;
grant execute on function public.update_twende_driver_location(double precision,double precision,numeric,numeric,numeric) to authenticated;

-- TWENDE-approved ZMW tariff values. Keep inactive until the migration is applied and tested.
create table if not exists public.taxi_fare_settings (
  service_type text primary key check(service_type in ('motorcycle','car')),
  base_fare numeric(10,2) not null default 0 check(base_fare >= 0),
  per_km numeric(10,2) not null default 0 check(per_km >= 0),
  minimum_fare numeric(10,2) not null default 0 check(minimum_fare >= 0),
  is_active boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.taxi_fare_settings enable row level security;
drop policy if exists "Authenticated users can read active taxi fares" on public.taxi_fare_settings;
create policy "Authenticated users can read active taxi fares"
on public.taxi_fare_settings for select to authenticated using (is_active=true);
insert into public.taxi_fare_settings(service_type,base_fare,per_km,minimum_fare,is_active)
values
  ('motorcycle',25,20,35,false),
  ('car',50,35,50,false)
on conflict(service_type) do update set
  base_fare=excluded.base_fare,
  per_km=excluded.per_km,
  minimum_fare=excluded.minimum_fare,
  is_active=false,
  updated_at=now();

-- Confirmed TWENDE rates (ZMW): motorcycle K25 base, K20/km, K35 minimum;
-- car K50 base, K35/km, K50 minimum. Deliberately remain inactive pending testing.
-- After successful tests, activate explicitly with:
-- update public.taxi_fare_settings set is_active=true, updated_at=now() where service_type in ('motorcycle','car');
