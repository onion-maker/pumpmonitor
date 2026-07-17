import { useState, useEffect } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function AlarmLevelInput({ value, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  /* 本地字串 state：讓輸入中的中間狀態（"-"、"-1"）不會被數字 state 彈回 */
  const [inputValue, setInputValue] = useState(String(value));

  /* 外部 prop 變化時同步到本地（例如重新載入設定） */
  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setInputValue(raw);

    /* 允許輸入中的負號中間狀態 */
    if (raw === '' || raw === '-' || raw === '-.') {
      setError(null);
      return;
    }

    const num = parseFloat(raw);

    if (isNaN(num)) {
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
          value={inputValue}
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