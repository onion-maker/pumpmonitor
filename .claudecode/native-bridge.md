# Capacitor Android 原生橋接規範

## 架構總覽

```
App 啟動
  │
  ├── Capacitor WebView (React UI)
  │     └── 設定透過 SharedPreferences 與原生共享
  │
  └── PumpMonitorService (前景服務 ⭐)
        ├── 狀態列顯示「水位監控背景執行中」
        ├── 每 2 分鐘輪詢 API
        ├── 每 5 分鐘整點 (0/5/10/15…) 標記檢查點
        ├── 水位超標 → 系統高優先級通知跳出
        └── START_STICKY：被系統殺掉後自動重啟
```

## Android 原生檔案

| 檔案 | 說明 |
|------|------|
| `android/.../MainActivity.java` | Capacitor 入口，啟動/停止前景服務 |
| `android/.../PumpMonitorService.java` | Foreground Service，2 分鐘循環檢查 |

## 設定共用機制

Web 端的設定自動同步到 Android 原生：

```
Zustand persist → localStorage → SharedPreferences "pump-monitor-settings"
```

Android 讀取的 key：
- `stationAlarmLevels` → JSONObject `{ "101": 1.0, "102": 0.5 }`
- `selectedStations` → JSONArray `["101","102","103"]`

## 背景輪詢設定

| 參數 | 值 |
|------|-----|
| 檢查間隔 | 2 分鐘 (精準 Handler.postDelayed) |
| 5 分鐘標記 | 系統分鐘為 0/5/10/15/20/25/30/35/40/45/50/55 時 Log 特別標註 |
| 網路要求 | 每次檢查時判斷，不需網路時跳過 |
| 服務優先級 | 前景服務 (Foreground Service) |
| 被殺策略 | START_STICKY → 系統會自動重啟 |

## 常駐通知

App 啟動後通知欄會顯示一條不可滑掉的訊息：

```
┌─────────────────────────────────┐
│ 🧭 水位監控背景執行中             │
│    每 2 分鐘檢查抽水站水位        │
└─────────────────────────────────┘
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