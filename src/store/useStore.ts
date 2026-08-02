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

// ── 自動儲存：監聽 store 變化，僅使用者設定變更時 debounce 存檔 ──
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSavedSnapshot = '';
const SAVE_KEYS = [
  'selectedStations', 'stationOrder', 'stationAlarmLevels', 'stationAlarmAudios',
  'biometricEnabled', 'backgroundIntervalSec', 'stationGateAlarmSwitches',
  'stationTideAlarmSwitches', 'monitoringEnabled', 'darkMode',
  'pumpOperationLog', 'gateOperationLog', 'previousPumpMap', 'previousDoorMap',
  'tideOperationLog',
] as const;

/** 冷啟動站點資料快取 — 與設定儲存分離，避免每 30 秒輪詢都觸發寫入 */
import type { PumpStationData } from '../types';

const CACHE_DATA_VERSION = 1;

function cacheDataKey(uid: string) {
  return `pump-monitor-cache-data-${uid}`;
}

export function loadCachedStationData(uid: string): PumpStationData[] | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(cacheDataKey(uid));
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (cache.version !== CACHE_DATA_VERSION) return null;
    if (!Array.isArray(cache.stationData) || cache.stationData.length === 0) return null;
    return cache.stationData.map((item: any) => ({
      ...item,
      rectime: item.rectime ? new Date(item.rectime) : null,
    })) as PumpStationData[];
  } catch {
    return null;
  }
}

export function saveCachedStationData(uid: string, stationData: PumpStationData[]): void {
  if (!uid || stationData.length === 0) return;
  try {
    const payload = { version: CACHE_DATA_VERSION, stationData };
    const raw = JSON.stringify(payload);
    if (raw.length > 3 * 1024 * 1024) return;
    localStorage.setItem(cacheDataKey(uid), raw);
  } catch { /* ignore */ }
}

function storageKey(uid: string) {
  return `pump-monitor-settings-${uid}`;
}

useStore.subscribe((state) => {
  if (!state.currentUid) return;
  // 只取需要 persist 的欄位做 lightweight diff，避免每次 stationData 更新都 trigger save
  const partial: Record<string, unknown> = {};
  for (const k of SAVE_KEYS) partial[k] = state[k as keyof typeof state];
  const snap = JSON.stringify(partial);
  if (snap === lastSavedSnapshot) return;
  lastSavedSnapshot = snap;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = useStore.getState();
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
      const raw = JSON.stringify(payload);
      // 安全閥：payload 超過 3MB 時，移除自訂音頻（base64 可能過大）以保護 localStorage 上限
      if (raw.length > 3 * 1024 * 1024 && Object.keys(payload.stationAlarmAudios).length > 0) {
        console.warn('[pumpmonitor] localStorage payload 超過 3MB，跳過自訂音頻儲存');
        const slim = { ...payload, stationAlarmAudios: {} };
        localStorage.setItem(storageKey(s.currentUid), JSON.stringify(slim));
        return;
      }
      localStorage.setItem(storageKey(s.currentUid), raw);
    } catch { /* ignore */ }
  }, 500);
});

export type { AppStore } from './types';