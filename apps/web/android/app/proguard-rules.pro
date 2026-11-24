# Capacitor 8 & 插件 R8 混淆保活规则
-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
}
-keep class * extends com.getcapacitor.BridgeActivity { *; }
-keep class io.github.luobod.gduthelp.** { *; }

# 官方及第三方 Capacitor 插件（本地通知、定位、应用内浏览器、自托管热更新）
-keep class com.capacitorjs.plugins.** { *; }
-keep class ee.forgr.capacitor_updater.** { *; }
-keep class ee.forgr.capacitor_inappbrowser.** { *; }
-keep class com.google.gson.** { *; }
-keep class org.json.** { *; }

# WebView JS Bridge 接口保活
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# 隐藏源码文件名与行号细节，同时移除调试日志
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
}
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.bouncycastle.**
-dontwarn javax.annotation.**
