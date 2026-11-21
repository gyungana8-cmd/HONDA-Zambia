-- TWENDE: collect driver identity details at vehicle assignment.
-- Vehicle registration/vehicle licence fields remain unchanged.
alter table public.twende_partner_applications
  add column if not exists driver_licence_number text,
  add column if not exists driver_nrc_number text;

-- Retire assignment RPCs that do not collect the required driver identity details.
revoke all on function public.twende_owner_assign_driver(uuid,text) from public;
revoke all on function public.twende_owner_assign_driver(uuid,text) from authenticated;
revoke all on function public.twende_owner_assign_driver_with_licence(uuid,text,text) from public;
revoke all on function public.twende_owner_assign_driver_with_licence(uuid,text,text) from authenticated;

create or replace function public.twende_owner_assign_driver_with_licence(
  p_vehicle_id uuid,
  p_driver_email text,
  p_driver_licence text,
  p_driver_nrc text
) returns void
language plpgsql security definer set search_path=public,auth as $$
declare
  v_driver uuid;
  v_licence text;
  v_nrc text;
begin
  v_licence := nullif(trim(p_driver_licence),'');
  v_nrc := nullif(upper(trim(p_driver_nrc)),'');
  if v_licence is null then
    raise exception 'Enter the assigned driver licence number';
  end if;
  if v_nrc is null then
    raise exception 'Enter the assigned driver NRC number';
  end if;

  if not exists(
    select 1 from public.driver_vehicles
    where id=p_vehicle_id and owner_id=auth.uid()
  ) then
    raise exception 'Vehicle not found in your fleet';
  end if;

  if exists(
    select 1 from public.driver_vehicles
    where id=p_vehicle_id and approval_status<>'approved'
  ) then
    raise exception 'The vehicle must be approved by TWENDE before assignment';
  end if;

  select u.id into v_driver
  from auth.users u
  join public.twende_partner_applications a on a.user_id=u.id
  where lower(u.email)=lower(trim(p_driver_email))
    and a.partner_type='driver'
    and a.application_status='approved'
    and a.account_status='active'
  limit 1;

  if v_driver is null then
    raise exception 'No active approved driver account found for that email';
  end if;

  update public.twende_partner_applications
  set driver_licence_number=v_licence,
      driver_nrc_number=v_nrc,
      updated_at=now()
  where user_id=v_driver and partner_type='driver';

  if not found then
    raise exception 'Approved driver application could not be updated';
  end if;

  update public.driver_vehicles
  set user_id=v_driver,
      driver_name=coalesce((select full_name from public.profiles where id=v_driver),driver_name),
      phone=coalesce((select phone from public.profiles where id=v_driver),phone),
      is_online=false
  where id=p_vehicle_id and owner_id=auth.uid();
end;
$$;

revoke all on function public.twende_owner_assign_driver_with_licence(uuid,text,text,text) from public;
grant execute on function public.twende_owner_assign_driver_with_licence(uuid,text,text,text) to authenticated;

select 'TWENDE driver licence and NRC assignment migration ready' as status;
