/**
 * 站點 101~115 名稱對照表
 * 資料來源：base.json
 */
export const STATION_NAMES: Record<string, string> = {
  '101': '林森',
  '102': '長安',
  '103': '長春',
  '104': '民權',
  '105': '民生',
  '106': '錦州',
  '107': '圓山',
  '108': '中山(潮汐站)',
  '109': '中山擴',
  '110': '建國(潮汐站)',
  '111': '建國擴',
  '112': '新生(潮汐站)',
  '113': '新生擴',
  '114': '特一左',
  '115': '特一右',
};

/** 潮汐站站號（外水位受基隆河潮汐影響） */
export const TIDE_STATIONS = ['108', '110', '112'];

/** 所有有效站號 */
export const VALID_STATIONS = Object.keys(STATION_NAMES);

/** 預設選取全部站點 */
export const DEFAULT_SELECTED = [...VALID_STATIONS];

/** 預設警報水位 (m) */
export const DEFAULT_ALARM_LEVEL = 1.0;

/** 輪詢間隔 (ms) */
export const POLL_INTERVAL_MS = 30000;

/** 預設背景服務檢查間隔（秒），預設 120 秒 = 2 分鐘 */
export const DEFAULT_BACKGROUND_INTERVAL_SEC = 120;

/** 預設警報音頻 URL（放在 public/ 目錄下） */
export const DEFAULT_ALARM_AUDIO_URL = './freesound_community-security-alarm-63578.mp3';

/** 抽水機與閘門的欄位對應（用於動態取值） */
export const PUMP_FIELDS = Array.from({ length: 16 }, (_, i) =>
  `pumb${String(i + 1).padStart(2, '0')}` as const
);
export const DOOR_FIELDS = Array.from({ length: 16 }, (_, i) =>
  `door${String(i + 1).padStart(2, '0')}` as const
);

/** 抽水機狀態中文對照（用於警報訊息及設定頁） */
export const PUMP_STATUS_LABEL: Record<string, string> = {
  '0': '停機',
  '1': '圖控運轉',
  '2': '全自動運轉',
  '3': '現場手動運轉',
};

/** GitHub Releases 設定（用於 App 自動更新檢查） */
export const GITHUB_OWNER = 'onion-maker';
export const GITHUB_REPO = 'pumpmonitor';