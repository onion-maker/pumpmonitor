package com.pumpmonitor.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

public class PumpMonitorService extends Service {

    private static final String TAG = "PumpMonitor";
    private static final String CHANNEL_SERVICE = "pump_service_channel";
    private static final String CHANNEL_ALARM = "pump_alarm_channel";
    private static final int NOTIFY_SERVICE = 1000;
    private static final int NOTIFY_ALARM = 1001;
    private static final String PREFS_NAME = "pump-monitor-settings";

    private static boolean running = false;

    /** 上次發送的警報訊息（用於去重，避免每輪重複通知） */
    private String lastAlarmMessage = "";

    private Handler handler;
    private final Runnable checkRunnable = new Runnable() {
        @Override
        public void run() {
            doCheck();
            long intervalMs = getIntervalMs(getApplicationContext());
            handler.postDelayed(this, intervalMs);
        }
    };

    private static long getIntervalMs(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int sec = prefs.getInt("backgroundIntervalSec", 120);
        return Math.max(30000, sec * 1000L); // 最少 30 秒
    }

    public static boolean isRunning() {
        return running;
    }

    public static void start(Context context) {
        Intent intent = new Intent(context, PumpMonitorService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        running = false;
        context.stopService(new Intent(context, PumpMonitorService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;
        Notification notification = buildServiceNotification();
        startForeground(NOTIFY_SERVICE, notification);
        handler.removeCallbacks(checkRunnable);
        handler.post(checkRunnable);
        long ms = getIntervalMs(this);
        Log.d(TAG, "前景服務已啟動，每 " + (ms / 1000) + " 秒檢查水位");
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        lastAlarmMessage = "";
        handler.removeCallbacks(checkRunnable);
        Log.d(TAG, "前景服務已停止");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    /** 從前端同步使用者設定到 SharedPreferences（供背景服務使用） */
    public static void syncSettings(Context context, String settingsJson) {
        try {
            JSONObject json = new JSONObject(settingsJson);
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                .putString("stationAlarmLevels", json.optString("stationAlarmLevels", "{}"))
                .putString("selectedStations", json.optString("selectedStations", "[]"))
                .putInt("backgroundIntervalSec", json.optInt("backgroundIntervalSec", 120))
                .apply();
            int sec = json.optInt("backgroundIntervalSec", 120);
            Log.d(TAG, "設定已同步至背景服務（間隔 " + sec + " 秒）");
        } catch (Exception e) {
            Log.e(TAG, "同步設定失敗", e);
        }
    }

    /** 重新載入間隔設定（讓前台變更立即生效） */
    public static void reloadInterval(Context context) {
        // 透過 Intent 重新觸發 onStartCommand，用新的間隔重啟 timer
        Intent intent = new Intent(context, PumpMonitorService.class);
        context.startService(intent);
    }

    private void doCheck() {
        Calendar cal = Calendar.getInstance();
        int minute = cal.get(Calendar.MINUTE);
        boolean isFiveMark = (minute % 5 == 0);
        String timeStr = new SimpleDateFormat("HH:mm:ss", Locale.TAIWAN).format(cal.getTime());
        Log.d(TAG, "檢查 [" + timeStr + "]" + (isFiveMark ? " ★5分鐘" : ""));

        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String levelsJson = prefs.getString("stationAlarmLevels", "{}");
            String selectedJson = prefs.getString("selectedStations", "[]");
            String prevPumpJson = prefs.getString("previousPumpStates", "{}");
            JSONObject alarmLevels = new JSONObject(levelsJson);
            JSONArray selected = new JSONArray(selectedJson);
            JSONObject prevPumpStates = new JSONObject(prevPumpJson);

            String jsonResponse = fetchApi();
            if (jsonResponse == null) return;

            JSONObject root = new JSONObject(jsonResponse);
            JSONArray d = root.getJSONArray("d");

            StringBuilder alarmMsg = new StringBuilder();
            int alarmCount = 0;
            JSONObject newPumpStates = new JSONObject();

            for (int i = 0; i < d.length(); i++) {
                JSONObject station = d.getJSONObject(i);
                String stationNo = station.getString("stationno");
                if (!contains(selected, stationNo)) continue;

                double alarmLevel = 1.0;
                if (alarmLevels.has(stationNo)) alarmLevel = alarmLevels.getDouble(stationNo);

                // 水位檢查
                if (!station.isNull("level_in")) {
                    double levelIn = station.getDouble("level_in");
                    if (levelIn > alarmLevel) {
                        if (alarmCount > 0) alarmMsg.append("\n");
                        alarmMsg.append(stationNo).append(" 水位 ").append(String.format("%.2f", levelIn)).append("m");
                        alarmCount++;
                    }
                }

                // 機組狀態變化檢查
                JSONObject stationPump = new JSONObject();
                JSONObject prevStation = prevPumpStates.optJSONObject(stationNo);
                if (prevStation == null) prevStation = new JSONObject();

                for (int p = 1; p <= 16; p++) {
                    String key = "pumb" + String.format("%02d", p);
                    if (station.isNull(key)) continue;
                    String curr = station.getString(key);
                    stationPump.put(key, curr);
                    String prev = prevStation.optString(key, "");

                    boolean prevWasRunning = prev.equals("1") || prev.equals("2") || prev.equals("3");
                    boolean nowRunning = curr.equals("1") || curr.equals("2") || curr.equals("3");

                    if (prev.equals("0") && nowRunning) {
                        if (alarmCount > 0) alarmMsg.append("\n");
                        alarmMsg.append(stationNo).append(" #").append(p).append(" 抽水機啟動");
                        alarmCount++;
                    } else if (prevWasRunning && curr.equals("0")) {
                        if (alarmCount > 0) alarmMsg.append("\n");
                        alarmMsg.append(stationNo).append(" #").append(p).append(" 抽水機停止");
                        alarmCount++;
                    }
                }
                newPumpStates.put(stationNo, stationPump);
            }

            prefs.edit().putString("previousPumpStates", newPumpStates.toString()).apply();

            if (alarmCount > 0) {
                String msg = alarmMsg.toString();
                // 只有當警報內容有變化時才發通知（避免每輪重複逼聲）
                if (!msg.equals(lastAlarmMessage)) {
                    lastAlarmMessage = msg;
                    sendAlarmNotification(alarmCount + " 個站點觸發警報", msg);
                }
            } else {
                lastAlarmMessage = "";
            }

        } catch (Exception e) {
            Log.e(TAG, "檢查錯誤", e);
        }
    }

    private String fetchApi() {
        try {
            URL url = new URL("https://heovcenter.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            if (conn.getResponseCode() != 200) return null;
            BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            return sb.toString();
        } catch (Exception e) {
            Log.e(TAG, "HTTP 失敗", e);
            return null;
        }
    }

    private boolean contains(JSONArray arr, String value) {
        for (int i = 0; i < arr.length(); i++) {
            try { if (arr.getString(i).equals(value)) return true; } catch (Exception ignored) { }
        }
        return false;
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager mgr = getSystemService(NotificationManager.class);

        // 前景服務通道 — 用 DEFAULT 確保通知欄可見
        NotificationChannel svc = new NotificationChannel(
                CHANNEL_SERVICE, "監控背景服務", NotificationManager.IMPORTANCE_DEFAULT);
        svc.setDescription("水位監控背景執行中");
        svc.setShowBadge(false);
        mgr.createNotificationChannel(svc);

        // 警報通道 — 高優先級 + 可繞過勿擾
        NotificationChannel alarm = new NotificationChannel(
                CHANNEL_ALARM, "水位警報", NotificationManager.IMPORTANCE_HIGH);
        alarm.setDescription("抽水站水位警報");
        alarm.enableVibration(true);
        alarm.setBypassDnd(true);
        mgr.createNotificationChannel(alarm);
    }

    private Notification buildServiceNotification() {
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        long intervalMs = getIntervalMs(this);
        int sec = (int)(intervalMs / 1000);
        String desc = "每 " + sec + " 秒檢查抽水站水位與機組狀態";

        return new NotificationCompat.Builder(this, CHANNEL_SERVICE)
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentTitle("水位監控背景執行中")
                .setContentText(desc)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    private void sendAlarmNotification(String title, String body) {
        NotificationManager mgr = getSystemService(NotificationManager.class);

        // 點擊通知 → 打開 App
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // 全螢幕意圖 — 鎖屏時強制彈出
        PendingIntent fullScreenPi = PendingIntent.getActivity(this, 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ALARM)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setFullScreenIntent(fullScreenPi, true)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();

        mgr.notify(NOTIFY_ALARM, notif);
    }
}