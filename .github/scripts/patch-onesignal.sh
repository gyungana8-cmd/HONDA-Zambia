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
s=root.read_text()
if "com.onesignal:OneSignal" not in app.read_text():
    a=app.read_text()
    a += "\n\ndependencies {\n    implementation 'com.onesignal:OneSignal:5.9.2'\n}\n"
    app.write_text(a)
s=manifest.read_text()
if 'android.permission.POST_NOTIFICATIONS' not in s:
    s=s.replace('<uses-permission android:name="android.permission.INTERNET" />','<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',1)
manifest.write_text(s)
s=activity.read_text()
if 'TwendeOneSignal' not in s:
    s=s.replace('import android.webkit.WebViewClient;','import android.webkit.WebViewClient;\nimport android.webkit.JavascriptInterface;')
    s=s.replace('        setContentView(webView);','''        setContentView(webView);
        TwendeOneSignal.initialize(getApplicationContext());
        webView.addJavascriptInterface(new OneSignalBridge(), "TwendeOneSignal");''')
    marker='    private boolean hasLocationPermission() {'
    bridge='''    private class OneSignalBridge {
        @JavascriptInterface
        public void identify(String externalId) {
            if (externalId != null && !externalId.trim().isEmpty()) {
                runOnUiThread(() -> TwendeOneSignal.login(externalId.trim()));
            }
        }
        @JavascriptInterface
        public void logout() {
            runOnUiThread(() -> TwendeOneSignal.logout());
        }
        @JavascriptInterface
        public void requestPermission() {
            runOnUiThread(() -> TwendeOneSignal.requestPermission(MainActivity.this));
        }
    }

'''
    s=s.replace(marker,bridge+marker)
    activity.write_text(s)
PY

cat > "$JAVA_DIR/TwendeOneSignal.java" <<'JAVA'
package com.yangu.hondazambia;

import android.app.Activity;
import android.content.Context;
import android.util.Log;
import com.onesignal.OneSignal;

public final class TwendeOneSignal {
    private static final String TAG = "TWENDE-OneSignal";
    private static final String APP_ID = "2f939555-257e-48f1-a038-8b9428d57b71";
    private static boolean initialized = false;

    private TwendeOneSignal() {}

    public static synchronized void initialize(Context context) {
        if (initialized) return;
        try {
            OneSignal.initWithContext(context, APP_ID);
            initialized = true;
            Log.i(TAG, "OneSignal initialized");
        } catch (Exception error) {
            Log.e(TAG, "OneSignal initialization failed", error);
        }
    }

    public static void login(String externalId) {
        if (!initialized || externalId == null || externalId.isEmpty()) return;
        try {
            OneSignal.login(externalId);
            Log.i(TAG, "OneSignal user identified");
        } catch (Exception error) {
            Log.e(TAG, "OneSignal identity login failed", error);
        }
    }

    public static void logout() {
        if (!initialized) return;
        try {
            OneSignal.logout();
        } catch (Exception error) {
            Log.e(TAG, "OneSignal logout failed", error);
        }
    }

    public static void requestPermission(Activity activity) {
        if (!initialized || activity == null) return;
        try {
            OneSignal.getNotifications().requestPermission(true,
                new kotlin.coroutines.Continuation<Boolean>() {
                    @Override
                    public kotlin.coroutines.CoroutineContext getContext() {
                        return kotlin.coroutines.EmptyCoroutineContext.INSTANCE;
                    }

                    @Override
                    public void resumeWith(Object result) {
                        Log.i(TAG, "OneSignal permission request completed: " + result);
                    }
                });
        } catch (Exception error) {
            Log.e(TAG, "OneSignal permission request failed", error);
        }
    }
}
JAVA
echo "TWENDE OneSignal Android SDK patch applied"
