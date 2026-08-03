// Tide and Alarm detection algorithms
// Ported from src/store/slices/tideSlice.ts and src/store/slices/alarmSlice.ts

import type { TideRecord, TideDirection, PumpRecord, GateRecord } from './types';

const TIDE_STATIONS = ['108', '110', '112'] as const;

// ========================================
// Tide Detection (from tideSlice.ts)
// ========================================

/**
 * detectTide - 原前端 tideSlice.ts:53-65
 * 比較最後 5 條 level_out 的相�鄰值，多數升則漲，多數降則退
 */
export function detectTideDirection(
  records: TideRecord[] | undefined,
  prevDirection: TideDirection | null = null,
): TideDirection {
  if (!records || records.length < 2) return prevDirection ?? 'slack';

  const valid = records.slice(-5).map(r => r.level_out).filter((v): v is number => v !== null);
  if (valid.length < 2) return prevDirection ?? 'slack';

  let inc = 0, dec = 0;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i] > valid[i - 1]) inc++;
    else if (valid[i] < valid[i - 1]) dec++;
  }

  if (dec > inc) return 'falling';
  if (inc > dec) return 'rising';
  return prevDirection ?? 'slack';
}

/**
 * detectOnSlice - 原前端 tideSlice.ts:81-92
 * 較短的 slice 用於找轉折點
 */
function detectOnSlice(records: TideRecord[]): TideDirection | null {
  const valid = records.map(r => r.level_out).filter((v): v is number => v !== null);
  if (valid.length < 2) return null;

  let inc = 0, dec = 0;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i] > valid[i - 1]) inc++;
    else if (valid[i] < valid[i - 1]) dec++;
  }

  if (dec > inc) return 'falling';
  if (inc > dec) return 'rising';
  return 'slack';
}

/**
 * findReversalIdx - 原前端 tideSlice.ts:95-104
 * 回掃 records 找轉折點：從尾部往前找到第一對不符合新方向的位置
 */
function findReversalIdx(records: TideRecord[], newDir: TideDirection): number {
  for (let i = records.length - 1; i >= 1; i--) {
    const a = records[i - 1].level_out;
    const b = records[i].level_out;
    if (a === null || b === null) continue;
    if (newDir === 'rising' && b <= a) return i;
    if (newDir === 'falling' && b >= a) return i;
  }
  return 0;
}

// ========================================
// Tide Gate Alarm (from tideSlice.ts:165-217)
// ========================================

const TIDE_DOOR_COLS: Record<string, string[]> = {
  '112': ['door01', 'door02', 'door03', 'door04', 'door05'],
  '110': ['door01', 'door02', 'door03', 'door04'],
  '108': ['door01', 'door02', 'door03'],
};

export interface TideGateCondition {
  stationNo: string;
  action: 'open' | 'close';
  reason: string;
}

/**
 * 閘門啟閉警報邏輯 (tideSlice.ts:186-217)
 * 使用 3-record trend (tailAvg/headAvg) 判斷
 * - 退潮: ta < ha 且 level_out < level_in 且 前一筆 out >= in 且 所有閘門關閉 → 'open'
 * - 漲潮: ta > ha 且 任一閘門半開 → 'close'
 */
export function checkTideGate(
  stationNo: string,
  records: TideRecord[],
): TideGateCondition | null {
  if (records.length < 3) return null;

  const newest = records[records.length - 1];
  const prev = records[records.length - 2];
  const prev2 = records[records.length - 3];

  const ni_lo = newest.level_out ?? 0;
  const ni_li = newest.level_in ?? 0;
  const pi_lo = prev.level_out ?? 0;
  const pi_li = prev.level_in ?? 0;
  const pi2_lo = prev2.level_out ?? 0;

  // 3-record trend (tailAvg vs headAvg)
  const ta = (pi_lo + ni_lo) / 2; // tail avg
  const ha = (pi2_lo + pi_lo) / 2; // head avg

  const doorCols = TIDE_DOOR_COLS[stationNo] ?? [];

  // 退潮: 開閘
  if (ta < ha) {
    if (ni_lo < ni_li && pi_lo >= pi_li) {
      const allClosed = doorCols.length > 0 && doorCols.every(d => {
        const ds = newest.doors?.[d];
        return ds === '1';  // '1' = closed
      });
      if (allClosed) {
        return {
          stationNo,
          action: 'open',
          reason: '退潮中外水位已低於內水位，建議開啟閘門排水',
        };
      }
    }
  }

  // 漲潮: 關閉
  if (ta > ha) {
    const anyOpen = doorCols.some(d => {
      const ds = newest.doors?.[d];
      return ds === '0' || ds === '2';  // '0' = open, '2' = half-open
    });
    if (anyOpen) {
      return {
        stationNo,
        action: 'close',
        reason: '漲潮中外水位上升中，建議關閉閘門防止河水倒灌',
      };
    }
  }

  return null;
}

// ========================================
// Tide Direction Log (tideSlice.ts:118-162)
// ========================================

export interface TideLogEntry {
  timestamp: number;
  stationNo: string;
  from: TideDirection;
  to: TideDirection;
}

function rectimeToMs(rectime: string): number {
  const t = rectime.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!t) return Date.now();
  return new Date(+t[1], +t[2] - 1, +t[3], +t[4], +t[5], +t[6]).getTime();
}

/**
 * 找轉折點的時間戳 (tideSlice.ts:130-131)
 */
function findTideReversalTime(records: TideRecord[], newDir: TideDirection): number {
  if (records.length < 2) return Date.now();

  for (let i = records.length - 1; i >= 1; i--) {
    const a = records[i - 1].level_out;
    const b = records[i].level_out;
    if (a === null || b === null) continue;
    if (newDir === 'rising' && b <= a) return rectimeToMs(records[i].rectime);
    if (newDir === 'falling' && b >= a) return rectimeToMs(records[i].rectime);
  }
  return Date.now();
}

/**
 * 產生 tide operation log (tideSlice.ts:118-162)
 */
export function detectTideOperationLog(
  stationNo: string,
  records: TideRecord[],
  prevDirection: TideDirection | null,
): TideLogEntry | null {
  if (!records || records.length < 3) return null;

  const newDir = detectTideDirection(records, prevDirection);

  if (prevDirection && prevDirection !== newDir) {
    const timestamp = findTideReversalTime(records, newDir);
    return {
      timestamp,
      stationNo,
      from: prevDirection,
      to: newDir,
    };
  }

  return null;
}

// ========================================
// Pump Operation Detection (from alarmSlice.ts)
// ========================================

export function detectPumpOperations(
  prev: TideRecord | null,
  curr: TideRecord,
): { pumpStart?: number; pumpStop?: number } {
  const result: { pumpStart?: number; pumpStop?: number } = {};

  for (let i = 1; i <= 16; i++) {
    const key = `pumb${String(i).padStart(2, '0')}`;
    const prevV = prev?.pumps?.[key];
    const currV = curr.pumps?.[key];
    if (!currV) continue;

    const wasRunning = prevV === '1' || prevV === '2' || prevV === '3';
    const isRunning = currV === '1' || currV === '2' || currV === '3';

    if (prevV === '0' && isRunning) {
      result.pumpStart = i;
    } else if (wasRunning && currV === '0') {
      result.pumpStop = i;
    }
  }

  return result;
}

// ========================================
// Door Operation Detection (from alarmSlice.ts)
// ========================================

export function detectDoorOperations(
  prev: TideRecord | null,
  curr: TideRecord,
): { doorOpen?: number; doorClose?: number } {
  const result: { doorOpen?: number; doorClose?: number } = {};

  for (let i = 1; i <= 16; i++) {
    const key = `door${String(i).padStart(2, '0')}`;
    const prevV = prev?.doors?.[key];
    const currV = curr.doors?.[key];
    if (!currV || !prevV || prevV === currV) continue;

    // 由關 (1) 變成開 (0) 或半開 (2) → 開啟
    if (prevV === '1' && (currV === '0' || currV === '2')) {
      result.doorOpen = i;
    }
    // 由開 (0) 或半開 (2) 變成關 (1) → 關閉
    else if ((prevV === '0' || prevV === '2') && currV === '1') {
      result.doorClose = i;
    }
  }

  return result;
}

// ========================================
// Gate Alarm - Inner High (from alarmSlice.ts:213-224)
// ========================================

export interface GateAlarm {
  stationNo: string;
  reason: string;
}

export function checkInnerHighGate(
  stationNo: string,
  records: TideRecord[],
  doorCols: string[],
): GateAlarm | null {
  if (records.length === 0) return null;

  const newest = records[records.length - 1];
  const levelIn = newest.level_in;
  const levelOut = newest.level_out;

  if (levelIn === null || levelOut === null) return null;

  // 內水位 > 外水位 且 所有閘門關閉
  const allClosed = doorCols.length === 0 || doorCols.every(d => {
    const ds = newest.doors?.[d];
    return ds === '1';  // '1' = closed
  });

  if (levelIn > levelOut && allClosed) {
    return {
      stationNo,
      reason: `內水位 ${levelIn.toFixed(2)}m 高於外水位 ${levelOut.toFixed(2)}m，閘門全閉`,
    };
  }

  return null;
}

// ========================================
// Water Level Alarm (from alarmSlice.ts:136-155)
// ========================================

export function checkWaterLevel(
  levelIn: number | null,
  threshold: number,
  prevLevel: number | null,
): boolean {
  if (levelIn === null || levelIn <= threshold) return false;

  if (prevLevel === null) return true;

  // 必須升高 >= 0.1m
  if (levelIn >= prevLevel + 0.1) return true;

  return false;
}