import { useState } from 'react';
import type { PumpStationData, AlarmReason } from '../types';
import { useStore } from '../store/useStore';
import { DEFAULT_ALARM_LEVEL } from '../config/stations';
import WaterLevelBar from './WaterLevelBar';
import PumpGrid from './PumpGrid';
import DoorGrid from './DoorGrid';

interface Props {
  station: PumpStationData;
}

const REASON_ICONS: Record<string, string> = {
  water_level: '🚨',
  pump_start: '🟢',
  pump_stop: '🔴',
};

/** 單一警報原因 badge */
function AlarmReasonBadge({ reason }: { reason: AlarmReason }) {
  const icon = REASON_ICONS[reason.type] ?? '⚠';
  const colors: Record<string, string> = {
    water_level: 'bg-red-100 text-red-700 border-red-300',
    pump_start: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    pump_stop: 'bg-orange-100 text-orange-700 border-orange-300',
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

export default function StationCard({ station }: Props) {
  const stationAlarmLevels = useStore((s) => s.stationAlarmLevels);
  const setStationAlarmLevel = useStore((s) => s.setStationAlarmLevel);
  const alarmingStations = useStore((s) => s.alarmingStations);
  const dismissStationAlarm = useStore((s) => s.dismissStationAlarm);

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
    if (!isNaN(num) && num >= 0.01 && num <= 10.0) {
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
          ? 'border-red-400 bg-red-50 shadow-md'
          : 'border-gray-200 bg-white shadow-sm'
      }`}
    >
      {/* 站名 + 站號 + 時間 */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {station.stationName}
            <span className="ml-1 text-sm font-normal text-gray-400">
              #{station.stationno}
            </span>
          </h3>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">{timeStr}</span>
      </div>

      {/* 警報原因 badges */}
      {stationAlarm && stationAlarm.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {stationAlarm.reasons.map((r, i) => (
            <AlarmReasonBadge key={`${r.type}-${r.pumpId ?? i}`} reason={r} />
          ))}
          <button
            onClick={() => dismissStationAlarm(station.stationno)}
            className="text-xs text-gray-400 hover:text-gray-600 ml-1"
            title="關閉此站警報"
          >
            ✕
          </button>
        </div>
      )}

      {/* 警報水位輸入 */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-gray-500 whitespace-nowrap">警報水位:</label>
        <input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleLevelBlur}
          onKeyDown={handleLevelKeyDown}
          step="0.01"
          min="0.01"
          max="10.0"
          className={`w-20 px-1.5 py-0.5 text-sm font-mono border rounded text-center outline-none
            ${isWaterAlarm
              ? 'border-red-400 bg-red-50 text-red-700'
              : 'border-gray-300 text-gray-700 focus:border-blue-400 focus:ring-1 focus:ring-blue-300'
            }`}
        />
        <span className="text-xs text-gray-400">m</span>
        {stationAlarmLevels[station.stationno] !== undefined && (
          <span className="text-xs text-blue-500" title="已自訂">
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

      {/* 抽水機 */}
      <PumpGrid pumps={station.pumps} />

      {/* 閘門 */}
      <DoorGrid doors={station.doors} />
    </div>
  );
}