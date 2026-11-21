-- TWENDE Finance Management v1
-- Apply in Supabase SQL Editor after the existing ride-hailing/admin migrations.
-- Commission is snapshotted per completed trip; historical rates never change.
create table if not exists public.twende_finance_settings (
  service_type text primary key check (service_type in ('car','motorcycle')),
  commission_rate numeric(5,4) not null default 0.1500 check (commission_rate >= 0 and commission_rate <= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.twende_finance_settings(service_type,commission_rate)
values ('car',0.1500),('motorcycle',0.1500)
on conflict (service_type) do nothing;
alter table public.twende_finance_settings enable row level security;
drop policy if exists "Finance officers can view commission settings" on public.twende_finance_settings;
create policy "Finance officers can view commission settings"
on public.twende_finance_settings for select to authenticated
using (public.twende_admin_has_permission('finance.view'));

create table if not exists public.twende_trip_finances (
  ride_id uuid primary key references public.ride_requests(id) on delete restrict,
  service_type text not null check(service_type in ('car','motorcycle')),
  driver_id uuid references auth.users(id) on delete set null,
  vehicle_id uuid,
  completed_at timestamptz not null,
  currency text not null default 'ZMW' check(currency='ZMW'),
  gross_fare numeric(12,2) not null check(gross_fare >= 0),
  commission_rate numeric(5,4) not null check(commission_rate between 0 and 1),
  company_commission numeric(12,2) not null check(company_commission >= 0),
  driver_earnings numeric(12,2) not null check(driver_earnings >= 0),
  expected_cash numeric(12,2) not null check(expected_cash >= 0),
  reported_cash numeric(12,2),
  cash_difference numeric(12,2),
  reconciliation_status text not null default 'pending'
    check(reconciliation_status in ('pending','matched','short','over','waived')),
  reconciliation_note text,
  reconciled_by uuid references auth.users(id),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  check (company_commission + driver_earnings = gross_fare),
  check (reported_cash is null or reported_cash >= 0)
);
create index if not exists twende_trip_finances_completed_idx on public.twende_trip_finances(completed_at desc);
create index if not exists twende_trip_finances_driver_idx on public.twende_trip_finances(driver_id,completed_at desc);
create index if not exists twende_trip_finances_recon_idx on public.twende_trip_finances(reconciliation_status,completed_at desc);
alter table public.twende_trip_finances enable row level security;
drop policy if exists "Finance officers can view trip finances" on public.twende_trip_finances;
create policy "Finance officers can view trip finances"
on public.twende_trip_finances for select to authenticated
using (public.twende_admin_has_permission('finance.view'));

create or replace function public.twende_snapshot_completed_trip_finance()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_rate numeric(5,4); v_fare numeric(12,2); v_commission numeric(12,2);
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    v_fare := greatest(coalesce(new.estimated_fare,0),0);
    select commission_rate into v_rate from public.twende_finance_settings where service_type=new.service_type;
    v_rate := coalesce(v_rate,0.15);
    v_commission := round(v_fare*v_rate,2);
    insert into public.twende_trip_finances(
      ride_id,service_type,driver_id,vehicle_id,completed_at,gross_fare,
      commission_rate,company_commission,driver_earnings,expected_cash
    ) values (
      new.id,new.service_type,new.driver_id,new.driver_vehicle_id,
      coalesce(new.completed_at,now()),v_fare,v_rate,v_commission,
      v_fare-v_commission,v_fare
    ) on conflict (ride_id) do nothing;
  end if;
  return new;
end; $$;
drop trigger if exists twende_finance_on_trip_completed on public.ride_requests;
create trigger twende_finance_on_trip_completed
after update of status on public.ride_requests
for each row execute function public.twende_snapshot_completed_trip_finance();

-- Backfill previously completed rides once, without overwriting existing ledger rows.
insert into public.twende_trip_finances(
  ride_id,service_type,driver_id,vehicle_id,completed_at,gross_fare,
  commission_rate,company_commission,driver_earnings,expected_cash
)
select r.id,r.service_type,r.driver_id,r.driver_vehicle_id,coalesce(r.completed_at,r.created_at),
  greatest(coalesce(r.estimated_fare,0),0),coalesce(s.commission_rate,0.15),
  round(greatest(coalesce(r.estimated_fare,0),0)*coalesce(s.commission_rate,0.15),2),
  greatest(coalesce(r.estimated_fare,0),0)-round(greatest(coalesce(r.estimated_fare,0),0)*coalesce(s.commission_rate,0.15),2),
  greatest(coalesce(r.estimated_fare,0),0)
from public.ride_requests r
left join public.twende_finance_settings s on s.service_type=r.service_type
where r.status='completed'
on conflict (ride_id) do nothing;

create or replace function public.twende_finance_set_commission(p_service_type text,p_rate numeric)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.twende_admin_has_permission('finance.reconcile') then raise exception 'Finance reconciliation permission required'; end if;
  if p_service_type not in ('car','motorcycle') or p_rate < 0 or p_rate > 1 then raise exception 'Invalid service type or commission rate'; end if;
  update public.twende_finance_settings set commission_rate=p_rate,updated_at=now(),updated_by=auth.uid()
   where service_type=p_service_type;
  if not found then insert into public.twende_finance_settings(service_type,commission_rate,updated_by) values(p_service_type,p_rate,auth.uid()); end if;
end; $$;

create or replace function public.twende_finance_reconcile_cash(
  p_ride_id uuid,p_reported_cash numeric,p_status text,p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_expected numeric(12,2);
begin
  if not public.twende_admin_has_permission('finance.reconcile') then raise exception 'Finance reconciliation permission required'; end if;
  if p_reported_cash < 0 or p_status not in ('matched','short','over','waived') then raise exception 'Invalid cash amount or reconciliation status'; end if;
  select expected_cash into v_expected from public.twende_trip_finances where ride_id=p_ride_id for update;
  if not found then raise exception 'Trip financial record not found'; end if;
  if p_status='matched' and round(p_reported_cash,2)<>v_expected then raise exception 'Reported cash does not match expected cash; use short or over'; end if;
  if p_status='short' and p_reported_cash>=v_expected then raise exception 'Short status requires reported cash below expected'; end if;
  if p_status='over' and p_reported_cash<=v_expected then raise exception 'Over status requires reported cash above expected'; end if;
  update public.twende_trip_finances set reported_cash=round(p_reported_cash,2),
    cash_difference=round(p_reported_cash,2)-expected_cash,reconciliation_status=p_status,
    reconciliation_note=nullif(trim(p_note),''),reconciled_by=auth.uid(),reconciled_at=now()
  where ride_id=p_ride_id;
end; $$;

create or replace function public.twende_finance_report(p_from timestamptz,p_to timestamptz)
returns table(
  service_type text,trip_count bigint,gross_fares numeric,company_commission numeric,
  driver_earnings numeric,expected_cash numeric,reported_cash numeric,
  pending_reconciliation bigint,short_count bigint,over_count bigint
) language plpgsql stable security definer set search_path=public as $$
begin
  if not public.twende_admin_has_permission('finance.view') then raise exception 'Finance view permission required'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'Invalid report date range'; end if;
  return query
  select f.service_type,count(*),coalesce(sum(f.gross_fare),0),coalesce(sum(f.company_commission),0),
    coalesce(sum(f.driver_earnings),0),coalesce(sum(f.expected_cash),0),
    coalesce(sum(f.reported_cash),0),
    count(*) filter(where f.reconciliation_status='pending'),
    count(*) filter(where f.reconciliation_status='short'),
    count(*) filter(where f.reconciliation_status='over')
  from public.twende_trip_finances f
  where f.completed_at>=p_from and f.completed_at<p_to
  group by f.service_type order by f.service_type;
end; $$;

revoke all on function public.twende_snapshot_completed_trip_finance() from public;
revoke all on function public.twende_finance_set_commission(text,numeric) from public;
revoke all on function public.twende_finance_reconcile_cash(uuid,numeric,text,text) from public;
revoke all on function public.twende_finance_report(timestamptz,timestamptz) from public;
grant execute on function public.twende_finance_set_commission(text,numeric) to authenticated;
grant execute on function public.twende_finance_reconcile_cash(uuid,numeric,text,text) to authenticated;
grant execute on function public.twende_finance_report(timestamptz,timestamptz) to authenticated;

-- Initial rates: 15% commission for both car and motorcycle rides.
select service_type,commission_rate from public.twende_finance_settings order by service_type;
