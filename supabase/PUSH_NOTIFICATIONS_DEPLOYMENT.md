# TWENDE push notification deployment

The Android app registers Firebase Cloud Messaging tokens in `public.device_push_tokens`. The server function is `supabase/functions/send-twende-push/index.ts`. Owner, driver and vehicle controls are defined in `supabase/owner_assigned_driver_notifications.sql`.

## 1. Apply database migrations

In the Supabase project `obgteeruczqlebllrafr`, open **SQL Editor** and run the following repository files in order. Skip files already successfully applied:

1. `supabase/ride_hailing_setup.sql`
2. `supabase/multi_vehicle_driver_phase1.sql`
3. `supabase/multi_vehicle_driver_phase2.sql`
4. `supabase/twende_admin_setup.sql`
5. `supabase/owner_assigned_driver_notifications.sql`
6. `supabase/push_notifications_setup.sql`

The owner/driver migration adds owner account approval, assigning an approved driver to an approved vehicle, owner monitoring of assigned-driver trips, and a restricted approved-driver directory. Do not run phase 1 or phase 2 again if they have already been applied successfully.

## 2. Configure Firebase

In Firebase Console, select **TWENDE Zambia** (`twende-zambia`). Open **Project settings → Service accounts → Firebase Admin SDK → Generate new private key**. Keep the downloaded JSON private. Never commit it to GitHub or place it in the Android app.

## 3. Deploy the push function

Deploy `send-twende-push` from the repository root:

```bash
supabase functions deploy send-twende-push --no-verify-jwt
```

Set these Supabase Edge Function secrets:
- `FIREBASE_SERVICE_ACCOUNT`: the complete Firebase service-account JSON.
- `TWENDE_WEBHOOK_SECRET`: a long random secret.
- Supabase normally supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; if they are not present, configure them in Supabase secrets. Never expose the service-role key in the client app or GitHub.

## 4. Configure database webhooks

In Supabase Dashboard → **Database → Webhooks**, create a webhook for each event below. All use this endpoint:

`https://obgteeruczqlebllrafr.supabase.co/functions/v1/send-twende-push`

Add this header to every webhook:

`x-twende-webhook-secret: <the exact TWENDE_WEBHOOK_SECRET value>`

Create these six event subscriptions:
1. `ride_requests` — INSERT (new taxi request).
2. `ride_requests` — UPDATE (accepted taxi request).
3. `bookings` — INSERT (motorcycle hire request).
4. `driver_vehicles` — UPDATE (vehicle approval/rejection).
5. `twende_owner_profiles` — UPDATE (owner approval/rejection).
6. `driver_profiles` — UPDATE (driver approval/rejection).

Use Supabase's standard webhook payload containing `type`, `table`, `record`, and `old_record` for update events. Taxi requests notify approved owners and the assigned approved driver of matching online vehicles. When the owner drives personally, the same account receives one notification. When a ride is accepted, the passenger and vehicle owner/assigned driver are notified. Owner, driver and vehicle approval decisions also trigger notifications.

## 5. End-to-end test

After applying the migrations and deploying the function:
1. Register an owner account and a vehicle.
2. As administrator, approve the owner and the vehicle.
3. Register a separate driver account and approve it.
4. From the owner's dashboard, assign that approved driver to the vehicle.
5. Put the vehicle online from the assigned driver's account.
6. Request a taxi from a separate passenger account.
7. Confirm the driver and owner receive notifications; accept the request and confirm the passenger receives confirmation while the owner can monitor the trip.
8. Repeat with the owner driving personally (clear the driver assignment and let the owner put the vehicle online).

**Important:** notifications are not live until the database migrations, Edge Function, Firebase secrets, all six webhooks and Android notification permission are configured. The Android 13+ notification permission must be granted. Test using separate devices/accounts before publishing the APK.
