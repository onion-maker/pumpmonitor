import type { PumpStationData, RawStationData, PumpStatus, DoorStatus, ApiResponse } from '../types';
import { STATION_NAMES, VALID_STATIONS, PUMP_FIELDS, DOOR_FIELDS, TIDE_STATIONS } from '../config/stations';

const API_URL = 'https://heovcenter.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo';
const API_URL_BACKUP = 'https://heovcenter2.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo';

// 潮汐站歷史水位 API（POST，需要 verify=False 繞過政府憑證撤銷檢查）
const TIDE_API_URL = 'https://heovcenter.gov.taipei/cia/WebLayout/GetAutoPumpWaterMins';
const TIDE_API_URL_BACKUP = 'https://heovcenter2.gov.taipei/cia/WebLayout/GetAutoPumpWaterMins';

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

// ═══════════════════════════════════════════
//  潮汐站歷史水位 API（GetAutoPumpWaterMins）
// ═══════════════════════════════════════════

/** 潮汐 record（RawStationData 的子集，用於潮汐判斷） */
export interface TideRecord {
  rectime: string;
  level_in: number | null;
  level_out: number | null;
  /** 閘門狀態 (door01~door16)，key 為欄位名 */
  doors: Record<string, string | null>;
}

/** 潮汐 API 回傳格式 */
interface TideApiResponse {
  d: RawStationData[];
}

/**
 * 透過 POST 呼叫潮汐 API（GetAutoPumpWaterMins）
 * 取得指定站號在時間範圍內的歷史水位紀錄
 */
async function fetchRawTide(
  apiUrl: string,
  sBgnDate: string,
  sEndDate: string,
  stationno: string,
): Promise<RawStationData[] | null> {
  const body = JSON.stringify({ sBgnDate, sEndDate, stationno });

  if (isNative()) {
    const bridge = (window as any).AndroidHttp;
    if (!bridge || typeof bridge.fetchPost !== 'function') {
      return null;
    }
    try {
      const jsonStr = bridge.fetchPost(apiUrl, body);
      if (!jsonStr) return null;
      const json: TideApiResponse = JSON.parse(jsonStr);
      return json.d || null;
    } catch {
      return null;
    }
  }

  // 瀏覽器環境：dev mode 透過 Vite proxy，production 直接 fetch
  let actualUrl = apiUrl;
  if (import.meta.env.DEV) {
    const path = '/WebLayout/GetAutoPumpWaterMins';
    if (apiUrl.includes('heovcenter2')) {
      actualUrl = `/api2${path}`;
    } else {
      actualUrl = `/api${path}`;
    }
  }

  try {
    const response = await fetch(actualUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!response.ok) return null;
    const json: TideApiResponse = await response.json();
    return json.d || null;
  } catch {
    return null;
  }
}

/**
 * 取得三個潮汐站（108/110/112）的歷史水位紀錄
 * 雙 API 合併，取 rectime 較新者
 * 回傳格式：{ stationno: TideRecord[] }
 */
export async function fetchTideRecords(): Promise<Record<string, TideRecord[]>> {
  const now = new Date();
  const sEnd = new Date(now.getTime() + 60 * 60 * 1000); // now + 1hr
  const sBgn = new Date(sEnd.getTime() - 2 * 60 * 60 * 1000); // sEnd - 2hr

  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const sBgnDate = fmt(sBgn);
  const sEndDate = fmt(sEnd);

  // 三個站點，兩個 API → 6 個請求
  const results = await Promise.all(
    TIDE_STATIONS.flatMap((no) => [
      fetchRawTide(TIDE_API_URL, sBgnDate, sEndDate, no),
      fetchRawTide(TIDE_API_URL_BACKUP, sBgnDate, sEndDate, no),
    ]),
  );

  // 依 stationno 分組合併（雙 API 結果取 rectime 較新）
  // results 順序：112主, 112備, 110主, 110備, 108主, 108備
  const out: Record<string, TideRecord[]> = {};

  for (let i = 0; i < TIDE_STATIONS.length; i++) {
    const no = TIDE_STATIONS[i];
    const primary = results[i * 2];
    const backup = results[i * 2 + 1];

    // 合併 + 排序
    const map = new Map<string, TideRecord>();
    const addRecords = (list: RawStationData[] | null) => {
      if (!list) return;
      for (const r of list) {
        const key = r.rectime;
        if (!map.has(key) || r.rectime > (map.get(key)!.rectime)) {
          map.set(key, {
            rectime: r.rectime,
            level_in: r.level_in,
            level_out: r.level_out,
            doors: Object.fromEntries(
              Array.from({ length: 16 }, (_, j) => {
                const f = `door${String(j + 1).padStart(2, '0')}`;
                return [f, (r as unknown as Record<string, string | null>)[f] ?? null];
              }),
            ),
          });
        }
      }
    };

    addRecords(primary);
    addRecords(backup);

    const records = Array.from(map.values()).sort((a, b) => a.rectime.localeCompare(b.rectime));
    if (records.length > 0) out[no] = records;
  }

  return out;
}
/**
 * 取得單一站點近 2 小時的水位歷史紀錄
 * 供圖表顯示使用
 */
export async function fetchWaterLevelHistory(
  stationNo: string,
  hours: number = 2,
): Promise<TideRecord | null> {
  const now = new Date();
  const sEnd = new Date(now.getTime() + 60 * 60 * 1000); // now + 1hr
  const sBgn = new Date(sEnd.getTime() - hours * 60 * 60 * 1000); // sEnd - hours

  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const sBgnDate = fmt(sBgn);
  const sEndDate = fmt(sEnd);

  const primary = await fetchRawTide(TIDE_API_URL, sBgnDate, sEndDate, stationNo);
  const backup = await fetchRawTide(TIDE_API_URL_BACKUP, sBgnDate, sEndDate, stationNo);

  // 合併取最新
  const map = new Map<string, TideRecord>();
  const addRecords = (list: RawStationData[] | null) => {
    if (!list) return;
    for (const r of list) {
      const key = r.rectime;
      if (!map.has(key) || r.rectime > (map.get(key)!.rectime)) {
        map.set(key, {
          rectime: r.rectime,
          level_in: r.level_in,
          level_out: r.level_out,
          doors: {} as Record<string, string | null>,
        });
      }
    }
  };

  addRecords(primary);
  addRecords(backup);

  const records = Array.from(map.values()).sort((a, b) => a.rectime.localeCompare(b.rectime));
  return records.length > 0 ? records[records.length - 1] : null;
}
