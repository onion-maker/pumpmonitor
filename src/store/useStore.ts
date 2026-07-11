import { create } from 'zustand';
import type {
  PumpStationData,
  PageState,
  StationAlarmInfo,
  AlarmReason,
  PumpStatusMap,
  PumpStatus,
} from '../types';
import { DEFAULT_SELECTED, DEFAULT_ALARM_LEVEL, DEFAULT_ALARM_AUDIO_URL, PUMP_STATUS_LABEL } from '../config/stations';
import { playStationAlarm, stopStationAlarm, stopAllAlarms } from '../utils/audio';

// ── 儲存 key ──
function storageKey(uid: string) {
  return `pump-monitor-settings-${uid}`;
}

/** 使用者設定（需要持久化/個人化的部分） */
interface UserSettings {
  selectedStations: string[];
  stationAlarmLevels: Record<string, number>;
  stationAlarmAudios: Record<string, string>;
  biometricEnabled: boolean;
}

const DEFAULT_USER_SETTINGS: UserSettings = {
  selectedStations: DEFAULT_SELECTED,
  stationAlarmLevels: {},
  stationAlarmAudios: {},
  biometricEnabled: false,
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
  stationAlarmLevels: Record<string, number>;
  stationAlarmAudios: Record<string, string>;
  biometricEnabled: boolean;

  setSelectedStations: (ids: string[]) => void;
  setStationAlarmLevel: (stationno: string, level: number) => void;
  setStationAlarmAudio: (stationno: string, base64: string) => void;
  clearStationAlarmAudio: (stationno: string) => void;
  setBiometricEnabled: (v: boolean) => void;

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

  loadUserSettings: (uid) => {
    try {
      const raw = localStorage.getItem(storageKey(uid));
      if (raw) {
        const data = JSON.parse(raw) as Partial<UserSettings>;
        set({
          currentUid: uid,
          selectedStations: data.selectedStations ?? DEFAULT_SELECTED,
          stationAlarmLevels: data.stationAlarmLevels ?? {},
          stationAlarmAudios: data.stationAlarmAudios ?? {},
          biometricEnabled: data.biometricEnabled ?? false,
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
    const { currentUid, selectedStations, stationAlarmLevels, stationAlarmAudios, biometricEnabled } = get();
    if (!currentUid) return;
    const payload: UserSettings = {
      selectedStations,
      stationAlarmLevels,
      stationAlarmAudios,
      biometricEnabled,
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
    const { selectedStations, stationAlarmLevels, previousPumpMap, lastAlarmedLevels } = state;
    const newAlarming: StationAlarmInfo[] = [];
    const newPumpMap: Record<string, PumpStatusMap> = {};
    const newLastAlarmed = { ...lastAlarmedLevels };
    const prevAlarmingNos = new Set(state.alarmingStations.map((a) => a.stationno));

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

      if (reasons.length > 0) {
        newAlarming.push({ stationno: station.stationno, stationName: station.stationName, reasons });
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
        stationAlarmLevels: state.stationAlarmLevels,
        stationAlarmAudios: state.stationAlarmAudios,
        biometricEnabled: state.biometricEnabled,
      };
      try {
        localStorage.setItem(storageKey(state.currentUid), JSON.stringify(payload));
      } catch { /* ignore */ }
    }
  }, 500); // 防抖 500ms
});