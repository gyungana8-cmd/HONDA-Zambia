# TWENDE 2.0 — Sprint 1 Technical Audit

**Repository:** `gyungana8-cmd/HONDA-Zambia`  
**Baseline branch:** `main`  
**Baseline commit:** `ca17bfa2b1fbcde6b241233a140273eb8b5f8886`  
**Development branch:** `twende-2.0-development`  
**Audit date:** 2026-11-25

## 1. Scope and safety decision

This audit is read-only against the production `main` branch. The development branch was created from the current `main` commit. No production application code, database schema, Supabase secrets, or deployed services were changed during this audit.

The Passenger app is the protected baseline. All new functionality must be developed behind feature flags and tested against a separate development Supabase project before any production rollout.

## 2. Existing implementation verified in the repository

### Passenger and booking
- The main web application is assembled from `index.html`, `app.js`, `gps-fares.js`, and `passenger-map.js`.
- The passenger UI currently exposes two taxi classes: `car` and `motorcycle`.
- The taxi request flow writes to `public.ride_requests`, recording rider, passenger contact, selected vehicle, pickup/destination text and coordinates, route distance, estimated fare, ZMW currency, cash payment, pending status and an idempotency request key.
- The passenger flow currently requires a selected vehicle ID before creating the request. This is the principal design constraint for fully automatic dispatch.
- The live map and nearby fleet logic uses the existing nearby-driver/vehicle RPCs and a 15 km matching radius.
- The GPS/fare module documents Photon geocoding and OSRM demo routing as prototype services; production routing requires a contracted provider.

### Partner and dispatch
- Driver and vehicle records use `driver_profiles` and `driver_vehicles`.
- The app has online/offline vehicle controls and a driver queue.
- Existing RPCs include `twende_driver_ride_queue`, `accept_twende_ride`, `reject_twende_ride`, `twende_dispatch_waiting_rides`, `twende_set_vehicle_online`, and `update_twende_driver_location`.
- Reassignment logic selects another eligible nearby vehicle within 15 km and excludes drivers who already rejected that ride.
- The app triggers waiting-ride dispatch when a vehicle is switched online and when the checked driver-location RPC runs.
- The current flow is therefore a hybrid/manual assignment foundation with automatic reassignment of unassigned requests; it is not yet an end-to-end best-driver automatic dispatch at initial passenger booking.
- The separate native Android Partner project declares application ID `com.yangu.twendedriver`, but its README explicitly says authentication, database actions and online/offline lifecycle are not release-ready and still require integration and testing.

### Notifications and communications
- Supabase Edge Functions currently include SMS OTP, SMS booking notifications and Firebase push notifications.
- The push function sends to the driver/owner associated with the selected vehicle and sends accepted-ride updates to the passenger.
- The SMS function currently sends a new booking message to approved online vehicles matching the service type; this needs to be aligned with a future dispatch-offer model so alerts go only to the current offer recipient.
- No WhatsApp booking Edge Function or WhatsApp webhook integration was found in the current `supabase/functions` directory.

### Admin and finance
- The web Admin Control Centre includes role/permission checks, fleet review, partner management and finance access.
- The finance SQL creates commission settings and a completed-trip finance snapshot. The initial commission rate is 15%.
- The owner/driver agreement SQL preserves the 15% TWENDE commission and 85% owner share independently of any optional driver compensation agreement.
- The driver wallet SQL describes a read-only earnings ledger, not an electronic money transfer wallet.
- Current finance reporting covers trip fares, commission, earnings/owner entitlement and cash reconciliation foundations. Separate subscription, advertising and cancellation-fee revenue modules were not found in the audited files.

## 3. Confirmed gaps for TWENDE 2.0

| Capability | Current baseline | Required work |
|---|---|---|
| Automatic initial dispatch | Passenger selects a vehicle before request creation; waiting unassigned rides can be dispatched later | Server-side booking creation + atomic dispatch-offer workflow |
| Dispatch scoring | Nearby radius and eligibility/rejection filtering exist | Rank eligible vehicles by ETA, distance, freshness, vehicle class and reliability |
| WhatsApp | No WhatsApp function found | Official WhatsApp Business Platform webhook, consent, session state and booking adapter |
| Dynamic surge | Base/per-km/minimum fares exist | Time/zone/demand rules, caps, fare quote expiry and passenger confirmation |
| AI route optimization | Prototype route calculation via OSRM demo service | Production routing provider; deterministic route engine first, AI-assisted improvements later |
| Fraud detection | No dedicated fraud-alert module found | Rules-based risk events, review queue and audit trail before any ML model |
| Sixteen ride modes | Current service types are car and motorcycle | Service catalogue, eligibility rules and staged activation |
| Revenue streams | 15% commission and owner entitlement foundations exist | Separate ledger entries and policies for subscriptions, cancellation fees, surge and ads |
| WhatsApp and push delivery | Push/SMS foundations exist | Event-driven notification preferences and delivery logs |
| Partner native app | Scaffold exists but is not release-ready | Complete auth, secure RPC actions, foreground location lifecycle, notifications and testing |

## 4. Recommended non-breaking architecture

1. Keep the existing `ride_requests` table and current Passenger request history intact.
2. Add a new dispatch layer:
   - `dispatch_jobs`: one dispatch lifecycle per ride.
   - `dispatch_offers`: one row per driver/vehicle offer, with status, expiry and timestamps.
   - A server-side booking RPC that validates the quote and inserts the ride, then starts dispatch within a transaction.
3. Use row locks / conditional updates to guarantee that only one offer can be accepted for a ride.
4. Do not expose every pending ride to every online driver. Drivers should only see offers assigned to them.
5. Keep WhatsApp as an alternate booking channel that calls the same server-side booking and dispatch service; it must not create a separate booking logic path.
6. Keep the existing fare calculator as the initial deterministic engine. Add surge as an explicit, capped line item to a server-generated quote.
7. Preserve the 15% / 85% ride split in the existing finance snapshot. Additional income types must use separate ledger classifications and must not silently change the ride split.
8. Add new ride modes only through a catalogue and eligibility configuration. Do not expand existing database check constraints until the operational requirements for each mode are approved.

## 5. Delivery order and acceptance gates

### Sprint 1A — Baseline protection
- Save and tag the Passenger baseline.
- Confirm the current production build workflow and package identity.
- Export schema and RLS policy definitions from the actual Supabase project.
- Create a development Supabase project and document required environment secrets.
- Establish booking regression tests.

**Gate:** Existing Passenger booking, fare, GPS, driver acceptance and notification flows pass unchanged.

### Sprint 1B — Dispatch engine
- Design booking creation RPC and dispatch state machine.
- Add dispatch job/offer tables and RLS.
- Implement eligibility and deterministic ranking.
- Implement offer expiry, next-driver retry, idempotency and atomic acceptance.
- Update driver UI to show only its current offer.

**Gate:** Concurrent acceptance tests prove that no ride can be assigned to two drivers; failed or expired offers safely move to the next eligible driver.

### Sprint 1C — WhatsApp channel
- Configure official WhatsApp Business Platform.
- Verify webhook signatures and idempotency.
- Capture consent and confirm passenger identity/contact.
- Call the same booking RPC used by the Passenger app.
- Send booking, driver assignment, arrival and completion updates.

**Gate:** WhatsApp-created rides appear in the same passenger history, dispatch queue and finance records.

### Sprint 1D — Pricing, safety and finance
- Add quote snapshots, surge rules and caps.
- Add rules-based fraud alerts and admin review.
- Extend finance ledger with distinct revenue categories.
- Test all allocations without changing the 15% / 85% ride split.

**Gate:** Every quote and charge is disclosed, auditable and reproducible.

### Later — Ride modes and expansion
- Activate only services that have verified vehicles, operating procedures, safety requirements and demand.
- Keep Mufumbwe as the first configured service area.
- Expand to other districts only after operational acceptance.

## 6. Items requiring live-environment verification

The repository contains SQL setup and migration scripts, but source files alone cannot prove which migrations are installed in the live Supabase project. Before writing or applying any new migration, verify:
- Actual tables, columns, constraints, indexes and triggers.
- Actual RLS policies and grants.
- Installed RPC definitions and function ownership.
- Supabase project secrets and webhook configuration.
- Firebase project/package registration.
- Current production app URL and deployed commit.

Never place Supabase service-role keys, Firebase service-account private keys, WhatsApp access tokens or signing keystores in source control or client-side code.

## 7. Immediate next engineering task

Design and test the automatic dispatch schema and server-side booking RPC in the development Supabase project. Do not modify the production Passenger booking insert or existing production database until the new workflow passes regression and concurrency tests.
