-- TWENDE owner finance transparency and reporting
-- Owner view is derived from completed-trip finance snapshots and the vehicle owner_id.
create or replace function public.twende_owner_finance_summary()
returns table(
 completed_trips bigint,
 gross_fares numeric,
 twende_commission numeric,
 owner_entitlement numeric,
 today_gross numeric,
 today_commission numeric,
 today_owner_entitlement numeric,
 month_gross numeric,
 month_commission numeric,
 month_owner_entitlement numeric
)
language plpgsql stable security definer set search_path=public,auth as $function$
begin
 if auth.uid() is null or not exists(
  select 1 from public.twende_partner_applications a
  where a.user_id=auth.uid() and a.partner_type='vehicle_owner'
   and a.application_status='approved' and a.account_status='active'
 ) then raise exception 'Active approved vehicle-owner account required'; end if;
 return query
 select
  count(f.ride_id),
  coalesce(sum(f.gross_fare),0),
  coalesce(sum(f.company_commission),0),
  coalesce(sum(f.driver_earnings),0),
  coalesce(sum(f.gross_fare) filter(where f.completed_at::date=current_date),0),
  coalesce(sum(f.company_commission) filter(where f.completed_at::date=current_date),0),
  coalesce(sum(f.driver_earnings) filter(where f.completed_at::date=current_date),0),
  coalesce(sum(f.gross_fare) filter(where date_trunc('month',f.completed_at)=date_trunc('month',now())),0),
  coalesce(sum(f.company_commission) filter(where date_trunc('month',f.completed_at)=date_trunc('month',now())),0),
  coalesce(sum(f.driver_earnings) filter(where date_trunc('month',f.completed_at)=date_trunc('month',now())),0)
 from public.twende_trip_finances f
 join public.driver_vehicles v on v.id=f.vehicle_id
 where v.owner_id=auth.uid();
end; $function$;
revoke all on function public.twende_owner_finance_summary() from public;
grant execute on function public.twende_owner_finance_summary() to authenticated;

-- Do not invoke this owner-only RPC from the SQL editor: auth.uid() is NULL there.
-- It is called by the signed-in Vehicle Owner dashboard.
