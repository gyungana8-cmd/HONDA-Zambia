-- TWENDE: live passenger discovery of every approved, online taxi within 15 km.
-- Apply this migration in Supabase SQL Editor after passenger_nearby_vehicles_fix.sql.
-- Returns one row per online vehicle (not one row per driver), so both car and
-- motorcycle taxis can be displayed when both are registered and online.

drop function if exists public.get_nearby_twende_drivers(double precision,double precision,double precision);

create function public.get_nearby_twende_drivers(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 15
)
returns table (
  vehicle_id uuid,
  driver_id uuid,
  driver_name text,
  vehicle_type text,
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  updated_at timestamptz,
  vehicle_make text,
  vehicle_model text,
  plate_number text,
  vehicle_color text,
  vehicle_photo_url text,
  vehicle_photo_url_secondary text
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then
    raise exception 'Passenger sign-in is required';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception 'Valid pickup coordinates are required';
  end if;

  return query
  with candidates as (
    select
      v.id as vehicle_id,
      l.driver_id,
      coalesce(nullif(trim(v.driver_name),''),'TWENDE driver') as driver_name,
      v.vehicle_type,
      l.latitude,
      l.longitude,
      (6371 * acos(least(1.0,greatest(-1.0,
        cos(radians(p_latitude))*cos(radians(l.latitude))*
        cos(radians(l.longitude)-radians(p_longitude))+
        sin(radians(p_latitude))*sin(radians(l.latitude))
      ))))::double precision as distance_km,
      l.updated_at,
      v.vehicle_make,
      v.vehicle_model,
      v.plate_number,
      v.vehicle_color,
      v.vehicle_photo_url,
      v.vehicle_photo_url_secondary
    from public.driver_locations l
    join public.driver_vehicles v on v.user_id=l.driver_id
    where v.approval_status='approved'
      and v.is_online=true
      and l.updated_at > now()-interval '2 minutes'
  )
  select c.vehicle_id,c.driver_id,c.driver_name,c.vehicle_type,
    c.latitude,c.longitude,c.distance_km,c.updated_at,
    c.vehicle_make,c.vehicle_model,c.plate_number,c.vehicle_color,
    c.vehicle_photo_url,c.vehicle_photo_url_secondary
  from candidates c
  where c.distance_km <= greatest(0.1,least(coalesce(p_radius_km,15),15))
  order by c.distance_km asc
  limit 100;
end;
$$;

revoke all on function public.get_nearby_twende_drivers(double precision,double precision,double precision) from public;
grant execute on function public.get_nearby_twende_drivers(double precision,double precision,double precision) to authenticated;

select 'TWENDE passenger live discovery: all approved online vehicles within 15 km' as status;
