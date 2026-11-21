-- TWENDE owner entitlement and optional owner-driver agreements
-- Apply after twende_finance_management.sql and the owner fleet migrations.
-- The 15% TWENDE commission remains controlled by the Primary Admin only.

alter table public.twende_trip_finances
  add column if not exists owner_share numeric(12,2);

-- Historical ledger: the former driver_earnings column actually represented
-- the 85% remainder. Preserve the amount and relabel it as owner entitlement.
update public.twende_trip_finances
set owner_share = driver_earnings
where owner_share is null;

alter table public.twende_trip_finances
  alter column owner_share set not null;

comment on column public.twende_trip_finances.driver_earnings is
  'Deprecated legacy field. Historically stored the vehicle owner 85% share; do not present as driver pay.';
comment on column public.twende_trip_finances.owner_share is
  'Vehicle owner entitlement after TWENDE commission. Driver remuneration is governed separately by an optional owner-driver agreement.';

-- Optional agreement for each owner/driver/vehicle relationship.
create table if not exists public.twende_owner_driver_agreements (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.driver_vehicles(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  driver_id uuid not null references auth.users(id) on delete restrict,
  compensation_type text not null check (
    compensation_type in ('fixed_daily','fixed_monthly','percentage_owner_share','other')
  ),
  compensation_amount numeric(12,2),
  compensation_percentage numeric(5,2),
  terms text,
  status text not null default 'proposed'
    check(status in ('proposed','active','rejected','terminated')),
  proposed_at timestamptz not null default now(),
  responded_at timestamptz,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(owner_id <> driver_id),
  check(compensation_amount is null or compensation_amount >= 0),
  check(compensation_percentage is null or compensation_percentage between 0 and 100)
);

create index if not exists twende_owner_driver_agreements_vehicle_idx
  on public.twende_owner_driver_agreements(vehicle_id, created_at desc);
create index if not exists twende_owner_driver_agreements_parties_idx
  on public.twende_owner_driver_agreements(owner_id,driver_id,status);

alter table public.twende_owner_driver_agreements enable row level security;
drop policy if exists "Agreement parties can view own agreements" on public.twende_owner_driver_agreements;
create policy "Agreement parties can view own agreements"
on public.twende_owner_driver_agreements for select to authenticated
using (owner_id=auth.uid() or driver_id=auth.uid());

-- Owner proposes terms for a vehicle currently registered to them and assigned
-- to the named active driver. A new proposal does not alter the 15/85 split.
create or replace function public.twende_owner_propose_driver_agreement(
  p_vehicle_id uuid,
  p_compensation_type text,
  p_compensation_amount numeric default null,
  p_compensation_percentage numeric default null,
  p_terms text default null,
  p_effective_from date default current_date,
  p_effective_to date default null
) returns uuid
language plpgsql security definer set search_path=public,auth as $$
declare v_driver uuid; v_agreement uuid;
begin
  select user_id into v_driver
  from public.driver_vehicles
  where id=p_vehicle_id and owner_id=auth.uid() and approval_status='approved';
  if not found then raise exception 'Approved vehicle in your fleet not found'; end if;
  if v_driver=auth.uid() then raise exception 'Assign a driver before proposing an agreement'; end if;
  if p_compensation_type not in ('fixed_daily','fixed_monthly','percentage_owner_share','other') then
    raise exception 'Invalid compensation type';
  end if;
  if p_compensation_type in ('fixed_daily','fixed_monthly') and coalesce(p_compensation_amount,0)<=0 then
    raise exception 'Enter a positive agreed payment amount';
  end if;
  if p_compensation_type='percentage_owner_share' and (p_compensation_percentage is null or p_compensation_percentage<0 or p_compensation_percentage>100) then
    raise exception 'Enter a percentage from 0 to 100';
  end if;
  if p_compensation_type='other' and nullif(trim(p_terms),'') is null then
    raise exception 'Describe the other agreed arrangement';
  end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then
    raise exception 'End date cannot be before start date';
  end if;
  update public.twende_owner_driver_agreements
  set status='terminated',updated_at=now()
  where vehicle_id=p_vehicle_id and owner_id=auth.uid() and status='proposed';
  insert into public.twende_owner_driver_agreements(
    vehicle_id,owner_id,driver_id,compensation_type,compensation_amount,
    compensation_percentage,terms,effective_from,effective_to
  ) values (
    p_vehicle_id,auth.uid(),v_driver,p_compensation_type,p_compensation_amount,
    p_compensation_percentage,nullif(trim(p_terms),''),p_effective_from,p_effective_to
  ) returning id into v_agreement;
  return v_agreement;
end; $$;

-- Only the assigned driver can accept or reject a pending proposal.
create or replace function public.twende_driver_respond_owner_agreement(
  p_agreement_id uuid,p_accept boolean
) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.twende_owner_driver_agreements
  set status=case when p_accept then 'active' else 'rejected' end,
      responded_at=now(),updated_at=now()
  where id=p_agreement_id and driver_id=auth.uid() and status='proposed';
  if not found then raise exception 'Pending agreement not found for this driver'; end if;
end; $$;

create or replace function public.twende_owner_terminate_driver_agreement(p_agreement_id uuid)
returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.twende_owner_driver_agreements
  set status='terminated',updated_at=now()
  where id=p_agreement_id and owner_id=auth.uid() and status='active';
  if not found then raise exception 'Active agreement not found for this owner'; end if;
end; $$;

-- Keep new financial snapshots explicit: 15% to TWENDE, 85% to vehicle owner.
create or replace function public.twende_snapshot_completed_trip_finance()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_rate numeric(5,4); v_fare numeric(12,2); v_commission numeric(12,2); v_owner_share numeric(12,2);
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    v_fare := greatest(coalesce(new.estimated_fare,0),0);
    select commission_rate into v_rate from public.twende_finance_settings where service_type=new.service_type;
    v_rate := coalesce(v_rate,0.15);
    v_commission := round(v_fare*v_rate,2);
    v_owner_share := v_fare-v_commission;
    insert into public.twende_trip_finances(
      ride_id,service_type,driver_id,vehicle_id,completed_at,gross_fare,
      commission_rate,company_commission,driver_earnings,owner_share,expected_cash
    ) values (
      new.id,new.service_type,new.driver_id,new.driver_vehicle_id,
      coalesce(new.completed_at,now()),v_fare,v_rate,v_commission,
      v_owner_share,v_owner_share,v_fare
    ) on conflict (ride_id) do nothing;
  end if;
  return new;
end; $$;

-- Backfill owner_share for any ledger rows created between migration versions.
update public.twende_trip_finances
set owner_share=gross_fare-company_commission
where owner_share is distinct from gross_fare-company_commission;

revoke all on function public.twende_owner_propose_driver_agreement(uuid,text,numeric,numeric,text,date,date) from public;
revoke all on function public.twende_driver_respond_owner_agreement(uuid,boolean) from public;
revoke all on function public.twende_owner_terminate_driver_agreement(uuid) from public;
grant execute on function public.twende_owner_propose_driver_agreement(uuid,text,numeric,numeric,text,date,date) to authenticated;
grant execute on function public.twende_driver_respond_owner_agreement(uuid,boolean) to authenticated;
grant execute on function public.twende_owner_terminate_driver_agreement(uuid) to authenticated;

select
  count(*) as ledger_rows,
  sum(gross_fare) as gross_fares,
  sum(company_commission) as twende_commission,
  sum(owner_share) as vehicle_owner_entitlement
from public.twende_trip_finances;
