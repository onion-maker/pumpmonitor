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

    console.log(`[Tide Debug] updateTide called, stations in tideRecords: ${Object.keys(tideRecords).join(',')}`);
    for (const k of Object.keys(tideRecords)) {
      const r = tideRecords[k];
      const valid = r?.filter(v => v.level_out !== null).length ?? 0;
      console.log(`[Tide Debug] updateTide: ${k} = ${r?.length ?? 0} records, ${valid} with level_out`);
    }

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

    // 新生(112) 決定方向 → 112 和 110 共用
    const xinshengTide = detectTide(tideRecords['112'], '112');
    newDirections['112'] = xinshengTide;
    newDirections['110'] = xinshengTide;

    // 中山(108) 獨立判斷
    newDirections['108'] = detectTide(tideRecords['108'], '108');

    console.log(`[Tide Debug] updateTide: newDirections — 112:${newDirections['112']}, 110:${newDirections['110']}, 108:${newDirections['108']}`);

    const rectimeToMs = (rectime: string): number => {
      const t = rectime.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
      if (!t) return 0;
      return new Date(+t[1], +t[2] - 1, +t[3], +t[4], +t[5], +t[6]).getTime();
    };

    const detectOnSlice = (records: TideRecord[]): TideDirection | null => {
      const valid = records.map(r => r.level_out).filter(v => v !== null) as number[];
      if (valid.length < 2) return null;
      let inc = 0, dec = 0;
      for (let i = 1; i < valid.length; i++) {
        if (valid[i] > valid[i - 1]) inc++;
        else if (valid[i] < valid[i - 1]) dec++;
      }
      if (dec > inc) return 'falling';
      if (inc > dec) return 'rising';
      return 'slack';
    };

    // 回掃 records 找轉折點：從尾部往前找到第一對不符合新方向的位置
    const findReversalIdx = (records: TideRecord[], newDir: TideDirection): number => {
      for (let i = records.length - 1; i >= 1; i--) {
        const a = records[i - 1].level_out;
        const b = records[i].level_out;
        if (a === null || b === null) continue;
        if (newDir === 'rising' && b <= a) return i;
        if (newDir === 'falling' && b >= a) return i;
      }
      return 0;
    };

    // 在 [lo, hi] range 中回掃找轉折點 (cold start path)
    const findReversalInRange = (records: TideRecord[], lo: number, hi: number, newDir: TideDirection): number => {
      for (let i = hi; i > lo; i--) {
        const a = records[i - 1].level_out;
        const b = records[i].level_out;
        if (a === null || b === null) continue;
        if (newDir === 'rising' && b <= a) return i;
        if (newDir === 'falling' && b >= a) return i;
      }
      return lo;
    };

    // ── 潮汐方向變化紀錄 ──
    const newTideLog: TideLogEntry[] = [];

    for (const stationNo of TIDE_STATIONS) {
      const records = tideRecords[stationNo];
      if (!records || records.length < 3) { console.warn(`[Tide Debug] updateTide: ${stationNo} — records太少(${records?.length ?? 0}), skip`); continue; }
      const newDir = newDirections[stationNo];
      if (!newDir) { console.warn(`[Tide Debug] updateTide: ${stationNo} — newDir falsy, skip`); continue; }

      const prevDir = prevDirections[stationNo];
      console.log(`[Tide Debug] updateTide: station ${stationNo} — records=${records.length}, newDir=${newDir}, prevDir=${prevDir ?? 'undefined'}`);
      if (prevDir) {
        if (prevDir !== newDir) {
          const revIdx = findReversalIdx(records, newDir);
          newTideLog.push({ timestamp: rectimeToMs(records[revIdx].rectime), stationNo, from: prevDir, to: newDir });
          console.log(`[Tide Debug] updateTide: ${stationNo} warm path reversal: ${prevDir} → ${newDir}`);
        }
      } else {
        const existingLogs = state.tideOperationLog.filter(l => l.stationNo === stationNo);
        const lastLoggedTime = existingLogs.length > 0
          ? Math.max(...existingLogs.map(l => l.timestamp))
          : 0;

        const win = 5;
        let lastDir: TideDirection | null = null;
        let logCount = 0;
        for (let i = win; i <= records.length; i += 1) {
          const slice = records.slice(i - win, i);
          const time = rectimeToMs(records[i - 1].rectime);
          if (time <= lastLoggedTime) {
            const d = detectOnSlice(slice);
            if (d) lastDir = d;
            continue;
          }
          const dir = detectOnSlice(slice);
          if (!dir) continue;
          if (lastDir !== null && dir !== lastDir) {
            const revIdx = findReversalInRange(records, i - win, i - 1, dir);
            newTideLog.push({ timestamp: rectimeToMs(records[revIdx].rectime), stationNo, from: lastDir, to: dir });
            logCount++;
          }
          lastDir = dir;
        }
        console.log(`[Tide Debug] updateTide: ${stationNo} cold scan done — ${logCount} reversals, lastDir=${lastDir}`);
        // 如果沒有找到任何轉折，至少記錄初始潮汐狀態
        if (logCount === 0 && newDir) {
          const firstTime = Date.now();
          newTideLog.push({ timestamp: firstTime, stationNo, from: 'slack', to: newDir });
          console.log(`[Tide Debug] updateTide: ${stationNo} — fallback initial entry: slack → ${newDir}`);
        }
      }
    }

    if (newTideLog.length > 0) {
      console.log(`[Tide Debug] updateTide: writing ${newTideLog.length} tide log entries`);
      set({ tideOperationLog: [...state.tideOperationLog, ...newTideLog].slice(-500) });
    } else {
      console.warn('[Tide Debug] updateTide: newTideLog is empty, nothing to write');
    }

    // ── 閘門啟閉警報（不看 newDir，直接用 level_out 趨勢） ──
    for (const stationNo of TIDE_STATIONS) {
      if (!selectedStations.includes(stationNo)) continue;
      const tideSwitch = stationTideAlarmSwitches[stationNo];
      if (!tideSwitch?.tideAlarm) continue;

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

      const ta = (pi_lo + ni_lo) / 2;
      const ha = (pi2_lo + pi_lo) / 2;

      // 退潮：外水位下降中 (tail < head) 且最新外水低於內水
      if (ta < ha) {
        if (ni_lo < ni_li && pi_lo >= pi_li) {
          const doorCols = TIDE_DOOR_COLS[stationNo] ?? [];
          const allClosed = doorCols.length > 0 && doorCols.every(d => newest.doors[d] === '1');
          if (allClosed) {
            tideReasons.push({
              stationno: stationNo,
              stationName,
              reasons: [{ type: 'tide_open_gate', detail: '退潮中外水位已低於內水位，建議開啟閘門排水' }],
            });
            get().addGateOperationLog({ timestamp: Date.now(), stationNo, gateId: '潮汐建議', action: 'open', source: 'tide' });
          }
        }
      }

      // 漲潮：外水位上升中 (tail > head)
      if (ta > ha) {
        const doorCols = TIDE_DOOR_COLS[stationNo] ?? [];
        const anyOpen = doorCols.some(d => newest.doors[d] === '0' || newest.doors[d] === '2');
        if (anyOpen) {
          tideReasons.push({
            stationno: stationNo,
            stationName,
            reasons: [{ type: 'tide_close_gate', detail: '漲潮中外水位上升中，建議關閉閘門防止河水倒灌' }],
          });
          get().addGateOperationLog({ timestamp: Date.now(), stationNo, gateId: '潮汐建議', action: 'close', source: 'tide' });
        }
      }
    }

    // 保留未重新產生的既有潮汐警報
    const currentTideNos = new Set(tideReasons.map(t => t.stationno));
    for (const existing of currentAlarms) {
      if (existing.reasons.some(r => r.type === 'tide_open_gate' || r.type === 'tide_close_gate') &&
          !currentTideNos.has(existing.stationno)) {
        tideReasons.push(existing);
      }
    }

    // 播放新警報
    const prevNos = new Set(currentAlarms.map(a => a.stationno));
    for (const alarm of tideReasons) {
      if (!prevNos.has(alarm.stationno)) {
        playStationAlarm(alarm.stationno, DEFAULT_ALARM_AUDIO_URL);
      }
    }

    set((s) => {
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