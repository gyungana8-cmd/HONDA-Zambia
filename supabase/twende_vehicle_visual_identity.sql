-- TWENDE vehicle photos and colour identification
-- Apply after twende_owner_fleet_management.sql.

alter table public.driver_vehicles
  add column if not exists vehicle_color text,
  add column if not exists vehicle_photo_url text,
  add column if not exists vehicle_photo_url_secondary text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('twende-vehicle-photos','twende-vehicle-photos',true,5242880,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "TWENDE owners upload own vehicle photos" on storage.objects;
create policy "TWENDE owners upload own vehicle photos"
on storage.objects for insert to authenticated
with check (
 bucket_id='twende-vehicle-photos'
 and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists "TWENDE owners update own vehicle photos" on storage.objects;
create policy "TWENDE owners update own vehicle photos"
on storage.objects for update to authenticated
using (bucket_id='twende-vehicle-photos' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='twende-vehicle-photos' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Public can view TWENDE vehicle photos" on storage.objects;
create policy "Public can view TWENDE vehicle photos"
on storage.objects for select to public using (bucket_id='twende-vehicle-photos');

create or replace function public.twende_owner_update_vehicle_visuals(
 p_vehicle_id uuid,p_vehicle_color text,p_photo_url text,p_photo_url_secondary text default null
) returns void language plpgsql security definer set search_path=public,auth as $$
begin
 if auth.uid() is null then raise exception 'Sign in is required'; end if;
 if nullif(trim(p_vehicle_color),'') is null then raise exception 'Select the vehicle colour'; end if;
 if p_photo_url is not null and p_photo_url not like '%/storage/v1/object/public/twende-vehicle-photos/%' then
  raise exception 'Invalid primary vehicle photo location'; end if;
 if p_photo_url_secondary is not null and p_photo_url_secondary not like '%/storage/v1/object/public/twende-vehicle-photos/%' then
  raise exception 'Invalid secondary vehicle photo location'; end if;
 update public.driver_vehicles
 set vehicle_color=trim(p_vehicle_color),vehicle_photo_url=p_photo_url,
     vehicle_photo_url_secondary=p_photo_url_secondary
 where id=p_vehicle_id and owner_id=auth.uid();
 if not found then raise exception 'Vehicle not found in your fleet'; end if;
end; $$;
revoke all on function public.twende_owner_update_vehicle_visuals(uuid,text,text,text) from public;
grant execute on function public.twende_owner_update_vehicle_visuals(uuid,text,text,text) to authenticated;

-- Drop the old OUT-parameter row type before changing the returned columns.
drop function if exists public.get_available_twende_vehicles();

create function public.get_available_twende_vehicles()
returns table (
 id uuid,vehicle_type text,driver_name text,vehicle_make text,vehicle_model text,
 plate_number text,operating_area text,vehicle_color text,vehicle_photo_url text,
 vehicle_photo_url_secondary text
)
language sql stable security definer set search_path=public as $$
 select v.id,v.vehicle_type,v.driver_name,v.vehicle_make,v.vehicle_model,
  v.plate_number,v.operating_area,v.vehicle_color,v.vehicle_photo_url,
  v.vehicle_photo_url_secondary
 from public.driver_vehicles v
 where v.approval_status='approved' and v.is_online=true
 order by v.vehicle_type,v.created_at desc;
$$;
revoke all on function public.get_available_twende_vehicles() from public;
grant execute on function public.get_available_twende_vehicles() to authenticated;

-- Extend the owner fleet summary so owners can edit and see saved vehicle visuals.
drop function if exists public.twende_owner_fleet_summary();
create function public.twende_owner_fleet_summary()
returns table(
 vehicle_id uuid,vehicle_type text,vehicle_make text,vehicle_model text,
 plate_number text,operating_area text,approval_status text,is_online boolean,
 driver_user_id uuid,driver_name text,driver_phone text,last_latitude double precision,
 last_longitude double precision,location_updated_at timestamptz,
 completed_trips bigint,completed_value numeric,
 vehicle_color text,vehicle_photo_url text,vehicle_photo_url_secondary text
)
language plpgsql stable security definer set search_path=public as $
begin
 if not exists(
  select 1 from public.twende_partner_applications a
  where a.user_id=auth.uid() and a.partner_type='vehicle_owner'
   and a.application_status='approved' and a.account_status='active'
 ) then
  raise exception 'Active approved vehicle-owner account required';
 end if;
 return query
 select v.id,v.vehicle_type,v.vehicle_make,v.vehicle_model,v.plate_number,v.operating_area,
  v.approval_status,v.is_online,v.user_id,v.driver_name,v.phone,v.last_latitude,v.last_longitude,
  v.location_updated_at,
  count(r.id) filter(where r.status='completed'),
  coalesce(sum(r.estimated_fare) filter(where r.status='completed'),0),
  v.vehicle_color,v.vehicle_photo_url,v.vehicle_photo_url_secondary
 from public.driver_vehicles v
 left join public.ride_requests r on r.driver_vehicle_id=v.id
 where v.owner_id=auth.uid()
 group by v.id order by v.created_at desc;
end; $;
revoke all on function public.twende_owner_fleet_summary() from public;
grant execute on function public.twende_owner_fleet_summary() to authenticated;

select 'TWENDE vehicle photo and colour identification migration ready' as status;
