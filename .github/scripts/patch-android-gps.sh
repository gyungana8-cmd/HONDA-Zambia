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
s=s.replace('<application', '<application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher" ', 1)
p.write_text(s)

res=Path("source/app/src/main/res")
(res/"mipmap-anydpi").mkdir(parents=True, exist_ok=True)
(res/"mipmap-anydpi-v26").mkdir(parents=True, exist_ok=True)
(res/"drawable").mkdir(parents=True, exist_ok=True)
(res/"values").mkdir(parents=True, exist_ok=True)
(res/"drawable/twende_launcher_foreground.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <group android:scaleX="0.68" android:scaleY="0.68" android:pivotX="54" android:pivotY="54">
    <path android:fillColor="@android:color/transparent" android:strokeColor="#FF171717" android:strokeWidth="2.8" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M4,40 L14,40 M9,40 L9,68 M17,40 L21,68 L27,48 L33,68 L37,40 M50,40 L40,40 L40,68 L50,68 M40,54 L48,54 M54,68 L54,40 L70,68 L70,40 M74,40 L74,68 L80,68 Q91,68 91,54 Q91,40 80,40 Z M104,40 L94,40 L94,68 L104,68 M94,54 L102,54"/>
    </group>
</vector>
""")
(res/"mipmap-anydpi/ic_launcher.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#FFFFCC00" android:pathData="M0,0 L108,0 L108,108 L0,108 Z"/>
    <group android:scaleX="0.68" android:scaleY="0.68" android:pivotX="54" android:pivotY="54">
    <path android:fillColor="@android:color/transparent" android:strokeColor="#FF171717" android:strokeWidth="2.8" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M4,40 L14,40 M9,40 L9,68 M17,40 L21,68 L27,48 L33,68 L37,40 M50,40 L40,40 L40,68 L50,68 M40,54 L48,54 M54,68 L54,40 L70,68 L70,40 M74,40 L74,68 L80,68 Q91,68 91,54 Q91,40 80,40 Z M104,40 L94,40 L94,68 L104,68 M94,54 L102,54"/>
    </group>
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

# Set the native Android application name and yellow/black TWENDE launcher icon.
python3 - <<'PY'
from pathlib import Path
import re
manifest=Path("source/app/src/main/AndroidManifest.xml")
s=manifest.read_text()
s=re.sub(r'android:label="[^"]*"', 'android:label="@string/app_name"', s, count=1)
if 'android:label=' not in s:
    s=s.replace('<application', '<application android:label="@string/app_name"', 1)
manifest.write_text(s)
res=Path("source/app/src/main/res")
(res/"values").mkdir(parents=True, exist_ok=True)
strings=res/"values/strings.xml"
xml=strings.read_text() if strings.exists() else '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n'
if re.search(r'<string name="app_name">.*?</string>', xml):
    xml=re.sub(r'<string name="app_name">.*?</string>', '<string name="app_name">Twende</string>', xml)
else:
    xml=xml.replace('</resources>', '    <string name="app_name">Twende</string>\n</resources>')
strings.write_text(xml)
colors=res/"values/colors.xml"
xml=colors.read_text() if colors.exists() else '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n'
if 'name="twende_icon_background"' in xml:
    xml=re.sub(r'<color name="twende_icon_background">.*?</color>', '<color name="twende_icon_background">#FFCC00</color>', xml)
else:
    xml=xml.replace('</resources>', '    <color name="twende_icon_background">#FFCC00</color>\n</resources>')
colors.write_text(xml)
legacy=res/"mipmap-anydpi/ic_launcher.xml"
if legacy.exists():
    t=legacy.read_text().replace('#FFC91F2C','#FFFFCC00')
    legacy.write_text(t)
PY

cat > "$ACTIVITY" <<'JAVA'
package com.yangu.hondazambia;
import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

public class MainActivity extends Activity {
  private static final int REQ=701;
  private WebView web;
  private LocationManager lm;
  private LocationListener listener;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private boolean sent=false, pending=false;
  private GeolocationPermissions.Callback geoCallback;
  private String geoOrigin;

  private boolean allowed() {
    return Build.VERSION.SDK_INT<23 ||
      checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED ||
      checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;
  }
  @Override public void onCreate(Bundle b) {
    super.onCreate(b);
    web=new WebView(this); setContentView(web);
    WebSettings w=web.getSettings(); w.setJavaScriptEnabled(true); w.setDomStorageEnabled(true);
    w.setAllowFileAccess(true); w.setGeolocationEnabled(true);
    web.addJavascriptInterface(new Bridge(),"TwendeAndroid");
    web.setWebViewClient(new WebViewClient());
    web.setWebChromeClient(new WebChromeClient() {
      @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
        if(allowed()) cb.invoke(origin,true,false);
        else { geoOrigin=origin; geoCallback=cb; askPermission(); }
      }
    });
    if(b==null) web.loadUrl("file:///android_asset/index.html"); else web.restoreState(b);
  }
  private void askPermission() {
    if(Build.VERSION.SDK_INT>=23) requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},REQ);
  }
  private class Bridge {
    @JavascriptInterface public void requestCurrentLocation() {
      runOnUiThread(() -> { if(!allowed()){pending=true;askPermission();} else locateNative(); });
    }
  }
  private void locateNative() {
    try {
      lm=(LocationManager)getSystemService(Context.LOCATION_SERVICE);
      if(lm==null || (!lm.isProviderEnabled("gps") && !lm.isProviderEnabled("network"))) { fail("Turn on Location/GPS in your phone settings."); return; }
      Location last=null;
      if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED) last=lm.getLastKnownLocation("gps");
      if(last==null && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED) last=lm.getLastKnownLocation("network");
      if(last!=null && System.currentTimeMillis()-last.getTime()<30000) { success(last); return; }
      sent=false;
      listener=new LocationListener() {
        @Override public void onLocationChanged(Location l) { success(l); }
        @Override public void onProviderEnabled(String p) {}
        @Override public void onProviderDisabled(String p) {}
        @Override public void onStatusChanged(String p,int status,Bundle extras) {}
      };
      if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED && lm.isProviderEnabled("gps"))
        lm.requestLocationUpdates("gps",1000,0,listener,Looper.getMainLooper());
      if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED && lm.isProviderEnabled("network"))
        lm.requestLocationUpdates("network",1000,0,listener,Looper.getMainLooper());
      handler.postDelayed(() -> { if(!sent) fail("GPS is taking too long. Check that Location is on and try again outdoors."); },25000);
    } catch(SecurityException e) { fail("Allow precise location for Twende in Android settings."); }
      catch(Exception e) { fail("Could not read phone location: "+e.getMessage()); }
  }
  private void stopUpdates() {
    if(lm!=null && listener!=null) try { lm.removeUpdates(listener); } catch(SecurityException ignored) {}
    listener=null;
  }
  private void success(Location l) {
    if(l==null || sent) return; sent=true; stopUpdates(); handler.removeCallbacksAndMessages(null);
    String js="window.onTwendeNativeLocation && window.onTwendeNativeLocation("+l.getLatitude()+","+l.getLongitude()+","+l.getAccuracy()+",null);";
    runOnUiThread(() -> { if(web!=null) web.evaluateJavascript(js,null); });
  }
  private void fail(String message) {
    if(sent) return; sent=true; stopUpdates(); handler.removeCallbacksAndMessages(null);
    String js="window.onTwendeNativeLocation && window.onTwendeNativeLocation(null,null,null,"+JSONObject.quote(message)+");";
    runOnUiThread(() -> { if(web!=null) web.evaluateJavascript(js,null); });
  }
  @Override public void onRequestPermissionsResult(int code,String[] p,int[] r) {
    super.onRequestPermissionsResult(code,p,r);
    if(code==REQ) {
      boolean ok=allowed();
      if(geoCallback!=null){geoCallback.invoke(geoOrigin,ok,false);geoCallback=null;geoOrigin=null;}
      if(pending){pending=false;if(ok)locateNative();else fail("Location permission was denied. Enable precise location for Twende.");}
    }
  }
  @Override protected void onSaveInstanceState(Bundle b){if(web!=null)web.saveState(b);super.onSaveInstanceState(b);}
  @Override protected void onDestroy(){stopUpdates();handler.removeCallbacksAndMessages(null);if(web!=null)web.destroy();super.onDestroy();}
  @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
}
JAVA
echo "GPS Android native location bridge applied"
