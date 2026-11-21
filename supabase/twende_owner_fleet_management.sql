-- TWENDE vehicle-owner fleet management
-- Apply after twende_partner_lifecycle.sql and multi_vehicle_driver_phase1.sql.
alter table public.driver_vehicles
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists last_latitude double precision,
  add column if not exists last_longitude double precision,
  add column if not exists location_updated_at timestamptz;

-- Preserve existing driver-owned vehicles; ownership is only assigned to newly
-- registered owner fleet vehicles through the secure RPC below.
create index if not exists driver_vehicles_owner_idx on public.driver_vehicles(owner_id);
create index if not exists driver_vehicles_location_idx on public.driver_vehicles(location_updated_at desc);

create or replace function public.twende_owner_add_vehicle(
 p_vehicle_type text,p_make text,p_model text,p_plate text,p_licence text,p_area text
) returns uuid language plpgsql security definer set search_path=public,auth as $$
declare v_id uuid; v_name text; v_phone text;
begin
 if auth.uid() is null or not exists(
   select 1 from public.twende_partner_applications a
   where a.user_id=auth.uid() and a.partner_type='vehicle_owner'
    and a.application_status='approved' and a.account_status='active'
 ) then raise exception 'An active approved vehicle-owner account is required'; end if;
 if p_vehicle_type not in ('car','motorcycle') then raise exception 'Choose car or motorcycle taxi'; end if;
 if nullif(trim(p_make),'') is null or nullif(trim(p_model),'') is null
   or nullif(trim(p_plate),'') is null or nullif(trim(p_licence),'') is null
   or nullif(trim(p_area),'') is null then raise exception 'Complete all vehicle details'; end if;
 select coalesce(p.full_name,u.email),coalesce(p.phone,u.phone)
 into v_name,v_phone from auth.users u left join public.profiles p on p.id=u.id where u.id=auth.uid();
 insert into public.driver_vehicles(user_id,owner_id,driver_name,phone,vehicle_type,vehicle_make,
  vehicle_model,plate_number,licence_number,operating_area,approval_status,is_online)
 values(auth.uid(),auth.uid(),v_name,coalesce(v_phone,''),p_vehicle_type,trim(p_make),
  trim(p_model),upper(trim(p_plate)),trim(p_licence),trim(p_area),'pending',false)
 returning id into v_id;
 return v_id;
end; $$;

create or replace function public.twende_owner_assign_driver(p_vehicle_id uuid,p_driver_email text)
returns void language plpgsql security definer set search_path=public,auth as $$
declare v_driver uuid;
begin
 if not exists(select 1 from public.driver_vehicles where id=p_vehicle_id and owner_id=auth.uid()) then
  raise exception 'Vehicle not found in your fleet'; end if;
 select u.id into v_driver from auth.users u
 join public.twende_partner_applications a on a.user_id=u.id
 where lower(u.email)=lower(trim(p_driver_email)) and a.partner_type='driver'
  and a.application_status='approved' and a.account_status='active'
 limit 1;
 if v_driver is null then raise exception 'No active approved driver account found for that email'; end if;
 if exists(select 1 from public.driver_vehicles where id=p_vehicle_id and approval_status<>'approved') then
  raise exception 'The vehicle must be approved by TWENDE before assignment'; end if;
 update public.driver_vehicles set user_id=v_driver,
  driver_name=coalesce((select full_name from public.profiles where id=v_driver),driver_name),
  phone=coalesce((select phone from public.profiles where id=v_driver),phone),
  is_online=false where id=p_vehicle_id and owner_id=auth.uid();
end; $$;

create or replace function public.twende_owner_unassign_driver(p_vehicle_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.driver_vehicles set user_id=owner_id,is_online=false
 where id=p_vehicle_id and owner_id=auth.uid();
 if not found then raise exception 'Vehicle not found in your fleet'; end if;
end; $$;

create or replace function public.twende_owner_update_vehicle_location(
 p_vehicle_id uuid,p_latitude double precision,p_longitude double precision
) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
  raise exception 'Invalid GPS coordinates'; end if;
 update public.driver_vehicles set last_latitude=p_latitude,last_longitude=p_longitude,
  location_updated_at=now()
 where id=p_vehicle_id and user_id=auth.uid() and approval_status='approved';
 if not found then raise exception 'This approved vehicle is not assigned to your driver account'; end if;
end; $$;

create or replace function public.twende_owner_fleet_summary()
returns table(vehicle_id uuid,vehicle_type text,vehicle_make text,vehicle_model text,
 plate_number text,operating_area text,approval_status text,is_online boolean,
 driver_user_id uuid,driver_name text,driver_phone text,last_latitude double precision,
 last_longitude double precision,location_updated_at timestamptz,
 completed_trips bigint,completed_value numeric)
language plpgsql stable security definer set search_path=public as $$
begin
 if not exists(select 1 from public.twende_partner_applications a where a.user_id=auth.uid()
  and a.partner_type='vehicle_owner' and a.application_status='approved' and a.account_status='active') then
  raise exception 'Active approved vehicle-owner account required'; end if;
 return query
 select v.id,v.vehicle_type,v.vehicle_make,v.vehicle_model,v.plate_number,v.operating_area,
  v.approval_status,v.is_online,v.user_id,v.driver_name,v.phone,v.last_latitude,v.last_longitude,
  v.location_updated_at,count(r.id) filter(where r.status='completed'),
  coalesce(sum(r.estimated_fare) filter(where r.status='completed'),0)
 from public.driver_vehicles v
 left join public.ride_requests r on r.driver_vehicle_id=v.id
 where v.owner_id=auth.uid()
 group by v.id order by v.created_at desc;
end; $$;

revoke all on function public.twende_owner_add_vehicle(text,text,text,text,text,text) from public;
revoke all on function public.twende_owner_assign_driver(uuid,text) from public;
revoke all on function public.twende_owner_unassign_driver(uuid) from public;
revoke all on function public.twende_owner_update_vehicle_location(uuid,double precision,double precision) from public;
revoke all on function public.twende_owner_fleet_summary() from public;
grant execute on function public.twende_owner_add_vehicle(text,text,text,text,text,text) to authenticated;
grant execute on function public.twende_owner_assign_driver(uuid,text) to authenticated;
grant execute on function public.twende_owner_unassign_driver(uuid) to authenticated;
grant execute on function public.twende_owner_update_vehicle_location(uuid,double precision,double precision) to authenticated;
grant execute on function public.twende_owner_fleet_summary() to authenticated;

select 'TWENDE owner fleet management migration ready' as status;
