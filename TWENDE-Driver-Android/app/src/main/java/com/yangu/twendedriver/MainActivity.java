package com.yangu.twendedriver;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.view.ViewGroup;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {
    private static final int REQUEST_PERMISSIONS = 501;
    private WebView webView;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(16, 12, 16, 12);
        TextView heading = new TextView(this);
        heading.setText("TWENDE DRIVER");
        heading.setTextSize(22);
        heading.setTextColor(0xFF202020);
        heading.setPadding(4, 8, 4, 12);
        root.addView(heading);

        TextView note = new TextView(this);
        note.setText("Driver portal preview. Background online tracking will be enabled after secure driver sign-in and online-status integration.");
        note.setTextSize(14);
        root.addView(note);

        Button permissions = new Button(this);
        permissions.setText("Grant location and notification permissions");
        permissions.setOnClickListener(v -> requestDriverPermissions());
        root.addView(permissions);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        root.addView(webView, webParams);
        setContentView(root);
        webView.loadUrl("https://gyungana8-cmd.github.io/HONDA-Zambia/");
    }

    private void requestDriverPermissions() {
        java.util.ArrayList<String> wanted = new java.util.ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
            wanted.add(Manifest.permission.ACCESS_FINE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            wanted.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!wanted.isEmpty()) ActivityCompat.requestPermissions(this, wanted.toArray(new String[0]), REQUEST_PERMISSIONS);
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
