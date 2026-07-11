import type { PumpStationData, RawStationData, PumpStatus, DoorStatus, ApiResponse } from '../types';
import { STATION_NAMES, VALID_STATIONS, PUMP_FIELDS, DOOR_FIELDS } from '../config/stations';

const API_URL = 'https://heovcenter.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo';
const API_URL_BACKUP = 'https://heovcenter2.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 解析 rectime 字串 'yyyyMMddHHmmss' → Date */
function parseRectime(raw: string): Date | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/** 取得站點名稱，找不到回傳站號 */
function getStationName(no: string): string {
  return STATION_NAMES[no] ?? no;
}

/** 整理單一站點原始資料 */
function normalizeStation(raw: RawStationData): PumpStationData {
  const pumps: { id: number; status: PumpStatus }[] = [];
  const doors: { id: number; status: DoorStatus }[] = [];

  for (const field of PUMP_FIELDS) {
    const v = (raw as unknown as Record<string, string | null>)[field];
    if (v === '0' || v === '1' || v === '2' || v === '3') {
      pumps.push({ id: parseInt(field.slice(4), 10), status: v as PumpStatus });
    }
  }

  for (const field of DOOR_FIELDS) {
    const v = (raw as unknown as Record<string, string | null>)[field];
    if (v === '0' || v === '1' || v === '2') {
      doors.push({ id: parseInt(field.slice(4), 10), status: v as DoorStatus });
    }
  }

  return {
    stationno: raw.stationno,
    stationName: getStationName(raw.stationno),
    rectime: parseRectime(raw.rectime),
    level_in: raw.level_in,
    level_out: raw.level_out,
    pumps,
    doors,
  };
}

/** 在 Capacitor 原生環境下，透過 AndroidHttp 橋接發送請求（繞過 CORS） */
async function nativeFetch(url: string): Promise<ApiResponse> {
  const bridge = (window as any).AndroidHttp;
  if (!bridge || typeof bridge.fetch !== 'function') {
    throw new ApiError('無法連線至伺服器，請檢查網路');
  }

  const jsonStr = bridge.fetch(url);
  if (jsonStr === null || jsonStr === undefined) {
    throw new ApiError('無法連線至伺服器，請檢查網路');
  }

  try {
    return JSON.parse(jsonStr) as ApiResponse;
  } catch {
    throw new ApiError('資料格式錯誤，無法解析');
  }
}

/** 在瀏覽器環境下，透過 fetch + Vite proxy 發送請求 */
async function browserFetch(url: string): Promise<ApiResponse> {
  // dev mode 時使用 proxy 路徑
  let actualUrl = url;
  if (import.meta.env.DEV) {
    if (url.includes('heovcenter2')) {
      actualUrl = '/api2/GetLastestAutoPumpPGInfo';
    } else {
      actualUrl = '/api/GetLastestAutoPumpPGInfo';
    }
  }

  let response: Response;
  try {
    response = await fetch(actualUrl);
  } catch (err) {
    throw new ApiError('無法連線至伺服器，請檢查網路', undefined, err);
  }

  if (!response.ok) {
    throw new ApiError(`伺服器回應異常 (${response.status})`, response.status);
  }

  let json: ApiResponse;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('資料格式錯誤，無法解析');
  }

  return json;
}

/** 判斷是否在 Capacitor 原生環境 */
function isNative(): boolean {
  try {
    return typeof (window as any).AndroidHttp !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * 從指定 URL 抓取 API 資料，回傳原始站點列表，失敗則回傳 null
 */
async function fetchRawStations(url: string): Promise<RawStationData[] | null> {
  try {
    const json = isNative() ? await nativeFetch(url) : await browserFetch(url);
    if (!json.d || !Array.isArray(json.d)) return null;
    return json.d.filter((r) => VALID_STATIONS.includes(r.stationno));
  } catch {
    return null;
  }
}

/**
 * 取兩個 API 中對每個站點最新的資料做合併
 * 站點以 rectime 較新者為準
 */
function mergeStations(
  primary: RawStationData[] | null,
  backup: RawStationData[] | null,
): RawStationData[] {
  const map = new Map<string, RawStationData>();

  const add = (list: RawStationData[] | null) => {
    if (!list) return;
    for (const s of list) {
      const existing = map.get(s.stationno);
      if (!existing || (s.rectime && (!existing.rectime || s.rectime > existing.rectime))) {
        map.set(s.stationno, s);
      }
    }
  };

  add(primary);
  add(backup);

  return Array.from(map.values());
}

/** 取得最新抽水站資料，從雙 API 中取最新的 */
export async function fetchAllStations(): Promise<PumpStationData[]> {
  // 同時請求兩個 API
  const [raw1, raw2] = await Promise.all([
    fetchRawStations(API_URL),
    fetchRawStations(API_URL_BACKUP),
  ]);

  if (!raw1 && !raw2) {
    throw new ApiError('無法連線至伺服器，請檢查網路');
  }

  const merged = mergeStations(raw1, raw2);
  return merged.map(normalizeStation);
}