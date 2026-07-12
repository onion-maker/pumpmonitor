import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { fetchAllStations } from '../api/pumpStation';
import { POLL_INTERVAL_MS } from '../config/stations';

const TIDE_CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 分鐘

export function usePumpData() {
  const page = useStore((s) => s.page);
  const setStationData = useStore((s) => s.setStationData);
  const setLoading = useStore((s) => s.setLoading);
  const setFetchError = useStore((s) => s.setFetchError);
  const setInitialLoading = useStore((s) => s.setInitialLoading);
  const checkAlarm = useStore((s) => s.checkAlarm);
  const checkTideAlarm = useStore((s) => s.checkTideAlarm);
  const recordLevelOut = useStore((s) => s.recordLevelOut);
  const isLoading = useStore((s) => s.isLoading);
  const isInitialLoading = useStore((s) => s.isInitialLoading);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (useStore.getState().page === 'settings') return;

    setLoading(true);
    try {
      const data = await fetchAllStations();
      if (!mountedRef.current) return;
      setStationData(data);

      // 記錄潮汐站外水位到 buffer
      for (const station of data) {
        if (station.rectime) {
          const rectimeStr = station.rectime
            .toISOString()
            .replace(/[-:T]/g, '')
            .slice(0, 14); // yyyyMMddHHmmss
          recordLevelOut(station.stationno, rectimeStr, station.level_out);
        }
      }

      // 潮汐檢查（每 10 分鐘）
      const state = useStore.getState();
      if (Date.now() - state.lastTideCheckTime >= TIDE_CHECK_INTERVAL_MS) {
        checkTideAlarm();
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
  }, [setStationData, setLoading, setFetchError, checkAlarm, checkTideAlarm, recordLevelOut, setInitialLoading]);

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

  // 定時輪詢（僅主頁）
  useEffect(() => {
    if (page !== 'main') {
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
  }, [page, fetchData]);

  return { refresh: fetchData, isLoading, isInitialLoading };
}