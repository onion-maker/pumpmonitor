# 水位即機組監控警示系統 — 整體架構規範

## 專案概述

即時監控臺北市抽水站（101~115）的內/外水位、抽水機與閘門狀態，支援警報水位門檻、自訂警報音頻、站點選擇等設定功能。

## 技術棧

| 類別 | 選擇 | 原因 |
|------|------|------|
| 框架 | React 18 + TypeScript | 型別安全，元件化開發 |
| 建構工具 | Vite 5 | 快速 HMR，零配置 |
| 樣式 | Tailwind CSS 3 | 實用優先，快速開發 |
| 狀態管理 | Zustand | 輕量、TypeScript 友好、支援 persist 中間件 |
| 持久化 | localStorage | 儲存使用者設定（選擇站點、警報水位、音頻） |
| 音頻 | HTML5 Audio API + blob URL | 使用者上傳自訂音頻後轉為 blob URL 儲存 |
| HTTP | Fetch API (原生) | 無需額外依賴 |

## 專案資料夾結構

```
水位即機組監控警示系統/
├── .claudecode/                # AI 開發規範
│   ├── ui-guidelines.md        # 外觀樣式規範
│   ├── feature-specs.md        # 功能邏輯規範
│   ├── api-conventions.md      # API 串接規範
│   └── ARCHITECTURE.md         # 本文件（架構總覽）
│
├── src/
│   ├── main.tsx                # 入口
│   ├── App.tsx                 # 根元件（路由：主頁 ↔ 設定頁）
│   ├── vite-env.d.ts
│   │
│   ├── types/
│   │   └── index.ts            # TypeScript 型別定義
│   │       # PumpStationData, StationStatus, DoorStatus, Settings, AlarmState
│   │
│   ├── api/
│   │   └── pumpStation.ts      # API 擷取邏輯
│   │       # fetchAllStations(), parseStationData()
│   │
│   ├── store/
│   │   └── useStore.ts         # Zustand store（settings + alarm state）
│   │       # selectedStations, alarmLevel, alarmAudio, stationData
│   │
│   ├── hooks/
│   │   └── usePumpData.ts      # 自動輪詢 hook
│   │       # setInterval 30s 擷取，生命週期自動清理
│   │
│   ├── pages/
│   │   ├── MainPage.tsx        # 主監控頁面
│   │   └── SettingsPage.tsx    # 設定頁面
│   │
│   ├── components/
│   │   ├── StationCard.tsx     # 單一站點卡片（核心顯示元件）
│   │   ├── WaterLevelBar.tsx   # 水位圖示（橫條 + 警報標記）
│   │   ├── PumpGrid.tsx        # 抽水機狀態網格
│   │   ├── DoorGrid.tsx        # 閘門狀態網格
│   │   ├── Header.tsx          # 頂部導覽列（標題 + 設定/重新整理按鈕）
│   │   ├── AlarmBanner.tsx     # 警報橫幅（當水位超標時顯示）
│   │   ├── StationSelector.tsx # 站點勾選清單（設定頁使用）
│   │   ├── AudioUploader.tsx   # 自訂音頻上傳元件
│   │   ├── AlarmLevelInput.tsx # 警報水位輸入元件
│   │   └── RefreshTimer.tsx    # 倒數計時器顯示
│   │
│   ├── config/
│   │   └── stations.ts         # 站點 101~115 名稱對照表（來自 base.json）
│   │
│   └── utils/
│       ├── format.ts           # rectime 解析、數字格式化
│       └── audio.ts            # audio blob 建立與播放
│
├── public/
│   └── default-alert.mp3       # 預設警報音（選用）
│
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

## 資料流 (Data Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│  API: https://heovcenter.gov.taipei/cia/WebLayout/              │
│       GetLastestAutoPumpPGInfo                                  │
└──────────────┬──────────────────────────────────────────────────┘
               │ fetch (每 30 秒)
               ▼
┌────────────────────────────────┐
│  api/pumpStation.ts            │
│  fetchAllStations()            │
│  → 解析 JSON { d: [...] }     │
│  → 過濾 stationno 101~115     │
│  → 回傳 PumpStationData[]     │
└──────────────┬─────────────────┘
               │ 寫入
               ▼
┌────────────────────────────────┐
│  Zustand Store                 │
│  ┌────────────────────────┐    │
│  │ settings (persisted)    │    │
│  │  ├ selectedStations[]   │    │
│  │  ├ alarmLevel: number   │    │
│  │  └ alarmAudio: blob URL │    │
│  ├─────────────────────────┤    │
│  │ data (not persisted)    │    │
│  │  └ stationData[]        │    │
│  │ alarm state             │    │
│  │  └ isAlarming: bool     │    │
│  └─────────────────────────┘    │
└──────┬──────────────────────────┘
       │ 訂閱
       ▼
┌────────────────────────────────┐
│  React 元件樹                  │
│  MainPage → StationCard[]     │
│  SettingsPage → 設定表單       │
└────────────────────────────────┘
```

## 元件樹

```
<App>
  ├── 狀態: page ('main' | 'settings')
  │
  ├── [page === 'main']
  │   └── <MainPage>
  │       ├── <Header>
  │       │   ├── 標題 + 最後更新時間
  │       │   ├── 重新整理按鈕
  │       │   └── 設定按鈕 → 切換 page='settings'
  │       ├── <RefreshTimer> (距離下次自動更新秒數)
  │       ├── <AlarmBanner /> (條件渲染：水位超標時顯示)
  │       └── <div.grid>
  │           └── {selectedStations.map → <StationCard>}
  │               ├── 站名 + 站號標題
  │               ├── rectime 顯示
  │               ├── <WaterLevelBar label="內池水位" value={level_in} />
  │               ├── <WaterLevelBar label="外池水位" value={level_out} />
  │               ├── <PumpGrid pumps={pumb01~pumb16} />
  │               └── <DoorGrid doors={door01~door16} />
  │
  └── [page === 'settings']
      └── <SettingsPage>
          ├── <h2>設定</h2>
          ├── <StationSelector>
          │   └── 勾選清單（站點 101~115，每個有 checkbox + 站名）
          ├── <AlarmLevelInput>
          │   └── 數字輸入框（設定警報水位 threshold）
          ├── <AudioUploader>
          │   └── 檔案上傳 input → 讀取為 blob URL
          └── 確定按鈕 → 儲存設定 + 切回 page='main'
```

## API 資料結構（已知）

```typescript
interface RawStationData {
  stationno: string;       // "101" ~ "115"
  stationtype: string | null;
  rectime: string;         // "20260710090000"
  level_in: number | null; // 內池水位 (m)，可為負值
  level_in2: number | null;
  level_out: number | null;// 外池水位 (m)
  level_out2: number | null;
  pumb01: string | null;   // 抽水機狀態，"0"=停止, null=無此機組
  pumb02: string | null;
  // ... pumb03 ~ pumb16
  door01: string | null;   // 閘門狀態，"0"/"1"/"2", null=無此閘門
  door02: string | null;
  // ... door03 ~ door16
}
```

**status 說明（需再確認）**：
- `pumb`: `"0"` = 停止, `"1"`? = 運轉中
- `door`: `"0"` = 開啟, `"1"` = 關閉, `"2"` = 異常/停止

## 警報邏輯

1. 使用者設定警報水位門檻 `alarmLevel`（預設 1.0m）
2. 每次資料更新時，遍歷所有選中的站點
3. 若任一站的 `level_in > alarmLevel`，觸發警報
4. 警報行為：
   - 顯示紅色 <AlarmBanner> + 閃爍效果
   - 播放在設定頁上傳的自訂音頻（若無上傳則不播放）
   - 直到水位降至門檻以下才解除
5. 使用防呆機制：短時間內不重複播放音頻

## 持久化儲存規劃（localStorage）

| Key | 型別 | 說明 |
|-----|------|------|
| `selectedStations` | `string[]` | 使用者勾選的站號陣列 |
| `alarmLevel` | `number` | 警報水位門檻 |
| `alarmAudioData` | `string` | 上傳音頻的 base64 編碼 |

## 路由設計

本專案為單頁應用（SPA），不使用 React Router，而是以 `page` 狀態切換：
- `'main'` → MainPage（監控主頁）
- `'settings'` → SettingsPage（設定頁）

未來如需擴充可引入 React Router。