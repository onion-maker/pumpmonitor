import { create } from 'zustand';
import type {
  PumpStationData,
  PageState,
  StationAlarmInfo,
  AlarmReason,
  PumpStatusMap,
  PumpStatus,
  GateAlarmSwitches,
  TideDirection,
  TideAlarmSwitch,
} from '../types';
import type { TideRecord } from '../api/pumpStation';
import { TIDE_STATIONS, TIDE_DOOR_COLS, DEFAULT_SELECTED, DEFAULT_ALARM_LEVEL, DEFAULT_ALARM_AUDIO_URL, PUMP_STATUS_LABEL, DEFAULT_BACKGROUND_INTERVAL_SEC } from '../config/stations';
import { playStationAlarm, stopStationAlarm, stopAllAlarms } from '../utils/audio';
import { dismissBackgroundAlarm } from '../utils/backgroundAlarm';

// ── 儲存 key ──
function storageKey(uid: string) {
  return `pump-monitor-settings-${uid}`;
}

/** 使用者設定（需要持久化/個人化的部分） */
interface UserSettings {
  selectedStations: string[];
  stationOrder: string[];
  stationAlarmLevels: Record<string, number>;
  stationAlarmAudios: Record<string, string>;
  biometricEnabled: boolean;
  backgroundIntervalSec: number;
  stationGateAlarmSwitches: Record<string, GateAlarmSwitches>;
  stationTideAlarmSwitches: Record<string, TideAlarmSwitch>;
  monitoringEnabled: boolean;
  darkMode: boolean;
}

const DEFAULT_USER_SETTINGS: UserSettings = {
  selectedStations: DEFAULT_SELECTED,
  stationOrder: [],
  stationAlarmLevels: {},
  stationAlarmAudios: {},
  biometricEnabled: false,
  backgroundIntervalSec: DEFAULT_BACKGROUND_INTERVAL_SEC,
  stationGateAlarmSwitches: {},
  stationTideAlarmSwitches: {},
  monitoringEnabled: true,
  darkMode: false,
};

export interface AppStore {
  // ── 登入 ──
  isLoggedIn: boolean;
  setIsLoggedIn: (v: boolean) => void;
  currentUid: string | null;

  // ── 頁面 ──
  page: PageState;
  setPage: (page: PageState) => void;

  // ── 資料 ──
  stationData: PumpStationData[];
  lastUpdateTime: string | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  fetchError: string | null;
  setStationData: (data: PumpStationData[]) => void;
  setLoading: (v: boolean) => void;
  setInitialLoading: (v: boolean) => void;
  setFetchError: (err: string | null) => void;

  // ── 使用者設定 ──
  selectedStations: string[];
  stationOrder: string[];
  stationAlarmLevels: Record<string, number>;
  stationAlarmAudios: Record<string, string>;
  biometricEnabled: boolean;
  backgroundIntervalSec: number;
  stationGateAlarmSwitches: Record<string, GateAlarmSwitches>;
  stationTideAlarmSwitches: Record<string, TideAlarmSwitch>;

  setSelectedStations: (ids: string[]) => void;
  setStationOrder: (order: string[]) => void;
  setStationAlarmLevel: (stationno: string, level: number) => void;
  setStationAlarmAudio: (stationno: string, base64: string) => void;
  clearStationAlarmAudio: (stationno: string) => void;
  setBiometricEnabled: (v: boolean) => void;
  setBackgroundIntervalSec: (sec: number) => void;
  setStationGateAlarmSwitch: (stationno: string, switches: GateAlarmSwitches) => void;
  setStationTideAlarmSwitch: (stationno: string, switches: TideAlarmSwitch) => void;

  /** 監控啟停 */
  monitoringEnabled: boolean;
  setMonitoringEnabled: (v: boolean) => void;

  /** 夜間暗色模式 */
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;

  /** 載入指定使用者的設定（登入成功時呼叫） */
  loadUserSettings: (uid: string) => void;
  /** 儲存目前使用者的設定 */
  saveUserSettings: () => void;
  /** 清除記憶體中的使用者設定（登出時呼叫） */
  clearUserSettings: () => void;

  // ── 警報狀態 ──
  alarmingStations: StationAlarmInfo[];
  isAlarming: boolean;
  previousPumpMap: Record<string, PumpStatusMap>;
  lastAlarmedLevels: Record<string, number | null>;
  testAlarmStationNos: string[];
  /** 各站最後關閉警報的時間戳（冷卻用，與 Java 端 10 分鐘同步） */
  alarmDismissTimestamps: Record<string, number>;
  /** 全部確認的時間戳（全域冷卻） */
  lastFullDismissTime: number;

  checkAlarm: (data: PumpStationData[]) => void;
  dismissStationAlarm: (stationno: string) => void;
  dismissAllAlarms: () => void;
  simulateAlarm: () => void;

  // ── 潮汐狀態 ──
  tideBuffer: Record<string, { time: number; level: number }[]>;
  tideDirection: Record<string, TideDirection>;
  lastTideCheckTime: number;

  recordLevelOut: (stationno: string, rectime: string, levelOut: number | null) => void;
  /** 改用 GetAutoPumpWaterMins API 資料做潮汐判斷（shinshun 5 筆多數決法） */
  updateTide: (tideRecords: Record<string, TideRecord[]>) => void;
}

function buildPumpMap(pumps: { id: number; status: PumpStatus }[]): PumpStatusMap {
  const map: PumpStatusMap = {};
  for (const p of pumps) {
    map[p.id] = p.status;
  }
  return map;
}

export const useStore = create<AppStore>()((set, get) => ({
  // ── 登入 ──
  isLoggedIn: false,
  setIsLoggedIn: (isLoggedIn) => set({ isLoggedIn }),
  currentUid: null,

  // ── 頁面 ──
  page: 'main',
  setPage: (page) => set({ page }),

  // ── 資料 ──
  stationData: [],
  lastUpdateTime: null,
  isLoading: false,
  isInitialLoading: true,
  fetchError: null,
  setStationData: (data) =>
    set({
      stationData: data,
      lastUpdateTime: new Date().toLocaleString('zh-TW'),
      isInitialLoading: false,
      fetchError: null,
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialLoading: (isInitialLoading) => set({ isInitialLoading }),
  setFetchError: (fetchError) => set({ fetchError, isInitialLoading: false }),

  // ── 使用者設定（初始為預設值） ──
  ...DEFAULT_USER_SETTINGS,

  setSelectedStations: (selectedStations) => set({ selectedStations }),
  setStationOrder: (stationOrder) => set({ stationOrder }),
  setStationAlarmLevel: (stationno, level) =>
    set((s) => ({
      stationAlarmLevels: { ...s.stationAlarmLevels, [stationno]: level },
    })),
  setStationAlarmAudio: (stationno, base64) =>
    set((s) => ({
      stationAlarmAudios: { ...s.stationAlarmAudios, [stationno]: base64 },
    })),
  clearStationAlarmAudio: (stationno) =>
    set((s) => {
      const next = { ...s.stationAlarmAudios };
      delete next[stationno];
      return { stationAlarmAudios: next };
    }),
  setBiometricEnabled: (biometricEnabled) => set({ biometricEnabled }),
  setBackgroundIntervalSec: (backgroundIntervalSec) => set({ backgroundIntervalSec }),
  setStationGateAlarmSwitch: (stationno, switches) =>
    set((s) => ({
      stationGateAlarmSwitches: { ...s.stationGateAlarmSwitches, [stationno]: switches },
    })),
  setStationTideAlarmSwitch: (stationno, switches) =>
    set((s) => ({
      stationTideAlarmSwitches: { ...s.stationTideAlarmSwitches, [stationno]: switches },
    })),

  loadUserSettings: (uid) => {
    try {
      const raw = localStorage.getItem(storageKey(uid));
      if (raw) {
        const data = JSON.parse(raw) as Partial<UserSettings>;
        set({
          currentUid: uid,
          selectedStations: data.selectedStations ?? DEFAULT_SELECTED,
          stationOrder: data.stationOrder ?? [],
          stationAlarmLevels: data.stationAlarmLevels ?? {},
          stationAlarmAudios: data.stationAlarmAudios ?? {},
          biometricEnabled: data.biometricEnabled ?? false,
          backgroundIntervalSec: data.backgroundIntervalSec ?? DEFAULT_BACKGROUND_INTERVAL_SEC,
          stationGateAlarmSwitches: data.stationGateAlarmSwitches ?? {},
          stationTideAlarmSwitches: data.stationTideAlarmSwitches ?? {},
          monitoringEnabled: data.monitoringEnabled ?? true,
          darkMode: data.darkMode ?? false,
        });
      } else {
        // 首次登入，使用預設值
        set({ currentUid: uid, ...DEFAULT_USER_SETTINGS });
      }
    } catch {
      set({ currentUid: uid, ...DEFAULT_USER_SETTINGS });
    }
  },

  saveUserSettings: () => {
    const { currentUid, selectedStations, stationOrder, stationAlarmLevels, stationAlarmAudios, biometricEnabled, backgroundIntervalSec, stationGateAlarmSwitches, stationTideAlarmSwitches, monitoringEnabled, darkMode } = get();
    if (!currentUid) return;
    const payload: UserSettings = {
      selectedStations,
      stationOrder,
      stationAlarmLevels,
      stationAlarmAudios,
      biometricEnabled,
      backgroundIntervalSec,
      stationGateAlarmSwitches,
      stationTideAlarmSwitches,
      monitoringEnabled,
      darkMode,
    };
    try {
      localStorage.setItem(storageKey(currentUid), JSON.stringify(payload));
    } catch {
      // localStorage 滿了或不可用，靜默忽略
    }
  },

  clearUserSettings: () => {
    set({
      currentUid: null,
      ...DEFAULT_USER_SETTINGS,
    });
  },

  // ── 警報 ──
  alarmingStations: [],
  isAlarming: false,
  previousPumpMap: {},
  lastAlarmedLevels: {},
  testAlarmStationNos: [],
  alarmDismissTimestamps: {},
  lastFullDismissTime: 0,
  monitoringEnabled: true,

  checkAlarm: (data) => {
    const state = get();
    const ALARM_COOLDOWN_MS = 10 * 60 * 1000; // 10 分鐘（與 Java 端同步）
    const now = Date.now();

    // ── 監控停用：清空所有警報、停止音效、重設追蹤狀態 ──
    if (!state.monitoringEnabled) {
      if (state.alarmingStations.length > 0) {
        stopAllAlarms();
        dismissBackgroundAlarm();
      }
      set({
        alarmingStations: [],
        isAlarming: false,
        testAlarmStationNos: [],
        previousPumpMap: {},
        lastAlarmedLevels: {},
      });
      return;
    }

    const { selectedStations, stationAlarmLevels, stationGateAlarmSwitches, previousPumpMap, lastAlarmedLevels,
            alarmDismissTimestamps, lastFullDismissTime } = state;
    const newAlarming: StationAlarmInfo[] = [];
    const newPumpMap: Record<string, PumpStatusMap> = {};
    const newLastAlarmed = { ...lastAlarmedLevels };
    const prevAlarmingNos = new Set(state.alarmingStations.map((a) => a.stationno));

    for (const station of data) {
      if (!selectedStations.includes(station.stationno)) continue;

      const reasons: AlarmReason[] = [];
      const alarmThreshold = stationAlarmLevels[station.stationno] ?? DEFAULT_ALARM_LEVEL;
      const prevLevel = newLastAlarmed[station.stationno] ?? null;

      // ── 冷卻檢查：10 分鐘內關閉過的警報不重響（但 pump 狀態仍要記錄） ──
      const stationDismissTs = alarmDismissTimestamps[station.stationno] ?? 0;
      const inCooldown = (now - Math.max(stationDismissTs, lastFullDismissTime)) < ALARM_COOLDOWN_MS;
      const isCurrentlyAlarming = prevAlarmingNos.has(station.stationno);

      // 冷卻中 + 尚未在警報中 → 跳過水位/機組/閘門檢查
      const skipAlarmChecks = inCooldown && !isCurrentlyAlarming;

      // ── 水位檢查（智慧觸發） ──
      const levelIn = station.level_in;
      if (!skipAlarmChecks && levelIn !== null && levelIn > alarmThreshold) {
        let shouldAlarm = false;

        if (prevLevel === null) {
          shouldAlarm = true;
          newLastAlarmed[station.stationno] = levelIn;
        } else if (levelIn >= prevLevel + 0.1) {
          shouldAlarm = true;
          newLastAlarmed[station.stationno] = levelIn;
        }

        if (shouldAlarm) {
          reasons.push({
            type: 'water_level',
            detail: `水位 ${levelIn.toFixed(2)}m 超過警報值 ${alarmThreshold.toFixed(2)}m`,
          });
        }
      } else {
        newLastAlarmed[station.stationno] = null;
      }

      // ── Pump 變化檢查（冷卻中只記錄狀態，不觸發警報） ──
      const prevPumps = previousPumpMap[station.stationno] ?? {};
      const currPumpMap = buildPumpMap(station.pumps);
      newPumpMap[station.stationno] = currPumpMap;

      if (!skipAlarmChecks) {
        for (const pump of station.pumps) {
          const prev = prevPumps[pump.id];
          const isRunning = pump.status === '1' || pump.status === '2' || pump.status === '3';
          const wasRunning = prev === '1' || prev === '2' || prev === '3';

          if (prev === '0' && isRunning) {
            reasons.push({
              type: 'pump_start',
              detail: `#${pump.id} 抽水機${PUMP_STATUS_LABEL[pump.status]}`,
              pumpId: pump.id,
            });
          } else if (wasRunning && pump.status === '0') {
            reasons.push({ type: 'pump_stop', detail: `#${pump.id} 抽水機停止`, pumpId: pump.id });
          }
        }

        // ── 閘門警報檢查 ──
        const gateSwitches = stationGateAlarmSwitches[station.stationno];
        const levelOut = station.level_out;

        if (gateSwitches && levelIn !== null && levelOut !== null) {
          const allDoorsClosed = station.doors.length > 0 && station.doors.every(d => d.status === '1');

          if (gateSwitches.innerHighAlarm && levelIn > levelOut && allDoorsClosed) {
            reasons.push({
              type: 'gate_high_inner',
              detail: `內水位 ${levelIn.toFixed(2)}m 高於外水位 ${levelOut.toFixed(2)}m，閘門全閉`,
            });
          }
        }
      }

      if (reasons.length > 0) {
        newAlarming.push({ stationno: station.stationno, stationName: station.stationName, reasons });
      } else if (prevAlarmingNos.has(station.stationno)) {
        // ── 保留仍在警報條件中的既有警報 ──
        const prevAlarm = state.alarmingStations.find(a => a.stationno === station.stationno);
        if (prevAlarm) {
          const hasWaterAlarm = station.level_in !== null && station.level_in > alarmThreshold;
          const hadWaterReason = prevAlarm.reasons.some(r => r.type === 'water_level');
          const hadPumpReason = prevAlarm.reasons.some(r => r.type === 'pump_start' || r.type === 'pump_stop');
          const hadGateReason = prevAlarm.reasons.some(r => r.type === 'gate_high_inner' || r.type === 'gate_low_inner');
          const hadTideReason = prevAlarm.reasons.some(r => r.type === 'tide_open_gate' || r.type === 'tide_close_gate');

          let keep = (hadWaterReason && hasWaterAlarm) || hadPumpReason || hadTideReason;
          if (hadGateReason) {
            const gateSwitches2 = stationGateAlarmSwitches[station.stationno];
            if (gateSwitches2) {
              const li = station.level_in;
              const lo = station.level_out;
              const allClosed = station.doors.length > 0 && station.doors.every(d => d.status === '1');
              keep = keep ||
                (gateSwitches2.innerHighAlarm && li !== null && lo !== null && li > lo && allClosed);
            }
          }
          if (keep) {
            newAlarming.push(prevAlarm);
          }
        }
      }
    }

    // ── 測試警報合併（確保測試警報不被輪詢覆蓋） ──
    for (const testNo of state.testAlarmStationNos) {
      if (!newAlarming.some(a => a.stationno === testNo)) {
        const testAlarm = state.alarmingStations.find(a => a.stationno === testNo);
        if (testAlarm) {
          newAlarming.push(testAlarm);
        }
      }
    }

    // ── 音頻管理 ──
    const newNos = new Set(newAlarming.map((a) => a.stationno));
    for (const alarm of newAlarming) {
      if (!prevAlarmingNos.has(alarm.stationno)) {
        playStationAlarm(alarm.stationno, DEFAULT_ALARM_AUDIO_URL);
      }
    }
    for (const prevNo of prevAlarmingNos) {
      if (!newNos.has(prevNo)) stopStationAlarm(prevNo);
    }

    set({
      alarmingStations: newAlarming,
      isAlarming: newAlarming.length > 0,
      previousPumpMap: newPumpMap,
      lastAlarmedLevels: newLastAlarmed,
    });
  },

  dismissStationAlarm: (stationno) => {
    const now = Date.now();
    stopStationAlarm(stationno);
    set((s) => {
      const next = s.alarmingStations.filter((a) => a.stationno !== stationno);
      return {
        alarmingStations: next,
        isAlarming: next.length > 0,
        testAlarmStationNos: s.testAlarmStationNos.filter(n => n !== stationno),
        alarmDismissTimestamps: { ...s.alarmDismissTimestamps, [stationno]: now },
      };
    });
    // 如果全部解除，通知背景服務停止警報音
    if (get().alarmingStations.length === 0) {
      dismissBackgroundAlarm();
    }
  },

  dismissAllAlarms: () => {
    const now = Date.now();
    const state = get();
    // 記錄所有目前警報中的站點關閉時間
    const dismissTs: Record<string, number> = {};
    for (const a of state.alarmingStations) {
      dismissTs[a.stationno] = now;
    }
    stopAllAlarms();
    set({
      alarmingStations: [],
      isAlarming: false,
      testAlarmStationNos: [],
      alarmDismissTimestamps: { ...state.alarmDismissTimestamps, ...dismissTs },
      lastFullDismissTime: now,
    });
    dismissBackgroundAlarm();
  },

  setMonitoringEnabled: (v) => set({ monitoringEnabled: v }),

  setDarkMode: (darkMode) => set({ darkMode }),

  simulateAlarm: () => {
    const state = get();
    const { stationData } = state;
    const targets = stationData
      .filter((s) => state.selectedStations.includes(s.stationno))
      .slice(0, Math.min(3, stationData.length));
    if (targets.length === 0) return;

    const simulated: StationAlarmInfo[] = targets.map((s) => ({
      stationno: s.stationno,
      stationName: s.stationName,
      reasons: [
        { type: 'water_level', detail: `模擬：水位 ${(Math.random() * 2 + 1).toFixed(2)}m` },
        { type: 'pump_start', detail: `#1 抽水機啟動`, pumpId: 1 },
      ],
    }));

    const newLastAlarmed = { ...state.lastAlarmedLevels };
    for (const s of targets) newLastAlarmed[s.stationno] = 99;

    for (const alarm of simulated) {
      playStationAlarm(alarm.stationno, DEFAULT_ALARM_AUDIO_URL);
    }
    set({ alarmingStations: simulated, isAlarming: true, lastAlarmedLevels: newLastAlarmed, testAlarmStationNos: targets.map(s => s.stationno) });
  },

  // ── 潮汐 ──
  tideBuffer: {},
  tideDirection: {},
  lastTideCheckTime: 0,

  /** 記錄 level_out 到滾動 buffer */
  recordLevelOut: (stationno, rectime, levelOut) => {
    if (levelOut === null) return;
    if (!TIDE_STATIONS.includes(stationno)) return;

    // 解析 rectime → timestamp
    const m = rectime.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (!m) return;
    const time = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();

    set((s) => {
      const buffer = [...(s.tideBuffer[stationno] ?? [])];
      // 去重：同時間已有則跳過
      if (buffer.some(d => d.time === time)) return s;
      buffer.push({ time, level: levelOut });
      // 保留最近 4 小時（寬裕）
      const cutoff = Date.now() - 4 * 60 * 60 * 1000;
      const trimmed = buffer.filter(d => d.time >= cutoff);
      return { tideBuffer: { ...s.tideBuffer, [stationno]: trimmed } };
    });
  },

  /** 潮汐方向判斷（shinshun 5 筆多數決法）+ 閘門啟閉警報
   *  新生(112) & 建國(110) 以新生的 level_out 決定潮汐方向
   *  中山(108) 以自己的 level_out 獨立判斷
   *  每 10 分鐘由 usePumpData 觸發 */
  updateTide: (tideRecords) => {
    const state = get();
    const { tideDirection: prevDirections, stationTideAlarmSwitches, selectedStations } = state;
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

    // ── 閘門啟閉警報（各站用自己的水位 & 閘門，但潮汐方向如上決定） ──
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
          }
        }
      } else if (newDir === 'rising') {
        const cond1 = (pi2_lo === pi_lo && pi_lo === ni_lo);
        const cond2 = (pi2_lo === pi_lo && ni_lo > pi_lo);
        if (cond1 || cond2) {
          const doorCols = TIDE_DOOR_COLS[stationNo] ?? [];
          const anyOpen = doorCols.some(d => newest.doors[d] === '2');
          if (anyOpen) {
            tideReasons.push({
              stationno: stationNo,
              stationName,
              reasons: [{ type: 'tide_close_gate', detail: '漲潮中外水位上升或持平，建議關閉閘門防止河水倒灌' }],
            });
          }
        }
      }
    }

    // 合併潮汐警報到現有警報列表
    const existingAlarms = state.alarmingStations.filter(a =>
      !a.reasons.some(r => r.type === 'tide_open_gate' || r.type === 'tide_close_gate')
    );

    // 保留本週期未重新產生的既有潮汐警報（使用者尚未確認則持續顯示）
    const currentTideNos = new Set(tideReasons.map(t => t.stationno));
    for (const existing of state.alarmingStations) {
      if (existing.reasons.some(r => r.type === 'tide_open_gate' || r.type === 'tide_close_gate') &&
          !currentTideNos.has(existing.stationno)) {
        tideReasons.push(existing);
      }
    }

    const newAlarming = [...existingAlarms, ...tideReasons];

    // 播放新警報音
    const prevNos = new Set(state.alarmingStations.map(a => a.stationno));
    for (const alarm of tideReasons) {
      if (!prevNos.has(alarm.stationno)) {
        playStationAlarm(alarm.stationno, DEFAULT_ALARM_AUDIO_URL);
      }
    }

    set({
      tideDirection: newDirections,
      lastTideCheckTime: Date.now(),
      alarmingStations: newAlarming,
      isAlarming: newAlarming.length > 0,
    });
  },
}));

// ── 自動儲存：監聽 store 變化，每當使用者設定變更時自動存檔 ──
let saveTimer: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    // 只有登入中才儲存
    if (state.currentUid) {
      const payload: UserSettings = {
        selectedStations: state.selectedStations,
        stationOrder: state.stationOrder,
        stationAlarmLevels: state.stationAlarmLevels,
        stationAlarmAudios: state.stationAlarmAudios,
        biometricEnabled: state.biometricEnabled,
        backgroundIntervalSec: state.backgroundIntervalSec,
        stationGateAlarmSwitches: state.stationGateAlarmSwitches,
        stationTideAlarmSwitches: state.stationTideAlarmSwitches,
        monitoringEnabled: state.monitoringEnabled,
        darkMode: state.darkMode,
      };
      try {
        localStorage.setItem(storageKey(state.currentUid), JSON.stringify(payload));
      } catch { /* ignore */ }
    }
  }, 500); // 防抖 500ms
});