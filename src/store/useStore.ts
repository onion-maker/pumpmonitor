/**
 * pumpmonitor Zustand store — slice pattern 組裝
 *
 * 將功能拆分為 5 個 slice：
 *   authSlice — 登入、使用者設定載入/儲存
 *   dataSlice — API 資料狀態
 *   settingsSlice — 使用者個人化設定
 *   tideSlice — 潮汐判斷 + 閘門啟閉警報
 *   alarmSlice — 警報檢查、關閉、操作紀錄
 */
import { create } from 'zustand';
import type { AppStore } from './types';
import { createAuthSlice } from './slices/authSlice';
import { createDataSlice } from './slices/dataSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createTideSlice } from './slices/tideSlice';
import { createAlarmSlice } from './slices/alarmSlice';

export const useStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createDataSlice(...a),
  ...createSettingsSlice(...a),
  ...createTideSlice(...a),
  ...createAlarmSlice(...a),
}));

// ── 自動儲存：監聽 store 變化，使用者設定變更時 debounce 存檔 ──
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function storageKey(uid: string) {
  return `pump-monitor-settings-${uid}`;
}

useStore.subscribe((state) => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!state.currentUid) return;
    const payload = {
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
      pumpOperationLog: state.pumpOperationLog,
      gateOperationLog: state.gateOperationLog,
    };
    try {
      localStorage.setItem(storageKey(state.currentUid), JSON.stringify(payload));
    } catch { /* ignore */ }
  }, 500);
});

export type { AppStore } from './types';