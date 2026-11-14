# Twende Android app project

This project wraps the existing Twende mobile web prototype in an Android WebView and packages its HTML/CSS/JavaScript assets inside the app. The demo screens therefore load offline after installation.

## Build an APK with GitHub Actions
1. Upload the contents of this folder (including the hidden `.github` folder) to the root of `gyungana8-cmd/HONDA-Zambia` and commit the changes.
2. In GitHub, open the repository's **Actions** tab.
3. Select **Build Twende APK** and tap **Run workflow** if it has not started automatically.
4. When the run completes successfully, open it and download the `Twende-Android-APK` artifact. Extract it to obtain `app-debug.apk`.
5. Transfer `app-debug.apk` to the Android phone and install it. Android may ask permission to install unknown apps for the browser or file manager used.

## Prototype limitations
This is an installable Android wrapper for the current front-end demo. Rider/owner accounts, a shared server database, real booking dispatch, payments, identity/licence checks, GPS tracking and push notifications are not implemented. Demo hire requests are stored locally on the device/browser. A production launch requires a secure backend and operational/safety checks.
