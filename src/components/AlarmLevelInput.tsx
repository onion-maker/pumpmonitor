import { useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function AlarmLevelInput({ value, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const num = parseFloat(raw);

    if (raw === '' || isNaN(num)) {
      setError('請輸入有效數值');
      return;
    }
    if (num > 10.0) {
      setError('最大值為 10.0 m');
      return;
    }

    setError(null);
    onChange(Math.round(num * 100) / 100);
  };

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">警報水位門檻</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        當站點內水位（level_in）超過此數值時觸發警報
      </p>

      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={handleChange}
          step="0.01"
          min="-10.0"
          max="10.0"
          className="w-32 px-3 py-2 text-lg font-mono text-gray-900 dark:text-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">公尺 (m)</span>
      </div>

      {error && <p className="mt-1 text-sm text-red-500">⚠ {error}</p>}
    </div>
  );
}