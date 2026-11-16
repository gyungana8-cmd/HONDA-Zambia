#!/usr/bin/env bash
set -euo pipefail
MANIFEST="source/app/src/main/AndroidManifest.xml"
ACTIVITY="source/app/src/main/java/com/yangu/hondazambia/MainActivity.java"
test -f "$MANIFEST"
test -f "$ACTIVITY"
python3 - <<'PY'
from pathlib import Path
p=Path("source/app/src/main/AndroidManifest.xml")
s=p.read_text()
needle='    <uses-permission android:name="android.permission.INTERNET" />'
if needle not in s: raise SystemExit("Expected INTERNET permission not found")
add=needle+'\n    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />'
if "android.permission.ACCESS_FINE_LOCATION" not in s:
    s=s.replace(needle,add,1)
p.write_text(s)

# Apply the TWENDE launcher icon to the native Android application.
import re
s=p.read_text()
s=re.sub(r'\s+android:(?:roundIcon|icon)="[^"]+"', '', s)
s=s.replace('<application', '<application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher" android:label="TWENDE" ', 1)
p.write_text(s)

res=Path("source/app/src/main/res")
(res/"mipmap-anydpi").mkdir(parents=True, exist_ok=True)
(res/"mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)
(res/"drawable").mkdir(parents=True, exist_ok=True)
(res/"values").mkdir(parents=True, exist_ok=True)
(res/"drawable/twende_launcher_foreground.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#FFFFFFFF" android:pathData="M22,25 L86,25 L86,43 L63,43 L63,83 L45,83 L45,43 L22,43 Z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M67,57 L85,57 L85,75 L67,75 Z"/>
</vector>
""")
(res/"mipmap-anydpi/ic_launcher.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#FFC91F2C" android:pathData="M0,0 L108,0 L108,108 L0,108 Z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M22,25 L86,25 L86,43 L63,43 L63,83 L45,83 L45,43 L22,43 Z"/>
    <path android:fillColor="#FFFFFFFF" android:pathData="M67,57 L85,57 L85,75 L67,75 Z"/>
</vector>
""")
(res/"mipmap-anydpi-v26/ic_launcher.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/twende_icon_background"/>
    <foreground android:drawable="@drawable/twende_launcher_foreground"/>
</adaptive-icon>
""")
colors=res/"values/colors.xml"
existing=colors.read_text() if colors.exists() else '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n'
if 'name="twende_icon_background"' not in existing:
    existing=existing.replace('</resources>', '    <color name="twende_icon_background">#C91F2C</color>\n</resources>')
colors.write_text(existing)
PY

cat > "$ACTIVITY" <<'JAVA'
package com.yangu.hondazambia;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final int LOCATION_PERMISSION_REQUEST = 701;
    private WebView webView;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    private boolean hasLocationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setGeolocationEnabled(true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }
                pendingGeoOrigin = origin;
                pendingGeoCallback = callback;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    requestPermissions(new String[] {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    }, LOCATION_PERMISSION_REQUEST);
                } else {
                    callback.invoke(origin, true, false);
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl("file:///android_asset/index.html");
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST && pendingGeoCallback != null) {
            boolean granted = hasLocationPermission();
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
JAVA
echo "GPS Android permission patch applied"
