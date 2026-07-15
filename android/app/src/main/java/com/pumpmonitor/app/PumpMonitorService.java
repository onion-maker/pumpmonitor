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
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
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
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class PumpMonitorService extends Service {

    private static final String TAG = "PumpMonitor";
    private static final String CHANNEL_SERVICE = "pump_service_silent";
    private static final String CHANNEL_ALARM = "pump_alarm_popup";
    private static final int NOTIFY_SERVICE = 1000;
    private static final int NOTIFY_ALARM = 1001;
    private static final String PREFS_NAME = "pump-monitor-settings";
    private static final String API_URL = "https://heovcenter.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo";
    private static final String API_URL_BACKUP = "https://heovcenter2.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo";
    private static final String TIDE_API_URL = "https://heovcenter.gov.taipei/cia/WebLayout/GetAutoPumpWaterMins";
    private static final String TIDE_API_URL_BACKUP = "https://heovcenter2.gov.taipei/cia/WebLayout/GetAutoPumpWaterMins";
    private static final int REQUEST_CHECK = 1;
    private static final int REQUEST_HEARTBEAT = 2;
    private static final int REQUEST_UPDATE_CHECK = 3;
    private static final String[] TIDE_STATIONS = {"108", "110", "112"};

    /** 各潮汐站監控的閘門清單（對應 shinshun door_cols） */
    private static final Map<String, String[]> TIDE_DOOR_COLS = new HashMap<String, String[]>() {{
        put("112", new String[]{"door02", "door03", "door04", "door05"});
        put("110", new String[]{"door01", "door02", "door03", "door04"});
        put("108", new String[]{"door01", "door02", "door03"});
    }};

    private static boolean running = false;

    private String lastAlarmMessage = "";
    private long alarmDismissedMs = 0;  // 使用者最後一次按確認的時間戳
    private static final long ALARM_COOLDOWN_MS = 10 * 60 * 1000;  // 冷卻 10 分鐘
    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;

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
        intent.setAction("com.pumpmonitor.RELOAD");
        context.startService(intent);
    }

    /** 停止背景警報音（前端警報確認時呼叫） */
    public static void dismissAlarm(Context context) {
        Intent intent = new Intent(context, PumpMonitorService.class);
        intent.setAction("com.pumpmonitor.DISMISS_ALARM");
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
                .putString("stationGateAlarmSwitches", json.optString("stationGateAlarmSwitches", "{}"))
                .putString("stationTideAlarmSwitches", json.optString("stationTideAlarmSwitches", "{}"))
                .putBoolean("monitoringEnabled", json.optBoolean("monitoringEnabled", true))
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
        Intent intent = new Intent(context, PumpAlarmReceiver.class);
        intent.setAction("com.pumpmonitor.CHECK");
        am.cancel(PendingIntent.getBroadcast(context, REQUEST_CHECK, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        intent.setAction("com.pumpmonitor.HEARTBEAT");
        am.cancel(PendingIntent.getBroadcast(context, REQUEST_HEARTBEAT, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        intent.setAction("com.pumpmonitor.UPDATE_CHECK");
        am.cancel(PendingIntent.getBroadcast(context, REQUEST_UPDATE_CHECK, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }

    /** 排程定時檢查（BroadcastReceiver + RTC_WAKEUP，HyperOS 相容性最佳） */
    private static void scheduleNextCheck(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long intervalMs = getIntervalMs(context);

        Intent intent = new Intent(context, PumpAlarmReceiver.class);
        intent.setAction("com.pumpmonitor.CHECK");
        PendingIntent pi = PendingIntent.getBroadcast(context, REQUEST_CHECK, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        long triggerTime = System.currentTimeMillis() + intervalMs;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Intent showIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            PendingIntent showPi = PendingIntent.getActivity(context, 0, showIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            AlarmManager.AlarmClockInfo alarmInfo =
                    new AlarmManager.AlarmClockInfo(triggerTime, showPi);
            am.setAlarmClock(alarmInfo, pi);
        } else {
            am.set(AlarmManager.RTC_WAKEUP, triggerTime, pi);
        }
        Log.d(TAG, "排程檢查: " + (intervalMs / 1000) + " 秒後");
    }

    /** 每 5 分鐘心跳備援 */
    private static void scheduleHeartbeat(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(context, PumpAlarmReceiver.class);
        intent.setAction("com.pumpmonitor.HEARTBEAT");
        PendingIntent pi = PendingIntent.getBroadcast(context, REQUEST_HEARTBEAT, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.set(AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 5 * 60 * 1000L, pi);
    }

    /** 每 24 小時排程一次 GitHub 版本檢查（僅檢查不自動下載） */
    private static void scheduleUpdateCheck(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        long lastCheck = prefs.getLong("lastUpdateCheckMs", 0);
        long now = System.currentTimeMillis();
        // 若上次檢查在 20 小時內則跳過（避免重複排程）
        if (now - lastCheck < 20 * 60 * 60 * 1000L) return;

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(context, PumpAlarmReceiver.class);
        intent.setAction("com.pumpmonitor.UPDATE_CHECK");
        PendingIntent pi = PendingIntent.getBroadcast(context, REQUEST_UPDATE_CHECK, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // 首次啟動先等 60 秒再檢查（避免剛開 app 就發請求），之後每 24 小時
        long delay = lastCheck == 0 ? 60 * 1000L : 24 * 60 * 60 * 1000L;
        am.set(AlarmManager.RTC_WAKEUP, now + delay, pi);
        Log.d(TAG, "排程更新檢查: " + (delay / 1000) + " 秒後");
    }

    /** 執行 GitHub Release 版本檢查，有新版本時推通知 */
    private void doUpdateCheck() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putLong("lastUpdateCheckMs", System.currentTimeMillis()).apply();

        AppUpdateHelper.checkForUpdate(this, "onion-maker", "pumpmonitor", info -> {
            if (info.hasUpdate) {
                Log.d(TAG, "發現新版本: " + info.latestVersion);
                showUpdateNotification(info.latestVersion, info.releaseNotes, info.apkUrl);
            } else {
                Log.d(TAG, "已是最新版本" + (info.error != null ? " (" + info.error + ")" : ""));
            }
        });
    }

    /** 顯示更新通知 */
    private void showUpdateNotification(String version, String releaseNotes, String apkUrl) {
        NotificationManager mgr = getSystemService(NotificationManager.class);
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // 下載按鈕：用瀏覽器開啟 APK 下載網址
        PendingIntent downloadPi = null;
        if (apkUrl != null && !apkUrl.isEmpty()) {
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            downloadPi = PendingIntent.getActivity(this, 4, browserIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        String bodyText = "版本 " + version + " 已發布" +
                (releaseNotes != null && !releaseNotes.isEmpty() ? "\n" + releaseNotes : "");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ALARM)
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentTitle("📦 有新版本可用")
                .setContentText("版本 " + version + " 已發布，點擊下載更新")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(bodyText))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi);
        if (downloadPi != null) {
            builder.addAction(android.R.drawable.ic_menu_directions, "📥 下載更新", downloadPi);
        }
        mgr.notify(999, builder.build());
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
        // 取得 WakeLock 確保警報音在螢幕關閉時也能播放
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PumpMonitor:AlarmWakeLock");
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;

        // 先 startForeground（必須，否則系統會殺服務）
        Notification notification = buildServiceNotification();
        startForeground(NOTIFY_SERVICE, notification);

        String action = intent != null ? intent.getAction() : "";

        if (action.equals("com.pumpmonitor.CHECK")) {
            // 定時檢查觸發（setAlarmClock 是單次鬧鐘，檢查完重新排程）
            new Thread(this::doCheck).start();
            scheduleNextCheck(this);
        } else if (action.equals("com.pumpmonitor.RELOAD")) {
            // 間隔變更 → 取消舊排程 + 重設新排程 + 立即檢查
            cancelAlarms(this);
            new Thread(this::doCheck).start();
            scheduleNextCheck(this);
            scheduleHeartbeat(this);
        } else if (action.equals("com.pumpmonitor.HEARTBEAT")) {
            // 心跳 → 執行檢查 → 再排程心跳
            new Thread(this::doCheck).start();
            scheduleHeartbeat(this);
        } else if (action.equals("com.pumpmonitor.DISMISS_ALARM")) {
            // 前端警報確認 → 停止背景警報音 + 進入冷卻（避免下輪檢查又重響）
            stopAlarmSound();
            alarmDismissedMs = System.currentTimeMillis();
        } else if (action.equals("com.pumpmonitor.UPDATE_CHECK")) {
            // 定時更新檢查
            doUpdateCheck();
        } else {
            // 首次啟動 → 立即檢查 + 排程三者
            new Thread(this::doCheck).start();
            scheduleNextCheck(this);
            scheduleHeartbeat(this);
            scheduleUpdateCheck(this);
        }

        Log.d(TAG, "服務啟動（action=" + action + "）");
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        lastAlarmMessage = "";
        stopAlarmSound();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
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
            String gateSwitchesJson = prefs.getString("stationGateAlarmSwitches", "{}");
            String tideSwitchesJson = prefs.getString("stationTideAlarmSwitches", "{}");
            JSONObject alarmLevels = new JSONObject(levelsJson);
            JSONArray selected = new JSONArray(selectedJson);
            JSONObject prevPumpStates = new JSONObject(prevPumpJson);
            JSONObject gateAlarmSwitches = new JSONObject(gateSwitchesJson);
            JSONObject tideAlarmSwitches = new JSONObject(tideSwitchesJson);

            JSONArray primary = fetchApiAsArray(API_URL);
            JSONArray backup = fetchApiAsArray(API_URL_BACKUP);

            if (primary == null && backup == null) {
                Log.e(TAG, "兩個 API 都無法連線");
                return;
            }

            JSONObject merged = new JSONObject();
            mergeArray(merged, primary);
            mergeArray(merged, backup);

            // ── 讀取潮向歷史 ──
            String tideDirJson = prefs.getString("tideDirections", "{}");
            JSONObject prevTideDir = new JSONObject(tideDirJson);
            JSONObject newTideDir = new JSONObject();

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

                // ── 閘門警報檢查 ──
                if (gateAlarmSwitches.has(stationNo) && !station.isNull("level_in") && !station.isNull("level_out")) {
                    JSONObject gs = gateAlarmSwitches.getJSONObject(stationNo);
                    double levelIn = station.getDouble("level_in");
                    double levelOut = station.getDouble("level_out");

                    boolean innerHighAlarm = gs.optBoolean("innerHighAlarm", false);

                    boolean allClosed = false;
                    boolean anyNotClosed = false;
                    int doorCount = 0;
                    for (int d = 1; d <= 16; d++) {
                        String doorKey = "door" + String.format("%02d", d);
                        if (!station.isNull(doorKey)) {
                            doorCount++;
                            String dv = station.getString(doorKey);
                            if (!dv.equals("1")) anyNotClosed = true;
                        }
                    }
                    allClosed = doorCount > 0 && !anyNotClosed;

                    if (innerHighAlarm && levelIn > levelOut && allClosed) {
                        if (alarmCount > 0) alarmMsg.append("\n");
                        alarmMsg.append(stationNo).append(" 內高外低閘門全閉");
                        alarmCount++;
                    }
                }

                newPumpStates.put(stationNo, stationPump);
            }

            // ── 儲存 pump states ──
            prefs.edit()
                .putString("previousPumpStates", newPumpStates.toString())
                .apply();

            // ── 潮汐方向判斷（新生 112 決定，建國 110 共用；中山 108 獨立） ──
            JSONObject tideRecords = fetchTideRecords();
            if (tideRecords != null) {
                // 先決定潮汐方向
                String xinshengTide = detectTide(tideRecords.optJSONArray("112"), prevTideDir.optString("112", "slack"));
                newTideDir.put("112", xinshengTide);
                newTideDir.put("110", xinshengTide);
                newTideDir.put("108", detectTide(tideRecords.optJSONArray("108"), prevTideDir.optString("108", "slack")));

                // 閘門啟閉警報（各站用自己的水位 & 閘門）
                for (String stationNo : TIDE_STATIONS) {
                    if (!contains(selected, stationNo)) continue;
                    if (!tideAlarmSwitches.has(stationNo)) continue;
                    JSONObject ts = tideAlarmSwitches.optJSONObject(stationNo);
                    if (ts == null || !ts.optBoolean("tideAlarm", false)) continue;

                    JSONArray records = tideRecords.optJSONArray(stationNo);
                    if (records == null || records.length() < 3) continue;

                    String dir = newTideDir.optString(stationNo, prevTideDir.optString(stationNo, "slack"));

                    int rlen = records.length();
                    JSONObject newest = records.getJSONObject(rlen - 1);
                    JSONObject prev  = records.getJSONObject(rlen - 2);
                    JSONObject prev2 = records.getJSONObject(rlen - 3);

                    double ni_lo = newest.optDouble("level_out", 0);
                    double ni_li = newest.optDouble("level_in", 0);
                    double pi_lo = prev.optDouble("level_out", 0);
                    double pi_li = prev.optDouble("level_in", 0);
                    double pi2_lo = prev2.optDouble("level_out", 0);

                    String[] doorCols = TIDE_DOOR_COLS.get(stationNo);

                    if (dir.equals("falling")) {
                        if (ni_lo < ni_li && pi_lo >= pi_li && doorCols != null) {
                            boolean allClosed = true;
                            for (String d : doorCols) {
                                if (!newest.optString(d, "").equals("1")) { allClosed = false; break; }
                            }
                            if (allClosed) {
                                if (alarmCount > 0) alarmMsg.append("\n");
                                alarmMsg.append(stationNo).append(" 退潮請開閘門");
                                alarmCount++;
                            }
                        }
                    } else if (dir.equals("rising")) {
                        boolean cond1 = (pi2_lo == pi_lo && pi_lo == ni_lo);
                        boolean cond2 = (pi2_lo == pi_lo && ni_lo > pi_lo);
                        if ((cond1 || cond2) && doorCols != null) {
                            boolean anyOpen = false;
                            for (String d : doorCols) {
                                if (newest.optString(d, "").equals("2")) { anyOpen = true; break; }
                            }
                            if (anyOpen) {
                                if (alarmCount > 0) alarmMsg.append("\n");
                                alarmMsg.append(stationNo).append(" 漲潮請關閘門");
                                alarmCount++;
                            }
                        }
                    }
                }

                prefs.edit().putString("tideDirections", newTideDir.toString()).apply();
            }

            // ── 監控暫停：清空警報、停止音效、不觸發任何通知 ──
            boolean monitoringEnabled = prefs.getBoolean("monitoringEnabled", true);
            if (!monitoringEnabled) {
                lastAlarmMessage = "";
                alarmDismissedMs = 0;
                stopAlarmSound();
                alarmCount = 0;
            }

            if (alarmCount > 0) {
                String msg = alarmMsg.toString();
                boolean sameAlarm = msg.equals(lastAlarmMessage);

                if (!sameAlarm) {
                    // 警報訊息變了 → 退出冷卻（代表條件有變化）
                    alarmDismissedMs = 0;
                    lastAlarmMessage = msg;
                    sendAlarmNotification(alarmCount + " 個站點觸發警報", msg);
                } else {
                    // 同一條警報：冷卻期內只更新通知（不響音），冷卻期外才恢復響音
                    boolean inCooldown = (System.currentTimeMillis() - alarmDismissedMs) < ALARM_COOLDOWN_MS;
                    if (inCooldown) {
                        // 只更新通知，不響音
                        sendSilentNotification(alarmCount + " 個站點觸發警報", msg);
                    } else {
                        // 冷卻結束，恢復正常警報
                        sendAlarmNotification(alarmCount + " 個站點觸發警報", msg);
                    }
                }
            } else {
                lastAlarmMessage = "";
                alarmDismissedMs = 0;
                stopAlarmSound();
            }

        } catch (Exception e) {
            Log.e(TAG, "檢查錯誤", e);
        }
    }

    // ═══════════ HTTP 工具 ═══════════

    // 靜態信任所有憑證（政府伺服器 schannel 撤銷檢查問題）
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

    private JSONArray fetchApiAsArray(String urlStr) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn;
            if (urlStr.startsWith("https://")) {
                conn = setupSSL(url);
            } else {
                conn = (HttpURLConnection) url.openConnection();
            }
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

    /** POST JSON 到潮汐 API，合併雙 API 取 rectime 最新 */
    private JSONArray fetchTideApi(String apiUrl, String body) {
        try {
            URL url = new URL(apiUrl);
            HttpsURLConnection conn = setupSSL(url);
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setDoOutput(true);

            OutputStream os = conn.getOutputStream();
            os.write(body.getBytes("UTF-8"));
            os.flush();
            os.close();

            if (conn.getResponseCode() != 200) return null;
            BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            JSONObject root = new JSONObject(sb.toString());
            return root.optJSONArray("d");
        } catch (Exception e) {
            Log.e(TAG, "潮汐 API 失敗: " + apiUrl, e);
            return null;
        }
    }

    /** 取得三個潮汐站的歷史水位紀錄（雙 API 合併） */
    private JSONObject fetchTideRecords() {
        try {
            Calendar cal = Calendar.getInstance();
            cal.add(Calendar.HOUR_OF_DAY, 1);
            String sEnd = new SimpleDateFormat("yyyy/MM/dd HH:mm:ss", Locale.TAIWAN).format(cal.getTime());
            cal.add(Calendar.HOUR_OF_DAY, -2);
            String sBgn = new SimpleDateFormat("yyyy/MM/dd HH:mm:ss", Locale.TAIWAN).format(cal.getTime());

            JSONObject body = new JSONObject();
            body.put("sBgnDate", sBgn);
            body.put("sEndDate", sEnd);
            String bodyStr = body.toString();

            JSONObject out = new JSONObject();

            for (String no : TIDE_STATIONS) {
                JSONObject bodyWithStation = new JSONObject();
                bodyWithStation.put("sBgnDate", sBgn);
                bodyWithStation.put("sEndDate", sEnd);
                bodyWithStation.put("stationno", no);
                String bs = bodyWithStation.toString();

                JSONArray primary = fetchTideApi(TIDE_API_URL, bs);
                JSONArray backup = fetchTideApi(TIDE_API_URL_BACKUP, bs);

                // 合併雙 API，取 rectime 較新
                Map<String, JSONObject> map = new HashMap<>();
                if (primary != null) {
                    for (int j = 0; j < primary.length(); j++) {
                        JSONObject r = primary.getJSONObject(j);
                        String rectime = r.optString("rectime", "");
                        JSONObject existing = map.get(rectime);
                        if (existing == null || rectime.compareTo(existing.optString("rectime", "")) > 0) {
                            map.put(rectime, r);
                        }
                    }
                }
                if (backup != null) {
                    for (int j = 0; j < backup.length(); j++) {
                        JSONObject r = backup.getJSONObject(j);
                        String rectime = r.optString("rectime", "");
                        JSONObject existing = map.get(rectime);
                        if (existing == null || rectime.compareTo(existing.optString("rectime", "")) > 0) {
                            map.put(rectime, r);
                        }
                    }
                }

                JSONArray merged = new JSONArray();
                // 依 rectime 排序（TreeMap 或手動排）
                Object[] keys = map.keySet().toArray();
                java.util.Arrays.sort(keys);
                for (Object k : keys) {
                    merged.put(map.get((String)k));
                }
                if (merged.length() > 0) {
                    out.put(no, merged);
                }
            }

            return out;
        } catch (Exception e) {
            Log.e(TAG, "潮汐 fetch 失敗", e);
            return null;
        }
    }

    /** 5 筆 pairwise 多數決潮汐判斷，不足 2 筆回傳 prevDir */
    private String detectTide(JSONArray records, String prevDir) {
        if (records == null || records.length() < 2) return prevDir;
        int rlen = records.length();
        int start = Math.max(0, rlen - 5);
        int inc = 0, dec = 0;
        Double prevVal = null;
        for (int j = start; j < rlen; j++) {
            try {
                JSONObject rec = records.getJSONObject(j);
                if (rec.isNull("level_out")) continue;
                double val = rec.getDouble("level_out");
                if (prevVal != null) {
                    if (val > prevVal) inc++;
                    else if (val < prevVal) dec++;
                }
                prevVal = val;
            } catch (Exception ignored) { }
        }
        if (dec > inc) return "falling";
        if (inc > dec) return "rising";
        return prevDir;
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

    private boolean arrayContains(String[] arr, String value) {
        for (String s : arr) {
            if (s.equals(value)) return true;
        }
        return false;
    }

    // ═══════════ 以下是通知 ═══════════

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager mgr = getSystemService(NotificationManager.class);

        NotificationChannel svc = mgr.getNotificationChannel(CHANNEL_SERVICE);
        if (svc == null) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_SERVICE, "監控背景服務", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("水位監控背景執行中");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            mgr.createNotificationChannel(channel);
        } else if (svc.getImportance() > NotificationManager.IMPORTANCE_LOW) {
            svc.setImportance(NotificationManager.IMPORTANCE_LOW);
            mgr.createNotificationChannel(svc);
        }

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

    private void startAlarmSound() {
        try {
            if (mediaPlayer != null) {
                mediaPlayer.release();
            }

            // 先用模組內建的預設警報音
            Uri alarmUri = Uri.parse("android.resource://" + getPackageName() + "/raw/alarm_default");
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alarmUri);
            mediaPlayer.setLooping(true);
            mediaPlayer.setVolume(1.0f, 1.0f);
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            mediaPlayer.prepare();
            mediaPlayer.start();
            // 取得 WakeLock 確保播放不中斷
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(10 * 60 * 1000L);
            }
        } catch (Exception e) {
            Log.e(TAG, "無法播放警報音", e);
        }
    }

    private void stopAlarmSound() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
            } catch (Exception ignored) {}
            mediaPlayer.release();
            mediaPlayer = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    private void sendAlarmNotification(String title, String body) {
        NotificationManager mgr = getSystemService(NotificationManager.class);
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent fullScreenPi = PendingIntent.getActivity(this, 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // 喚醒螢幕，確保使用者能看到警報（5秒後自動釋放）
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            PowerManager.WakeLock screenLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "PumpMonitor:WakeUpScreen");
            screenLock.acquire(5000);
        }

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

        // 開始循環播放警報音（MediaPlayer）
        startAlarmSound();
    }

    /** 只推通知不響音（冷卻期內使用） */
    private void sendSilentNotification(String title, String body) {
        NotificationManager mgr = getSystemService(NotificationManager.class);
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ALARM)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .build();

        mgr.notify(NOTIFY_ALARM, notif);
    }
}