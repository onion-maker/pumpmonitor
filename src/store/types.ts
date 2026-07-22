/**
 * AppStore — 完整 store 型別定義
 * 由 5 個 slice 介面組合而成
 */
import type { AuthSlice } from './slices/authSlice';
import type { DataSlice } from './slices/dataSlice';
import type { SettingsSlice } from './slices/settingsSlice';
import type { TideSlice } from './slices/tideSlice';
import type { AlarmSlice } from './slices/alarmSlice';

export type AppStore = AuthSlice & DataSlice & SettingsSlice & TideSlice & AlarmSlice;