# 功能邏輯規範

## 狀態管理架構

使用 Zustand + persist 中間件，資料流向為單向：

```
API fetch → store.setStationData() → React 元件自動更新
User action → store.setSettings() → localStorage 持久化 → React 元件自動更新
```

### Store 結構

```typescript
interface AppStore {
  // 頁面導航
  page: 'main' | 'settings';
  setPage: (page: 'main' | 'settings') => void;

  // 資料（不持久化）
  stationData: PumpStationData[];
  lastUpdateTime: string | null;
  isLoading: boolean;
  fetchError: string | null;
  setStationData: (data: PumpStationData[]) => void;

  // 設定（自動持久化到 localStorage）
  selectedStations: string[];          // 預設：101~115 全部選取
  alarmLevel: number;                  // 預設：1.0
  alarmAudioData: string | null;       // base64 編碼的音頻
  setSelectedStations: (ids: string[]) => void;
  setAlarmLevel: (level: number) => void;
  setAlarmAudio: (base64: string | null) => void;

  // 警報狀態
  isAlarming: boolean;
  alarmingStations: string[];          // 觸發警報的站號列表
  checkAlarm: () => void;              // 比對水位 → 更新 isAlarming
  dismissAlarm: () => void;            // 手動關閉警報
}
```

## 商業邏輯抽離原則

- **Page 元件**：只負責排版組合，不包含邏輯
- **元件**：只負責渲染 props，不直接存取 store
- **Custom Hooks**：所有資料擷取、輪詢、警報判斷邏輯都放在 `hooks/` 中
- **Utils**：純函數工具放在 `utils/` 中

## 輪詢機制（usePumpData）

```typescript
function usePumpData(intervalMs: number = 30000) {
  // 1. 首次載入時立即 fetch
  // 2. 使用 setInterval 定時 fetch
  // 3. 同步 store 中的 stationData
  // 4. fetch 完成後自動呼叫 checkAlarm()
  // 5. 頁面切換到設定頁時暫停輪詢
  // 6. 元件 unmount 時清理 interval
  // 7. fetch 失敗時設定 fetchError，不中斷現有資料顯示
}
```

## 警報邏輯（checkAlarm）

```
輸入：store.stationData, store.alarmLevel, store.selectedStations
流程：
  1. 過濾 selectedStations 的資料
  2. 對每個站點檢查 level_in > alarmLevel
  3. 若有任一站點超標：
     a. 設定 isAlarming = true
     b. 記錄 alarmingStations 列表
     c. 播放警報音頻（若已上傳）
  4. 若所有站點都低於門檻：
     a. 設定 isAlarming = false
     b. 清空 alarmingStations
     c. 停止音頻播放
     d. 重設 audio 播放位置
```

## 音頻管理（audio.ts）

```typescript
// 上傳時：File → base64 → store.alarmAudioData
// 播放時：base64 → blob URL → Audio.play()
// 警報解除時：Audio.pause() + Audio.currentTime = 0

function encodeAudioAsBase64(file: File): Promise<string>
function playAlarmAudio(base64Data: string): Promise<void>
function stopAlarmAudio(): void
```

## 防呆與驗證

| 項目 | 規則 |
|------|------|
| 警報水位輸入 | 僅允許正數，最小值 0.01，最大值 10.0 |
| 站點選擇 | 至少勾選 1 個站點，否則無法儲存設定 |
| 音頻上傳 | 僅接受 .mp3 / .wav / .ogg，最大 2MB |
| API fetch 失敗 | 保留上次資料繼續顯示，顯示錯誤提示但不下拉更新 |
| 快速點擊 | 重新整理按鈕加入 2 秒防連點 (disabled state) |
| 頁面切換 | 設定頁切回主頁時立即觸發一次 fetch |

## 預設值

| 設定 | 預設值 |
|------|--------|
| selectedStations | 101~115 全選 |
| alarmLevel | 1.0 (m) |
| alarmAudioData | null (無自訂音頻) |
| 輪詢間隔 | 30 秒 |

## 錯誤處理策略

1. **API 錯誤**：fetchError 顯示 Toast 提示，保留舊資料繼續渲染
2. **音頻載入失敗**：靜默忽略，不影響警報視覺顯示
3. **localStorage 滿**：try/catch 包住 persist，失敗時使用記憶體中的預設值
4. **rectime 解析失敗**：顯示 "未知時間"，不中斷其他資料渲染