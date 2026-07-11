package com.pumpmonitor.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Log;
import android.webkit.MimeTypeMap;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
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
    private static long downloadId = -1;

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
     *
     * @param owner    GitHub 擁有者（使用者或組織）
     * @param repo     GitHub 專案名稱
     * @param callback 回傳 UpdateInfo
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

                // tag_name 格式：v{versionCode}，例如 "v14" 代表 versionCode=14
                int latestVersion = 0;
                String tag = tagName.startsWith("v") ? tagName.substring(1) : tagName;
                try {
                    latestVersion = Integer.parseInt(tag);
                } catch (NumberFormatException e) {
                    info.error = "版本格式錯誤: " + tagName;
                    callback.onComplete(info);
                    return;
                }

                info.latestVersion = tagName;
                info.releaseNotes = body;
                info.apkUrl = apkUrl;
                info.hasUpdate = latestVersion > currentVersion;

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
            // assets -> [ { name: "app-debug.apk", browser_download_url: "..." } ]
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
     * 下載 APK 並觸發安裝
     * 使用 DownloadManager 下載到外部公開目錄，再啟動安裝 Intent
     */
    public static void downloadAndInstall(Activity activity, String apkUrl) {
        // 先刪除舊的下載檔案
        File apkFile = new File(Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_DOWNLOADS), "pump-monitor-update.apk");
        if (apkFile.exists()) apkFile.delete();

        // 註冊廣播接收器監聽下載完成
        BroadcastReceiver onComplete = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != downloadId) return;
                context.unregisterReceiver(this);

                installApk(activity, apkFile);
            }
        };
        activity.registerReceiver(onComplete, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                Context.RECEIVER_EXPORTED);

        // 開始下載
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
        request.setTitle("水位監控系統更新");
        request.setDescription("下載更新檔中…");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "pump-monitor-update.apk");

        DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        downloadId = dm.enqueue(request);
    }

    /** 安裝 APK */
    private static void installApk(Activity activity, File apkFile) {
        Intent intent = new Intent(Intent.ACTION_VIEW);
        Uri apkUri;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Android 7+ 使用 FileProvider
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