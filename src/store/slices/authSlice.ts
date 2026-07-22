/**
 * Auth slice — 登入狀態、使用者設定載入/儲存/清除
 */
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';

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

  loadUserSettings: (uid) => {
    try {
      const raw = localStorage.getItem(storageKey(uid));
      if (raw) {
        const data = JSON.parse(raw);
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
          pumpOperationLog: data.pumpOperationLog ?? [],
          gateOperationLog: data.gateOperationLog ?? [],
        });
      } else {
        set({ currentUid: uid });
      }
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
    };
    try {
      localStorage.setItem(storageKey(s.currentUid), JSON.stringify(payload));
    } catch { /* ignore */ }
  },

  clearUserSettings: () => {
    set({ currentUid: null });
  },
});