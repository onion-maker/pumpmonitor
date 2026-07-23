import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface Props {
  level_in: number | null;
  level_out: number | null;
  alarmLevel?: number;
  height?: number;
  onChartClick?: () => void;
}

export default function WaterLevelChart({ 
  level_in, 
  level_out, 
  alarmLevel, 
  height = 50,
  onChartClick 
}: Props) {
  const data = [
    { time: '--', level_in: level_in ?? 0, level_out: level_out ?? 0 }
  ];

  const maxVal = Math.max(
    (level_in ?? 0) + 0.1,
    (level_out ?? 0) + 0.1,
    (alarmLevel ?? 1.0) + 0.1
  );
  const minVal = Math.min(level_in ?? 0, level_out ?? 0) - 0.1;

  return (
    <div 
      className="border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-800 cursor-pointer"
      onClick={onChartClick}
    >
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">水位趨勢</div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <XAxis dataKey="time" fontSize={8} tick={{ fontSize: 8 }} hide />
          <YAxis 
            fontSize={8} 
            tick={{ fontSize: 8 }} 
            domain={[minVal, maxVal]}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={((value: any, name: any) => {
              const numValue = Number(value);
              if (isNaN(numValue)) return ['--', name];
              return [`${numValue.toFixed(2)}m`, name === 'level_in' ? '內池' : '外池'];
            }) as any}
            contentStyle={{ fontSize: '10px', padding: '4px' }}
          />
          {alarmLevel !== null && (
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
            strokeWidth={2}
            dot={false}
            name="內池"
          />
          <Line
            type="monotone"
            dataKey="level_out"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="外池"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
