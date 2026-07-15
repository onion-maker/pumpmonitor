# Capacitor Android 原生橋接規範

## 架構總覽

```
App 啟動
  │
  ├── Capacitor WebView (React UI)
  │     ├── 30 秒輪詢 API → 驅動 checkAlarm()
  │     ├── 每 10 分鐘 fetchTideRecords() → updateTide()
  │     ├── 播放 HTMLAudioElement 警報音
  │     └── 設定透過 SharedPreferences 與原生共享
  │
  └── PumpMonitorService (前景服務 ⭐)
        ├── 狀態列顯示「水位監控背景執行中」
        ├── 依 backgroundIntervalSec 設定輪詢 API (預設 120 秒)
        ├── 每 5 分鐘心跳備援（防止排程遺漏）
        ├── 水位超標 → 系統高優先級通知跳出
        └── START_STICKY：被系統殺掉後自動重啟
```

## Android 原生檔案

| 檔案 | 說明 |
|------|------|
| `android/.../MainActivity.java` | Capacitor 入口，註冊 `AndroidPump` 橋接，啟動/停止前景服務 |
| `android/.../PumpMonitorService.java` | Foreground Service，依設定間隔（可調 30~600 秒）循環檢查 |
| `android/.../PumpAlarmReceiver.java` | 接收 AlarmManager 鬧鐘喚醒，轉發給 Service |

## 設定共用機制

Web 端的設定自動同步到 Android 原生：

```
Zustand store → syncSettingsToNative() → AndroidPump.syncSettings() → SharedPreferences "pump-monitor-settings"
```

Android 讀取的 key：
- `stationAlarmLevels` → JSONObject `{ "101": 1.0, "102": 0.5 }`
- `selectedStations` → JSONArray `["101","102","103"]`
- `backgroundIntervalSec` → int `120`（預設 2 分鐘，最小值 30 秒）
- `stationGateAlarmSwitches` → JSONObject（各站閘門高低差警報開關）
- `stationTideAlarmSwitches` → JSONObject（各站潮汐警報開關）

## 背景輪詢機制

| 項目 | 說明 |
|------|------|
| 主要輪詢間隔 | 讀取 `backgroundIntervalSec` 設定（預設 120 秒），可從 App 設定頁調整 30~600 秒 |
| 排程方式 | `AlarmManager.AlarmClock`（單次鬧鐘），每次觸發後重新排程，確保省電模式仍能喚醒 |
| 心跳備援 | 固定每 5 分鐘一支 `RTC_WAKEUP` 鬧鐘，確保即使主要輪詢排程遺漏，至少每 5 分鐘檢查一次 |
| 網路要求 | 每次檢查時獨立發起 HTTP 請求，兩個 API 都失敗則跳過本次 |
| 設定變更 | 前端變更 `backgroundIntervalSec` → 同步到 Native → RELOAD（取消舊排程 + 以新間隔重新排程 + 立即檢查一次） |
| 服務優先級 | 前景服務 (Foreground Service) |
| 被殺策略 | START_STICKY → 系統會自動重啟 |

## 常駐通知

App 啟動後通知欄會顯示一條不可滑掉的訊息，內容顯示實際輪詢間隔：

```
┌─────────────────────────────────────┐
│ 🧭 水位監控背景執行中               │
│    每 120 秒檢查抽水站水位與機組狀態  │
└─────────────────────────────────────┘
```

## 警報通知

水位超標時跳出（含震動 + 系統預設音效）：

```
┌─────────────────────────────────┐
│ 🚨 3 個站點水位警報              │
│    101 水位 1.52m               │
│    102 水位 1.23m               │  ← 可展開看完整內容
│    107 水位 1.08m               │
└─────────────────────────────────┘
```

### 背景警報冷卻機制

使用者按下警報確認後，背景服務進入 10 分鐘冷卻期：
- 冷卻期內：同一組警報條件只更新通知（不響音）
- 冷卻期外：恢復正常警報音
- 警報條件有變化（水位再升 0.1m 等）：立即退出冷卻

## AndroidManifest.xml 必要設定

自動產生 `android/app/src/main/AndroidManifest.xml` 後，請在 `<application>` 區塊內加入：

```xml
<service
    android:name=".PumpMonitorService"
    android:foregroundServiceType="dataSync"
    android:exported="false" />
```

並在 `<manifest>` 內加入權限：

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

## 開發流程

```bash
# 1. 建置 Web 端
npm run build

# 2. 同步到 Android（首次會產生 android/ 資料夾）
npx cap sync android

# 3. ⚠ 編輯 AndroidManifest.xml 加入前景服務設定（見上方）

# 4. 產出 APK
cd android && ./gradlew assembleDebug

# APK 路徑：android/app/build/outputs/apk/debug/app-debug.apk
```