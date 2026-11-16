#!/usr/bin/env bash
set -euo pipefail

PROJECT_FILE="$(find source -type f -name settings.gradle -print -quit)"
[ -n "$PROJECT_FILE" ] || PROJECT_FILE="$(find source -type f -name settings.gradle.kts -print -quit)"
[ -n "$PROJECT_FILE" ] || { echo "Android settings file missing"; exit 1; }
PROJECT_DIR="$(dirname "$PROJECT_FILE")"
APP_DIR="$PROJECT_DIR/app"
MAIN="$APP_DIR/src/main"
JAVA_DIR="$MAIN/java/com/yangu/hondazambia"
mkdir -p "$JAVA_DIR"

python3 - "$PROJECT_DIR/build.gradle" "$APP_DIR/build.gradle" "$MAIN/AndroidManifest.xml" "$MAIN/java/com/yangu/hondazambia/MainActivity.java" <<'PY'
from pathlib import Path
import sys
root, app, manifest, activity = map(Path, sys.argv[1:])
s = root.read_text()
if "com.google.gms.google-services" not in s:
    s = s.replace("id 'com.android.application' version '8.7.3' apply false", "id 'com.android.application' version '8.7.3' apply false\n    id 'com.google.gms.google-services' version '4.4.2' apply false")
root.write_text(s)

s = app.read_text()
if "com.google.gms.google-services" not in s:
    s = s.replace("plugins { id 'com.android.application' }", "plugins {\n    id 'com.android.application'\n    id 'com.google.gms.google-services'\n}")
if "firebase-messaging" not in s:
    s += """
\ndependencies {
    implementation platform('com.google.firebase:firebase-bom:33.7.0')
    implementation 'com.google.firebase:firebase-messaging'
}
"""
app.write_text(s)

s = manifest.read_text()
if 'android.permission.POST_NOTIFICATIONS' not in s:
    s = s.replace('<uses-permission android:name="android.permission.INTERNET" />', '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />')
if 'TwendeFirebaseMessagingService' not in s:
    s = s.replace('        <activity', '''        <service
            android:name=".TwendeFirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
        <activity''')
manifest.write_text(s)

s = activity.read_text()
if 'JavascriptInterface' not in s:
    s = s.replace('import android.webkit.WebSettings;', 'import android.webkit.WebSettings;\nimport android.webkit.JavascriptInterface;\nimport android.content.Context;\nimport android.app.NotificationChannel;\nimport android.app.NotificationManager;\nimport android.os.Build;\nimport com.google.firebase.messaging.FirebaseMessaging;')
    s = s.replace('    private static final int LOCATION_PERMISSION_REQUEST = 701;', '    private static final int LOCATION_PERMISSION_REQUEST = 701;\n    private static final int NOTIFICATION_PERMISSION_REQUEST = 702;\n    private static final String CHANNEL_ID = "twende_bookings";')
    s = s.replace('        setContentView(webView);', '''        setContentView(webView);
        createNotificationChannel();
        webView.addJavascriptInterface(new PushBridge(), "TwendePush");
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, NOTIFICATION_PERMISSION_REQUEST);
        }''')
    marker = '    private boolean hasLocationPermission() {'
    bridge = '''    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "TWENDE ride and hire alerts", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("New ride requests, motorcycle hires and booking updates");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private class PushBridge {
        @JavascriptInterface
        public void requestPushToken() {
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) return;
                String token = task.getResult();
                getSharedPreferences("twende_push", Context.MODE_PRIVATE).edit().putString("fcm_token", token).apply();
                runOnUiThread(() -> webView.evaluateJavascript(
                    "window.twendeReceivePushToken && window.twendeReceivePushToken(" + org.json.JSONObject.quote(token) + ")", null));
            });
        }
    }

'''
    s = s.replace(marker, bridge + marker)
    activity.write_text(s)
PY

cat > "$JAVA_DIR/TwendeFirebaseMessagingService.java" <<'JAVA'
package com.yangu.hondazambia;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class TwendeFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "twende_bookings";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences("twende_push", MODE_PRIVATE).edit().putString("fcm_token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        String title = "TWENDE";
        String body = "You have a new update.";
        if (message.getNotification() != null) {
            if (message.getNotification().getTitle() != null) title = message.getNotification().getTitle();
            if (message.getNotification().getBody() != null) body = message.getNotification().getBody();
        }
        if (message.getData().containsKey("title")) title = message.getData().get("title");
        if (message.getData().containsKey("body")) body = message.getData().get("body");

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "TWENDE ride and hire alerts", NotificationManager.IMPORTANCE_HIGH);
            manager.createNotificationChannel(channel);
        }
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pending = launch == null ? null : PendingIntent.getActivity(
            this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true);
        if (pending != null) builder.setContentIntent(pending);
        manager.notify((int) System.currentTimeMillis(), builder.build());
    }
}
JAVA
echo "Firebase Messaging native integration patched"
