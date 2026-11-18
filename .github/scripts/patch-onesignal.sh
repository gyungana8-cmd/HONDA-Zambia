#!/usr/bin/env bash
set -euo pipefail

: "${ONESIGNAL_APP_ID:?GitHub Actions secret ONESIGNAL_APP_ID is required}"
PROJECT_FILE="$(find source -type f -name settings.gradle -print -quit)"
[ -n "$PROJECT_FILE" ] || PROJECT_FILE="$(find source -type f -name settings.gradle.kts -print -quit)"
[ -n "$PROJECT_FILE" ] || { echo "Android settings file missing"; exit 1; }
PROJECT_DIR="$(dirname "$PROJECT_FILE")"
APP_DIR="$PROJECT_DIR/app"
MAIN="$APP_DIR/src/main"
MANIFEST="$MAIN/AndroidManifest.xml"
ACTIVITY="$MAIN/java/com/yangu/hondazambia/MainActivity.java"

python3 - "$APP_DIR/build.gradle" "$MANIFEST" "$ACTIVITY" "$ONESIGNAL_APP_ID" <<'PY'
from pathlib import Path
import re, sys
app = Path(sys.argv[1])\nmanifest = Path(sys.argv[2])\nactivity = Path(sys.argv[3])\napp_id = sys.argv[4]
# Add the official OneSignal Android SDK to the existing app module.
s=app.read_text()
if "com.onesignal:OneSignal" not in s:
    if "dependencies {" in s:
        s=s.replace("dependencies {", "dependencies {\n    implementation 'com.onesignal:OneSignal:[5.1.6, 5.1.99]'", 1)
    else:
        s += "\n\ndependencies { implementation 'com.onesignal:OneSignal:[5.1.6, 5.1.99]' }\n"
    app.write_text(s)

# OneSignal owns FCM delivery. Remove the old custom Firebase service to avoid
# competing message receivers; retain Firebase config as OneSignal's FCM transport.
m=manifest.read_text()
m=re.sub(r'\s*<service\s+android:name="\.TwendeFirebaseMessagingService".*?</service>\s*', '\n', m, flags=re.S)
manifest.write_text(m)

# Replace the old Firebase WebView bridge with an account-identity bridge.
a=activity.read_text()
a=a.replace('import com.google.firebase.messaging.FirebaseMessaging;\n','')
a=a.replace('import android.content.Context;\n','')
if 'import com.onesignal.OneSignal;' not in a:
    a=a.replace('import android.app.Activity;', 'import android.app.Activity;\nimport com.onesignal.OneSignal;\nimport com.onesignal.Continue;\nimport com.onesignal.debug.LogLevel;')
a=re.sub(r'\s*webView\.addJavascriptInterface\(new PushBridge\(\), "TwendePush"\);', '', a)
a=re.sub(r'\s*if \(Build\.VERSION\.SDK_INT >= 33 && checkSelfPermission\("android\.permission\.POST_NOTIFICATIONS"\) != PackageManager\.PERMISSION_GRANTED\) \{\s*requestPermissions\(new String\[\]\{"android\.permission\.POST_NOTIFICATIONS"\}, NOTIFICATION_PERMISSION_REQUEST\);\s*\}', '', a)
# Remove the Firebase-only PushBridge class and its notification channel helper.
a=re.sub(r'\s*private void createNotificationChannel\(\) \{.*?\n    \}\n\n    private class PushBridge \{.*?\n    \}\n', '\n', a, flags=re.S)
bridge='''    private class PushBridge {
        @android.webkit.JavascriptInterface
        public void login(String userId) {
            if (userId != null && !userId.trim().isEmpty()) {
                runOnUiThread(() -> OneSignal.login(userId));
            }
        }

        @android.webkit.JavascriptInterface
        public void logout() {
            runOnUiThread(OneSignal::logout);
        }
    }

'''
if 'private class PushBridge' not in a:
    a=a.replace('    private boolean hasLocationPermission() {', bridge+'    private boolean hasLocationPermission() {')
init='''        OneSignal.getDebug().setLogLevel(LogLevel.VERBOSE);
        OneSignal.initWithContext(this, "'''+str(app_id)+'''");
        OneSignal.getNotifications().requestPermission(false, Continue.none());
        webView.addJavascriptInterface(new PushBridge(), "TwendePush");
'''
if 'OneSignal.initWithContext' not in a:
    a=a.replace('        setContentView(webView);', '        setContentView(webView);\n'+init.rstrip())
activity.write_text(a)
Path("source/app/src/main/java/com/yangu/hondazambia/TwendeFirebaseMessagingService.java").unlink(missing_ok=True)
PY

echo "OneSignal Android SDK and TWENDE identity bridge configured."
grep -q 'com.onesignal:OneSignal' "$APP_DIR/build.gradle"
grep -q 'OneSignal.initWithContext' "$ACTIVITY"
grep -q 'new PushBridge(), "TwendePush"' "$ACTIVITY"
