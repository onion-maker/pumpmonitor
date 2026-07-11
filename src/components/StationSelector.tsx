import { STATION_NAMES, VALID_STATIONS } from '../config/stations';

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
}

export default function StationSelector({ selected, onChange }: Props) {
  const allSelected = selected.length === VALID_STATIONS.length;

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      const next = selected.filter((x) => x !== id);
      // 至少要選一個
      if (next.length > 0) onChange(next);
    } else {
      onChange([...selected, id]);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
    } else {
      onChange([...VALID_STATIONS]);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">選擇監控站點</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          全選 / 全不選
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {VALID_STATIONS.map((id) => {
          const checked = selected.includes(id);
          return (
            <label
              key={id}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                checked
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(id)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                {STATION_NAMES[id]}
                <span className="text-xs text-gray-400 ml-0.5">#{id}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}