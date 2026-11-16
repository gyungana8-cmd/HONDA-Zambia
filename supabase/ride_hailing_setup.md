# TWENDE ride-hailing setup

This branch adds the first cash-based taxi-request and driver-onboarding flows while preserving the existing daily motorcycle-hire feature.

## Deploy the database changes

1. Open the Supabase project used by TWENDE.
2. Open **SQL Editor** and create a new query.
3. Copy the complete contents of `ride_hailing_setup.sql`.
4. Run the SQL script.
5. Refresh the TWENDE website.

The migration creates:
- `driver_profiles`: motorcycle/car driver registrations and manual approval state.
- `ride_requests`: passenger requests, assigned driver, cash payment method and trip status.
- Row-level security policies.
- RPC functions for driver online/offline, atomic ride acceptance and trip completion.

## Driver approval

Driver registrations start as `pending`. An administrator must verify the driver's licence and vehicle details outside the app, then approve the driver in Supabase SQL Editor:

```sql
update public.driver_profiles
set approval_status = 'approved'
where user_id = 'AUTH_USER_UUID';
```

Only approved drivers can go online. Drivers can accept only requests matching their registered vehicle type.

## Current implementation boundary

This is the first implementation milestone, not a complete Yango-equivalent release. It supports cash taxi request creation, driver registration, manual approval, online/offline status, ride acceptance and trip completion after the SQL migration is installed.

Live GPS driver discovery, map routing, continuously updated trip location, push notifications, fare calculation, in-app support/emergency workflows, driver document uploads and an admin approval screen still require additional integrations and testing. Taxi fares are agreed directly with the driver; the app does not calculate or collect taxi payments. Existing motorcycle daily-hire bookings remain in the original `motorcycles` and `bookings` tables.
