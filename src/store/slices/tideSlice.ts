/**
 * Tide slice — 潮汐 buffer、方向判斷、閘門啟閉警報
 */
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { TideDirection, StationAlarmInfo, TideLogEntry } from '../../types';
import type { TideRecord } from '../../api/pumpStation';
import { TIDE_STATIONS, TIDE_DOOR_COLS, DEFAULT_ALARM_AUDIO_URL } from '../../config/stations';
import { playStationAlarm } from '../../utils/audio';

export interface TideSlice {
  tideBuffer: Record<string, { time: number; level: number }[]>;
  tideDirection: Record<string, TideDirection>;
  lastTideCheckTime: number;
  tideOperationLog: TideLogEntry[];

  recordLevelOut: (stationno: string, rectime: string, levelOut: number | null) => void;
  /** 改用 GetAutoPumpWaterMins API 資料做潮汐判斷（shinshun 5 筆多數決法） */
  updateTide: (tideRecords: Record<string, TideRecord[]>) => void;
  getTideLogsByStation: (stationno: string) => TideLogEntry[];
  clearTideLogs: () => void;
}

export const createTideSlice: StateCreator<AppStore, [], [], TideSlice> = (set, get) => ({
  tideBuffer: {},
  tideDirection: {},
  lastTideCheckTime: 0,
  tideOperationLog: [],

  recordLevelOut: (stationno, rectime, levelOut) => {
    if (levelOut === null) return;
    if (!TIDE_STATIONS.includes(stationno)) return;

    const m = rectime.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!m) return;
    const time = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();

    set((s) => {
      const buffer = [...(s.tideBuffer[stationno] ?? [])];
      if (buffer.some(d => d.time === time)) return s;
      buffer.push({ time, level: levelOut });
      const cutoff = Date.now() - 4 * 60 * 60 * 1000;
      const trimmed = buffer.filter(d => d.time >= cutoff);
      return { tideBuffer: { ...s.tideBuffer, [stationno]: trimmed } };
    });
  },

  updateTide: (tideRecords) => {
    const state = get();
    const { tideDirection: prevDirections, stationTideAlarmSwitches, selectedStations, alarmingStations: currentAlarms } = state;
    const newDirections: Record<string, TideDirection> = {};
    const tideReasons: StationAlarmInfo[] = [];

    /** 用指定站號的 level_out 做 5 筆 pairwise 多數決 */
    const detectTide = (records: TideRecord[] | undefined, stationNo: string): TideDirection => {
      if (!records || records.length < 2) return prevDirections[stationNo] ?? 'slack';
      const valid = records.slice(-5).map(r => r.level_out).filter(v => v !== null) as number[];
      if (valid.length < 2) return prevDirections[stationNo] ?? 'slack';
      let inc = 0, dec = 0;
      for (let i = 1; i < valid.length; i++) {
        if (valid[i] > valid[i - 1]) inc++;
        else if (valid[i] < valid[i - 1]) dec++;
      }
      if (dec > inc) return 'falling';
      if (inc > dec) return 'rising';
      return prevDirections[stationNo] ?? 'slack';
    };

    // 新生(112) 決定潮汐方向 → 112 和 110 共用
    const xinshengTide = detectTide(tideRecords['112'], '112');
    newDirections['112'] = xinshengTide;
    newDirections['110'] = xinshengTide;

    // 中山(108) 獨立用自己的 level_out 判斷
    newDirections['108'] = detectTide(tideRecords['108'], '108');

    // ── 潮汐方向變化紀錄 ──
    const now = Date.now();
    const newTideLog: TideLogEntry[] = [...state.tideOperationLog];
    for (const stationNo of TIDE_STATIONS) {
      const prevDir = prevDirections[stationNo];
      const newDir = newDirections[stationNo];
      // 只在有明確方向變化時才記錄（排除 slack ↔ slack 及初始狀態）
      if (prevDir && newDir && prevDir !== newDir) {
        newTideLog.push({ timestamp: now, stationNo, from: prevDir, to: newDir });
      }
    }
    set({ tideOperationLog: newTideLog.slice(-500) });

    // ── 閘門啟閉警報 ──
    for (const stationNo of TIDE_STATIONS) {
      if (!selectedStations.includes(stationNo)) continue;
      const tideSwitch = stationTideAlarmSwitches[stationNo];
      if (!tideSwitch?.tideAlarm) continue;

      const newDir = newDirections[stationNo] ?? prevDirections[stationNo] ?? 'slack';
      const records = tideRecords[stationNo];
      if (!records || records.length < 3) continue;

      const newest = records[records.length - 1];
      const prev = records[records.length - 2];
      const prev2 = records[records.length - 3];

      const ni_lo = newest.level_out ?? 0;
      const ni_li = newest.level_in ?? 0;
      const pi_lo = prev.level_out ?? 0;
      const pi_li = prev.level_in ?? 0;
      const pi2_lo = prev2.level_out ?? 0;

      const stationData = state.stationData.find(s => s.stationno === stationNo);
      const stationName = stationData?.stationName ?? stationNo;

      if (newDir === 'falling') {
        if (ni_lo < ni_li && pi_lo >= pi_li) {
          const doorCols = TIDE_DOOR_COLS[stationNo] ?? [];
          const allClosed = doorCols.length > 0 && doorCols.every(d => newest.doors[d] === '1');
          if (allClosed) {
            tideReasons.push({
              stationno: stationNo,
              stationName,
              reasons: [{ type: 'tide_open_gate', detail: '退潮中外水位已低於內水位，建議開啟閘門排水' }],
            });
            // 寫入閘門操作紀錄（潮汐建議開閘）
            const now = Date.now();
            for (const d of doorCols) {
              get().addGateOperationLog({ timestamp: now, stationNo, gateId: d, action: 'open', source: 'tide' });
            }
          }
        }
      } else if (newDir === 'rising') {
        // 漲潮：三筆中，最後兩筆的平均值 > 前兩筆的平均值 → 趨勢上升
        const tailAvg = (pi_lo + ni_lo) / 2;
        const headAvg = (pi2_lo + pi_lo) / 2;
        if (tailAvg > headAvg) {
          const doorCols = TIDE_DOOR_COLS[stationNo] ?? [];
          const anyOpen = doorCols.some(d => newest.doors[d] === '2');
          if (anyOpen) {
            tideReasons.push({
              stationno: stationNo,
              stationName,
              reasons: [{ type: 'tide_close_gate', detail: '漲潮中外水位上升或持平，建議關閉閘門防止河水倒灌' }],
            });
            // 寫入閘門操作紀錄（潮汐建議關閘）
            const now = Date.now();
            for (const d of doorCols) {
              get().addGateOperationLog({ timestamp: now, stationNo, gateId: d, action: 'close', source: 'tide' });
            }
          }
        }
      }
    }

    // 保留本週期未重新產生的既有潮汐警報（使用者尚未確認則持續顯示）
    const currentTideNos = new Set(tideReasons.map(t => t.stationno));
    for (const existing of currentAlarms) {
      if (existing.reasons.some(r => r.type === 'tide_open_gate' || r.type === 'tide_close_gate') &&
          !currentTideNos.has(existing.stationno)) {
        tideReasons.push(existing);
      }
    }

    // 播放新警報音
    const prevNos = new Set(currentAlarms.map(a => a.stationno));
    for (const alarm of tideReasons) {
      if (!prevNos.has(alarm.stationno)) {
        playStationAlarm(alarm.stationno, DEFAULT_ALARM_AUDIO_URL);
      }
    }

    set((s) => {
      // 保留現有警報中的非潮汐警報（避免覆蓋 checkAlarm 產生的 pump/水位警報）
      const nonTideAlarms = s.alarmingStations.filter(a =>
        !a.reasons.some(r => r.type === 'tide_open_gate' || r.type === 'tide_close_gate')
      );
      const tideNos = new Set(tideReasons.map(t => t.stationno));
      const merged = [...nonTideAlarms.filter(a => !tideNos.has(a.stationno))];
      merged.push(...tideReasons);
      return {
        tideDirection: newDirections,
        lastTideCheckTime: Date.now(),
        alarmingStations: merged,
        isAlarming: merged.length > 0,
      };
    });
  },

  getTideLogsByStation: (stationno) => {
    return get().tideOperationLog.filter(l => l.stationNo === stationno).slice(-50);
  },

  clearTideLogs: () => {
    set({ tideOperationLog: [] });
  },
});