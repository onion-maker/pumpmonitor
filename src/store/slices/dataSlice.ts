/**
 * Data slice — API 資料狀態
 */
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { PumpStationData } from '../../types';
import type { TideRecord } from '../../api/pumpStation';

export interface DataSlice {
  stationData: PumpStationData[];
  lastUpdateTime: string | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  fetchError: string | null;
  /** 各站近 2 小時歷史水位（key: stationno, value: 按 rectime 排序的陣列） */
  waterLevelHistories: Record<string, TideRecord[]>;
  setStationData: (data: PumpStationData[]) => void;
  setWaterLevelHistories: (histories: Record<string, TideRecord[]>) => void;
  setLoading: (v: boolean) => void;
  setInitialLoading: (v: boolean) => void;
  setFetchError: (err: string | null) => void;
}

export const createDataSlice: StateCreator<AppStore, [], [], DataSlice> = (set) => ({
  stationData: [],
  lastUpdateTime: null,
  isLoading: false,
  isInitialLoading: true,
  fetchError: null,
  waterLevelHistories: {},
  setStationData: (data) =>
    set({
      stationData: data,
      lastUpdateTime: new Date().toLocaleString('zh-TW'),
      isInitialLoading: false,
      fetchError: null,
    }),
  setWaterLevelHistories: (histories) => set({ waterLevelHistories: histories }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialLoading: (isInitialLoading) => set({ isInitialLoading }),
  setFetchError: (fetchError) => set({ fetchError, isInitialLoading: false }),
});