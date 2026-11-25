-- TWENDE 2.0 finance security hardening
-- DEVELOPMENT ONLY. Do not run against production until reviewed and tested.
-- Based on the live read-only audit supplied on 2026-11-25.
--
-- Scope:
--   * Remove anonymous access to finance/admin tables.
--   * Keep authenticated SELECT access subject to existing RLS policies.
--   * Remove authenticated direct write privileges on finance tables.
--   * Prevent direct client execution of the trip snapshot trigger function.
--   * Keep authenticated execution of the permission helper because RLS policies call it.
--
-- Explicitly NOT included:
--   * No changes to the 15% / 85% finance calculation.
--   * No changes to ride_requests, driver_vehicles, passenger booking, or dispatch.
--   * No owner/driver finance SELECT policies. Those require verified ownership/assignment
--     relationships and must be implemented separately.
--   * No changes to twende_finance_set_commission until its definition and grants are audited.
--
-- Review the resulting grants and policies after applying in a disposable/staging project.

BEGIN;

-- Fail closed if expected tables or RLS configuration differ from the audited schema.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'twende_admin_role_permissions',
    'twende_admins',
    'twende_finance_settings',
    'twende_trip_finances'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'Required table public.% is missing; aborting migration', v_table;
    END IF;

    IF NOT (
      SELECT c.relrowsecurity
      FROM pg_class c
      WHERE c.oid = to_regclass(format('public.%I', v_table))
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%; aborting migration', v_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ride_requests'
      AND t.tgname = 'twende_finance_on_trip_completed'
      AND NOT t.tgisinternal
      AND t.tgenabled IN ('O', 'A')
  ) THEN
    RAISE EXCEPTION 'Expected enabled finance completion trigger not found; aborting migration';
  END IF;
END
$$;

-- Remove any inherited PUBLIC and explicit anon grants from the sensitive tables.
REVOKE ALL PRIVILEGES ON TABLE
  public.twende_admin_role_permissions,
  public.twende_admins,
  public.twende_finance_settings,
  public.twende_trip_finances
FROM PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE
  public.twende_admin_role_permissions,
  public.twende_admins,
  public.twende_finance_settings,
  public.twende_trip_finances
FROM anon;

-- Permission lookup tables are read by SECURITY DEFINER functions owned by postgres.
-- Do not grant direct table access to authenticated clients.
REVOKE ALL PRIVILEGES ON TABLE
  public.twende_admin_role_permissions
FROM authenticated;

-- Authenticated users may read their own admin row, subject to its existing RLS policy.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.twende_admins
FROM authenticated;
GRANT SELECT ON TABLE public.twende_admins TO authenticated;

-- Finance readers may SELECT only, subject to finance.view RLS policies.
-- No direct client writes to settings or trip snapshots.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.twende_finance_settings, public.twende_trip_finances
FROM authenticated;
GRANT SELECT ON TABLE
  public.twende_finance_settings,
  public.twende_trip_finances
TO authenticated;

-- The permission helper must remain callable by authenticated users because the
-- existing finance SELECT RLS policies invoke it. Anonymous callers do not need it.
REVOKE EXECUTE ON FUNCTION public.twende_admin_has_permission(text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.twende_admin_has_permission(text)
TO authenticated, service_role;

-- This function is a trigger implementation, not a client RPC.
-- Revoking client EXECUTE does not remove or disable the already-created trigger.
REVOKE EXECUTE ON FUNCTION public.twende_snapshot_completed_trip_finance()
FROM PUBLIC, anon, authenticated;

-- Reassert the two audited finance read policies exist. This does not create or
-- broaden policies; it aborts if the live policy names/commands unexpectedly differ.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'twende_finance_settings'
      AND policyname = 'Finance officers can view commission settings'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Expected commission-settings SELECT policy missing; aborting';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'twende_trip_finances'
      AND policyname = 'Finance officers can view trip finances'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Expected trip-finance SELECT policy missing; aborting';
  END IF;
END
$$;

COMMIT;

-- POST-APPLY VERIFICATION (run separately):
--
-- 1. Verify no anon/PUBLIC table grants remain:
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema='public'
--   AND table_name IN ('twende_admin_role_permissions','twende_admins',
--                      'twende_finance_settings','twende_trip_finances')
-- ORDER BY table_name, grantee, privilege_type;
--
-- 2. Verify function execution grants:
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_schema='public'
--   AND routine_name IN ('twende_admin_has_permission',
--                        'twende_snapshot_completed_trip_finance')
-- ORDER BY routine_name, grantee;
--
-- 3. In staging, test:
--    a. anonymous SELECT/INSERT/UPDATE/DELETE against finance tables is denied;
--    b. authenticated user without finance.view cannot read finance rows;
--    c. finance.view user can read finance rows;
--    d. authenticated direct INSERT/UPDATE/DELETE against finance tables is denied;
--    e. completing a test ride still inserts exactly one finance snapshot;
--    f. duplicate completion/update does not create a second snapshot.
--
-- ROLLBACK:
-- Do not restore the previous broad grants. If application compatibility requires
-- a privilege, add only the minimum specific grant after identifying the caller
-- and confirming the matching RLS policy. Restore the prior migration snapshot
-- only in an isolated development database, never by regranting broad access blindly.
