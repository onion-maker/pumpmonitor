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
import type { TideRecord } from '../../api/pumpStation';
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
  /** 記錄已警報過的 pump 事件 (stationNo:pumpId:action → timestamp)，避免歷史 API 重複觸發 */
  alarmedPumpEvents: Record<string, number>;
  /** 記錄已警報過的 door 事件，避免歷史 API 重複觸發 */
  alarmedDoorEvents: Record<string, number>;

  checkAlarm: (data: PumpStationData[]) => void;
  /** 用歷史 API 做 pump/door 逐對變化檢查（取代 snapshot 比對） */
  checkPumpHistoryAlarm: (data: PumpStationData[], history: Record<string, TideRecord[]>) => void;
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

const MAX_LOG_ENTRIES = 500;

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
  alarmedPumpEvents: {},
  alarmedDoorEvents: {},

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
            // 由「關」變成半開或全開 → 開啟
            if (prevDoorStatus === '1' && (door.status === '2' || door.status === '0')) {
              newGateLog.push({
                timestamp: now,
                stationNo: station.stationno,
                gateId: `door${String(door.id).padStart(2, '0')}`,
                action: 'open',
              });
            }
            // 由半開或全開變成「關」 → 關閉
            else if ((prevDoorStatus === '0' || prevDoorStatus === '2') && door.status === '1') {
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

  /** 用歷史 API (GetAutoPumpWaterMins) 做 pump/door 逐對變化檢查
   *  解決 30 秒 snapshot 輪詢會遺漏中間狀態變化的問題 */
  checkPumpHistoryAlarm: (data, history) => {
    const state = get();
    const now = Date.now();
    const ALARM_COOLDOWN_MS = 10 * 60 * 1000;

    if (!state.monitoringEnabled) return;
    if (Object.keys(history).length === 0) return;

    const { selectedStations, alarmDismissTimestamps, lastFullDismissTime,
            pumpOperationLog, gateOperationLog, alarmingStations: currentAlarms,
            alarmedPumpEvents, alarmedDoorEvents } = state;

    const newPumpLog: PumpOperationLogEntry[] = [...pumpOperationLog];
    const newGateLog: GateOperationLogEntry[] = [...gateOperationLog];
    const newAlarmedPumps = { ...alarmedPumpEvents };
    const newAlarmedDoor = { ...alarmedDoorEvents };

    // 收集這次歷史檢查產生的新警報原因
    const historyReasons: Record<string, AlarmReason[]> = {};

    for (const stationNo of Object.keys(history)) {
      if (!selectedStations.includes(stationNo)) continue;

      const stationDismissTs = alarmDismissTimestamps[stationNo] ?? 0;
      const inCooldown = (now - Math.max(stationDismissTs, lastFullDismissTime)) < ALARM_COOLDOWN_MS;
      if (inCooldown) continue;

      const records = history[stationNo];
      if (records.length < 2) continue;

      // 對每對相鄰 record 做 pump/door 狀態比較
      for (let i = 1; i < records.length; i++) {
        const prev = records[i - 1];
        const curr = records[i];

        // ── Pump 變化 ──
        for (let pId = 1; pId <= 16; pId++) {
          const pKey = `pumb${String(pId).padStart(2, '0')}`;
          const prevV = prev.pumps[pKey];
          const currV = curr.pumps[pKey];
          if (!currV || !prevV) continue;

          const prevRunning = prevV === '1' || prevV === '2' || prevV === '3';
          const nowRunning = currV === '1' || currV === '2' || currV === '3';

          if (prevV === '0' && nowRunning) {
            const dedupKey = `${stationNo}:${pId}:start`;
            // 去重：同一事件已經在 pumpOperationLog 或 alarmedPumpEvents 中就不重複
            const alreadyLogged = newPumpLog.some(
              l => l.stationNo === stationNo && l.pumpId === pId && l.action === 'start'
            );
            const alreadyAlarmed = newAlarmedPumps[dedupKey];
            if (!alreadyLogged && !alreadyAlarmed) {
              newAlarmedPumps[dedupKey] = now;
              newPumpLog.push({ timestamp: now, stationNo, pumpId: pId, action: 'start' });
              const reasons = historyReasons[stationNo] ?? [];
              reasons.push({
                type: 'pump_start',
                detail: `#${pId} 抽水機${PUMP_STATUS_LABEL[currV]}`,
                pumpId: pId,
              });
              historyReasons[stationNo] = reasons;
            }
          } else if (prevRunning && currV === '0') {
            const dedupKey = `${stationNo}:${pId}:stop`;
            const alreadyLogged = newPumpLog.some(
              l => l.stationNo === stationNo && l.pumpId === pId && l.action === 'stop'
            );
            const alreadyAlarmed = newAlarmedPumps[dedupKey];
            if (!alreadyLogged && !alreadyAlarmed) {
              newAlarmedPumps[dedupKey] = now;
              newPumpLog.push({ timestamp: now, stationNo, pumpId: pId, action: 'stop' });
              const reasons = historyReasons[stationNo] ?? [];
              reasons.push({
                type: 'pump_stop',
                detail: `#${pId} 抽水機停止`,
                pumpId: pId,
              });
              historyReasons[stationNo] = reasons;
            }
          }
        }

        // ── door 變化 ──
        for (let dId = 1; dId <= 16; dId++) {
          const dKey = `door${String(dId).padStart(2, '0')}`;
          const prevD = prev.doors[dKey];
          const currD = curr.doors[dKey];
          if (!currD || !prevD) continue;
          if (prevD === currD) continue;

          // 由「關」變成半開或全開 → 開啟
          if (prevD === '1' && (currD === '2' || currD === '0')) {
            const dedupKey = `${stationNo}:${dKey}:open`;
            const alreadyLogged = newGateLog.some(
              l => l.stationNo === stationNo && l.gateId === dKey && l.action === 'open'
            );
            const alreadyAlarmed = newAlarmedDoor[dedupKey];
            if (!alreadyLogged && !alreadyAlarmed) {
              newAlarmedDoor[dedupKey] = now;
              newGateLog.push({ timestamp: now, stationNo, gateId: dKey, action: 'open' });
            }
          }
          // 由半開或全開變成「關」 → 關閉
          else if ((prevD === '0' || prevD === '2') && currD === '1') {
            const dedupKey = `${stationNo}:${dKey}:close`;
            const alreadyLogged = newGateLog.some(
              l => l.stationNo === stationNo && l.gateId === dKey && l.action === 'close'
            );
            const alreadyAlarm = newAlarmedDoor[dedupKey];
            if (!alreadyLogged && !alreadyAlarm) {
              newAlarmedDoor[dedupKey] = now;
              newGateLog.push({ timestamp: now, stationNo, gateId: dKey, action: 'close' });
            }
          }
        }
      }
    }

    // ── 合併到現有警報列表 ──
    if (Object.keys(historyReasons).length === 0) {
      // 只更新 log 和去重表，不改變警報狀態
      set({ pumpOperationLog: newPumpLog, gateOperationLog: newGateLog,
        alarmedPumpEvents: newAlarmedPumps, alarmedDoorEvents: newAlarmedDoor });
      return;
    }

    const newAlarming: StationAlarmInfo[] = [...currentAlarms];

    for (const [stationNo, reasons] of Object.entries(historyReasons)) {
      if (reasons.length === 0) continue;
      const stationData = data.find(s => s.stationno === stationNo);
      const stationName = stationData?.stationName ?? stationNo;
      const existingIdx = newAlarming.findIndex(a => a.stationno === stationNo);
      if (existingIdx >= 0) {
        // 合併究 reasons 到既有警報項目中
        const merged = { ...newAlarming[existingIdx] };
        const existingReasonTexts = new Set(merged.reasons.map(r => r.detail));
        for (const r of reasons) {
          if (!existingReasonTexts.has(r.detail)) {
            merged.reasons = [...merged.reasons, r];
          }
        }
        newAlarming[existingIdx] = merged;
      } else {
        newAlarming.push({ stationno: stationNo, stationName, reasons });
      }
    }

    // 為新警報播放音頻
    const prevNos = new Set(currentAlarms.map(a => a.stationno));
    for (const [stationNo] of Object.entries(historyReasons)) {
      if (!prevNos.has(stationNo)) {
        playStationAlarm(stationNo, DEFAULT_ALARM_AUDIO_URL);
      }
    }

    set({
      alarmingStations: newAlarming,
      isAlarming: newAlarming.length > 0,
      pumpOperationLog: newPumpLog,
      gateOperationLog: newGateLog,
      alarmedPumpEvents: newAlarmedPumps,
      alarmedDoorEvents: newAlarmedDoor,
    });
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
    set((s) => ({ pumpOperationLog: [...s.pumpOperationLog.slice(-(MAX_LOG_ENTRIES - 1)), entry] })),

  addGateOperationLog: (entry) =>
    set((s) => ({ gateOperationLog: [...s.gateOperationLog.slice(-(MAX_LOG_ENTRIES - 1)), entry] })),

  clearOperationLogs: () =>
    set({ pumpOperationLog: [], gateOperationLog: [], alarmedPumpEvents: {}, alarmedDoorEvents: {} }),

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