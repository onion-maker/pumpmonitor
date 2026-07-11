/** 原始 API 回傳的站點資料 */
export interface RawStationData {
  stationno: string;
  stationtype: string | null;
  rectime: string;             // "yyyyMMddHHmmss"
  level_in: number | null;
  level_in2: number | null;
  level_out: number | null;
  level_out2: number | null;
  pumb01: string | null;
  pumb02: string | null;
  pumb03: string | null;
  pumb04: string | null;
  pumb05: string | null;
  pumb06: string | null;
  pumb07: string | null;
  pumb08: string | null;
  pumb09: string | null;
  pumb10: string | null;
  pumb11: string | null;
  pumb12: string | null;
  pumb13: string | null;
  pumb14: string | null;
  pumb15: string | null;
  pumb16: string | null;
  door01: string | null;
  door02: string | null;
  door03: string | null;
  door04: string | null;
  door05: string | null;
  door06: string | null;
  door07: string | null;
  door08: string | null;
  door09: string | null;
  door10: string | null;
  door11: string | null;
  door12: string | null;
  door13: string | null;
  door14: string | null;
  door15: string | null;
  door16: string | null;
}

/** 抽水機狀態：'0'=停機, '1'=圖控運轉, '2'=全自動運轉, '3'=現場手動運轉 */
export type PumpStatus = '0' | '1' | '2' | '3';

/** 閘門狀態：'0'=開啟, '1'=關閉, '2'=半開 */
export type DoorStatus = '0' | '1' | '2';

/** 整理後的站點資料（元件使用） */
export interface PumpStationData {
  stationno: string;
  stationName: string;
  rectime: Date | null;
  level_in: number | null;
  level_out: number | null;
  /** 有值（非 null）的抽水機列表 */
  pumps: { id: number; status: PumpStatus }[];
  /** 有值（非 null）的閘門列表 */
  doors: { id: number; status: DoorStatus }[];
}

/** 頁面狀態 */
export type PageState = 'main' | 'settings';

/** API 回應包裝 */
export interface ApiResponse {
  d: RawStationData[];
}

// ══════════════════════════════════════════════
// 警報相關型別（新增）
// ══════════════════════════════════════════════

/** 警報原因類型 */
export type AlarmReasonType = 'water_level' | 'pump_start' | 'pump_stop' | 'gate_high_inner' | 'gate_low_inner';

/** 單一警報原因描述 */
export interface AlarmReason {
  type: AlarmReasonType;
  detail: string;
  pumpId?: number;
}

/** 站點警報資訊 */
export interface StationAlarmInfo {
  stationno: string;
  stationName: string;
  reasons: AlarmReason[];
}

/** 單站 pump 狀態快照，key=pump id (1~16) */
export type PumpStatusMap = Record<number, PumpStatus>;

/** 閘門狀態快照，key=door id (1~16)，'0'=開啟, '1'=關閉, '2'=半開 */
export type DoorStatusMap = Record<number, DoorStatus>;

/** 閘門警報開關設定（每站可獨立開關） */
export interface GateAlarmSwitches {
  /** 內水位 > 外水位，但所有閘門全閉時告警 */
  innerHighAlarm: boolean;
  /** 內水位 < 外水位，但任一閘門未全閉時告警 */
  outerHighAlarm: boolean;
}