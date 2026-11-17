# TWENDE push notification deployment

The Android project now includes Firebase Messaging and the app registers its FCM token in `public.device_push_tokens`. The server function is `supabase/functions/send-twende-push/index.ts`. The owner/assigned-driver extension is in `supabase/owner_assigned_driver_notifications.sql`.

## 1. Apply the database migrations

In Supabase Dashboard for project `obgteeruczqlebllrafr`, open **SQL Editor** and run these repository files in order: `supabase/ride_hailing_setup.sql` (if not already applied), `supabase/multi_vehicle_driver_phase1.sql`, `supabase/multi_vehicle_driver_phase2.sql`, `supabase/twende_admin_setup.sql` (if not already applied), `supabase/owner_assigned_driver_notifications.sql`, then `supabase/push_notifications_setup.sql`. The last migration adds owner approval, assigned-driver controls, owner monitoring and the safe approved-driver directory RPC.

## 2. Create a Firebase service account key

In Firebase Console, select **TWENDE Zambia** (`twende-zambia`). Open **Project settings → Service accounts → Firebase Admin SDK → Generate new private key**. Download the JSON file and keep it private. Never commit it to GitHub or put it in the Android app.

## 3. Add Supabase Edge Function secrets

Deploy `send-twende-push` from the Supabase CLI using this repository, then set these secrets in Supabase Edge Function secrets:
- `FIREBASE_SERVICE_ACCOUNT`: the entire downloaded service-account JSON as one secret value.
- `TWENDE_WEBHOOK_SECRET`: a long random secret generated privately.
- Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions; if not, set them from the project API settings. Never expose the service-role key in the app or GitHub.

Deploy command from the repository root:
```bash
supabase functions deploy send-twende-push --no-verify-jwt
```

## 4. Configure Database Webhooks

In Supabase Dashboard → **Database → Webhooks**, create one webhook for each event below, all pointing to:
`https://obgteeruczqlebllrafr.supabase.co/functions/v1/send-twende-push`

For every webhook add header:
`x-twende-webhook-secret: <the exact TWENDE_WEBHOOK_SECRET value>`

Configure events:
1. `ride_requests`: INSERT (new taxi requests).
2. `ride_requests`: UPDATE (driver acceptance).
3. `bookings`: INSERT (motorcycle hire request).\n4. `driver_vehicles`: UPDATE (vehicle approval/rejection).\n5. `twende_owner_profiles`: UPDATE (owner approval/rejection).\n6. `driver_profiles`: UPDATE (driver approval/rejection).

Use the webhook's JSON payload format with `type`, `table`, and `record` fields. For taxi requests, the function first checks for approved owner accounts, then notifies the owner and the assigned driver of approved online matching vehicles. When the owner is driving personally, the account is deduplicated and receives one notification. On acceptance, the passenger and vehicle owner/assigned driver are notified. Vehicle approval/rejection updates notify the owner and assigned driver.

## 5. Test

Build and install the new APK. Sign in on a driver/owner phone, allow notifications, and confirm that a row appears in `device_push_tokens`. Then create a test request from a second account. Test with the receiving app in the background and screen locked.

**Current limitations:** push delivery will not start until the database migrations are applied, the function is deployed, Firebase service-account secret is configured, all six event webhooks are enabled, and Android notification permission is granted. Android 13+ users must allow notifications. The service account private key must remain secret.
