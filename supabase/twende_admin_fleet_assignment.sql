-- TWENDE administrator fleet assignment
-- Apply after twende_admin_specialist_roles.sql,
-- twende_owner_fleet_management.sql and twende_driver_licence_assignment.sql.

create or replace function public.twende_admin_list_assignable_drivers()
returns table(driver_user_id uuid,email text,driver_name text,phone text)
language plpgsql stable security definer set search_path=public,auth as $$
begin
  if not public.twende_admin_has_permission('fleet.assign') then
    raise exception 'Fleet-assignment permission required';
  end if;
  return query
  select u.id, lower(u.email),
         coalesce(nullif(p.full_name,''), a.applicant_name, u.email),
         coalesce(nullif(p.phone,''), a.phone, u.phone, '')
  from public.twende_partner_applications a
  join auth.users u on u.id=a.user_id
  left join public.profiles p on p.id=u.id
  where a.partner_type='driver'
    and a.application_status='approved'
    and a.account_status='active'
  order by coalesce(nullif(p.full_name,''),a.applicant_name,u.email);
end;
$$;

create or replace function public.twende_admin_assign_driver_with_licence(
  p_vehicle_id uuid,
  p_driver_email text,
  p_driver_licence text,
  p_driver_nrc text
) returns void
language plpgsql security definer set search_path=public,auth as $$
declare
  v_driver uuid;
  v_licence text := nullif(trim(p_driver_licence),'');
  v_nrc text := nullif(upper(trim(p_driver_nrc)),'');
begin
  if not public.twende_admin_has_permission('fleet.assign') then
    raise exception 'Fleet-assignment permission required';
  end if;
  if v_licence is null or v_nrc is null then
    raise exception 'Driver licence and NRC numbers are required';
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

  if not exists(
    select 1 from public.driver_vehicles
    where id=p_vehicle_id and approval_status='approved'
  ) then
    raise exception 'Only an approved vehicle can be assigned';
  end if;

  update public.twende_partner_applications
  set driver_licence_number=v_licence,
      driver_nrc_number=v_nrc,
      updated_at=now()
  where user_id=v_driver and partner_type='driver'
    and application_status='approved' and account_status='active';

  if not found then
    raise exception 'Approved driver application could not be updated';
  end if;

  update public.driver_vehicles
  set user_id=v_driver,
      driver_name=coalesce((select nullif(full_name,'') from public.profiles where id=v_driver),driver_name),
      phone=coalesce((select nullif(phone,'') from public.profiles where id=v_driver),phone),
      is_online=false
  where id=p_vehicle_id and approval_status='approved';
end;
$$;

revoke all on function public.twende_admin_list_assignable_drivers() from public;
revoke all on function public.twende_admin_assign_driver_with_licence(uuid,text,text,text) from public;
grant execute on function public.twende_admin_list_assignable_drivers() to authenticated;
grant execute on function public.twende_admin_assign_driver_with_licence(uuid,text,text,text) to authenticated;

select 'TWENDE administrator fleet assignment functions ready' as status;
