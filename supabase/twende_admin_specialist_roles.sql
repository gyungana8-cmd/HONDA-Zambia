-- TWENDE specialist administrator roles and server-enforced permissions
-- Apply AFTER supabase/twende_admin_hierarchy.sql and partner lifecycle SQL.
-- Existing Primary and Operations administrators are preserved.

alter table public.twende_admins drop constraint if exists twende_admins_admin_role_check;
alter table public.twende_admins add constraint twende_admins_admin_role_check
 check (admin_role in ('primary','operations','fleet_manager','driver_support','finance','customer_support','compliance','dispatcher'));

create table if not exists public.twende_admin_role_permissions (
 admin_role text not null,
 permission_key text not null,
 primary key(admin_role,permission_key)
);
alter table public.twende_admin_role_permissions enable row level security;
revoke all on public.twende_admin_role_permissions from anon,authenticated;

insert into public.twende_admin_role_permissions(admin_role,permission_key) values
 ('primary','*'),
 ('operations','partners.review'),('operations','fleet.review'),('operations','rides.view'),
 ('operations','rides.dispatch'),('operations','support.manage'),('operations','compliance.review'),
 ('fleet_manager','fleet.review'),('fleet_manager','fleet.assign'),('fleet_manager','fleet.view'),
 ('driver_support','partners.review'),('driver_support','drivers.support'),('driver_support','rides.view'),
 ('finance','finance.view'),('finance','finance.reconcile'),
 ('customer_support','support.manage'),('customer_support','rides.view'),
 ('compliance','compliance.review'),('compliance','partners.review'),
 ('dispatcher','rides.view'),('dispatcher','rides.dispatch')
on conflict do nothing;

create or replace function public.twende_admin_has_permission(p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(
   select 1 from public.twende_admins a
   join public.twende_admin_role_permissions p on p.admin_role=a.admin_role
   where a.user_id=auth.uid()
     and (p.permission_key='*' or p.permission_key=p_permission)
 );
$$;

create or replace function public.twende_add_admin_by_role(p_email text,p_role text)
returns void language plpgsql security definer set search_path=public as $$
declare v_user_id uuid; v_email text; v_role text:=lower(trim(p_role));
begin
 if not public.twende_is_primary_admin() then raise exception 'Only the Primary Administrator can appoint administrators'; end if;
 if v_role not in ('operations','fleet_manager','driver_support','finance','customer_support','compliance','dispatcher') then
   raise exception 'Select a valid specialist administrator role'; end if;
 v_email:=lower(trim(p_email));
 if v_email is null or v_email='' then raise exception 'Email address is required'; end if;
 select id,lower(email) into v_user_id,v_email from auth.users where lower(email)=v_email limit 1;
 if v_user_id is null then raise exception 'No registered TWENDE account was found for that email'; end if;
 if exists(select 1 from public.twende_admins where user_id=v_user_id and admin_role='primary') then
   raise exception 'The Primary Administrator role cannot be reassigned'; end if;
 insert into public.twende_admins(user_id,email,admin_role) values(v_user_id,v_email,v_role)
 on conflict(user_id) do update set email=excluded.email,admin_role=excluded.admin_role;
end; $$;

create or replace function public.twende_list_admins()
returns table(user_id uuid,email text,admin_role text,created_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.twende_is_primary_admin() then raise exception 'Primary Administrator access required'; end if;
 return query select a.user_id,a.email,a.admin_role,a.created_at
 from public.twende_admins a
 order by case when a.admin_role='primary' then 0 else 1 end,a.created_at;
end; $$;

create or replace function public.twende_remove_operations_admin(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.twende_is_primary_admin() then raise exception 'Only the Primary Administrator can remove administrators'; end if;
 if p_user_id=auth.uid() then raise exception 'You cannot remove your own administrator access here'; end if;
 delete from public.twende_admins where user_id=p_user_id and admin_role<>'primary';
 if not found then raise exception 'Administrator not found'; end if;
end; $$;

-- Partner review is limited to roles with the partner-review permission.
create or replace function public.twende_admin_list_partner_applications()
returns table(id uuid,user_id uuid,partner_type text,vehicle_types text[],application_status text,
 account_status text,applicant_name text,phone text,email text,review_note text,created_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.twende_admin_has_permission('partners.review') then raise exception 'Partner-review permission required'; end if;
 return query select a.id,a.user_id,a.partner_type,a.vehicle_types,a.application_status,
  a.account_status,a.applicant_name,a.phone,a.email,a.review_note,a.created_at
 from public.twende_partner_applications a order by
  case when a.application_status='pending' then 0 else 1 end,a.created_at desc;
end; $$;

create or replace function public.twende_admin_review_partner_application(
 p_application_id uuid,p_decision text,p_review_note text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.twende_admin_has_permission('partners.review') then raise exception 'Partner-review permission required'; end if;
 if p_decision not in ('approved','rejected','dismissed','suspended','activated') then raise exception 'Invalid application decision'; end if;
 update public.twende_partner_applications
 set application_status=case when p_decision='activated' then 'approved' else p_decision end,
     account_status=case when p_decision in ('approved','activated') then 'active'
       when p_decision='suspended' then 'suspended' else 'pending' end,
     review_note=nullif(trim(p_review_note),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
 where id=p_application_id
   and (p_decision in ('suspended','activated') or application_status='pending');
 if not found then raise exception 'Application not found or cannot be changed from its current status'; end if;
 if p_decision='suspended' then
   update public.driver_vehicles set is_online=false
   where user_id=(select user_id from public.twende_partner_applications where id=p_application_id);
 end if;
end; $$;

revoke all on function public.twende_admin_has_permission(text) from public;
revoke all on function public.twende_add_admin_by_role(text,text) from public;
revoke all on function public.twende_list_admins() from public;
revoke all on function public.twende_remove_operations_admin(uuid) from public;
revoke all on function public.twende_admin_list_partner_applications() from public;
revoke all on function public.twende_admin_review_partner_application(uuid,text,text) from public;
grant execute on function public.twende_admin_has_permission(text) to authenticated;
grant execute on function public.twende_add_admin_by_role(text,text) to authenticated;
grant execute on function public.twende_list_admins() to authenticated;
grant execute on function public.twende_remove_operations_admin(uuid) to authenticated;
grant execute on function public.twende_admin_list_partner_applications() to authenticated;
grant execute on function public.twende_admin_review_partner_application(uuid,text,text) to authenticated;

select admin_role,permission_key from public.twende_admin_role_permissions order by admin_role,permission_key;

-- Return only the signed-in administrator's own role label.
create or replace function public.twende_get_my_admin_role()
returns text language sql stable security definer set search_path=public as $$
 select admin_role from public.twende_admins where user_id=auth.uid() limit 1;
$$;
revoke all on function public.twende_get_my_admin_role() from public;
grant execute on function public.twende_get_my_admin_role() to authenticated;

-- Vehicle approval actions require the fleet-review permission.
create or replace function public.twende_admin_review_vehicle(
 p_vehicle_id uuid,p_decision text
) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.twende_admin_has_permission('fleet.review') then
   raise exception 'Fleet-review permission required';
 end if;
 if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;
 update public.driver_vehicles
 set approval_status=p_decision,is_online=false
 where id=p_vehicle_id and approval_status='pending';
 if not found then raise exception 'Pending vehicle application not found'; end if;
end; $$;
revoke all on function public.twende_admin_review_vehicle(uuid,text) from public;
grant execute on function public.twende_admin_review_vehicle(uuid,text) to authenticated;
