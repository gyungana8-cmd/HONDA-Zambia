-- TWENDE multi-vehicle phase 2: secure vehicle controls and ride matching
-- Safe to run after multi_vehicle_driver_phase1.sql. Keeps driver_profiles intact.
alter table public.ride_requests
  add column if not exists driver_vehicle_id uuid references public.driver_vehicles(id) on delete set null;

drop policy if exists "Admins can read driver vehicles" on public.driver_vehicles;
create policy "Admins can read driver vehicles"
  on public.driver_vehicles for select to authenticated
  using (exists(select 1 from public.twende_admins a where a.user_id=auth.uid()));

create or replace function public.twende_set_vehicle_online(p_vehicle_id uuid,p_online boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.driver_vehicles
    where id=p_vehicle_id and user_id=auth.uid() and approval_status='approved') then
    raise exception 'Only your approved vehicle can be set online';
  end if;
  update public.driver_vehicles set is_online=p_online
    where id=p_vehicle_id and user_id=auth.uid();
end; $$;

create or replace function public.twende_admin_review_vehicle(p_vehicle_id uuid,p_decision text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.twende_admins where user_id=auth.uid()) then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
  update public.driver_vehicles set approval_status=p_decision,is_online=false
    where id=p_vehicle_id and approval_status='pending';
  if not found then raise exception 'Pending vehicle application not found'; end if;
end; $$;

drop policy if exists "Passengers and assigned drivers can read rides" on public.ride_requests;
create policy "Passengers and assigned drivers can read rides"
  on public.ride_requests for select to authenticated using (
    rider_id=auth.uid() or driver_id=auth.uid() or
    (status='pending' and exists(
      select 1 from public.driver_vehicles v
      where v.user_id=auth.uid() and v.approval_status='approved'
        and v.is_online=true and v.vehicle_type=ride_requests.service_type
    ))
  );

create or replace function public.accept_twende_ride(p_ride_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_vehicle public.driver_vehicles%rowtype; v_type text;
begin
  select service_type into v_type from public.ride_requests where id=p_ride_id and status='pending';
  if not found then raise exception 'Ride is no longer available'; end if;
  select * into v_vehicle from public.driver_vehicles
   where user_id=auth.uid() and approval_status='approved' and is_online=true
     and vehicle_type=v_type order by created_at limit 1;
  if not found then raise exception 'An approved online matching vehicle is required'; end if;
  update public.ride_requests set driver_id=auth.uid(),driver_vehicle_id=v_vehicle.id,
    status='accepted',accepted_at=now()
   where id=p_ride_id and status='pending';
  if not found then raise exception 'Ride is no longer available'; end if;
end; $$;

revoke all on function public.twende_set_vehicle_online(uuid,boolean) from public;
revoke all on function public.twende_admin_review_vehicle(uuid,text) from public;
grant execute on function public.twende_set_vehicle_online(uuid,boolean) to authenticated;
grant execute on function public.twende_admin_review_vehicle(uuid,text) to authenticated;
revoke all on function public.accept_twende_ride(uuid) from public;
grant execute on function public.accept_twende_ride(uuid) to authenticated;
