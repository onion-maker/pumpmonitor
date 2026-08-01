// Type definitions for pump monitoring server

export type TideDirection = 'rising' | 'falling' | 'slack';
export type PumpStatus = '0' | '1' | '2' | '3';
export type DoorStatus = '0' | '1' | '2';

export interface RawStationData {
  stationno: string;
  stationtype: string | null;
  rectime: string;
  level_in: number | null;
  level_out: number | null;
  pumb01: string | null;
  pumb02: string | null;
  pumb03: string | null;
  pumb04: string | null;
  pumb05: string | null;
  pumb06: string | null;
  pumb07: string | null;
  pumb08: string | null;
  pumb09: string | null;
  pumb10: string | null;
  pumb11: string | null;
  pumb12: string | null;
  pumb13: string | null;
  pumb14: string | null;
  pumb15: string | null;
  pumb16: string | null;
  door01: string | null;
  door02: string | null;
  door03: string | null;
  door04: string | null;
  door05: string | null;
  door06: string | null;
  door07: string | null;
  door08: string | null;
  door09: string | null;
  door10: string | null;
  door11: string | null;
  door12: string | null;
  door13: string | null;
  door14: string | null;
  door15: string | null;
  door16: string | null;
}

export interface PumpStationData {
  stationno: string;
  stationName: string;
  rectime: Date | null;
  level_in: number | null;
  level_out: number | null;
  pumps: { id: number; status: PumpStatus }[];
  doors: { id: number; status: DoorStatus }[];
}

export interface TideRecord {
  stationno: string;
  rectime: string;
  level_in: number | null;
  level_out: number | null;
  doors: Record<string, string | null>;
  pumps: Record<string, string | null>;
}

export interface StationAlarmInfo {
  stationno: string;
  stationName: string;
  reasons: AlarmReason[];
}

export type AlarmReasonType =
  | 'water_level'
  | 'pump_start'
  | 'pump_stop'
  | 'gate_high_inner'
  | 'gate_low_inner'
  | 'tide_open_gate'
  | 'tide_close_gate';

export interface AlarmReason {
  type: AlarmReasonType;
  detail: string;
  pumpId?: number;
}

export interface PumpRecord {
  id: number;
  status: PumpStatus;
}

export interface GateRecord {
  id: number;
  status: DoorStatus;
}

export interface GateOperationLogEntry {
  timestamp: number;
  stationNo: string;
  gateId: string;
  action: 'open' | 'close';
  source?: 'tide';
}

export interface TideLogEntry {
  timestamp: number;
  stationNo: string;
  from: TideDirection;
  to: TideDirection;
}

export interface GateAlarmSwitches {
  innerHighAlarm: boolean;
  outerHighAlarm: boolean;
}

export interface TideAlarmSwitch {
  tideAlarm: boolean;
}

// For FCM
export interface FcmToken {
  uid: string;
  token: string;
  createdAt: number;
}