/**
 * Settings slice — 使用者個人化設定
 */
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { GateAlarmSwitches, TideAlarmSwitch } from '../../types';
import { DEFAULT_SELECTED, DEFAULT_BACKGROUND_INTERVAL_SEC } from '../../config/stations';

export interface SettingsSlice {
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

  setSelectedStations: (ids: string[]) => void;
  setStationOrder: (order: string[]) => void;
  setStationAlarmLevel: (stationno: string, level: number) => void;
  setStationAlarmAudio: (stationno: string, base64: string) => void;
  clearStationAlarmAudio: (stationno: string) => void;
  setBiometricEnabled: (v: boolean) => void;
  setBackgroundIntervalSec: (sec: number) => void;
  setStationGateAlarmSwitch: (stationno: string, switches: GateAlarmSwitches) => void;
  setStationTideAlarmSwitch: (stationno: string, switches: TideAlarmSwitch) => void;
  setMonitoringEnabled: (v: boolean) => void;
  setDarkMode: (v: boolean) => void;
}

export const createSettingsSlice: StateCreator<AppStore, [], [], SettingsSlice> = (set) => ({
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

  setSelectedStations: (ids) => set({ selectedStations: ids }),
  setStationOrder: (order) => set({ stationOrder: order }),
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
  setBiometricEnabled: (v) => set({ biometricEnabled: v }),
  setBackgroundIntervalSec: (sec) => set({ backgroundIntervalSec: sec }),
  setStationGateAlarmSwitch: (stationno, switches) =>
    set((s) => ({
      stationGateAlarmSwitches: { ...s.stationGateAlarmSwitches, [stationno]: switches },
    })),
  setStationTideAlarmSwitch: (stationno, switches) =>
    set((s) => ({
      stationTideAlarmSwitches: { ...s.stationTideAlarmSwitches, [stationno]: switches },
    })),
  setMonitoringEnabled: (v) => {
    set({ monitoringEnabled: v });
    // 立即同步至 Android 端
    try {
      const bridge = (window as any).AndroidPump;
      if (bridge && typeof bridge.syncSettingsToNative === 'function') {
        bridge.syncSettingsToNative(JSON.stringify({ monitoringEnabled: v }));
      }
    } catch { /* ignore */ }
  },
  setDarkMode: (v) => set({ darkMode: v }),
});