/**
 * Server API client — 與 pumpmonitor-server 通訊
 *
 * 前端不再直接打 heovcenter API，改由 server 代理。
 * server 同時做輪詢 + 警報判斷 + FCM 推播。
 * 前端仍保留直接 fetch 的能力作為 fallback。
 */
import type { PumpStationData } from '../types';

const BASE = (import.meta as any).env?.VITE_SERVER_URL || '';

/** 從 server 取得所有站點最新資料 */
export async function fetchStationsFromServer(): Promise<PumpStationData[]> {
  if (!BASE) throw new Error('Server URL not configured');
  const res = await fetch(`${BASE}/api/stations`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const data = await res.json();
  return data;
}

/** 從 server 取得所有潮汐站資料 */
export async function fetchTideFromServer(): Promise<Record<string, any[]>> {
  if (!BASE) throw new Error('Server URL not configured');
  const res = await fetch(`${BASE}/api/tide`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return await res.json();
}

/** 從 server 取得指定站點歷史水位 */
export async function fetchHistoryFromServer(stationNo: string, _hours: number = 2): Promise<any[]> {
  if (!BASE) throw new Error('Server URL not configured');
  const res = await fetch(`${BASE}/api/tide/${stationNo}`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return await res.json();
}

/** 向 server 註冊 FCM token */
export async function registerFcmToServer(uid: string, token: string): Promise<boolean> {
  if (!BASE) return false;
  try {
    const res = await fetch(`${BASE}/api/register-fcm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}