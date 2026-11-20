-- TWENDE Control Centre administrator hierarchy
-- Run once in Supabase SQL Editor for project obgteeruczqlebllrafr.
-- Every row in twende_admins retains operational permissions. The primary
-- administrator additionally manages administrator appointments.

alter table public.twende_admins
  add column if not exists admin_role text not null default 'operations'
  check (admin_role in ('primary','operations'));

-- The existing designated account remains the Primary Administrator.
update public.twende_admins
set admin_role='primary'
where lower(email)=lower('gyungana8@gmail.com');

create or replace function public.twende_is_admin()
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(select 1 from public.twende_admins where user_id=auth.uid());
$$;

create or replace function public.twende_is_primary_admin()
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.twende_admins
    where user_id=auth.uid() and admin_role='primary'
  );
$$;

create or replace function public.twende_list_admins()
returns table(user_id uuid,email text,admin_role text,created_at timestamptz)
language plpgsql stable security definer set search_path=public
as $$
begin
  if not public.twende_is_primary_admin() then
    raise exception 'Primary Administrator access required';
  end if;
  return query
    select a.user_id,a.email,a.admin_role,a.created_at
    from public.twende_admins a
    order by case when a.admin_role='primary' then 0 else 1 end,a.created_at;
end;
$$;

create or replace function public.twende_add_operations_admin(p_email text)
returns void
language plpgsql security definer set search_path=public
as $$
declare v_user_id uuid; v_email text;
begin
  if not public.twende_is_primary_admin() then
    raise exception 'Only the Primary Administrator can appoint administrators';
  end if;
  v_email:=lower(trim(p_email));
  if v_email is null or v_email='' then raise exception 'Email address is required'; end if;
  select id,lower(email) into v_user_id,v_email
  from auth.users where lower(email)=v_email limit 1;
  if v_user_id is null then raise exception 'No registered TWENDE account was found for that email'; end if;
  if exists(select 1 from public.twende_admins where user_id=v_user_id and admin_role='primary') then
    raise exception 'This account is already a Primary Administrator';
  end if;
  insert into public.twende_admins(user_id,email,admin_role)
  values(v_user_id,v_email,'operations')
  on conflict(user_id) do update set email=excluded.email,admin_role='operations';
end;
$$;

create or replace function public.twende_remove_operations_admin(p_user_id uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.twende_is_primary_admin() then
    raise exception 'Only the Primary Administrator can remove administrators';
  end if;
  if p_user_id=auth.uid() then raise exception 'You cannot remove your own administrator access here'; end if;
  delete from public.twende_admins
  where user_id=p_user_id and admin_role='operations';
  if not found then raise exception 'Operations Administrator not found'; end if;
end;
$$;

revoke all on function public.twende_is_admin() from public;
revoke all on function public.twende_is_primary_admin() from public;
revoke all on function public.twende_list_admins() from public;
revoke all on function public.twende_add_operations_admin(text) from public;
revoke all on function public.twende_remove_operations_admin(uuid) from public;
grant execute on function public.twende_is_admin() to authenticated;
grant execute on function public.twende_is_primary_admin() to authenticated;
grant execute on function public.twende_list_admins() to authenticated;
grant execute on function public.twende_add_operations_admin(text) to authenticated;
grant execute on function public.twende_remove_operations_admin(uuid) to authenticated;

-- Verification: existing primary account should return primary.
select email,admin_role from public.twende_admins order by created_at;
