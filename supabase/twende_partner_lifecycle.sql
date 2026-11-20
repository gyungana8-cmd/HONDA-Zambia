-- TWENDE partner registration and account lifecycle
-- Apply in Supabase SQL Editor after twende_admin_hierarchy.sql.
create table if not exists public.twende_partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_type text not null check (partner_type in ('driver','vehicle_owner')),
  vehicle_types text[] not null default '{}',
  application_status text not null default 'pending'
    check (application_status in ('pending','approved','rejected','dismissed','suspended')),
  account_status text not null default 'pending'
    check (account_status in ('pending','active','suspended')),
  applicant_name text not null,
  phone text not null,
  email text not null,
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,partner_type)
);
alter table public.twende_partner_applications enable row level security;
drop policy if exists "Partners can read own applications" on public.twende_partner_applications;
create policy "Partners can read own applications"
on public.twende_partner_applications for select to authenticated
using (user_id=auth.uid());

create or replace function public.twende_submit_partner_application(
  p_partner_type text,
  p_vehicle_types text[] default '{}'
) returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare v_id uuid; v_name text; v_phone text; v_email text; v_types text[];
begin
  if auth.uid() is null then raise exception 'Sign in before submitting a partner application'; end if;
  if p_partner_type not in ('driver','vehicle_owner') then raise exception 'Invalid partner type'; end if;
  select coalesce(nullif(trim(p.full_name),''),u.email),
         coalesce(nullif(trim(p.phone),''),u.phone),
         lower(u.email)
    into v_name,v_phone,v_email
  from auth.users u left join public.profiles p on p.id=u.id
  where u.id=auth.uid();
  if v_email is null then raise exception 'A verified account email is required'; end if;
  if v_phone is null or trim(v_phone)='' then raise exception 'Add a contact phone number to your profile before applying'; end if;
  v_types:=coalesce(p_vehicle_types,'{}');
  if p_partner_type='vehicle_owner' and
    (cardinality(v_types)=0 or not (v_types <@ array['car','motorcycle']::text[])) then
    raise exception 'Select car, motorcycle or both vehicle categories';
  end if;
  insert into public.twende_partner_applications(user_id,partner_type,vehicle_types,applicant_name,phone,email)
  values(auth.uid(),p_partner_type,case when p_partner_type='driver' then '{}' else v_types end,v_name,v_phone,v_email)
  on conflict(user_id,partner_type) do update set
    applicant_name=excluded.applicant_name,phone=excluded.phone,email=excluded.email,
    vehicle_types=case when public.twende_partner_applications.application_status in ('rejected','dismissed')
      then excluded.vehicle_types else public.twende_partner_applications.vehicle_types end,
    application_status=case when public.twende_partner_applications.application_status in ('rejected','dismissed')
      then 'pending' else public.twende_partner_applications.application_status end,
    account_status=case when public.twende_partner_applications.application_status in ('rejected','dismissed')
      then 'pending' else public.twende_partner_applications.account_status end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.twende_get_partner_access()
returns table(partner_type text,application_status text,account_status text,vehicle_types text[])
language sql stable security definer set search_path=public as $$
  select a.partner_type,a.application_status,a.account_status,a.vehicle_types
  from public.twende_partner_applications a where a.user_id=auth.uid();
$$;

create or replace function public.twende_admin_list_partner_applications()
returns table(id uuid,user_id uuid,partner_type text,vehicle_types text[],application_status text,
 account_status text,applicant_name text,phone text,email text,review_note text,created_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.twende_is_admin() then raise exception 'Administrator access required'; end if;
 return query select a.id,a.user_id,a.partner_type,a.vehicle_types,a.application_status,
  a.account_status,a.applicant_name,a.phone,a.email,a.review_note,a.created_at
 from public.twende_partner_applications a order by
  case when a.application_status='pending' then 0 else 1 end,a.created_at desc;
end; $$;

create or replace function public.twende_admin_review_partner_application(
 p_application_id uuid,p_decision text,p_review_note text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.twende_is_admin() then raise exception 'Administrator access required'; end if;
 if p_decision not in ('approved','rejected','dismissed','suspended','activated') then
  raise exception 'Invalid application decision'; end if;
 update public.twende_partner_applications
 set application_status=case when p_decision='activated' then 'approved' else p_decision end,
     account_status=case when p_decision in ('approved','activated') then 'active'
       when p_decision='suspended' then 'suspended' else 'pending' end,
     review_note=nullif(trim(p_review_note),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
 where id=p_application_id
   and (p_decision in ('suspended','activated') or application_status='pending');
 if not found then raise exception 'Application not found or cannot be changed from its current status'; end if;
end; $$;

revoke all on function public.twende_submit_partner_application(text,text[]) from public;
revoke all on function public.twende_get_partner_access() from public;
revoke all on function public.twende_admin_list_partner_applications() from public;
revoke all on function public.twende_admin_review_partner_application(uuid,text,text) from public;
grant execute on function public.twende_submit_partner_application(text,text[]) to authenticated;
grant execute on function public.twende_get_partner_access() to authenticated;
grant execute on function public.twende_admin_list_partner_applications() to authenticated;
grant execute on function public.twende_admin_review_partner_application(uuid,text,text) to authenticated;


-- Preserve existing approved driver accounts and vehicles during rollout.
insert into public.twende_partner_applications(
 user_id,partner_type,vehicle_types,application_status,account_status,applicant_name,phone,email,reviewed_at
)
select distinct v.user_id,'driver','{}','approved','active',
 coalesce(nullif(trim(v.driver_name),''),u.email),
 coalesce(nullif(trim(v.phone),''),u.phone),
 lower(u.email),now()
from public.driver_vehicles v join auth.users u on u.id=v.user_id
where v.approval_status='approved' and u.email is not null
on conflict(user_id,partner_type) do nothing;

-- Account suspension takes approved vehicles offline and prevents future online activation.
create or replace function public.twende_set_vehicle_online(p_vehicle_id uuid,p_online boolean)
returns void language plpgsql security definer set search_path=public as $
begin
 if not exists(
   select 1 from public.twende_partner_applications a
   where a.user_id=auth.uid() and a.partner_type='driver'
     and a.application_status='approved' and a.account_status='active'
 ) then
   raise exception 'Driver partner account is not active. Contact TWENDE support.';
 end if;
 if not exists(select 1 from public.driver_vehicles
   where id=p_vehicle_id and user_id=auth.uid() and approval_status='approved') then
   raise exception 'Only your approved vehicle can be set online';
 end if;
 update public.driver_vehicles set is_online=p_online where id=p_vehicle_id and user_id=auth.uid();
end; $;
revoke all on function public.twende_set_vehicle_online(uuid,boolean) from public;
grant execute on function public.twende_set_vehicle_online(uuid,boolean) to authenticated;

select 'partner lifecycle migration ready' as status;
