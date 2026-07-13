# 水位即機組監控警示系統 (pumpmonitor)

## 專案概述

台北市抽水站即時監控 PWA，監測 15 座抽水站的水位、機組運轉、閘門狀態。支援 Android APK（Capacitor）及瀏覽器 PWA。

## 技術棧

- React 19 + TypeScript + Vite 6
- Zustand 5（狀態管理）
- Firebase 11（登入驗證 + Firestore session）
- Capacitor 7（Android 原生橋接）
- Tailwind CSS 4
- Android 原生 Java（背景服務、鬧鐘通知、更新檢查）

## 專案結構

```
src/
├── api/pumpStation.ts      # API 呼叫 + 資料正規化
├── config/stations.ts       # 站點常數、TIDE_STATIONS、PUMP/DOOR 欄位定義
├── store/useStore.ts        # Zustand store：資料、設定、潮汐緩衝、警報邏輯
├── hooks/usePumpData.ts     # 30 秒輪詢 hook，驅動 checkTideAlarm
├── components/
│   ├── StationCard.tsx      # 站點卡片：水位、機組、閘門、潮汐標註
│   ├── WaterLevelBar.tsx    # 水位橫條 + 警報閾值標記
│   ├── PumpGrid.tsx         # 16 機組狀態網格
│   ├── DoorGrid.tsx         # 16 閘門狀態網格
│   ├── StationSelector.tsx  # 站點勾選 + 拖曳排序
│   ├── AlarmBanner.tsx      # 固定頂部警報橫幅
│   └── ...
├── pages/
│   ├── MainPage.tsx         # 主監控儀表板
│   ├── LoginPage.tsx        # Email + 生物辨識登入
│   └── SettingsPage.tsx     # 設定頁
├── types/index.ts           # TypeScript 型別定義
└── utils/
    ├── audio.ts             # 多站獨立音效播放（base64 → Audio loop）
    ├── backgroundAlarm.ts   # JS→Android 背景服務橋接
    └── format.ts            # 水位格式化 + bar 百分比計算
```

## API 資料來源

### 主 API：GetLastestAutoPumpPGInfo（目前使用中）

- URL: `https://heovcenter.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo`
- 備援: `https://heovcenter2.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo`
- Method: GET
- 回應: `{"d": [15站最新一筆資料]}`
- Vite proxy: `/api` → heovcenter, `/api2` → heovcenter2
- Android: `AndroidHttp.fetch()` 原生 HTTP 橋接
- 雙 API 平行呼叫，同站取 rectime 較新者

### 潮汐用 API：GetAutoPumpWaterMins（來自 shinshun 參考）

- URL: `https://heovcenter.gov.taipei/cia/WebLayout/GetAutoPumpWaterMins`
- 備援: `https://heovcenter2.gov.taipei/cia/WebLayout/GetAutoPumpWaterMins`
- Method: POST, Content-Type: application/json
- SSL: 必須 `verify=False`（政府憑證 schannel 撤銷檢查會失敗）
- 參數: `{"sBgnDate":"YYYY/MM/DD HH:MM:SS", "sEndDate":"YYYY/MM/DD HH:MM:SS", "stationno":"112"}`
- 回應: `{"d": [{rectime, level_in, level_out, door01~16, pumb01~16}, ...]}`
- rectime 格式: 14 位數字字串 `YYYYMMDDHHmmss`
- 雙 API 可能不同步（差距可達 5 分鐘），需合併取 rectime 最新

## 潮汐判斷（目前）

- 潮汐站: 108 (中山), 110 (建國), 112 (新生)
- 用 `GetLastestAutoPumpPGInfo` 的 `level_out` 建立 4 小時滾動緩衝
- 取最後 3 筆比較：全部遞增 → 漲潮, 全部遞減 → 退潮, 其他 → 平潮
- 每 10 分鐘觸發一次 `checkTideAlarm()`
- 潮汐警報：退潮且外水低於內水 → `tide_open_gate`；退轉漲 → `tide_close_gate`

## Android 背景服務

- `PumpMonitorService.java` — foreground service，含獨立輪詢邏輯
- `PumpAlarmReceiver.java` — AlarmManager 定時喚醒 receiver
- `BootReceiver.java` — 開機自動重啟服務
- 背景服務內重複實作潮汐判斷邏輯（Java 版），用 SharedPreferences 存 tide buffer

## 參考專案

`D:\cc project\shinshun\` — 同作者的抽水站閘門監控系統，Windows Tkinter + Android Kivy 版本。
- 使用 `GetAutoPumpWaterMins` API 取得歷史水位紀錄做潮汐判斷
- 每次取 5 筆 records，以 consecutive pairs 比較判斷漲退潮
- 閘門啟閉提醒邏輯更完整（退潮開閘、漲潮關閘）
- pumpmonitor 如果要改用 `GetAutoPumpWaterMins` 做潮汐，可參考 `shinshun/pump_monitor_112.py` 的 `_detect_tide()` 和 `_check_gate_condition()`