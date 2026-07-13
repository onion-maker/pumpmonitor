package com.pumpmonitor.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * GitHub Releases 為基礎的 App 更新檢查、下載、安裝
 *
 * 使用方式：
 *   AppUpdateHelper.checkForUpdate(activity, owner, repo, callback)
 *   AppUpdateHelper.downloadAndInstall(activity, apkUrl)
 */
public class AppUpdateHelper {

    private static final String TAG = "AppUpdate";

    /** GitHub API 最新 Release 的回傳結果 */
    public static class UpdateInfo {
        public boolean hasUpdate;
        public String latestVersion;   // e.g. "v1.0.1"
        public String apkUrl;          // APK 下載網址
        public String releaseNotes;    // 更新說明
        public String error;           // 錯誤訊息（null = 無錯誤）
    }

    /**
     * 檢查 GitHub Release 是否有新版本
     */
    public static void checkForUpdate(Context context, String owner, String repo,
                                      final OnCheckComplete callback) {
        new Thread(() -> {
            UpdateInfo info = new UpdateInfo();
            try {
                int currentVersion = context.getPackageManager()
                        .getPackageInfo(context.getPackageName(), 0).versionCode;

                URL url = new URL("https://api.github.com/repos/" + owner + "/" + repo + "/releases/latest");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                conn.setRequestProperty("Accept", "application/json");

                if (conn.getResponseCode() != 200) {
                    info.error = "GitHub API 回應異常: " + conn.getResponseCode();
                    callback.onComplete(info);
                    return;
                }

                BufferedReader reader = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();

                JSONObject json = new JSONObject(sb.toString());
                String tagName = json.optString("tag_name", "v0.0.0");
                String body = json.optString("body", "");
                String apkUrl = findApkUrl(json);

                // tag_name 格式：vX.Y.Z (semver)
                String latestTag = tagName.startsWith("v") ? tagName.substring(1) : tagName;
                info.latestVersion = tagName;
                info.releaseNotes = body;
                info.apkUrl = apkUrl;

                // 從 tag 提取 versionCode (YYMMDD 格式的整數) 或比對 versionName
                int latestCode = extractVersionCode(body, latestTag, apkUrl);
                info.hasUpdate = latestCode > currentVersion;

                if (info.hasUpdate && (apkUrl == null || apkUrl.isEmpty())) {
                    info.error = "Release 中找不到 APK 檔案";
                }

            } catch (Exception e) {
                info.error = "檢查更新失敗: " + e.getMessage();
                Log.e(TAG, "checkForUpdate 錯誤", e);
            }
            callback.onComplete(info);
        }).start();
    }

    /** 從 GitHub Release JSON 中找出第一個 APK 的下載網址 */
    private static String findApkUrl(JSONObject releaseJson) {
        try {
            var assets = releaseJson.optJSONArray("assets");
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.getJSONObject(i);
                    String name = asset.optString("name", "");
                    if (name.endsWith(".apk")) {
                        return asset.optString("browser_download_url", null);
                    }
                }
            }
        } catch (Exception ignored) { }
        return null;
    }

    /**
     * 從 release body / tag / APK 檔名中提取 versionCode
     * workflow 會把 versionCode 寫在 release body 第一行：versionCode:YYMMDD
     * 如果找不到，fallback 到 tag 中的純數字部分
     */
    private static int extractVersionCode(String body, String latestTag, String apkUrl) {
        // 1. 從 release body 找 "versionCode:數字"（支援 YYMMDDHHMM 格式）
        if (body != null) {
            java.util.regex.Pattern p = java.util.regex.Pattern.compile("versionCode[\\s:]*?(\\d{8,10})");
            java.util.regex.Matcher m = p.matcher(body);
            if (m.find()) {
                return Integer.parseInt(m.group(1));
            }
        }
        // 2. 從 tag 中找純數字（e.g. v1.4.0 → 取不包含點的最大數字區段當 fallback）
        //    改用 semver 的三節數字轉換: major*10000 + minor*100 + patch
        java.util.regex.Pattern sv = java.util.regex.Pattern.compile("(\\d+)\\.(\\d+)\\.(\\d+)");
        java.util.regex.Matcher sm = sv.matcher(latestTag);
        if (sm.find()) {
            int major = Integer.parseInt(sm.group(1));
            int minor = Integer.parseInt(sm.group(2));
            int patch = Integer.parseInt(sm.group(3));
            return major * 10000 + minor * 100 + patch;
        }
        // 3. 從 APK 檔名找數字
        if (apkUrl != null) {
            java.util.regex.Pattern pf = java.util.regex.Pattern.compile("(\\d{5,6})");
            java.util.regex.Matcher pm = pf.matcher(apkUrl);
            if (pm.find()) {
                return Integer.parseInt(pm.group(1));
            }
        }
        return 0;
    }

    /**
     * 下載 APK 並觸發安裝
     * 直接使用 HTTP 下載到 App cache，不透過 DownloadManager（避免權限問題）
     */
    public static void downloadAndInstall(Activity activity, String apkUrl) {
        new Thread(() -> {
            try {
                // 下載到 App cache 目錄（一定可讀寫）
                File cacheDir = new File(activity.getCacheDir(), "updates");
                cacheDir.mkdirs();
                File apkFile = new File(cacheDir, "pump-monitor-update.apk");
                if (apkFile.exists()) apkFile.delete();

                Log.d(TAG, "開始下載: " + apkUrl);

                // HTTP 下載
                URL url = new URL(apkUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setInstanceFollowRedirects(true);

                BufferedInputStream in = new BufferedInputStream(conn.getInputStream());
                FileOutputStream out = new FileOutputStream(apkFile);

                byte[] buffer = new byte[8192];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    out.write(buffer, 0, count);
                }
                out.flush();
                out.close();
                in.close();

                Log.d(TAG, "下載完成，大小: " + apkFile.length() + " bytes");

                // 下載完成後在 UI 執行緒安裝
                activity.runOnUiThread(() -> installApk(activity, apkFile));

            } catch (Exception e) {
                Log.e(TAG, "下載失敗", e);
            }
        }).start();
    }

    /** 安裝 APK */
    private static void installApk(Activity activity, File apkFile) {
        if (!apkFile.exists() || apkFile.length() == 0) {
            Log.e(TAG, "APK 檔案不存在或為空");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW);
        Uri apkUri;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            apkUri = FileProvider.getUriForFile(activity,
                    activity.getPackageName() + ".fileprovider", apkFile);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            apkUri = Uri.fromFile(apkFile);
        }

        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(intent);
    }

    public interface OnCheckComplete {
        void onComplete(UpdateInfo info);
    }
}