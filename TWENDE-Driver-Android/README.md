# TWENDE Driver for Android

A separate native Android application module. It does not replace the existing TWENDE Passenger APK or its Firebase configuration.

## Identity
- Application ID: `com.yangu.twendedriver`
- Firebase project: `twende-zambia`
- Firebase Android configuration: `app/google-services.json`

## Build
Open this folder as an Android Studio project, or run:

```bash
gradle assembleDebug
```

The repository GitHub Actions workflow will be added after the native driver flow is integrated and validated.

## Implementation stages
1. Native Android project and Firebase registration.
2. Driver sign-in using the existing TWENDE Supabase authentication and role model.
3. Foreground location service, started only after the driver chooses Go Online and grants location permissions.
4. FCM booking alerts with sound/vibration and booking detail actions.
5. Secure Accept/Decline actions using existing TWENDE database policies.
6. Test reconnection, screen-off tracking, stale GPS handling, and battery restrictions.

## Safety and privacy
- No Supabase service-role key or Firebase service-account private key belongs in this Android project.
- Background location is used only for the driver's explicit online availability.
- Android may stop tracking after force-stop, device shutdown, revoked permissions, or manufacturer battery restrictions.
- This initial project scaffold is not yet a release-ready driver app. Authentication, database actions, and the online/offline lifecycle must be integrated and tested before field deployment.
