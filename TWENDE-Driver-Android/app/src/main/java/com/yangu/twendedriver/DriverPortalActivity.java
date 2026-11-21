package com.yangu.twendedriver;

import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class DriverPortalActivity extends AppCompatActivity {
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        WebView web=new WebView(this);
        WebSettings settings=web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.clearCache(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        setContentView(web);
        web.loadUrl("https://gyungana8-cmd.github.io/HONDA-Zambia/?portal=driver&driver_portal_version=20261121b");
    }
}
