/**
 * 背景警報工具 — 與 Android 原生 PumpMonitorService 通訊
 *
 * 提供前端的設定同步、服務啟停，確保手機螢幕關閉時仍能收到警報通知。
 */

import type { GateAlarmSwitches, TideAlarmSwitch } from '../types';

const SERVER_BASE_URL = import.meta.env.VITE_SERVER_URL || '';

interface Bridge {
  startService: () => void;
  stopService: () => void;
  isServiceRunning: () => boolean;
  syncSettings: (json: string) => void;
  dismissAlarm: () => void;
  getOperationLogs: () => string;
  getTideOperationLogs: () => string;
  clearLogs: () => void;
  getDeviceInfo: () => string;
}

/** 取得 Android 原生橋接物件（不存在時回傳 null） */
function getBridge(): Bridge | null {
  try {
    return (window as any).AndroidPump ?? null;
  } catch {
    return null;
  }
}

/** 是否在 Android 原生環境中 */
export function isNative(): boolean {
  return getBridge() !== null;
}

/** 啟動背景服務 */
export function startBackgroundService(): void {
  const bridge = getBridge();
  if (bridge) {
    bridge.startService();
  }
}

/** 停止背景服務 */
export function stopBackgroundService(): void {
  const bridge = getBridge();
  if (bridge) {
    bridge.stopService();
  }
}

/** 背景服務是否正在執行 */
export function isBackgroundServiceRunning(): boolean {
  const bridge = getBridge();
  return bridge ? bridge.isServiceRunning() : false;
}

/**
 * 將使用者設定同步到 Native SharedPreferences
 * 供背景服務讀取（水位門檻、選取站點、警報冷卻等）
 */
export function syncSettingsToNative(params: {
  selectedStations: string[];
  stationOrder: string[];
  stationAlarmLevels: Record<string, number>;
  backgroundIntervalSec: number;
  stationGateAlarmSwitches: Record<string, GateAlarmSwitches>;
  stationTideAlarmSwitches: Record<string, TideAlarmSwitch>;
  monitoringEnabled: boolean;
  alarmDismissTimestamps: Record<string, number>;
  lastFullDismissTime: number;
}): void {
  const bridge = getBridge();
  if (!bridge) return;

  const payload = JSON.stringify(params);

  bridge.syncSettings(payload);
}

/** 通知背景服務停止警報音（前端按下警報確認時呼叫） */
export function dismissBackgroundAlarm(): void {
  const bridge = getBridge();
  if (bridge) {
    try {
      bridge.dismissAlarm();
    } catch (err) {
      console.warn('Failed to dismiss background alarm:', err);
    }
  }
}

/** 取得操作紀錄 */

export interface OperationLogs {
  pumpLog: Array<{ timestamp: number; stationNo: string; pumpId: number; action: 'start' | 'stop' }>;
  gateLog: Array<{ timestamp: number; stationNo: string; gateId: string; action: 'open' | 'close' }>;
}

export function getOperationLogs(): OperationLogs {
  const bridge = getBridge();
  if (!bridge) return { pumpLog: [], gateLog: [] };

  try {
    const result = bridge.getOperationLogs();
    return JSON.parse(result);
  } catch (err) {
    console.warn('Failed to get operation logs:', err);
    return { pumpLog: [], gateLog: [] };
  }
}

/** 清除操作紀錄 */
export function clearOperationLogs(): void {
  const bridge = getBridge();
  if (!bridge) return;

  try {
    bridge.clearLogs();
  } catch (err) {
    console.warn('Failed to clear operation logs:', err);
  }
}

/** 取得背景服務記錄的潮汐方向變化紀錄 */
export function getTideOperationLogs(): Array<{
  timestamp: number;
  stationNo: string;
  from: string;
  to: string;
}> {
  const bridge = getBridge();
  if (!bridge) return [];

  try {
    const result = bridge.getTideOperationLogs();
    return JSON.parse(result);
  } catch (err) {
    console.warn('Failed to get tide operation logs:', err);
    return [];
  }
}

/**
 * 取得設備資訊
 */
export interface DeviceInfo {
  model: string;
  manufacturer: string;
  device: string;
  sdkInt: number;
  release: string;
  versionName: string;
  isEmulator: boolean;
  error?: string;
}

export function getDeviceInfo(): DeviceInfo {
  const bridge = getBridge();
  if (!bridge) {
    return {
      model: 'Unknown',
      manufacturer: 'Unknown',
      device: 'Unknown',
      sdkInt: 0,
      release: 'Unknown',
      versionName: '0.0.0',
      isEmulator: false
    };
  }

  try {
    const result = bridge.getDeviceInfo();
    return JSON.parse(result);
  } catch (err) {
    console.warn('Failed to get device info:', err);
    return {
      model: 'Unknown',
      manufacturer: 'Unknown',
      device: 'Unknown',
      sdkInt: 0,
      release: 'Unknown',
      versionName: '0.0.0',
      isEmulator: false
    };
  }
}

// ═══════════════════════════════════════════
//  FCM token 管理
// ═══════════════════════════════════════════

let fcmToken: string | null = null;
let fcmResolve: ((t: string) => void) | null = null;

/** Android MainActivity 取得 token 後會呼叫此函式 */
(window as any).__fcmToken__ = (raw: string) => {
  try {
    const obj = JSON.parse(raw);
    fcmToken = obj.token;
    console.log('[FCM] token received from native:', fcmToken?.substring(0, 20) + '...');
    if (fcmResolve) {
      fcmResolve(fcmToken);
      fcmResolve = null;
    }
  } catch {
    console.warn('[FCM] failed to parse token');
  }
};

/** 等待原生層回傳 FCM token（最多等 8 秒） */
export function waitForFcmToken(): Promise<string | null> {
  if (fcmToken) return Promise.resolve(fcmToken);
  return new Promise((resolve) => {
    fcmResolve = resolve;
    setTimeout(() => {
      if (fcmResolve) {
        fcmResolve = null;
        resolve(null);
      }
    }, 8000);
  });
}

/** 向 server 註冊 FCM token */
export async function registerFcmToken(uid: string): Promise<boolean> {
  const token = await waitForFcmToken();
  if (!token || !SERVER_BASE_URL) {
    console.warn('[FCM] registration skipped: token=' + !!token + ' server=' + SERVER_BASE_URL);
    return false;
  }
  try {
    const res = await fetch(`${SERVER_BASE_URL}/api/register-fcm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, token }),
    });
    const ok = res.ok;
    console.log('[FCM] register:', ok ? 'OK' : 'FAIL ' + res.status);
    return ok;
  } catch (err) {
    console.error('[FCM] register error:', err);
    return false;
  }
}