import { useState } from 'react';
import type { PumpStationData, AlarmReason, GateAlarmSwitches } from '../types';
import { useStore } from '../store/useStore';
import { DEFAULT_ALARM_LEVEL } from '../config/stations';
import { TIDE_STATIONS } from '../config/stations';
import WaterLevelBar from './WaterLevelBar';
import WaterLevelChart from './WaterLevelChart';
import PumpGrid from './PumpGrid';
import DoorGrid from './DoorGrid';

interface Props {
  station: PumpStationData;
}

const REASON_ICONS: Record<string, string> = {
  water_level: '🚨',
  pump_start: '🟢',
  pump_stop: '🔴',
  gate_high_inner: '⬆',
  gate_low_inner: '⬇',
  tide_open_gate: '↗',
  tide_close_gate: '↘',
};

/** 單一警報原因 badge */
function AlarmReasonBadge({ reason }: { reason: AlarmReason }) {
  const icon = REASON_ICONS[reason.type] ?? '⚠';
  const colors: Record<string, string> = {
    water_level: 'bg-red-100 text-red-700 border-red-300',
    pump_start: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    pump_stop: 'bg-orange-100 text-orange-700 border-orange-300',
    gate_high_inner: 'bg-purple-100 text-purple-700 border-purple-300',
    gate_low_inner: 'bg-blue-100 text-blue-700 border-blue-300',
    tide_open_gate: 'bg-teal-100 text-teal-700 border-teal-300',
    tide_close_gate: 'bg-amber-100 text-amber-700 border-amber-300',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[reason.type] ?? 'bg-gray-100 text-gray-700'}`}
      title={reason.detail}
    >
      {icon} {reason.detail}
    </span>
  );
}

/** 閘門警報開關元件 */
function GateAlarmToggle({ station }: Props) {
  const stationGateAlarmSwitches = useStore((s) => s.stationGateAlarmSwitches);
  const setStationGateAlarmSwitch = useStore((s) => s.setStationGateAlarmSwitch);
  const stationTideAlarmSwitches = useStore((s) => s.stationTideAlarmSwitches);
  const setStationTideAlarmSwitch = useStore((s) => s.setStationTideAlarmSwitch);

  const isTideStation = TIDE_STATIONS.includes(station.stationno);

  const current: GateAlarmSwitches = stationGateAlarmSwitches[station.stationno] ?? {
    innerHighAlarm: false,
    outerHighAlarm: false,
  };

  const tideCurrent = stationTideAlarmSwitches[station.stationno] ?? { tideAlarm: false };

  const toggle = (key: keyof GateAlarmSwitches) => {
    setStationGateAlarmSwitch(station.stationno, {
      ...current,
      [key]: !current[key],
    });
  };

  return (
    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">閘門警報條件</p>
      <label className="flex items-center justify-between cursor-pointer">
        <span className={`text-xs ${current.innerHighAlarm ? 'text-purple-600 dark:text-purple-400 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>內高外低閘門未開時告警</span>
        <button
          type="button"
          role="switch"
          aria-checked={current.innerHighAlarm}
          onClick={() => toggle('innerHighAlarm')}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
            current.innerHighAlarm ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-600'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
              current.innerHighAlarm ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </label>
      {isTideStation && (
        <label className="flex items-center justify-between cursor-pointer">
          <span className={`text-xs ${tideCurrent.tideAlarm ? 'text-teal-600 dark:text-teal-400 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>潮汐站閘門啟閉提醒</span>
          <button
            type="button"
            role="switch"
            aria-checked={tideCurrent.tideAlarm}
            onClick={() =>
              setStationTideAlarmSwitch(station.stationno, {
                tideAlarm: !tideCurrent.tideAlarm,
              })
            }
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              tideCurrent.tideAlarm ? 'bg-teal-500' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                tideCurrent.tideAlarm ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </label>
      )}
    </div>
  );
}

export default function StationCard({ station }: Props) {
  const stationAlarmLevels = useStore((s) => s.stationAlarmLevels);
  const setStationAlarmLevel = useStore((s) => s.setStationAlarmLevel);
  const alarmingStations = useStore((s) => s.alarmingStations);
  const dismissStationAlarm = useStore((s) => s.dismissStationAlarm);
  const tideDirection = useStore((s) => s.tideDirection);

  const alarmLevel = stationAlarmLevels[station.stationno] ?? DEFAULT_ALARM_LEVEL;
  const [editValue, setEditValue] = useState(alarmLevel.toFixed(2));

  // 該站是否有警報
  const stationAlarm = alarmingStations.find(
    (a) => a.stationno === station.stationno,
  );
  const isAlarm = !!stationAlarm;

  // 水位是否超過警報值
  const isWaterAlarm =
    station.level_in !== null && station.level_in > alarmLevel;

  const timeStr = station.rectime
    ? station.rectime.toLocaleString('zh-TW')
    : '--';

  const handleLevelBlur = () => {
    const num = parseFloat(editValue);
    if (!isNaN(num) && num >= -10.0 && num <= 10.0) {
      setStationAlarmLevel(station.stationno, Math.round(num * 100) / 100);
    } else {
      setEditValue(alarmLevel.toFixed(2));
    }
  };

  const handleLevelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setEditValue(alarmLevel.toFixed(2));
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div
      className={`rounded-xl border p-4 transition-shadow duration-200 hover:shadow-md ${
        isAlarm
          ? 'border-red-400 bg-red-50 shadow-md dark:bg-red-950/40 dark:border-red-700'
          : 'border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:hover:shadow-gray-800/50'
      }`}
    >
      {/* 站名 + 站號 + 時間 */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {station.stationName}
          </h3>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{timeStr}</span>
      </div>

      {/* 警報原因 badges */}
      {stationAlarm && stationAlarm.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {stationAlarm.reasons.map((r, i) => (
            <AlarmReasonBadge key={`${r.type}-${r.pumpId ?? i}`} reason={r} />
          ))}
          <button
            onClick={() => dismissStationAlarm(station.stationno)}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 ml-1"
            title="關閉此站警報"
          >
            ✕
          </button>
        </div>
      )}

      {/* 警報水位輸入 */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">警報水位:</label>
        <input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleLevelBlur}
          onKeyDown={handleLevelKeyDown}
          step="0.01"
          min="-10.0"
          max="10.0"
          className={`w-20 px-1.5 py-0.5 text-sm font-mono border rounded text-center outline-none
            ${isWaterAlarm
              ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400'
              : 'border-gray-300 text-gray-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-300 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:focus:border-blue-500 dark:focus:ring-blue-800'
            }`}
        />
        <span className="text-xs text-gray-400 dark:text-gray-500">m</span>
        {TIDE_STATIONS.includes(station.stationno) && (() => {
          const dir = tideDirection[station.stationno];
          if (!dir) {
            return <span className="text-lg font-bold text-gray-400 dark:text-gray-500 ml-auto">潮汐判定中</span>;
          }
          if (dir === 'slack') {
            return <span className="text-lg font-bold text-gray-400 dark:text-gray-500 ml-auto">平潮</span>;
          }
          if (dir === 'rising') {
            return <span className="text-lg font-bold text-red-500 ml-auto">漲潮</span>;
          }
          return <span className="text-lg font-bold text-blue-500 ml-auto">退潮</span>;
        })()}
        {stationAlarmLevels[station.stationno] !== undefined && (
          <span className="text-xs text-blue-500 dark:text-blue-400" title="已自訂">
            ●
          </span>
        )}
      </div>

      {/* 水位 */}
      <WaterLevelBar
        label="內池水位"
        value={station.level_in}
        alarmLevel={alarmLevel}
        isAlert={isWaterAlarm}
      />
      <WaterLevelBar
        label="外池水位"
        value={station.level_out}
        alarmLevel={alarmLevel}
        isAlert={false}
        showThreshold={false}
      />

      {/* 水位曲線圖 */}
      <WaterLevelChart
        level_in={station.level_in}
        level_out={station.level_out}
        alarmLevel={alarmLevel}
      />

      {/* 抽水機 */}
      <PumpGrid pumps={station.pumps} />

      {/* 閘門 */}
      <DoorGrid doors={station.doors} />

      {/* 閘門警報開關 */}
      <GateAlarmToggle station={station} />
    </div>
  );
}