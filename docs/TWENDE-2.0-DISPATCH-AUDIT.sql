-- TWENDE 2.0 — focused read-only dispatch and finance audit
-- Run in Supabase SQL Editor. This script makes no database changes.

-- A. Full column inventory for dispatch-related tables
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public'
  and table_name in (
    'ride_requests','driver_vehicles','driver_profiles','driver_locations',
    'twende_ride_rejections','twende_dispatch_jobs','twende_dispatch_offers',
    'twende_finance_settings','twende_trip_finances','twende_owner_driver_agreements'
  )
order by table_name, ordinal_position;

-- B. Dispatch-related functions and their installed definitions
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as return_type,
       p.prosecdef as security_definer,
       pg_get_userbyid(p.proowner) as function_owner,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (
    p.proname ilike '%dispatch%'
    or p.proname ilike '%ride_queue%'
    or p.proname in (
      'get_nearby_twende_drivers','accept_twende_ride','reject_twende_ride',
      'complete_twende_ride','twende_set_vehicle_online',
      'update_twende_driver_location','twende_driver_ride_queue'
    )
  )
order by p.proname, arguments;

-- C. Tables and RLS policies for dispatch, rejections and core rides
select t.relname as table_name,
       t.relrowsecurity as rls_enabled,
       t.relforcerowsecurity as rls_forced,
       p.polname as policy_name,
       p.polcmd as policy_command,
       pg_get_expr(p.polqual,p.polrelid) as using_expression,
       pg_get_expr(p.polwithcheck,p.polrelid) as with_check_expression
from pg_class t
join pg_namespace n on n.oid=t.relnamespace
left join pg_policy p on p.polrelid=t.oid
where n.nspname='public'
  and t.relkind='r'
  and (
    t.relname in (
      'ride_requests','driver_vehicles','driver_profiles',
      'twende_ride_rejections','twende_dispatch_jobs','twende_dispatch_offers'
    )
  )
order by t.relname,p.polname;

-- D. Triggers and installed finance split columns
select event_object_table as table_name, trigger_name,
       event_manipulation, action_timing, action_statement
from information_schema.triggers
where trigger_schema='public'
  and event_object_table in ('ride_requests','twende_trip_finances','driver_vehicles')
order by event_object_table,trigger_name;

select column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public'
  and table_name='twende_trip_finances'
  and column_name in (
    'gross_fare','commission_rate','company_commission',
    'driver_earnings','owner_share','expected_cash'
  )
order by ordinal_position;

-- E. Current configured fares and commission settings (configuration only)
select service_type,base_fare,per_km,minimum_fare
from public.taxi_fare_settings
order by service_type;

select service_type,commission_rate,updated_at
from public.twende_finance_settings
order by service_type;
