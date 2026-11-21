-- TWENDE taxi booking expiry
-- Apply after ride_hailing_setup.sql, multi_vehicle_driver_phase2.sql,
-- and twende_partner_lifecycle_fixed.sql.
-- Unaccepted taxi requests expire 15 minutes after creation.
-- Accepted/completed/cancelled records are retained for the audit trail.

alter table public.ride_requests
  add column if not exists expires_at timestamptz,
  add column if not exists expired_at timestamptz;

alter table public.ride_requests
  alter column expires_at set default (now() + interval '15 minutes');

update public.ride_requests
set expires_at = coalesce(expires_at, created_at + interval '15 minutes')
where expires_at is null;

-- Extend the existing status constraint without deleting historical records.
alter table public.ride_requests
  drop constraint if exists ride_requests_status_check;
alter table public.ride_requests
  add constraint ride_requests_status_check
  check (status in ('pending','accepted','completed','cancelled','expired'));

create index if not exists ride_requests_pending_expiry_idx
  on public.ride_requests(expires_at)
  where status = 'pending';

-- Mark all already-stale pending requests as expired immediately.
update public.ride_requests
set status = 'expired', expired_at = now()
where status = 'pending' and expires_at <= now();

create or replace function public.expire_stale_twende_rides()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_expired integer;
begin
  update public.ride_requests
     set status = 'expired', expired_at = now()
   where status = 'pending'
     and expires_at <= now();
  get diagnostics v_expired = row_count;
  return v_expired;
end;
$$;

revoke all on function public.expire_stale_twende_rides() from public;
grant execute on function public.expire_stale_twende_rides() to authenticated;

-- Expired requests must no longer be visible to drivers looking for work.
drop policy if exists "Passengers and assigned drivers can read rides" on public.ride_requests;
create policy "Passengers and assigned drivers can read rides"
on public.ride_requests for select to authenticated
using (
  rider_id = auth.uid()
  or driver_id = auth.uid()
  or (
    status = 'pending'
    and expires_at > now()
    and exists (
      select 1 from public.driver_vehicles v
      where v.user_id = auth.uid()
        and v.approval_status = 'approved'
        and v.is_online = true
        and v.vehicle_type = ride_requests.service_type
    )
  )
);

-- Keep the existing approved-driver, active-partner and assigned-vehicle checks.
-- A request cannot be accepted once its 15-minute window has elapsed.
create or replace function public.accept_twende_ride(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride public.ride_requests%rowtype;
  v_vehicle public.driver_vehicles%rowtype;
begin
  if not exists (
    select 1 from public.twende_partner_applications a
    where a.user_id = auth.uid()
      and a.partner_type = 'driver'
      and a.application_status = 'approved'
      and a.account_status = 'active'
  ) then
    raise exception 'Driver partner account is not active. Contact TWENDE support.';
  end if;

  select * into v_ride
  from public.ride_requests
  where id = p_ride_id
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'This booking has expired or is no longer available.';
  end if;

  select * into v_vehicle
  from public.driver_vehicles
  where user_id = auth.uid()
    and approval_status = 'approved'
    and is_online = true
    and vehicle_type = v_ride.service_type
  order by created_at
  limit 1;

  if not found then
    raise exception 'An approved online matching vehicle is required.';
  end if;

  update public.ride_requests
     set driver_id = auth.uid(),
         driver_vehicle_id = v_vehicle.id,
         status = 'accepted',
         accepted_at = now()
   where id = p_ride_id
     and status = 'pending'
     and expires_at > now();

  if not found then
    raise exception 'This booking has expired or is no longer available.';
  end if;
end;
$$;

revoke all on function public.accept_twende_ride(uuid) from public;
grant execute on function public.accept_twende_ride(uuid) to authenticated;

-- If pg_cron is enabled in this Supabase project, expire requests every minute.
-- The Driver portal also invokes the expiry function while it is open.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select cron.unschedule(jobid) from cron.job where jobname = ''twende-expire-stale-rides''';
    execute 'select cron.schedule(''twende-expire-stale-rides'', ''* * * * *'', ''select public.expire_stale_twende_rides();'')';
  else
    raise notice 'pg_cron is not enabled. The Driver portal will expire stale requests when active; enable pg_cron for background expiry.';
  end if;
exception when others then
  raise notice 'Could not schedule pg_cron automatically: %. Enable pg_cron and schedule public.expire_stale_twende_rides() every minute if background expiry is required.', sqlerrm;
end;
$$;

select
  count(*) filter (where status = 'expired') as expired_requests,
  count(*) filter (where status = 'pending') as remaining_pending_requests
from public.ride_requests;
