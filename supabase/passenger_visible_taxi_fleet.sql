-- TWENDE passenger-visible available taxi fleet.
-- Run after multi_vehicle_driver_phase1.sql and multi_vehicle_driver_phase2.sql.
-- Exposes only approved, online vehicles and the fields passengers requested.
-- Contact numbers and owner account IDs are intentionally not returned.

create or replace function public.get_available_twende_vehicles()
returns table (
  id uuid,
  vehicle_type text,
  driver_name text,
  vehicle_make text,
  vehicle_model text,
  plate_number text,
  operating_area text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.vehicle_type,
    v.driver_name,
    v.vehicle_make,
    v.vehicle_model,
    v.plate_number,
    v.operating_area
  from public.driver_vehicles v
  where v.approval_status = 'approved'
    and v.is_online = true
  order by v.vehicle_type, v.created_at desc;
$$;

revoke all on function public.get_available_twende_vehicles() from public;
grant execute on function public.get_available_twende_vehicles() to authenticated;
