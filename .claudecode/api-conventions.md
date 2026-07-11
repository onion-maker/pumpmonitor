# API 串接規範

## 端點資訊

| 項目 | 內容 |
|------|------|
| URL | `https://heovcenter.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo` |
| 方法 | GET |
| Content-Type | `application/json` |
| 編碼 | UTF-8 |
| CORS | 無限制（公開 API） |

## 資料格式

```json
{
  "d": [
    {
      "stationno": "string",
      "stationtype": "string | null",
      "rectime": "string (格式: yyyyMMddHHmmss)",
      "level_in": "number | null",
      "level_in2": "number | null",
      "level_out": "number | null",
      "level_out2": "number | null",
      "pumb01": "string ('0' | null)",
      "pumb02": "string ('0' | null)",
      "...": "...",
      "pumb16": "string | null",
      "door01": "string ('0' | '1' | '2' | null)",
      "door02": "string | null",
      "...": "...",
      "door16": "string | null"
    }
  ]
}
```

## API 擷取函式（api/pumpStation.ts）

```typescript
const API_URL = 'https://heovcenter.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo';
const VALID_STATIONS = ['101','102','103','104','105','106','107','108','109','110',
                         '111','112','113','114','115'];

export interface PumpStationRaw {
  stationno: string;
  stationtype: string | null;
  rectime: string;
  level_in: number | null;
  level_in2: number | null;
  level_out: number | null;
  level_out2: number | null;
  pumb01: string | null;
  // ... pumb02~pumb16
  door01: string | null;
  // ... door02~door16
}

export interface PumpStationData {
  stationno: string;
  stationName: string;
  rectime: Date | null;
  level_in: number | null;
  level_out: number | null;
  pumps: (string | null)[];      // 只保留有值的機組
  doors: (string | null)[];      // 只保留有值的閘門
  hasPump: boolean;              // 該站是否有抽水機資料
  hasDoor: boolean;              // 該站是否有閘門資料
}

export async function fetchAllStations(): Promise<PumpStationData[]> {
  // 1. fetch API
  // 2. 檢查 response.ok
  // 3. 解析 JSON
  // 4. 過濾 stationno 101~115
  // 5. 對映站名
  // 6. 解析 rectime
  // 7. 整理 pumps/doors 陣列
  // 8. 錯誤時拋出例外
}
```

## 命名規則

| 類別 | 規則 | 範例 |
|------|------|------|
| 變數 | camelCase | `selectedStations`, `alarmLevel` |
| 型別/介面 | PascalCase | `PumpStationData`, `StationStatus` |
| 檔案 | camelCase + kebab 複合 | `pumpStation.ts`, `usePumpData.ts` |
| 元件 | PascalCase | `StationCard.tsx`, `WaterLevelBar.tsx` |
| API 函式 | fetch + 名詞 | `fetchAllStations` |
| CSS class | Tailwind utility only | 禁止自訂 class 名稱 |

## 錯誤處理規範

所有 API 呼叫必須統一處理：

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 使用方式
try {
  const data = await fetchAllStations();
  store.setStationData(data);
  store.checkAlarm();
} catch (error) {
  if (error instanceof ApiError) {
    store.setFetchError(error.message);
  } else {
    store.setFetchError('發生未知錯誤，請稍後再試');
  }
}
```

## 時間格式

| 原始格式 | 範例 | 輸出格式 |
|----------|------|---------|
| `yyyyMMddHHmmss` | `20260710090000` | `2026-07-10 09:00:00` |

解析函式：
```typescript
function parseRectime(rectime: string): Date | null {
  // 使用正則拆解: yyyy MM dd HH mm ss
  // 回傳 Date 物件或 null
}
```

## 安全性注意事項

- 此 API 為公開資料，無須認證
- 不應將任何 token 或憑證寫入程式碼
- Fetch 使用 `mode: 'cors'`（預設值即可）