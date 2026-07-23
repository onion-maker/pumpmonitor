/**
 * Alarm slice — 警報檢查、關閉、模擬，以及操作紀錄
 */
import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type {
  PumpStationData,
  StationAlarmInfo,
  AlarmReason,
  PumpStatusMap,
  PumpStatus,
  DoorStatusMap,
  PumpOperationLogEntry,
  GateOperationLogEntry,
} from '../../types';
import { DEFAULT_ALARM_LEVEL, DEFAULT_ALARM_AUDIO_URL, PUMP_STATUS_LABEL } from '../../config/stations';
import { playStationAlarm, stopStationAlarm, stopAllAlarms } from '../../utils/audio';
import { dismissBackgroundAlarm } from '../../utils/backgroundAlarm';

export interface AlarmSlice {
  alarmingStations: StationAlarmInfo[];
  isAlarming: boolean;
  previousPumpMap: Record<string, PumpStatusMap>;
  previousDoorMap: Record<string, DoorStatusMap>;
  lastAlarmedLevels: Record<string, number | null>;
  testAlarmStationNos: string[];
  alarmDismissTimestamps: Record<string, number>;
  lastFullDismissTime: number;
  pumpOperationLog: PumpOperationLogEntry[];
  gateOperationLog: GateOperationLogEntry[];
  notificationSuppressed: Record<string, boolean>;

  checkAlarm: (data: PumpStationData[]) => void;
  dismissStationAlarm: (stationno: string) => void;
  dismissAllAlarms: () => void;
  simulateAlarm: () => void;
  addPumpOperationLog: (entry: PumpOperationLogEntry) => void;
  addGateOperationLog: (entry: GateOperationLogEntry) => void;
  clearOperationLogs: () => void;
  getPumpLogsByStation: (stationno: string) => PumpOperationLogEntry[];
  getGateLogsByStation: (stationno: string) => GateOperationLogEntry[];
  suppressNotification: (stationno: string) => void;
  resolveNotification: (stationno: string) => void;
}

function buildPumpMap(pumps: { id: number; status: PumpStatus }[]): PumpStatusMap {
  const map: PumpStatusMap = {};
  for (const p of pumps) {
    map[p.id] = p.status;
  }
  return map;
}

function buildDoorMap(doors: { id: number; status: string }[]): DoorStatusMap {
  const map: DoorStatusMap = {};
  for (const d of doors) {
    map[d.id] = d.status as any;
  }
  return map;
}

export const createAlarmSlice: StateCreator<AppStore, [], [], AlarmSlice> = (set, get) => ({
  alarmingStations: [],
  isAlarming: false,
  previousPumpMap: {},
  previousDoorMap: {},
  lastAlarmedLevels: {},
  testAlarmStationNos: [],
  alarmDismissTimestamps: {},
  lastFullDismissTime: 0,
  pumpOperationLog: [],
  gateOperationLog: [],
  notificationSuppressed: {},

  checkAlarm: (data) => {
    const state = get();
    const ALARM_COOLDOWN_MS = 10 * 60 * 1000;
    const GRACE_PERIOD_MS = 30 * 1000;
    const now = Date.now();

    if (!state.monitoringEnabled) {
      if (state.alarmingStations.length > 0) {
        stopAllAlarms();
        dismissBackgroundAlarm();
      }
      set({
        alarmingStations: [],
        isAlarming: false,
        testAlarmStationNos: [],
        previousPumpMap: {},
        lastAlarmedLevels: {},
      });
      return;
    }

    const { selectedStations, stationAlarmLevels, stationGateAlarmSwitches,
            previousPumpMap, previousDoorMap, lastAlarmedLevels,
            alarmDismissTimestamps, lastFullDismissTime } = state;

    const newAlarming: StationAlarmInfo[] = [];
    const newPumpMap: Record<string, PumpStatusMap> = {};
    const newDoorMap: Record<string, DoorStatusMap> = {};
    const newLastAlarmed = { ...lastAlarmedLevels };
    const prevAlarmingNos = new Set(state.alarmingStations.map((a) => a.stationno));

    const newPumpLog: PumpOperationLogEntry[] = [...state.pumpOperationLog];
    const newGateLog: GateOperationLogEntry[] = [...state.gateOperationLog];

    for (const station of data) {
      if (!selectedStations.includes(station.stationno)) continue;

      const reasons: AlarmReason[] = [];
      const alarmThreshold = stationAlarmLevels[station.stationno] ?? DEFAULT_ALARM_LEVEL;
      const prevLevel = newLastAlarmed[station.stationno] ?? null;

      const stationDismissTs = alarmDismissTimestamps[station.stationno] ?? 0;
      const inCooldown = (now - Math.max(stationDismissTs, lastFullDismissTime)) < ALARM_COOLDOWN_MS;
      const isCurrentlyAlarming = prevAlarmingNos.has(station.stationno);

      const timeSinceDismissal = now - Math.max(stationDismissTs, lastFullDismissTime);
      const recentlyDismissed = timeSinceDismissal < GRACE_PERIOD_MS;

      const skipAlarmChecks = inCooldown && !isCurrentlyAlarming && !recentlyDismissed;

      // ── 水位檢查 ──
      const levelIn = station.level_in;
      if (!skipAlarmChecks && levelIn !== null && levelIn > alarmThreshold) {
        let shouldAlarm = false;
        if (prevLevel === null) {
          shouldAlarm = true;
          newLastAlarmed[station.stationno] = levelIn;
        } else if (levelIn >= prevLevel + 0.1) {
          shouldAlarm = true;
          newLastAlarmed[station.stationno] = levelIn;
        }
        if (shouldAlarm) {
          reasons.push({
            type: 'water_level',
            detail: `水位 ${levelIn.toFixed(2)}m 超過警報值 ${alarmThreshold.toFixed(2)}m`,
          });
        }
      } else if (!skipAlarmChecks) {
        newLastAlarmed[station.stationno] = null;
      }

      // ── Pump 變化檢查 ──
      const prevPumps = previousPumpMap[station.stationno] ?? {};
      const currPumpMap = buildPumpMap(station.pumps);
      newPumpMap[station.stationno] = currPumpMap;

      if (!skipAlarmChecks) {
        for (const pump of station.pumps) {
          const prev = prevPumps[pump.id];
          const isRunning = pump.status === '1' || pump.status === '2' || pump.status === '3';
          const wasRunning = prev === '1' || prev === '2' || prev === '3';

          if (prev === '0' && isRunning) {
            reasons.push({
              type: 'pump_start',
              detail: `#${pump.id} 抽水機${PUMP_STATUS_LABEL[pump.status]}`,
              pumpId: pump.id,
            });
            newPumpLog.push({ timestamp: now, stationNo: station.stationno, pumpId: pump.id, action: 'start' });
          } else if (wasRunning && pump.status === '0') {
            reasons.push({
              type: 'pump_stop',
              detail: `#${pump.id} 抽水機停止`,
              pumpId: pump.id,
            });
            newPumpLog.push({ timestamp: now, stationNo: station.stationno, pumpId: pump.id, action: 'stop' });
          }
        }

        // ── 閘門事件記錄 + 警報 ──
        const prevDoors = previousDoorMap[station.stationno] ?? {};
        for (const door of station.doors) {
          const prevDoorStatus = prevDoors[door.id];
          if (prevDoorStatus !== undefined && prevDoorStatus !== door.status) {
            if (door.status === '0') {
              newGateLog.push({
                timestamp: now,
                stationNo: station.stationno,
                gateId: `door${String(door.id).padStart(2, '0')}`,
                action: 'open',
              });
            } else if (door.status === '1') {
              newGateLog.push({
                timestamp: now,
                stationNo: station.stationno,
                gateId: `door${String(door.id).padStart(2, '0')}`,
                action: 'close',
              });
            }
          }
        }

        newDoorMap[station.stationno] = buildDoorMap(station.doors);

        // 閘門警報
        const gateSwitches = stationGateAlarmSwitches[station.stationno];
        const levelOut = station.level_out;
        if (gateSwitches && levelIn !== null && levelOut !== null) {
          const allDoorsClosed = station.doors.length > 0 && station.doors.every(d => d.status === '1');
          if (gateSwitches.innerHighAlarm && levelIn > levelOut && allDoorsClosed) {
            reasons.push({
              type: 'gate_high_inner',
              detail: `內水位 ${levelIn.toFixed(2)}m 高於外水位 ${levelOut.toFixed(2)}m，閘門全閉`,
            });
          }
        }
      }

      if (reasons.length > 0) {
        newAlarming.push({ stationno: station.stationno, stationName: station.stationName, reasons });
      } else if (prevAlarmingNos.has(station.stationno)) {
        const prevAlarm = state.alarmingStations.find(a => a.stationno === station.stationno);
        if (prevAlarm) {
          const hasWaterAlarm = station.level_in !== null && station.level_in > alarmThreshold;
          const hadWaterReason = prevAlarm.reasons.some(r => r.type === 'water_level');
          const hadPumpReason = prevAlarm.reasons.some(r => r.type === 'pump_start' || r.type === 'pump_stop');
          const hadGateReason = prevAlarm.reasons.some(r => r.type === 'gate_high_inner' || r.type === 'gate_low_inner');
          const hadTideReason = prevAlarm.reasons.some(r => r.type === 'tide_open_gate' || r.type === 'tide_close_gate');

          let keep = (hadWaterReason && hasWaterAlarm) || hadPumpReason || hadTideReason;
          if (hadGateReason) {
            const gs = stationGateAlarmSwitches[station.stationno];
            if (gs) {
              const li = station.level_in;
              const lo = station.level_out;
              const allClosed = station.doors.length > 0 && station.doors.every(d => d.status === '1');
              keep = keep || (gs.innerHighAlarm && li !== null && lo !== null && li > lo && allClosed);
            }
          }
          if (keep) newAlarming.push(prevAlarm);
        }
      }
    }

    // 測試警報合併
    for (const testNo of state.testAlarmStationNos) {
      if (!newAlarming.some(a => a.stationno === testNo)) {
        const testAlarm = state.alarmingStations.find(a => a.stationno === testNo);
        if (testAlarm) newAlarming.push(testAlarm);
      }
    }

    // 音頻管理
    const newNos = new Set(newAlarming.map((a) => a.stationno));
    for (const alarm of newAlarming) {
      const wasPreviouslyAlarming = prevAlarmingNos.has(alarm.stationno);
      const isNewAlarm = !wasPreviouslyAlarming;
      const stationDismissTs = alarmDismissTimestamps[alarm.stationno] ?? 0;
      const timeSinceDismissal = now - Math.max(stationDismissTs, lastFullDismissTime);
      const isInCooldown = timeSinceDismissal < ALARM_COOLDOWN_MS;

      if (isNewAlarm && !isInCooldown) {
        playStationAlarm(alarm.stationno, DEFAULT_ALARM_AUDIO_URL);
      }
    }
    prevAlarmingNos.forEach(prevNo => {
      if (!newNos.has(prevNo)) stopStationAlarm(prevNo);
    });

    set({
      alarmingStations: newAlarming,
      isAlarming: newAlarming.length > 0,
      previousPumpMap: newPumpMap,
      previousDoorMap: newDoorMap,
      lastAlarmedLevels: newLastAlarmed,
      pumpOperationLog: newPumpLog,
      gateOperationLog: newGateLog,
    });
  },

  dismissStationAlarm: (stationno) => {
    const now = Date.now();
    stopStationAlarm(stationno);
    set((s) => {
      const next = s.alarmingStations.filter((a) => a.stationno !== stationno);
      return {
        alarmingStations: next,
        isAlarming: next.length > 0,
        testAlarmStationNos: s.testAlarmStationNos.filter(n => n !== stationno),
        alarmDismissTimestamps: { ...s.alarmDismissTimestamps, [stationno]: now },
      };
    });
    if (get().alarmingStations.length === 0) {
      dismissBackgroundAlarm();
    }
  },

  dismissAllAlarms: () => {
    const now = Date.now();
    const state = get();
    const dismissTs: Record<string, number> = {};
    for (const a of state.alarmingStations) {
      dismissTs[a.stationno] = now;
    }
    stopAllAlarms();
    set({
      alarmingStations: [],
      isAlarming: false,
      testAlarmStationNos: [],
      alarmDismissTimestamps: { ...state.alarmDismissTimestamps, ...dismissTs },
      lastFullDismissTime: now,
    });
    dismissBackgroundAlarm();
  },

  simulateAlarm: () => {
    const state = get();
    const { stationData, selectedStations } = state;
    const targets = stationData
      .filter((s) => selectedStations.includes(s.stationno))
      .slice(0, Math.min(3, stationData.length));
    if (targets.length === 0) return;

    const simulated: StationAlarmInfo[] = targets.map((s) => ({
      stationno: s.stationno,
      stationName: s.stationName,
      reasons: [
        { type: 'water_level', detail: `模擬：水位 ${(Math.random() * 2 + 1).toFixed(2)}m` },
        { type: 'pump_start', detail: `#1 抽水機啟動`, pumpId: 1 },
      ],
    }));

    const newLastAlarmed = { ...state.lastAlarmedLevels };
    for (const s of targets) newLastAlarmed[s.stationno] = 99;

    for (const alarm of simulated) {
      playStationAlarm(alarm.stationno, DEFAULT_ALARM_AUDIO_URL);
    }
    set({
      alarmingStations: simulated,
      isAlarming: true,
      lastAlarmedLevels: newLastAlarmed,
      testAlarmStationNos: targets.map(s => s.stationno),
    });
  },

  addPumpOperationLog: (entry) =>
    set((s) => ({ pumpOperationLog: [...s.pumpOperationLog, entry] })),

  addGateOperationLog: (entry) =>
    set((s) => ({ gateOperationLog: [...s.gateOperationLog, entry] })),

  clearOperationLogs: () =>
    set({ pumpOperationLog: [], gateOperationLog: [] }),

  /** 取得指定站點的抽水機操作紀錄（最後 N 筆） */
  getPumpLogsByStation: (stationno) => {
    const state = get();
    return state.pumpOperationLog.filter(log => log.stationNo === stationno).slice(-100);
  },

  /** 取得指定站點的閘門操作紀錄（最後 N 筆） */
  getGateLogsByStation: (stationno) => {
    const state = get();
    return state.gateOperationLog.filter(log => log.stationNo === stationno).slice(-10);
  },

  /** 抑制指定站點的通知（用於避免重複通知） */
  suppressNotification: (stationno) => {
    set((s) => ({
      notificationSuppressed: { ...s.notificationSuppressed, [stationno]: true }
    }));
  },

  /** 解除抑制指定站點的通知 */
  resolveNotification: (stationno) => {
    set((s) => ({
      notificationSuppressed: { ...s.notificationSuppressed, [stationno]: false }
    }));
  },
});