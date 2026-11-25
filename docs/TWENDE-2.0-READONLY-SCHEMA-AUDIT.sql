-- TWENDE 2.0 — READ-ONLY live schema audit
-- Run in Supabase SQL Editor against the CURRENT TWENDE project.
-- This script only reads PostgreSQL metadata. It does not create, update or delete data.

-- 1) Relevant tables and columns
select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and (
    c.table_name in (
      'profiles','driver_profiles','driver_vehicles','ride_requests',
      'driver_locations','taxi_fare_settings','twende_finance_settings',
      'twende_trip_finances','twende_driver_wallet_entries',
      'twende_owner_driver_agreements','twende_ride_rejections'
    )
    or c.table_name ilike '%partner%'
    or c.table_name ilike '%admin%'
  )
order by c.table_name, c.ordinal_position;

-- 2) RLS status and policies on relevant tables
select
  n.nspname as schema_name,
  t.relname as table_name,
  t.relrowsecurity as rls_enabled,
  t.relforcerowsecurity as rls_forced,
  p.polname as policy_name,
  case p.polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    when '*' then 'ALL'
    else p.polcmd::text
  end as command,
  pg_get_userbyid(p.polroles[1]) as first_policy_role,
  pg_get_expr(p.polqual, p.polrelid) as using_expression,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expression
from pg_class t
join pg_namespace n on n.oid = t.relnamespace
left join pg_policy p on p.polrelid = t.oid
where n.nspname = 'public'
  and (
    t.relname in (
      'profiles','driver_profiles','driver_vehicles','ride_requests',
      'driver_locations','taxi_fare_settings','twende_finance_settings',
      'twende_trip_finances','twende_driver_wallet_entries',
      'twende_owner_driver_agreements','twende_ride_rejections'
    )
    or t.relname ilike '%partner%'
    or t.relname ilike '%admin%'
  )
  and t.relkind = 'r'
order by t.relname, p.polname;

-- 3) Installed TWENDE RPCs / database functions
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as return_type,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  pg_get_userbyid(p.proowner) as owner,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%twende%'
    or p.proname in (
      'get_nearby_twende_drivers',
      'update_twende_driver_location',
      'accept_twende_ride',
      'reject_twende_ride',
      'complete_twende_ride'
    )
  )
order by p.proname, arguments;

-- 4) Triggers on core ride and finance tables
select
  event_object_table as table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'ride_requests','twende_trip_finances','driver_vehicles'
  )
order by event_object_table, trigger_name, event_manipulation;

-- 5) Constraints on ride/vehicle/finance tables
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(pc.oid) as definition
from information_schema.table_constraints tc
join pg_constraint pc
  on pc.conname = tc.constraint_name
join information_schema.tables tb
  on tb.table_schema = tc.table_schema
 and tb.table_name = tc.table_name
where tc.table_schema = 'public'
  and tc.table_name in (
    'ride_requests','driver_vehicles','driver_profiles',
    'taxi_fare_settings','twende_finance_settings','twende_trip_finances'
  )
order by tc.table_name, tc.constraint_type, tc.constraint_name;
