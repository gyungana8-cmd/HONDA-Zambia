-- TWENDE: connect multi-vehicle availability to GPS and passenger discovery.
-- Apply after gps_fares_phase2.sql and multi_vehicle_driver_phase2.sql.

drop policy if exists "Approved online drivers location visible to matching riders" on public.driver_locations;
create policy "Approved online drivers location visible to matching riders"
on public.driver_locations for select to authenticated
using (
  exists (
    select 1 from public.driver_vehicles v
    where v.user_id = driver_locations.driver_id
      and v.approval_status = 'approved'
      and v.is_online = true
  )
  and exists (
    select 1 from public.ride_requests r
    where r.rider_id = auth.uid()
      and r.driver_id = driver_locations.driver_id
      and r.status = 'accepted'
  )
);

create or replace function public.update_twende_driver_location(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null,
  p_heading numeric default null,
  p_speed_mps numeric default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then
    raise exception 'Driver sign-in is required';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception 'Invalid GPS coordinates';
  end if;
  if not exists (
    select 1 from public.driver_vehicles
    where user_id=auth.uid()
      and approval_status='approved'
      and is_online=true
  ) then
    raise exception 'Set an approved vehicle online before sharing GPS';
  end if;
  insert into public.driver_locations(driver_id,latitude,longitude,accuracy_m,heading,speed_mps,updated_at)
  values(auth.uid(),p_latitude,p_longitude,p_accuracy_m,p_heading,p_speed_mps,now())
  on conflict(driver_id) do update set
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    accuracy_m=excluded.accuracy_m,
    heading=excluded.heading,
    speed_mps=excluded.speed_mps,
    updated_at=now();
end;
$$;
revoke all on function public.update_twende_driver_location(double precision,double precision,numeric,numeric,numeric) from public;
grant execute on function public.update_twende_driver_location(double precision,double precision,numeric,numeric,numeric) to authenticated;

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
language plpgsql security definer set search_path=public as $$
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
    select l.driver_id, v.vehicle_type, l.latitude, l.longitude,
      (6371 * acos(least(1.0,greatest(-1.0,
        cos(radians(p_latitude))*cos(radians(l.latitude))*
        cos(radians(l.longitude)-radians(p_longitude))+
        sin(radians(p_latitude))*sin(radians(l.latitude))
      ))))::double precision as distance_km,
      l.updated_at,
      row_number() over (
        partition by l.driver_id
        order by case when v.vehicle_type='car' then 0 else 1 end, v.created_at
      ) as vehicle_rank
    from public.driver_locations l
    join public.driver_vehicles v on v.user_id=l.driver_id
    where v.approval_status='approved'
      and v.is_online=true
      and l.updated_at > now() - interval '2 minutes'
  )
  select c.driver_id,c.vehicle_type,c.latitude,c.longitude,c.distance_km,c.updated_at
  from candidates c
  where c.vehicle_rank=1
    and c.distance_km <= greatest(1.0,least(coalesce(p_radius_km,15),50))
  order by c.distance_km asc
  limit 100;
end;
$$;
revoke all on function public.get_nearby_twende_drivers(double precision,double precision,double precision) from public;
grant execute on function public.get_nearby_twende_drivers(double precision,double precision,double precision) to authenticated;
