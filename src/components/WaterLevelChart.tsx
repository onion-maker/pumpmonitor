import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { TideRecord } from '../api/pumpStation';

interface Props {
  /** 歷史水位紀錄陣列（按 rectime 排序），傳入 [] 或空陣列時顯示 null state */
  records: TideRecord[];
  alarmLevel?: number;
  height?: number;
  onChartClick?: () => void;
}

/** 將 14 位 rectime 字串 "YYYYMMDDHHmmss" 格式化成圖表 X 軸 label */
function formatTime(raw: string): string {
  // 取 HH:mm
  if (raw.length >= 12) {
    return `${raw.substring(8, 10)}:${raw.substring(10, 12)}`;
  }
  return raw;
}

export default function WaterLevelChart({
  records,
  alarmLevel,
  height = 50,
  onChartClick,
}: Props) {
  // 無歷史資料時顯示單點（fallback 到目前即時值無法做，因為這裡不接收 level_in/level_out）
  const hasData = records.length > 0;

  const chartData = hasData
    ? records.map((r) => ({
        time: formatTime(r.rectime),
        level_in: r.level_in ?? null,
        level_out: r.level_out ?? null,
      }))
    : [];

  // domain 計算：取歷史資料中所有有效值的 min/max
  let maxVal = alarmLevel ?? 1.0;
  let minVal = 0;
  if (hasData) {
    const allVals = records.flatMap((r) => [r.level_in, r.level_out].filter((v): v is number => v !== null));
    if (allVals.length > 0) {
      const hi = Math.max(...allVals);
      const lo = Math.min(...allVals);
      const pad = (hi - lo) * 0.3 || 0.2;
      maxVal = Math.max(hi + pad, alarmLevel ?? 1.0);
      minVal = Math.max(0, lo - pad);
    }
  }

  if (!hasData) {
    return (
      <div
        className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800 cursor-pointer"
        onClick={onChartClick}
      >
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">水位趨勢</div>
        <div className="flex items-center justify-center text-xs text-gray-400 dark:text-gray-500" style={{ height }}>
          尚無歷史資料
        </div>
      </div>
    );
  }

  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800 cursor-pointer"
      onClick={onChartClick}
    >
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">水位趨勢</div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData}>
          <XAxis dataKey="time" fontSize={8} tick={{ fontSize: 8 }} interval="preserveStartEnd" />
          <YAxis
            fontSize={8}
            tick={{ fontSize: 8 }}
            domain={[minVal, maxVal]}
            tickFormatter={(v: number) => v.toFixed(2)}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={((value: any, name: any) => {
              const numValue = Number(value);
              if (isNaN(numValue)) return ['--', name];
              return [`${numValue.toFixed(2)}m`, name === 'level_in' ? '內池' : '外池'];
            }) as any}
            labelFormatter={(label) => `時間: ${label}`}
            contentStyle={{ fontSize: '10px', padding: '4px' }}
          />
          {alarmLevel !== undefined && (
            <ReferenceLine
              y={alarmLevel}
              stroke="#ef4444"
              strokeDasharray="3 3"
            />
          )}
          <Line
            type="monotone"
            dataKey="level_in"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
            name="內池"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="level_out"
            stroke="#10b981"
            strokeWidth={1.5}
            dot={false}
            name="外池"
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}