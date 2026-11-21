package com.yangu.twendedriver;

import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class DriverPortalActivity extends AppCompatActivity {
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        WebView web=new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        setContentView(web);
        web.loadUrl("https://gyungana8-cmd.github.io/HONDA-Zambia/");
    }
}
