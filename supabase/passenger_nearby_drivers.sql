-- TWENDE passenger nearby-driver discovery.
-- Apply after ride_hailing_setup.sql and gps_fares_phase2.sql.
-- Only approved drivers who are online and have a recent GPS fix are returned.
create or replace function public.get_nearby_twende_drivers(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_km double precision default 15
)
returns table (
  driver_id uuid,
  vehicle_type text,
  latitude double precision,
  longitude double precision,
  distance_km double precision,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
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
  select l.driver_id, d.vehicle_type, l.latitude, l.longitude,
    (6371 * acos(least(1.0,greatest(-1.0,
      cos(radians(p_latitude))*cos(radians(l.latitude))*
      cos(radians(l.longitude)-radians(p_longitude))+
      sin(radians(p_latitude))*sin(radians(l.latitude))
    ))))::double precision as distance_km,
    l.updated_at
  from public.driver_locations l
  join public.driver_profiles d on d.user_id=l.driver_id
  where d.approval_status='approved'
    and d.is_online=true
    and l.updated_at > now() - interval '2 minutes'
    and 6371 * acos(least(1.0,greatest(-1.0,
      cos(radians(p_latitude))*cos(radians(l.latitude))*
      cos(radians(l.longitude)-radians(p_longitude))+
      sin(radians(p_latitude))*sin(radians(l.latitude))
    ))) <= greatest(1.0,least(coalesce(p_radius_km,15),50))
  order by distance_km asc
  limit 100;
end;
$$;
revoke all on function public.get_nearby_twende_drivers(double precision,double precision,double precision) from public;
grant execute on function public.get_nearby_twende_drivers(double precision,double precision,double precision) to authenticated;
