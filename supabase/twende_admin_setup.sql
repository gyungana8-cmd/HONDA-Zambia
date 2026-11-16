-- TWENDE administrator bootstrap and secure driver review
-- Assigns administrator access to the existing Supabase Auth account with this email.
create table if not exists public.twende_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.twende_admins enable row level security;
drop policy if exists "Admins can read their own admin record" on public.twende_admins;
create policy "Admins can read their own admin record"
on public.twende_admins for select to authenticated
using (user_id = auth.uid());

-- Bootstrap only this named account; no password or client-side role claim is used.
insert into public.twende_admins(user_id,email)
select id, lower(email)
from auth.users
where lower(email) = lower('gyungana8@gmail.com')
on conflict (user_id) do update set email = excluded.email;

create or replace function public.twende_is_admin()
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(select 1 from public.twende_admins where user_id=auth.uid());
$$;

create or replace function public.twende_admin_review_driver(
  p_driver_id uuid,
  p_decision text
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from public.twende_admins where user_id=auth.uid()) then
    raise exception 'Administrator access required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  update public.driver_profiles
  set approval_status=p_decision,
      is_online=false
  where user_id=p_driver_id and approval_status='pending';
  if not found then
    raise exception 'Pending driver application not found';
  end if;
end;
$$;

revoke all on function public.twende_is_admin() from public;
revoke all on function public.twende_admin_review_driver(uuid,text) from public;
grant execute on function public.twende_is_admin() to authenticated;
grant execute on function public.twende_admin_review_driver(uuid,text) to authenticated;

-- Show whether the target account was found and assigned.
select
  exists(select 1 from auth.users where lower(email)=lower('gyungana8@gmail.com')) as account_exists,
  exists(select 1 from public.twende_admins a join auth.users u on u.id=a.user_id
         where lower(u.email)=lower('gyungana8@gmail.com')) as admin_assigned;
