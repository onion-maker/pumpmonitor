import { useMemo } from 'react';
import { calcLevelPercent } from '../utils/format';

interface Props {
  label: string;
  value: number | null;
  alarmLevel: number;
  isAlert: boolean;
  showThreshold?: boolean;  // 是否顯示警報標記線
}

export default function WaterLevelBar({ label, value, alarmLevel, isAlert, showThreshold = true }: Props) {
  const pct = useMemo(() => calcLevelPercent(value, alarmLevel), [value, alarmLevel]);

  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
        <span className={`text-lg font-mono font-bold ${isAlert ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {value !== null ? `${value.toFixed(2)} m` : '--'}
        </span>
      </div>
      <div className="relative w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        {/* 水位填充條 */}
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isAlert ? 'bg-red-500 animate-shake' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
        {/* 警報標記線（可選） */}
        {showThreshold && (
          <div
            className="absolute top-0 bottom-0 border-l-2 border-red-600 z-10"
            style={{ left: `${calcLevelPercent(alarmLevel, alarmLevel)}%` }}
          />
        )}
      </div>
      {/* 圖例 */}
      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        <span>0</span>
        {showThreshold && (
          <span className="text-red-500">警報: {alarmLevel.toFixed(2)}m</span>
        )}
      </div>
    </div>
  );
}