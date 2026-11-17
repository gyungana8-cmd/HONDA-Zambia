-- TWENDE multi-vehicle driver migration (non-destructive phase 1)
-- Creates one vehicle record per vehicle while preserving the existing
-- driver_profiles table and its current approved driver record.
-- Do not delete or alter driver_profiles during this phase.

create table if not exists public.driver_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  driver_name text not null,
  phone text not null,
  vehicle_type text not null check (vehicle_type in ('motorcycle','car')),
  vehicle_make text not null,
  vehicle_model text not null,
  plate_number text not null,
  licence_number text not null,
  operating_area text not null,
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  is_online boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists driver_vehicles_user_plate_uidx
  on public.driver_vehicles(user_id, lower(plate_number));

create index if not exists driver_vehicles_user_idx
  on public.driver_vehicles(user_id);

create index if not exists driver_vehicles_matching_idx
  on public.driver_vehicles(vehicle_type, approval_status, is_online);

alter table public.driver_vehicles enable row level security;

drop policy if exists "Drivers can read own vehicle records" on public.driver_vehicles;
create policy "Drivers can read own vehicle records"
  on public.driver_vehicles for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Admins can read vehicle applications" on public.driver_vehicles;
create policy "Admins can read vehicle applications"
  on public.driver_vehicles for select to authenticated
  using (exists (
    select 1 from public.twende_admins a where a.user_id = auth.uid()
  ));

drop policy if exists "Users can register their own vehicles" on public.driver_vehicles;
create policy "Users can register their own vehicles"
  on public.driver_vehicles for insert to authenticated
  with check (
    user_id = auth.uid()
    and approval_status = 'pending'
    and is_online = false
  );

-- Copy each existing driver profile into the new vehicle table.
-- Existing approval and online status are retained. Re-running this migration
-- will not create duplicate copies for the same account and plate number.
insert into public.driver_vehicles (
  user_id, driver_name, phone, vehicle_type, vehicle_make, vehicle_model,
  plate_number, licence_number, operating_area, approval_status, is_online,
  created_at
)
select
  d.user_id, d.driver_name, d.phone, d.vehicle_type, d.vehicle_make,
  d.vehicle_model, d.plate_number, d.licence_number, d.operating_area,
  d.approval_status, d.is_online, d.created_at
from public.driver_profiles d
on conflict (user_id, lower(plate_number)) do nothing;

-- Verification: this should show the migrated vehicle(s), including the
-- existing Nissan Note if that is the vehicle currently registered.
select user_id, driver_name, vehicle_type, vehicle_make, vehicle_model,
       plate_number, approval_status, is_online
from public.driver_vehicles
order by created_at;
