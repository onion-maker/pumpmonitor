import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { fetchAllStations, fetchTideRecords } from '../api/pumpStation';
import { POLL_INTERVAL_MS } from '../config/stations';

const TIDE_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 分鐘

export function usePumpData() {
  const page = useStore((s) => s.page);
  const setStationData = useStore((s) => s.setStationData);
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

  const fetchData = useCallback(async () => {
    if (useStore.getState().page === 'settings') return;

    setLoading(true);
    try {
      const data = await fetchAllStations();
      if (!mountedRef.current) return;
      setStationData(data);

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
  }, [setStationData, setLoading, setFetchError, checkAlarm, updateTide, setInitialLoading]);

  // 首次載入與 page 切換時 fetch
  useEffect(() => {
    mountedRef.current = true;
    if (page === 'main') {
      fetchData();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [page, fetchData]);

  // 定時輪詢（僅主頁 + 監控啟用中）
  useEffect(() => {
    if (page !== 'main' || !monitoringEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      fetchData();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [page, monitoringEnabled, fetchData]);

  return { refresh: fetchData, isLoading, isInitialLoading };
}