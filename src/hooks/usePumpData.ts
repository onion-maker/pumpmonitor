import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { fetchAllStations, fetchTideRecords, fetchWaterLevelHistory } from '../api/pumpStation';
import type { TideRecord } from '../api/pumpStation';
import { POLL_INTERVAL_MS } from '../config/stations';

const TIDE_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 分鐘
const HISTORY_FETCH_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分鐘更新一次歷史水位

export function usePumpData() {
  const page = useStore((s) => s.page);
  const setStationData = useStore((s) => s.setStationData);
  const setWaterLevelHistories = useStore((s) => s.setWaterLevelHistories);
  const setLoading = useStore((s) => s.setLoading);
  const setFetchError = useStore((s) => s.setFetchError);
  const setInitialLoading = useStore((s) => s.setInitialLoading);
  const checkAlarm = useStore((s) => s.checkAlarm);
  const updateTide = useStore((s) => s.updateTide);
  const isLoading = useStore((s) => s.isLoading);
  const isInitialLoading = useStore((s) => s.isInitialLoading);
  const monitoringEnabled = useStore((s) => s.monitoringEnabled);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // ref 存 monitoringEnabled，避免 effect dependency chain 觸發 cleanup/re-run → crash
  const monitoringEnabledRef = useRef(monitoringEnabled);
  monitoringEnabledRef.current = monitoringEnabled;

  // ref 存最近一次 fetch 歷史水位的時間
  const lastHistoryFetchRef = useRef(0);

  const fetchData = useCallback(async () => {
    if (useStore.getState().page === 'settings') return;

    setLoading(true);
    try {
      const data = await fetchAllStations();
      if (!mountedRef.current) return;
      setStationData(data);

      // 歷史水位（每 5 分鐘更新一次，所有站平行 fetch）
      if (Date.now() - lastHistoryFetchRef.current >= HISTORY_FETCH_INTERVAL_MS) {
        lastHistoryFetchRef.current = Date.now();
        try {
          const stationNos = data.map((s) => s.stationno);
          const results = await Promise.allSettled(
            stationNos.map((no) => fetchWaterLevelHistory(no, 2)),
          );
          if (mountedRef.current) {
            const histories: Record<string, TideRecord[]> = {};
            stationNos.forEach((no, i) => {
              const r = results[i];
              if (r.status === 'fulfilled' && r.value.length > 0) {
                histories[no] = r.value;
              }
            });
            setWaterLevelHistories(histories);
          }
        } catch {
          // 歷史水位 API 失敗則跳過本次
        }
      }

      // 潮汐檢查（每 10 分鐘用 GetAutoPumpWaterMins API 判斷）
      const state = useStore.getState();
      if (Date.now() - state.lastTideCheckTime >= TIDE_CHECK_INTERVAL_MS) {
        try {
          const tideRecords = await fetchTideRecords();
          if (mountedRef.current) updateTide(tideRecords);
        } catch {
          // 潮汐 API 失敗則跳過本次，等下次週期
        }
      }

      checkAlarm(data);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : '取得資料失敗';
      setFetchError(msg);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setInitialLoading(false);
      }
    }
  }, [setStationData, setWaterLevelHistories, setLoading, setFetchError, checkAlarm, updateTide, setInitialLoading]);

  // ref 存最新 fetchData，避免 effect 因 fetchData reference 改變而 rebuild
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  // 首次載入與 page 切換時 fetch
  useEffect(() => {
    mountedRef.current = true;
    if (page === 'main') {
      fetchDataRef.current();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [page]);

  // 定時輪詢（僅主頁，監控啟停不影響 effect 重建，只在 callback 內部判斷）
  useEffect(() => {
    if (page !== 'main') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      if (monitoringEnabledRef.current) {
        fetchDataRef.current();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [page]);

  return { refresh: fetchData, isLoading, isInitialLoading };
}