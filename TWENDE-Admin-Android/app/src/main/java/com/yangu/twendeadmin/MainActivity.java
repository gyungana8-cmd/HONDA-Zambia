package com.yangu.twendeadmin;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

public class MainActivity extends Activity {
    private WebView web;
    private ProgressBar progress;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFFF5C400);
        getWindow().setNavigationBarColor(0xFF101820);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        progress = new ProgressBar(this);
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(96,96,android.view.Gravity.CENTER);
        root.addView(web, new FrameLayout.LayoutParams(-1,-1));
        root.addView(progress,p);
        setContentView(root);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.clearCache(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view,int value) {
                progress.setVisibility(value >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        web.loadUrl("https://gyungana8-cmd.github.io/HONDA-Zambia/admin.html?app=android&v=20261122");
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (web != null) { web.stopLoading(); web.destroy(); web = null; }
        super.onDestroy();
    }
}
