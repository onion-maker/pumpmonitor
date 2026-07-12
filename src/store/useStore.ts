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
import { TIDE_STATIONS, DEFAULT_SELECTED, DEFAULT_ALARM_LEVEL, DEFAULT_ALARM_AUDIO_URL, PUMP_STATUS_LABEL, DEFAULT_BACKGROUND_INTERVAL_SEC } from '../config/stations';
import { playStationAlarm, stopStationAlarm, stopAllAlarms } from '../utils/audio';

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

  checkAlarm: (data: PumpStationData[]) => void;
  dismissStationAlarm: (stationno: string) => void;
  dismissAllAlarms: () => void;
  simulateAlarm: () => void;

  // ── 潮汐狀態 ──
  tideBuffer: Record<string, { time: number; level: number }[]>;
  tideDirection: Record<string, TideDirection>;
  lastTideCheckTime: number;
  previousLevelOut: Record<string, number | null>;

  recordLevelOut: (stationno: string, rectime: string, levelOut: number | null) => void;
  checkTideAlarm: () => void;
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
    const { currentUid, selectedStations, stationOrder, stationAlarmLevels, stationAlarmAudios, biometricEnabled, backgroundIntervalSec, stationGateAlarmSwitches, stationTideAlarmSwitches } = get();
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

  checkAlarm: (data) => {
    const state = get();
    const { selectedStations, stationAlarmLevels, stationGateAlarmSwitches, stationTideAlarmSwitches, previousPumpMap, lastAlarmedLevels, tideDirection, previousLevelOut } = state;
    const newAlarming: StationAlarmInfo[] = [];
    const newPumpMap: Record<string, PumpStatusMap> = {};
    const newLastAlarmed = { ...lastAlarmedLevels };
    const prevAlarmingNos = new Set(state.alarmingStations.map((a) => a.stationno));
    const nextPrevLevelOut = { ...previousLevelOut };

    for (const station of data) {
      if (!selectedStations.includes(station.stationno)) continue;

      const reasons: AlarmReason[] = [];
      const level = stationAlarmLevels[station.stationno] ?? DEFAULT_ALARM_LEVEL;
      const prevLevel = newLastAlarmed[station.stationno] ?? null;

      // ── 水位檢查（智慧觸發） ──
      const levelIn = station.level_in;
      if (levelIn !== null && levelIn > level) {
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
            detail: `水位 ${levelIn.toFixed(2)}m 超過警報值 ${level.toFixed(2)}m`,
          });
        }
      } else {
        newLastAlarmed[station.stationno] = null;
      }

      // ── Pump 變化檢查 ──
      const prevPumps = previousPumpMap[station.stationno] ?? {};
      const currPumpMap = buildPumpMap(station.pumps);
      newPumpMap[station.stationno] = currPumpMap;

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

      // ── 潮汐站閘門啟閉提醒 ──
      const tideSwitch = stationTideAlarmSwitches[station.stationno];
      if (tideSwitch?.tideAlarm && TIDE_STATIONS.includes(station.stationno) && levelIn !== null && levelOut !== null) {
        const prevOut = previousLevelOut[station.stationno] ?? null;
        const direction = tideDirection[station.stationno] ?? 'slack';

        // 開閘門警報：外水 > 內水，退潮中，且外水從高於內水變低於或等於內水（交叉點）
        if (prevOut !== null && prevOut > levelIn && levelOut <= levelIn && direction === 'falling') {
          reasons.push({
            type: 'tide_open_gate',
            detail: `退潮中外水位 ${levelOut.toFixed(2)}m 已降至內水位 ${levelIn.toFixed(2)}m 以下，建議開啟閘門排水`,
          });
        }
      }

      // 記錄本輪外水位（供下輪交叉判斷用）
      if (levelOut !== null) {
        nextPrevLevelOut[station.stationno] = levelOut;
      }

      if (reasons.length > 0) {
        newAlarming.push({ stationno: station.stationno, stationName: station.stationName, reasons });
      } else if (prevAlarmingNos.has(station.stationno)) {
        // ── 保留仍在警報條件中的既有警報 ──
        const prevAlarm = state.alarmingStations.find(a => a.stationno === station.stationno);
        if (prevAlarm) {
          const hasWaterAlarm = station.level_in !== null && station.level_in > level;
          const hasRunningPump = station.pumps.some(p => p.status === '1' || p.status === '2' || p.status === '3');
          const hadWaterReason = prevAlarm.reasons.some(r => r.type === 'water_level');
          const hadPumpReason = prevAlarm.reasons.some(r => r.type === 'pump_start' || r.type === 'pump_stop');
          const hadGateReason = prevAlarm.reasons.some(r => r.type === 'gate_high_inner' || r.type === 'gate_low_inner');
          const hadTideReason = prevAlarm.reasons.some(r => r.type === 'tide_open_gate' || r.type === 'tide_close_gate');

          let keep = (hadWaterReason && hasWaterAlarm) || (hadPumpReason && hasRunningPump);
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
          if (hadTideReason) {
            // 潮汐警報只觸發一次，不自動保留（由 checkTideAlarm 重新產生）
            keep = false;
          }
          if (keep) {
            newAlarming.push(prevAlarm);
          }
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
      previousLevelOut: nextPrevLevelOut,
    });
  },

  dismissStationAlarm: (stationno) => {
    stopStationAlarm(stationno);
    set((s) => {
      const next = s.alarmingStations.filter((a) => a.stationno !== stationno);
      return { alarmingStations: next, isAlarming: next.length > 0 };
    });
  },

  dismissAllAlarms: () => {
    stopAllAlarms();
    set({ alarmingStations: [], isAlarming: false });
  },

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
    set({ alarmingStations: simulated, isAlarming: true, lastAlarmedLevels: newLastAlarmed });
  },

  // ── 潮汐 ──
  tideBuffer: {},
  tideDirection: {},
  lastTideCheckTime: 0,
  previousLevelOut: {},

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

  /** 潮汐方向判斷 + 關閘門警報（每 10 分鐘由 usePumpData 觸發） */
  checkTideAlarm: () => {
    const state = get();
    const { tideBuffer, tideDirection: prevDirections, stationTideAlarmSwitches, selectedStations } = state;
    const now = Date.now();
    const newDirections: Record<string, TideDirection> = { ...prevDirections };
    const tideReasons: StationAlarmInfo[] = [];

    for (const stationNo of TIDE_STATIONS) {
      if (!selectedStations.includes(stationNo)) continue;
      const tideSwitch = stationTideAlarmSwitches[stationNo];
      if (!tideSwitch?.tideAlarm) continue;

      const buffer = tideBuffer[stationNo] ?? [];
      const recent = buffer.slice(-3);
      if (recent.length < 3) {
        newDirections[stationNo] = 'slack';
        continue;
      }

      const [t2, t1, t] = recent.map(d => d.level);
      const prevDir = prevDirections[stationNo] ?? 'slack';
      let newDir: TideDirection = prevDir;

      if (t > t1 && t > t2) {
        newDir = 'rising';
      } else if (t < t1 && t < t2) {
        newDir = 'falling';
      }
      // 其他情況維持上次判定

      newDirections[stationNo] = newDir;

      // 關閘門警報：退潮 → 漲潮（趨勢反轉）
      if (prevDir === 'falling' && newDir === 'rising') {
        const stationData = state.stationData.find(s => s.stationno === stationNo);
        const stationName = stationData?.stationName ?? stationNo;
        tideReasons.push({
          stationno: stationNo,
          stationName,
          reasons: [{
            type: 'tide_close_gate',
            detail: '外水位已從退潮轉為漲潮，建議關閉閘門防止河水倒灌',
          }],
        });
      }
    }

    // 合併潮汐警報到現有警報列表
    const existingAlarms = state.alarmingStations.filter(a =>
      !a.reasons.some(r => r.type === 'tide_open_gate' || r.type === 'tide_close_gate')
    );
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
      lastTideCheckTime: now,
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
      };
      try {
        localStorage.setItem(storageKey(state.currentUid), JSON.stringify(payload));
      } catch { /* ignore */ }
    }
  }, 500); // 防抖 500ms
});