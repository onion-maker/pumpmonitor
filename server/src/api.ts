import axios from 'axios';
import type { PumpStationData, RawStationData, TideRecord } from './types';
import { CONFIG } from './config';

// API endpoints (same as in original frontend)
const API_URL = 'https://heovcenter.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo';
const API_URL_BACKUP = 'https://heovcenter2.gov.taipei/cia/WebLayout/GetLastestAutoPumpPGInfo';
const TIDE_API_URL = 'https://heovcenter.gov.taipei/cia/WebLayout/GetAutoPumpWaterMins';
const TIDE_API_URL_BACKUP = 'https://heovcenter2.gov.taipei/cia/WebLayout/GetAutoPumpWaterMins';

const TIDE_STATIONS = CONFIG.TIDE_STATIONS;

/** 解析 rectime 字串 'yyyyMMddHHmmss' → Date */
function parseRectime(raw: string): Date | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/** 整理單一站點原始資料 (copied from src/api/pumpStation.ts) */
function normalizeStation(raw: RawStationData): PumpStationData {
  const pumps: { id: number; status: import('./types').PumpStatus }[] = [];
  const doors: { id: number; status: import('./types').DoorStatus }[] = [];

  for (let i = 1; i <= 16; i++) {
    const pumpKey = `pumb${String(i).padStart(2, '0')}`;
    const v = raw[pumpKey as keyof RawStationData] as string | null | undefined;
    if (v === '0' || v === '1' || v === '2' || v === '3') {
      pumps.push({ id: i, status: v as import('./types').PumpStatus });
    }
  }

  for (let i = 1; i <= 16; i++) {
    const doorKey = `door${String(i).padStart(2, '0')}`;
    const v = raw[doorKey as keyof RawStationData] as string | null | undefined;
    if (v === '0' || v === '1' || v === '2') {
      doors.push({ id: i, status: v as import('./types').DoorStatus });
    }
  }

  return {
    stationno: raw.stationno,
    stationName: CONFIG.STATION_NAMES[raw.stationno] ?? raw.stationno,
    rectime: parseRectime(raw.rectime),
    level_in: raw.level_in,
    level_out: raw.level_out,
    pumps,
    doors,
  };
}

interface ApiResponse {
  d: RawStationData[];
}

/** 取得最新抽水站資料，從雙 API 中取最新的 (copied from src/api/pumpStation.ts) */
export async function fetchAllStations(): Promise<PumpStationData[]> {
  try {
    const [res1, res2] = await Promise.all([
      axios.get<ApiResponse>(API_URL).catch(() => null),
      axios.get<ApiResponse>(API_URL_BACKUP).catch(() => null),
    ]);

    const valid = (data: RawStationData[] | null | undefined) =>
      data?.filter((r) => CONFIG.VALID_STATIONS.includes(r.stationno)) ?? null;

    const raw1 = valid(res1?.data?.d);
    const raw2 = valid(res2?.data?.d);

    const map = new Map<string, RawStationData>();

    for (const s of raw1 ?? []) {
      map.set(s.stationno, s);
    }
    for (const s of raw2 ?? []) {
      const existing = map.get(s.stationno);
      if (!existing || !existing.rectime || s.rectime > existing.rectime) {
        map.set(s.stationno, s);
      }
    }

    return Array.from(map.values()).map(normalizeStation);
  } catch (err) {
    console.error('Failed to fetchAllStations:', err);
    throw err;
  }
}

/** 轉換 TideRecord */
function toTideRecord(raw: RawStationData): TideRecord {
  const doors: Record<string, string | null> = {};
  const pumps: Record<string, string | null> = {};

  for (let i = 1; i <= 16; i++) {
    const d = `door${String(i).padStart(2, '0')}`;
    const p = `pumb${String(i).padStart(2, '0')}`;
    doors[d] = (raw[d as keyof RawStationData] as string | null) ?? null;
    pumps[p] = (raw[p as keyof RawStationData] as string | null) ?? null;
  }

  return {
    stationno: raw.stationno,
    rectime: raw.rectime,
    level_in: raw.level_in,
    level_out: raw.level_out,
    doors,
    pumps,
  };
}

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 取得三個潮汐站的歷史水位紀錄 */
export async function fetchTideRecords(hoursBack: number = 2): Promise<Record<string, TideRecord[]>> {
  const now = new Date();
  const sEnd = new Date(now.getTime() + 60 * 60 * 1000);
  const sBgn = new Date(sEnd.getTime() - hoursBack * 60 * 60 * 1000);

  const sBgnDate = fmtDate(sBgn);
  const sEndDate = fmtDate(sEnd);

  const fetchForStation = async (stationNo: string) => {
    const body = JSON.stringify({ sBgnDate, sEndDate, stationno: stationNo });

    const [res1, res2] = await Promise.all([
      axios.post<string>(TIDE_API_URL, body, { headers: { 'Content-Type': 'application/json' } }).catch(() => null),
      axios.post<string>(TIDE_API_URL_BACKUP, body, { headers: { 'Content-Type': 'application/json' } }).catch(() => null),
    ]);

    const parse = (r: string | null): RawStationData[] => {
      if (!r) return [];
      try {
        const parsed = JSON.parse(r) as ApiResponse;
        return parsed.d || [];
      } catch {
        return [];
      }
    };

    const r1 = parse(res1?.data ?? null);
    const r2 = parse(res2?.data ?? null);

    const map = new Map<string, TideRecord>();
    for (const raw of [...r1, ...r2]) {
      const key = raw.rectime;
      const existing = map.get(key);
      if (!existing || raw.rectime > (existing.rectime || '')) {
        map.set(key, toTideRecord(raw));
      }
    }

    return Array.from(map.values()).sort((a, b) => a.rectime.localeCompare(b.rectime));
  };

  const results = await Promise.all(TIDE_STATIONS.map(fetchForStation));

  const out: Record<string, TideRecord[]> = {};
  for (let i = 0; i < TIDE_STATIONS.length; i++) {
    if (results[i].length > 0) {
      out[TIDE_STATIONS[i]] = results[i];
    }
  }
  return out;
}

/** 取得單一站點的水位歷史 */
export async function fetchWaterLevelHistory(stationNo: string, hours: number = 2): Promise<TideRecord[]> {
  const now = new Date();
  const sEnd = new Date(now.getTime() + 60 * 1000);
  const sBgn = new Date(sEnd.getTime() - hours * 60 * 60 * 1000);

  const sBgnDate = fmtDate(sBgn);
  const sEndDate = fmtDate(sEnd);

  const body = JSON.stringify({ sBgnDate, sEndDate, stationno: stationNo });

  const [res1, res2] = await Promise.all([
    axios.post<string>(TIDE_API_URL, body, { headers: { 'Content-Type': 'application/json' } }).catch(() => null),
    axios.post<string>(TIDE_API_URL_BACKUP, body, { headers: { 'Content-Type': 'application/json' } }).catch(() => null),
  ]);

  const parse = (r: string | null): RawStationData[] => {
    if (!r) return [];
    try {
      const parsed = JSON.parse(r) as ApiResponse;
      return parsed.d || [];
    } catch {
      return [];
    }
  };

  const r1 = parse(res1?.data ?? null);
  const r2 = parse(res2?.data ?? null);

  const map = new Map<string, TideRecord>();
  for (const raw of [...r1, ...r2]) {
    const key = raw.rectime;
    const existing = map.get(key);
    if (!existing || raw.rectime > (existing.rectime || '')) {
      map.set(key, toTideRecord(raw));
    }
  }

  return Array.from(map.values()).sort((a, b) => a.rectime.localeCompare(b.rectime));
}

/** 批次取得 pump/door 歷史（補償 snapshot 漏檢） */
export async function fetchPumpHistoryForStations(
  stationNos: string[],
  windowMinutes: number = 2,
): Promise<Record<string, TideRecord[]>> {
  if (stationNos.length === 0) return {};

  const now = new Date();
  const sEnd = new Date(now.getTime() + 60 * 1000);
  const sBgn = new Date(sEnd.getTime() - windowMinutes * 60 * 1000);

  const sBgnDate = fmtDate(sBgn);
  const sEndDate = fmtDate(sEnd);

  const fetchOne = async (stationNo: string) => {
    const body = JSON.stringify({ sBgnDate, sEndDate, stationno: stationNo });

    const [res1, res2] = await Promise.all([
      axios.post<string>(TIDE_API_URL, body, { headers: { 'Content-Type': 'application/json' } }).catch(() => null),
      axios.post<string>(TIDE_API_URL_BACKUP, body, { headers: { 'Content-Type': 'application/json' } }).catch(() => null),
    ]);

    const parse = (r: string | null): RawStationData[] => {
      if (!r) return [];
      try {
        const parsed = JSON.parse(r) as ApiResponse;
        return parsed.d || [];
      } catch {
        return [];
      }
    };

    const r1 = parse(res1?.data ?? null);
    const r2 = parse(res2?.data ?? null);

    const map = new Map<string, TideRecord>();
    for (const raw of [...r1, ...r2]) {
      const key = raw.rectime;
      const existing = map.get(key);
      if (!existing || raw.rectime > (existing.rectime || '')) {
        map.set(key, toTideRecord(raw));
      }
    }

    return Array.from(map.values()).sort((a, b) => a.rectime.localeCompare(b.rectime));
  };

  const results = await Promise.all(stationNos.map(fetchOne));

  const out: Record<string, TideRecord[]> = {};
  for (let i = 0; i < stationNos.length; i++) {
    if (results[i].length > 0) {
      out[stationNos[i]] = results[i];
    }
  }
  return out;
}