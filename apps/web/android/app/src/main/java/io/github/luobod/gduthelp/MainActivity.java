package io.github.luobod.gduthelp;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 发布包强制关闭 WebView 远程调试（chrome://inspect），仅本地 Debug 构建可调试
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setAllowFileAccessFromFileURLs(false);
            settings.setAllowUniversalAccessFromFileURLs(false);
            settings.setAllowContentAccess(false);
        }
    }
}
