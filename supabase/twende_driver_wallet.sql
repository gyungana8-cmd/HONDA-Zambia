-- TWENDE Driver Wallet & Earnings Transparency
-- Apply after twende_finance_management.sql and twende_owner_driver_agreements.sql.
-- This is an auditable earnings statement, not an electronic money transfer wallet.
-- TWENDE's 15% commission and vehicle owner's 85% entitlement remain unchanged.

create table if not exists public.twende_driver_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.twende_trip_finances(ride_id) on delete restrict,
  driver_id uuid not null references auth.users(id) on delete restrict,
  vehicle_id uuid references public.driver_vehicles(id) on delete set null,
  completed_at timestamptz not null,
  currency text not null default 'ZMW' check(currency='ZMW'),
  gross_fare numeric(12,2) not null check(gross_fare >= 0),
  twende_commission numeric(12,2) not null check(twende_commission >= 0),
  owner_entitlement numeric(12,2) not null check(owner_entitlement >= 0),
  agreement_id uuid references public.twende_owner_driver_agreements(id) on delete set null,
  compensation_type text check(compensation_type in ('fixed_daily','fixed_monthly','percentage_owner_share','other')),
  compensation_amount numeric(12,2),
  compensation_percentage numeric(5,2),
  driver_earnings numeric(12,2),
  agreement_terms text,
  created_at timestamptz not null default now(),
  check (twende_commission + owner_entitlement = gross_fare),
  check (driver_earnings is null or driver_earnings >= 0)
);

create index if not exists twende_driver_wallet_entries_driver_date_idx
  on public.twende_driver_wallet_entries(driver_id,completed_at desc);

alter table public.twende_driver_wallet_entries enable row level security;
drop policy if exists "Drivers can view their own wallet entries" on public.twende_driver_wallet_entries;
create policy "Drivers can view their own wallet entries"
on public.twende_driver_wallet_entries for select to authenticated
using (driver_id=auth.uid());

revoke all on public.twende_driver_wallet_entries from anon,authenticated;
grant select on public.twende_driver_wallet_entries to authenticated;

create or replace function public.twende_record_driver_wallet_entry()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_agreement public.twende_owner_driver_agreements%rowtype;
  v_driver_earnings numeric(12,2);
begin
  if new.driver_id is null then return new; end if;

  select a.* into v_agreement
  from public.twende_owner_driver_agreements a
  where a.driver_id=new.driver_id
    and a.vehicle_id=new.vehicle_id
    and a.responded_at is not null
    and a.responded_at<=new.completed_at
    and a.effective_from<=new.completed_at::date
    and (a.effective_to is null or a.effective_to>=new.completed_at::date)
    and (
      a.status='active'
      or (a.status='terminated' and a.updated_at>=new.completed_at)
    )
  order by a.responded_at desc,a.created_at desc
  limit 1;

  v_driver_earnings := null;
  if found and v_agreement.compensation_type='percentage_owner_share' then
    v_driver_earnings := round(new.owner_share*coalesce(v_agreement.compensation_percentage,0)/100,2);
  end if;

  insert into public.twende_driver_wallet_entries(
    ride_id,driver_id,vehicle_id,completed_at,gross_fare,twende_commission,
    owner_entitlement,agreement_id,compensation_type,compensation_amount,
    compensation_percentage,driver_earnings,agreement_terms
  ) values (
    new.ride_id,new.driver_id,new.vehicle_id,new.completed_at,new.gross_fare,
    new.company_commission,new.owner_share,
    case when found then v_agreement.id else null end,
    case when found then v_agreement.compensation_type else null end,
    case when found then v_agreement.compensation_amount else null end,
    case when found then v_agreement.compensation_percentage else null end,
    v_driver_earnings,
    case when found then v_agreement.terms else null end
  ) on conflict (ride_id) do nothing;

  return new;
end;
$$;

drop trigger if exists twende_driver_wallet_after_finance_insert on public.twende_trip_finances;
create trigger twende_driver_wallet_after_finance_insert
after insert on public.twende_trip_finances
for each row execute function public.twende_record_driver_wallet_entry();

-- Backfill completed trips already in the finance ledger.
insert into public.twende_driver_wallet_entries(
  ride_id,driver_id,vehicle_id,completed_at,gross_fare,twende_commission,
  owner_entitlement,agreement_id,compensation_type,compensation_amount,
  compensation_percentage,driver_earnings,agreement_terms
)
select
  f.ride_id,f.driver_id,f.vehicle_id,f.completed_at,f.gross_fare,
  f.company_commission,f.owner_share,
  a.id,a.compensation_type,a.compensation_amount,a.compensation_percentage,
  case when a.compensation_type='percentage_owner_share'
    then round(f.owner_share*coalesce(a.compensation_percentage,0)/100,2)
    else null end,
  a.terms
from public.twende_trip_finances f
left join lateral (
  select ag.*
  from public.twende_owner_driver_agreements ag
  where ag.driver_id=f.driver_id
    and ag.vehicle_id=f.vehicle_id
    and ag.responded_at is not null
    and ag.responded_at<=f.completed_at
    and ag.effective_from<=f.completed_at::date
    and (ag.effective_to is null or ag.effective_to>=f.completed_at::date)
    and (
      ag.status='active'
      or (ag.status='terminated' and ag.updated_at>=f.completed_at)
    )
  order by ag.responded_at desc,ag.created_at desc
  limit 1
) a on true
where f.driver_id is not null
on conflict (ride_id) do nothing;

comment on table public.twende_driver_wallet_entries is
  'Read-only driver earnings transparency ledger. Not a stored-value wallet or payment rail.';
comment on column public.twende_driver_wallet_entries.driver_earnings is
  'Calculated only for an accepted percentage_owner_share agreement. Fixed daily/monthly or other arrangements are displayed as agreed terms and are not converted into per-trip wages.';

select
  count(*) as wallet_entries,
  coalesce(sum(gross_fare),0) as completed_gross_fares,
  coalesce(sum(twende_commission),0) as twende_commission,
  coalesce(sum(owner_entitlement),0) as vehicle_owner_entitlement,
  coalesce(sum(driver_earnings),0) as calculated_percentage_agreement_earnings
from public.twende_driver_wallet_entries;
