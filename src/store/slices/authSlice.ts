/**
 * Auth slice — 登入狀態、使用者設定載入/儲存/清除
 */
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import { getTideOperationLogs, registerFcmToken } from '../../utils/backgroundAlarm';
import { loadCachedStationData } from '../useStore';
import type { TideLogEntry } from '../../types';

export interface AuthSlice {
  isLoggedIn: boolean;
  setIsLoggedIn: (v: boolean) => void;
  currentUid: string | null;
  page: 'main' | 'settings';
  setPage: (page: 'main' | 'settings') => void;
  loadUserSettings: (uid: string) => void;
  saveUserSettings: () => void;
  clearUserSettings: () => void;
}

function storageKey(uid: string) {
  return `pump-monitor-settings-${uid}`;
}

export const createAuthSlice: StateCreator<AppStore, [], [], AuthSlice> = (set, get) => ({
  isLoggedIn: false,
  setIsLoggedIn: (isLoggedIn) => set({ isLoggedIn }),
  currentUid: null,
  page: 'main',
  setPage: (page) => set({ page }),

  loadUserSettings: async (uid) => {
    try {
      const raw = localStorage.getItem(storageKey(uid));
      if (raw) {
        const data = JSON.parse(raw);
        // 合併 native 背景服務記錄的潮汐方向變化，以 timestamp 排序、去重、只保留最後 500 筆
        let mergedTideLogs: TideLogEntry[] = (data.tideOperationLog ?? []);
        try {
          const nativeTideLogs = getTideOperationLogs();
          if (nativeTideLogs.length > 0) {
            const seen = new Set<number>();
            for (const entry of mergedTideLogs) seen.add(entry.timestamp);
            for (const entry of nativeTideLogs) {
              if (!seen.has(entry.timestamp)) {
                mergedTideLogs.push(entry as TideLogEntry);
                seen.add(entry.timestamp);
              }
            }
            mergedTideLogs.sort((a, b) => a.timestamp - b.timestamp);
            mergedTideLogs = mergedTideLogs.slice(-500);
          }
        } catch { /* native bridge 不可用則略過 */ }
        set({
          currentUid: uid,
          selectedStations: data.selectedStations ?? get().selectedStations,
          stationOrder: data.stationOrder ?? [],
          stationAlarmLevels: data.stationAlarmLevels ?? {},
          stationAlarmAudios: data.stationAlarmAudios ?? {},
          biometricEnabled: data.biometricEnabled ?? false,
          backgroundIntervalSec: data.backgroundIntervalSec ?? 120,
          stationGateAlarmSwitches: data.stationGateAlarmSwitches ?? {},
          stationTideAlarmSwitches: data.stationTideAlarmSwitches ?? {},
          monitoringEnabled: data.monitoringEnabled ?? true,
          darkMode: data.darkMode ?? false,
          pumpOperationLog: (data.pumpOperationLog ?? []).slice(-500),
          gateOperationLog: (data.gateOperationLog ?? []).slice(-500),
          tideOperationLog: mergedTideLogs,
          previousPumpMap: data.previousPumpMap ?? {},
          previousDoorMap: data.previousDoorMap ?? {},
        });
      } else {
        set({ currentUid: uid });
      }

      // ── 冷啟動快取：還原上次的站點資料，讓 MainPage 秒開 ⚡ ──
      const cached = loadCachedStationData(uid);
      if (cached && cached.length > 0) {
        set({ stationData: cached, isInitialLoading: false });
      }

      // 登入後註冊 FCM token
      await registerFcmToken(uid);
    } catch {
      set({ currentUid: uid });
    }
  },

  saveUserSettings: () => {
    const s = get();
    if (!s.currentUid) return;
    const payload = {
      selectedStations: s.selectedStations,
      stationOrder: s.stationOrder,
      stationAlarmLevels: s.stationAlarmLevels,
      stationAlarmAudios: s.stationAlarmAudios,
      biometricEnabled: s.biometricEnabled,
      backgroundIntervalSec: s.backgroundIntervalSec,
      stationGateAlarmSwitches: s.stationGateAlarmSwitches,
      stationTideAlarmSwitches: s.stationTideAlarmSwitches,
      monitoringEnabled: s.monitoringEnabled,
      darkMode: s.darkMode,
      pumpOperationLog: s.pumpOperationLog,
      gateOperationLog: s.gateOperationLog,
      tideOperationLog: s.tideOperationLog,
      previousPumpMap: s.previousPumpMap,
      previousDoorMap: s.previousDoorMap,
    };
    try {
      localStorage.setItem(storageKey(s.currentUid), JSON.stringify(payload));
    } catch { /* ignore */ }
  },

  clearUserSettings: () => {
    // 登出時保留 currentUid 和 biometricEnabled，讓下次指紋辨識可以直接復原使用者設定
    set({});
  },
});