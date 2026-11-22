#!/usr/bin/env bash
set -euo pipefail
ACTIVITY="source/app/src/main/java/com/yangu/hondazambia/MainActivity.java"
MANIFEST="source/app/src/main/AndroidManifest.xml"
test -f "$ACTIVITY" && test -f "$MANIFEST"
python3 - <<'PY'
from pathlib import Path
import re
p=Path("source/app/src/main/java/com/yangu/hondazambia/MainActivity.java")
s=p.read_text()
imports=[
 "import android.content.Context;",
 "import android.content.Intent;",
 "import android.net.Uri;",
 "import android.app.NotificationChannel;",
 "import android.app.NotificationManager;",
 "import android.os.Build;",
 "import android.webkit.JavascriptInterface;",
 "import android.webkit.WebResourceRequest;",
 "import com.google.firebase.messaging.FirebaseMessaging;"
]
for line in imports:
    if line not in s:
        s=s.replace("import android.webkit.WebView;", "import android.webkit.WebView;\n"+line,1)

# Intercept telephone links in WebView and open Android's dialler.
old='web.setWebViewClient(new WebViewClient());'
new='''web.setWebViewClient(new WebViewClient() {
      private boolean openExternal(String url) {
        if (url == null || !url.toLowerCase().startsWith("tel:")) return false;
        try {
          Intent dial = new Intent(Intent.ACTION_DIAL, Uri.parse(url));
          startActivity(dial);
        } catch (Exception e) {
          android.widget.Toast.makeText(MainActivity.this, "No phone dialler is available.", android.widget.Toast.LENGTH_LONG).show();
        }
        return true;
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
        return openExternal(url);
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return openExternal(request.getUrl().toString());
      }
    });'''
if old in s:
    s=s.replace(old,new,1)
elif "private boolean openExternal(String url)" not in s:
    raise SystemExit("Expected WebViewClient insertion point not found")

# Register native FCM bridge and request notification permission.
anchor='web=new WebView(this); setContentView(web);'
if anchor in s and 'new TwendePushBridge()' not in s:
    s=s.replace(anchor,anchor+'''
    createTwendeNotificationChannel();
    web.addJavascriptInterface(new TwendePushBridge(), "TwendePush");
    if (Build.VERSION.SDK_INT >= 33 &&
        checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 702);
    }''',1)
elif 'new TwendePushBridge()' not in s:
    raise SystemExit("Expected WebView setup line not found")

bridge='''
  private void createTwendeNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel = new NotificationChannel(
        "twende_bookings", "TWENDE booking alerts", NotificationManager.IMPORTANCE_HIGH);
      channel.setDescription("Immediate alerts for new passenger taxi requests and booking updates");
      channel.enableVibration(true);
      channel.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
        new android.media.AudioAttributes.Builder()
          .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
      NotificationManager manager = getSystemService(NotificationManager.class);
      if (manager != null) manager.createNotificationChannel(channel);
    }
  }

  private class TwendePushBridge {
    @JavascriptInterface
    public void requestPushToken() {
      FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
        if (!task.isSuccessful() || task.getResult() == null) return;
        String token = task.getResult();
        getSharedPreferences("twende_push", Context.MODE_PRIVATE)
          .edit().putString("fcm_token", token).apply();
        runOnUiThread(() -> {
          if (web != null) web.evaluateJavascript(
            "window.twendeReceivePushToken && window.twendeReceivePushToken(" +
            org.json.JSONObject.quote(token) + ")", null);
        });
      });
    }
  }

'''
if 'private void createTwendeNotificationChannel()' not in s:
    marker='  @Override public void onBackPressed()'
    if marker not in s: raise SystemExit("Could not find MainActivity method insertion point")
    s=s.replace(marker,bridge+marker,1)
p.write_text(s)

m=Path("source/app/src/main/AndroidManifest.xml")
ms=m.read_text()
if 'android.permission.POST_NOTIFICATIONS' not in ms:
    ms=ms.replace('<uses-permission android:name="android.permission.INTERNET" />',
      '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',1)
m.write_text(ms)
print("TWENDE native push-token bridge, high-importance sound channel and telephone dialler handler applied")
PY
