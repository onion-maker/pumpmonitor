import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { fetchAllStations, fetchTideRecords, fetchWaterLevelHistory, fetchPumpHistoryForStations } from '../api/pumpStation';
import { fetchStationsFromServer, fetchTideFromServer } from '../api/pumpServer';
import { saveCachedStationData } from '../store/useStore';
import type { TideRecord } from '../api/pumpStation';
import { POLL_INTERVAL_MS } from '../config/stations';

const TIDE_CHECK_INTERVAL_MS = 90 * 1000; // 90 秒（原 10 分鐘過長，錯過漲潮變化）
const HISTORY_FETCH_INTERVAL_MS = 5 * 60 * 1000; // 每 5 分鐘更新一次歷史水位

export function usePumpData() {
  const page = useStore((s) => s.page);
  const setStationData = useStore((s) => s.setStationData);
  const setWaterLevelHistories = useStore((s) => s.setWaterLevelHistories);
  const setLoading = useStore((s) => s.setLoading);
  const setFetchError = useStore((s) => s.setFetchError);
  const setInitialLoading = useStore((s) => s.setInitialLoading);
  const checkAlarm = useStore((s) => s.checkAlarm);
  const checkPumpHistoryAlarm = useStore((s) => s.checkPumpHistoryAlarm);
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

  /** 輕量 refresh：只拉主 API + 警報判斷，不拉歷史水位和潮汐（回到前景用） */
  const fetchDataLight = useCallback(async () => {
    if (useStore.getState().page === 'settings') return;

    try {
      let data;
      try {
        data = await fetchStationsFromServer();
      } catch {
        data = await fetchAllStations();
      }
      if (!mountedRef.current) return;
      setStationData(data);
      const uid = useStore.getState().currentUid;
      if (uid) { try { saveCachedStationData(uid, data); } catch { /* ignore */ } }
      checkAlarm(data);
    } catch {
      // 失敗則保持目前資料
    }
  }, [setStationData, checkAlarm]);

  const fetchData = useCallback(async () => {
    if (useStore.getState().page === 'settings') return;

    setLoading(true);
    try {
      // ═══════ Phase A: Critical Path — 取得站點資料後立刻顯示 ═══════
      let data;
      try {
        data = await fetchStationsFromServer();
      } catch {
        data = await fetchAllStations();
      }
      if (!mountedRef.current) return;
      setStationData(data);
      const uid = useStore.getState().currentUid;
      if (uid) { try { saveCachedStationData(uid, data); } catch { /* ignore */ } }
      checkAlarm(data);
      setLoading(false);

      if (!mountedRef.current) return;

      // ═══════ Phase B: Background — 不阻塞顯示 ═══════

      // 歷史水位（每 5 分鐘更新一次）
      if (Date.now() - lastHistoryFetchRef.current >= HISTORY_FETCH_INTERVAL_MS) {
        lastHistoryFetchRef.current = Date.now();
        (async () => {
          try {
            const selected = useStore.getState().selectedStations;
            const stationNos = data
              .filter((s) => selected.includes(s.stationno))
              .map((s) => s.stationno);
            if (stationNos.length > 0) {
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
            }
          } catch {
            // 歷史水位 API 失敗則跳過本次
          }
        })();
      }

      // 潮汐檢查（背景非同步，不阻塞首頁載入）
      const state = useStore.getState();
      if (Date.now() - state.lastTideCheckTime >= TIDE_CHECK_INTERVAL_MS) {
        const hasPrevDir = Object.keys(state.tideDirection).length > 0;
        const hoursBack = hasPrevDir ? 3 : 12;
        fetchTideFromServer()
          .then(tideRecords => {
            if (mountedRef.current) updateTide(tideRecords);
          })
          .catch(() => {
            fetchTideRecords(hoursBack).then(tideRecords => {
              if (mountedRef.current) updateTide(tideRecords);
            }).catch(() => {});
          });
      }

      // Pump 歷史檢查（背景補救，不阻塞主流程）
      (async () => {
        try {
          const selected = useStore.getState().selectedStations;
          if (selected.length > 0) {
            const history = await fetchPumpHistoryForStations(selected, 10);
            if (mountedRef.current && Object.keys(history).length > 0) {
              checkPumpHistoryAlarm(data, history);
            }
          }
        } catch {
          // 歷史 API 失敗不影響主流程
        }
      })();

    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : '取得資料失敗';
      setFetchError(msg);
      setLoading(false);
    } finally {
      if (mountedRef.current) {
        setInitialLoading(false);
      }
    }
  }, [setStationData, setWaterLevelHistories, setLoading, setFetchError, checkAlarm, checkPumpHistoryAlarm, updateTide, setInitialLoading]);

  // ref 存最新 fetchData/fetchDataLight，避免 effect 因 callback reference 改變而 rebuild
  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;
  const fetchDataLightRef = useRef(fetchDataLight);
  fetchDataLightRef.current = fetchDataLight;

  // 首次載入時用完整 fetch，從設定切回時用 light refresh（store 已有資料）
  useEffect(() => {
    mountedRef.current = true;
    if (page === 'main') {
      const alreadyLoaded = useStore.getState().stationData.length > 0;
      if (alreadyLoaded) {
        fetchDataLightRef.current();
      } else {
        fetchDataRef.current();
      }
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

  return { refresh: fetchData, refreshLight: fetchDataLight, isLoading, isInitialLoading };
}