package com.pumpmonitor.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
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
    private static final String CHANNEL_SERVICE = "pump_service_silent";
    private static final String CHANNEL_ALARM = "pump_alarm_popup";
    private static final int NOTIFY_SERVICE = 1000;
    private static final int NOTIFY_ALARM = 1001;
    private static final String PREFS_NAME = "pump-monitor-settings";
    private static final String API_URL = "https://heovcenter.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo";
    private static final String API_URL_BACKUP = "https://heovcenter2.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo";
    private static final int REQUEST_CHECK = 1;
    private static final int REQUEST_HEARTBEAT = 2;

    private static boolean running = false;
    private String lastAlarmMessage = "";

    private static long getIntervalMs(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int sec = prefs.getInt("backgroundIntervalSec", 120);
        return Math.max(30000, sec * 1000L);
    }

    public static boolean isRunning() { return running; }

    public static void start(Context context) {
        Intent intent = new Intent(context, PumpMonitorService.class);
        intent.setAction("com.pumpmonitor.START");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        running = false;
        cancelAlarms(context);
        context.stopService(new Intent(context, PumpMonitorService.class));
    }

    /** 重新載入間隔設定（讓前台變更立即生效） */
    public static void reloadInterval(Context context) {
        Intent intent = new Intent(context, PumpMonitorService.class);
        intent.setAction("com.pumpmonitor.CHECK");
        context.startService(intent);
    }

    /** 從前端同步使用者設定 */
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

    private static void cancelAlarms(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(context, PumpMonitorService.class);
        intent.setAction("com.pumpmonitor.CHECK");
        am.cancel(PendingIntent.getService(context, REQUEST_CHECK, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        intent.setAction("com.pumpmonitor.HEARTBEAT");
        am.cancel(PendingIntent.getService(context, REQUEST_HEARTBEAT, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }

    /** 排程下一次定時檢查（AlarmManager 取代 Handler，可在 Doze 模式喚醒） */
    private static void scheduleNextCheck(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long intervalMs = getIntervalMs(context);
        Intent intent = new Intent(context, PumpMonitorService.class);
        intent.setAction("com.pumpmonitor.CHECK");
        PendingIntent pi = PendingIntent.getService(context, REQUEST_CHECK, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + intervalMs, pi);
        Log.d(TAG, "下次檢查: " + (intervalMs / 1000) + " 秒後");
    }

    /** 每 5 分鐘心跳備援 */
    private static void scheduleHeartbeat(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(context, PumpMonitorService.class);
        intent.setAction("com.pumpmonitor.HEARTBEAT");
        PendingIntent pi = PendingIntent.getService(context, REQUEST_HEARTBEAT, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 5 * 60 * 1000L, pi);
        Log.d(TAG, "心跳排程: 5 分鐘後");
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;

        // 先 startForeground（必須，否則系統會殺服務）
        Notification notification = buildServiceNotification();
        startForeground(NOTIFY_SERVICE, notification);

        String action = intent != null ? intent.getAction() : "";

        if (action.equals("com.pumpmonitor.CHECK")) {
            // 定時檢查或 reload → 執行檢查 → 排程下一次
            doCheck();
            scheduleNextCheck(this);
        } else if (action.equals("com.pumpmonitor.HEARTBEAT")) {
            // 心跳 → 執行檢查 → 再排程心跳
            doCheck();
            scheduleHeartbeat(this);
        } else {
            // 首次啟動 → 立即檢查 + 排程兩者
            doCheck();
            scheduleNextCheck(this);
            scheduleHeartbeat(this);
        }

        Log.d(TAG, "服務啟動（action=" + action + "）");
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        lastAlarmMessage = "";
        cancelAlarms(this);
        Log.d(TAG, "服務已停止");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ═══════════ 以下是檢查邏輯 ═══════════

    private void doCheck() {
        Calendar cal = Calendar.getInstance();
        String timeStr = new SimpleDateFormat("HH:mm:ss", Locale.TAIWAN).format(cal.getTime());
        Log.d(TAG, "檢查 [" + timeStr + "]");

        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String levelsJson = prefs.getString("stationAlarmLevels", "{}");
            String selectedJson = prefs.getString("selectedStations", "[]");
            String prevPumpJson = prefs.getString("previousPumpStates", "{}");
            JSONObject alarmLevels = new JSONObject(levelsJson);
            JSONArray selected = new JSONArray(selectedJson);
            JSONObject prevPumpStates = new JSONObject(prevPumpJson);

            JSONArray primary = fetchApiAsArray(API_URL);
            JSONArray backup = fetchApiAsArray(API_URL_BACKUP);

            if (primary == null && backup == null) {
                Log.e(TAG, "兩個 API 都無法連線");
                return;
            }

            JSONObject merged = new JSONObject();
            mergeArray(merged, primary);
            mergeArray(merged, backup);

            StringBuilder alarmMsg = new StringBuilder();
            int alarmCount = 0;
            JSONObject newPumpStates = new JSONObject();

            for (int i = 0; i < merged.length(); i++) {
                String stationNo = merged.names().getString(i);
                JSONObject station = merged.getJSONObject(stationNo);
                if (!contains(selected, stationNo)) continue;

                double alarmLevel = 1.0;
                if (alarmLevels.has(stationNo)) alarmLevel = alarmLevels.getDouble(stationNo);

                if (!station.isNull("level_in")) {
                    double levelIn = station.getDouble("level_in");
                    if (levelIn > alarmLevel) {
                        if (alarmCount > 0) alarmMsg.append("\n");
                        alarmMsg.append(stationNo).append(" 水位 ").append(String.format("%.2f", levelIn)).append("m");
                        alarmCount++;
                    }
                }

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

    private JSONArray fetchApiAsArray(String urlStr) {
        try {
            URL url = new URL(urlStr);
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
            JSONObject root = new JSONObject(sb.toString());
            return root.optJSONArray("d");
        } catch (Exception e) {
            Log.e(TAG, "HTTP 失敗: " + urlStr, e);
            return null;
        }
    }

    private void mergeArray(JSONObject merged, JSONArray arr) {
        if (arr == null) return;
        for (int i = 0; i < arr.length(); i++) {
            try {
                JSONObject station = arr.getJSONObject(i);
                String no = station.optString("stationno", "");
                if (no.isEmpty()) continue;
                JSONObject existing = merged.optJSONObject(no);
                if (existing == null) {
                    merged.put(no, station);
                } else {
                    String newTime = station.optString("rectime", "0");
                    String oldTime = existing.optString("rectime", "0");
                    if (newTime.compareTo(oldTime) > 0) merged.put(no, station);
                }
            } catch (Exception ignored) { }
        }
    }

    private boolean contains(JSONArray arr, String value) {
        for (int i = 0; i < arr.length(); i++) {
            try { if (arr.getString(i).equals(value)) return true; } catch (Exception ignored) { }
        }
        return false;
    }

    // ═══════════ 以下是通知 ═══════════

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager mgr = getSystemService(NotificationManager.class);

        NotificationChannel svc = new NotificationChannel(
                CHANNEL_SERVICE, "監控背景服務", NotificationManager.IMPORTANCE_DEFAULT);
        svc.setDescription("水位監控背景執行中");
        svc.setShowBadge(false);
        svc.setSound(null, null);
        svc.enableVibration(false);
        mgr.createNotificationChannel(svc);

        // 警報通道 — 高優先級會彈出視窗，可鎖屏顯示，無系統音
        NotificationChannel alarm = new NotificationChannel(
                CHANNEL_ALARM, "水位警報", NotificationManager.IMPORTANCE_HIGH);
        alarm.setDescription("抽水站水位警報");
        alarm.enableVibration(false);
        alarm.setSound(null, null);
        alarm.setBypassDnd(true);
        alarm.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        mgr.createNotificationChannel(alarm);
    }

    private Notification buildServiceNotification() {
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long intervalMs = getIntervalMs(this);
        int sec = (int)(intervalMs / 1000);
        return new NotificationCompat.Builder(this, CHANNEL_SERVICE)
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentTitle("水位監控背景執行中")
                .setContentText("每 " + sec + " 秒檢查抽水站水位與機組狀態")
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    private void sendAlarmNotification(String title, String body) {
        NotificationManager mgr = getSystemService(NotificationManager.class);
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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