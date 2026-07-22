/**
 * Data slice — API 資料狀態
 */
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { PumpStationData } from '../../types';

export interface DataSlice {
  stationData: PumpStationData[];
  lastUpdateTime: string | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  fetchError: string | null;
  setStationData: (data: PumpStationData[]) => void;
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
  setStationData: (data) =>
    set({
      stationData: data,
      lastUpdateTime: new Date().toLocaleString('zh-TW'),
      isInitialLoading: false,
      fetchError: null,
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialLoading: (isInitialLoading) => set({ isInitialLoading }),
  setFetchError: (fetchError) => set({ fetchError, isInitialLoading: false }),
});