package com.pumpmonitor.app;

import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.util.Log;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.cert.X509Certificate;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.util.concurrent.Executor;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "PumpMonitor";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        runOnUiThread(() -> {
            try {
                webView = getBridge().getWebView();
                if (webView != null) {
                    webView.getSettings().setJavaScriptEnabled(true);
                    webView.addJavascriptInterface(new HttpBridge(), "AndroidHttp");
                    webView.addJavascriptInterface(new BiometricBridge(), "AndroidBiometric");
                    webView.addJavascriptInterface(new PumpBridge(), "AndroidPump");
                    Log.d(TAG, "原生橋接已註冊");
                }
            } catch (Exception e) {
                Log.e(TAG, "註冊橋接失敗", e);
            }
        });
    }

    @Override
    public void onDestroy() {
        // 不在此停止 Service，讓背景服務獨立持續運作
        // 使用者登出時從前端呼叫 stopBackgroundService() 才會停止
        super.onDestroy();
    }

    // ═══════════════════════════════════════════
    //  原生 HTTP 橋接
    // ═══════════════════════════════════════════

    private class HttpBridge {

        // 靜態初始化：信任所有憑證（政府伺服器 schannel 撤銷檢查問題）
        private static final TrustManager[] TRUST_ALL = new TrustManager[]{
            new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                public void checkServerTrusted(X509Certificate[] certs, String authType) {}
            }
        };

        private static HttpsURLConnection setupSSL(URL url) throws Exception {
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, TRUST_ALL, new java.security.SecureRandom());
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            conn.setSSLSocketFactory(sc.getSocketFactory());
            conn.setHostnameVerifier((hostname, session) -> true);
            return conn;
        }

        @JavascriptInterface
        public String fetch(String urlString) {
            Log.d(TAG, "AndroidHttp.fetch: " + urlString);
            try {
                URL url = new URL(urlString);
                HttpURLConnection conn;
                if (urlString.startsWith("https://")) {
                    conn = setupSSL(url);
                } else {
                    conn = (HttpURLConnection) url.openConnection();
                }
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setRequestProperty("Accept", "application/json");

                int code = conn.getResponseCode();
                Log.d(TAG, "HTTP 狀態碼: " + code);
                if (code != 200) return null;

                BufferedReader reader = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                return sb.toString();
            } catch (Exception e) {
                Log.e(TAG, "HTTP 請求失敗", e);
                return null;
            }
        }

        /** POST JSON 版本（用於 GetAutoPumpWaterMins 潮汐 API） */
        @JavascriptInterface
        public String fetchPost(String urlString, String jsonBody) {
            Log.d(TAG, "AndroidHttp.fetchPost: " + urlString);
            try {
                URL url = new URL(urlString);
                HttpsURLConnection conn = setupSSL(url);
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "application/json");
                conn.setDoOutput(true);

                OutputStream os = conn.getOutputStream();
                os.write(jsonBody.getBytes("UTF-8"));
                os.flush();
                os.close();

                int code = conn.getResponseCode();
                Log.d(TAG, "HTTP POST 狀態碼: " + code);
                if (code != 200) return null;

                BufferedReader reader = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                return sb.toString();
            } catch (Exception e) {
                Log.e(TAG, "HTTP POST 請求失敗", e);
                return null;
            }
        }
    }

    // ═══════════════════════════════════════════
    //  生物辨識橋接
    // ═══════════════════════════════════════════

    private class BiometricBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            BiometricManager manager = BiometricManager.from(MainActivity.this);
            int result = manager.canAuthenticate(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG
                            | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
            return result == BiometricManager.BIOMETRIC_SUCCESS;
        }

        @JavascriptInterface
        public void authenticate() {
            runOnUiThread(() -> {
                Executor executor = ContextCompat.getMainExecutor(MainActivity.this);

                BiometricPrompt prompt = new BiometricPrompt(MainActivity.this, executor,
                        new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(
                                    BiometricPrompt.AuthenticationResult result) {
                                Log.d(TAG, "生物辨識成功");
                                callJs("window.__biometricResult__ && window.__biometricResult__('success')");
                            }

                            @Override
                            public void onAuthenticationError(int errorCode, CharSequence errString) {
                                Log.d(TAG, "生物辨識錯誤: " + errString);
                                if (errorCode != BiometricPrompt.ERROR_CANCELED) {
                                    callJs("window.__biometricResult__ && window.__biometricResult__('error')");
                                }
                            }

                            @Override
                            public void onAuthenticationFailed() {
                                Log.d(TAG, "生物辨識失敗");
                                callJs("window.__biometricResult__ && window.__biometricResult__('failed')");
                            }
                        });

                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle("水位監控系統")
                        .setSubtitle("請驗證您的身分以快速登入")
                        .setAllowedAuthenticators(
                                BiometricManager.Authenticators.BIOMETRIC_STRONG
                                        | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                        .build();

                prompt.authenticate(info);
            });
        }

        private void callJs(final String js) {
            MainActivity.this.callJs(js);
        }
    }

    // ═══════════════════════════════════════════
    //  背景服務橋接
    // ═══════════════════════════════════════════

    private class PumpBridge {
        @JavascriptInterface
        public void startService() {
            runOnUiThread(() -> {
                requestNotificationPermissionIfNeeded();
                PumpMonitorService.start(getApplicationContext());
            });
        }

        @JavascriptInterface
        public void stopService() {
            PumpMonitorService.stop(getApplicationContext());
        }

        @JavascriptInterface
        public boolean isServiceRunning() {
            return PumpMonitorService.isRunning();
        }

        @JavascriptInterface
        public void syncSettings(String json) {
            PumpMonitorService.syncSettings(getApplicationContext(), json);
            // 設定變更後重建通知（更新顯示的間隔秒數）
            PumpMonitorService.reloadInterval(getApplicationContext());
        }

        /** 停止背景警報音（前端警報確認時呼叫） */
        @JavascriptInterface
        public void dismissAlarm() {
            PumpMonitorService.dismissAlarm(getApplicationContext());
        }

        // ── App 更新 ──

        /** 檢查 GitHub Release 是否有新版本（非同步，結果透過 callback JS 回傳） */
        @JavascriptInterface
        public void checkUpdate(final String owner, final String repo) {
            AppUpdateHelper.checkForUpdate(MainActivity.this, owner, repo, info -> {
                String json;
                try {
                    JSONObject obj = new JSONObject();
                    obj.put("hasUpdate", info.hasUpdate);
                    obj.put("latestVersion", info.latestVersion != null ? info.latestVersion : "");
                    obj.put("apkUrl", info.apkUrl != null ? info.apkUrl : "");
                    obj.put("releaseNotes", info.releaseNotes != null ? info.releaseNotes : "");
                    obj.put("error", info.error != null ? info.error : "");
                    json = obj.toString();
                } catch (Exception e) {
                    json = "{\"hasUpdate\":false,\"error\":\"序列化失敗\"}";
                }
                MainActivity.this.callJs("window.__updateCallback__ && window.__updateCallback__(" + JSONObject.quote(json) + ")");
            });
        }

        /** 下載 APK 並啟動安裝 */
        @JavascriptInterface
        public void downloadAndInstall(final String apkUrl) {
            runOnUiThread(() -> AppUpdateHelper.downloadAndInstall(MainActivity.this, apkUrl));
        }

        /** 取得目前 App 的 versionCode */
        @JavascriptInterface
        public int getAppVersionCode() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            } catch (PackageManager.NameNotFoundException e) {
                return 0;
            }
        }

        /** 取得目前 App 的 versionName */
        @JavascriptInterface
        public String getAppVersionName() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (PackageManager.NameNotFoundException e) {
                return "0.0.0";
            }
        }
    }

    /** Android 13+ 通知權限請求 */
    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                == android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        requestPermissions(
                new String[]{ android.Manifest.permission.POST_NOTIFICATIONS },
                9001);
        Log.d(TAG, "已請求通知權限");
    }

    /** 在 WebView 中執行 JavaScript（供各 Bridge 呼叫） */
    private void callJs(final String js) {
        if (webView != null) {
            runOnUiThread(() -> webView.evaluateJavascript(js, null));
        }
    }
}