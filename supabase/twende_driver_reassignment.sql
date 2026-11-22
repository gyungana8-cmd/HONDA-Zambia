-- TWENDE driver rejection and automatic nearby reassignment.
-- Apply after twende_ride_expiry.sql, twende_driver_request_delivery_fix.sql,
-- twende_owner_fleet_management.sql and twende_partner_lifecycle_fixed.sql.

create table if not exists public.twende_ride_rejections (
  ride_id uuid not null references public.ride_requests(id) on delete cascade,
  driver_id uuid not null references auth.users(id) on delete cascade,
  rejected_at timestamptz not null default now(),
  primary key (ride_id, driver_id)
);
alter table public.twende_ride_rejections enable row level security;

create index if not exists twende_ride_rejections_driver_idx
  on public.twende_ride_rejections(driver_id, rejected_at desc);

-- Driver queue only returns requests currently assigned to this driver and
-- never resurfaces a request that this driver has already rejected.
create or replace function public.twende_driver_ride_queue()
returns setof public.ride_requests
language sql stable security definer set search_path=public,auth
as $$
 select r.*
 from public.ride_requests r
 where auth.uid() is not null
   and exists (
     select 1 from public.twende_partner_applications a
     where a.user_id=auth.uid() and a.partner_type='driver'
       and a.application_status='approved' and a.account_status='active'
   )
   and (
     r.driver_id=auth.uid()
     or (
       r.status='pending' and r.driver_vehicle_id is not null
       and exists (
         select 1 from public.driver_vehicles v
         where v.id=r.driver_vehicle_id and v.user_id=auth.uid()
           and v.approval_status='approved' and v.is_online=true
           and v.vehicle_type=r.service_type
       )
       and not exists (
         select 1 from public.twende_ride_rejections x
         where x.ride_id=r.id and x.driver_id=auth.uid()
       )
     )
   )
 order by r.created_at desc limit 100;
$$;

-- Driver explicitly rejects a request. The row lock and conditional update
-- prevent two drivers receiving the same reassignment at the same time.
create or replace function public.reject_twende_ride(p_ride_id uuid)
returns jsonb
language plpgsql security definer set search_path=public,auth
as $$
declare
 v_ride public.ride_requests%rowtype;
 v_current_vehicle uuid;
 v_next_vehicle uuid;
begin
 if auth.uid() is null then raise exception 'Driver sign-in is required'; end if;
 if not exists (
   select 1 from public.twende_partner_applications a
   where a.user_id=auth.uid() and a.partner_type='driver'
     and a.application_status='approved' and a.account_status='active'
 ) then raise exception 'An active approved driver account is required'; end if;

 select * into v_ride from public.ride_requests
 where id=p_ride_id and status='pending' and expires_at>now()
 for update;
 if not found then raise exception 'This request is no longer available'; end if;

 select v.id into v_current_vehicle
 from public.driver_vehicles v
 where v.id=v_ride.driver_vehicle_id and v.user_id=auth.uid()
   and v.approval_status='approved';
 if not found then raise exception 'This request is not assigned to your driver account'; end if;

 insert into public.twende_ride_rejections(ride_id,driver_id)
 values(p_ride_id,auth.uid()) on conflict do nothing;

 select v.id into v_next_vehicle
 from public.driver_vehicles v
 join public.driver_locations l on l.driver_id=v.user_id
 join public.twende_partner_applications a
   on a.user_id=v.user_id and a.partner_type='driver'
  and a.application_status='approved' and a.account_status='active'
 where v.id<>v_current_vehicle
   and v.approval_status='approved' and v.is_online=true
   and v.vehicle_type=v_ride.service_type
   and l.latitude is not null and l.longitude is not null
   and l.updated_at>now()-interval '2 minutes'
   and not exists (
     select 1 from public.twende_ride_rejections x
     where x.ride_id=p_ride_id and x.driver_id=v.user_id
   )
   and 6371 * acos(least(1.0,greatest(-1.0,
       sin(radians(v_ride.pickup_lat))*sin(radians(l.latitude))+
       cos(radians(v_ride.pickup_lat))*cos(radians(l.latitude))*
       cos(radians(l.longitude-v_ride.pickup_lng))
   ))) <= 15
 order by 6371 * acos(least(1.0,greatest(-1.0,
       sin(radians(v_ride.pickup_lat))*sin(radians(l.latitude))+
       cos(radians(v_ride.pickup_lat))*cos(radians(l.latitude))*
       cos(radians(l.longitude-v_ride.pickup_lng))
   )))
 limit 1;

 update public.ride_requests
 set driver_id=null,driver_vehicle_id=v_next_vehicle
 where id=p_ride_id and status='pending' and expires_at>now();
 if not found then raise exception 'Request changed while reassignment was being processed'; end if;
 return jsonb_build_object('assigned_vehicle_id',v_next_vehicle,'queued',v_next_vehicle is null);
end;
$;

-- When a driver goes online, let that driver claim any unassigned pending
-- request of the matching service within 15 km, excluding prior rejections.
create or replace function public.twende_dispatch_waiting_rides()
returns integer
language plpgsql security definer set search_path=public,auth
as $$
declare
 v_ride record;
 v_vehicle uuid;
 v_count integer:=0;
begin
 if auth.uid() is null or not exists (
   select 1 from public.twende_partner_applications a
   where a.user_id=auth.uid() and a.partner_type='driver'
     and a.application_status='approved' and a.account_status='active'
 ) then raise exception 'An active approved driver account is required'; end if;

 for v_ride in
   select r.* from public.ride_requests r
   where r.status='pending' and r.driver_vehicle_id is null
     and r.expires_at>now() and r.pickup_lat is not null and r.pickup_lng is not null
   order by r.created_at
   for update skip locked
 loop
   select v.id into v_vehicle
   from public.driver_vehicles v
   join public.driver_locations l on l.driver_id=v.user_id
   where v.user_id=auth.uid() and v.approval_status='approved'
     and v.is_online=true and v.vehicle_type=v_ride.service_type
     and l.latitude is not null and l.longitude is not null
     and l.updated_at>now()-interval '2 minutes'
     and not exists (
       select 1 from public.twende_ride_rejections x
       where x.ride_id=v_ride.id and x.driver_id=auth.uid()
     )
     and 6371 * acos(least(1.0,greatest(-1.0,
       sin(radians(v_ride.pickup_lat))*sin(radians(l.latitude))+
       cos(radians(v_ride.pickup_lat))*cos(radians(l.latitude))*
       cos(radians(l.longitude-v_ride.pickup_lng))
     ))) <= 15
   order by 6371 * acos(least(1.0,greatest(-1.0,
       sin(radians(v_ride.pickup_lat))*sin(radians(l.latitude))+
       cos(radians(v_ride.pickup_lat))*cos(radians(l.latitude))*
       cos(radians(l.longitude-v_ride.pickup_lng))
     )))
   limit 1;

   if v_vehicle is not null then
     update public.ride_requests set driver_vehicle_id=v_vehicle,driver_id=null
     where id=v_ride.id and status='pending' and driver_vehicle_id is null;
     if found then v_count:=v_count+1; end if;
   end if;
 end loop;
 return v_count;
end;
$$;

revoke all on function public.reject_twende_ride(uuid) from public;
revoke all on function public.twende_dispatch_waiting_rides() from public;
revoke all on function public.twende_driver_ride_queue() from public;
grant execute on function public.reject_twende_ride(uuid) to authenticated;
grant execute on function public.twende_dispatch_waiting_rides() to authenticated;
grant execute on function public.twende_driver_ride_queue() to authenticated;

select 'TWENDE rejection and reassignment functions installed' as status;


-- GPS writes also try to dispatch any unassigned pending requests to this
-- newly located online driver. The two-minute freshness rule matches the
-- passenger nearby-vehicle discovery query.
create or replace function public.update_twende_driver_location(
 p_latitude double precision,p_longitude double precision,
 p_accuracy_m numeric default null,p_heading numeric default null,p_speed_mps numeric default null
) returns void language plpgsql security definer set search_path=public,auth as $$
begin
 if auth.uid() is null then raise exception 'Driver sign-in is required'; end if;
 if p_latitude is null or p_longitude is null
   or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
   raise exception 'Invalid GPS coordinates'; end if;
 if not exists(select 1 from public.driver_vehicles
   where user_id=auth.uid() and approval_status='approved' and is_online=true) then
   raise exception 'Set an approved vehicle online before sharing GPS'; end if;
 insert into public.driver_locations(driver_id,latitude,longitude,accuracy_m,heading,speed_mps,updated_at)
 values(auth.uid(),p_latitude,p_longitude,p_accuracy_m,p_heading,p_speed_mps,now())
 on conflict(driver_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,
   accuracy_m=excluded.accuracy_m,heading=excluded.heading,speed_mps=excluded.speed_mps,updated_at=now();
 perform public.twende_dispatch_waiting_rides();
end;
$$;
revoke all on function public.update_twende_driver_location(double precision,double precision,numeric,numeric,numeric) from public;
grant execute on function public.update_twende_driver_location(double precision,double precision,numeric,numeric,numeric) to authenticated;
