# TWENDE push notification deployment

The Android project now includes Firebase Messaging and the app registers its FCM token in `public.device_push_tokens`. The server function is `supabase/functions/send-twende-push/index.ts`.

## 1. Apply the token table

In Supabase Dashboard for project `obgteeruczqlebllrafr`, open **SQL Editor**, paste and run `supabase/push_notifications_setup.sql`.

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

In Supabase Dashboard → **Database → Webhooks**, create three webhooks pointing to:
`https://obgteeruczqlebllrafr.supabase.co/functions/v1/send-twende-push`

For every webhook add header:
`x-twende-webhook-secret: <the exact TWENDE_WEBHOOK_SECRET value>`

Configure events:
1. `ride_requests`: INSERT (new taxi requests).
2. `ride_requests`: UPDATE (driver acceptance).
3. `bookings`: INSERT (motorcycle hire request).

Use the webhook's JSON payload format with `type`, `table`, and `record` fields. The function sends requests only to approved online drivers with the matching vehicle type, sends hire requests to the motorcycle owner, and sends acceptance updates to the passenger.

## 5. Driver rejection and automatic reassignment

After the base booking-expiry and driver-request-delivery migrations have been applied, run `supabase/twende_driver_reassignment.sql` in Supabase SQL Editor. This adds an auditable rejection record, prevents rejected requests returning to the same driver, and assigns the request to the next approved online matching driver with a fresh GPS location within 15 km. If no eligible driver is currently available, the request remains pending and unassigned; a later online driver's GPS update triggers another dispatch attempt.

The `ride_requests` UPDATE webhook must be enabled. The push function now sends high-priority data-only FCM messages for both new and reassigned pending requests. The Partner Android app displays native Accept and Reject actions so drivers can respond without opening the dashboard. Keep Android notifications enabled on the phone.

## 6. Test

Build and install the updated TWENDE Partner APK. Sign in on a driver phone, allow notifications, and confirm that a row appears in `device_push_tokens`. Create a test request from a second account. Test with the driver app in the background and screen locked; use Accept and Reject directly from the notification. When rejecting, confirm the next eligible nearby driver receives the same ride request. Also test that Call passenger opens the dialler with the complete +260 number.

**Current limitations:** push delivery will not start until the SQL is applied, the function is deployed, Firebase service-account secret is configured, and all three database webhooks are enabled. Android 13+ users must allow notifications. The service account private key must remain secret.
