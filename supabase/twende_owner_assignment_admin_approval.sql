-- TWENDE responsibility separation:
-- Vehicle owners assign approved drivers to their own approved fleet vehicles.
-- Fleet Managers and the Primary Administrator review/approve applications.
-- Preserve all existing vehicle ownership, driver assignments and approval records.

-- Remove specialist approval permissions from all roles except Fleet Manager.
delete from public.twende_admin_role_permissions
where permission_key in ('partners.review','fleet.review','fleet.assign')
  and admin_role <> 'primary';

insert into public.twende_admin_role_permissions(admin_role,permission_key) values
  ('fleet_manager','partners.review'),
  ('fleet_manager','fleet.review'),
  ('fleet_manager','fleet.view')
on conflict(admin_role,permission_key) do nothing;

-- Retire administrator-side driver assignment endpoints. Assignment is handled
-- by twende_owner_assign_driver_with_licence after ownership/approval checks.
revoke all on function public.twende_admin_list_assignable_drivers() from public;
revoke all on function public.twende_admin_list_assignable_drivers() from authenticated;
revoke all on function public.twende_admin_assign_driver_with_licence(uuid,text,text,text) from public;
revoke all on function public.twende_admin_assign_driver_with_licence(uuid,text,text,text) from authenticated;

-- Confirm the resulting specialist approval permissions.
select admin_role,permission_key
from public.twende_admin_role_permissions
where permission_key in ('partners.review','fleet.review','fleet.assign')
order by admin_role,permission_key;

select 'TWENDE owner assignment and Fleet Manager/Primary Administrator approval permissions updated' as status;
