import { STATION_NAMES, VALID_STATIONS } from '../config/stations';

interface Props {
  selected: string[];
  order: string[];
  onChange: (ids: string[]) => void;
  onReorder: (order: string[]) => void;
}

export default function StationSelector({ selected, order, onChange, onReorder }: Props) {
  // 依 order 排序所有站點，未在 order 中的依 VALID_STATIONS 順序排在最後
  const sortedAll = [...VALID_STATIONS].sort((a, b) => {
    if (order.length === 0) return 0;
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return VALID_STATIONS.indexOf(a) - VALID_STATIONS.indexOf(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const allSelected = selected.length === VALID_STATIONS.length;

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      const next = selected.filter((x) => x !== id);
      const nextOrder = order.filter((x) => x !== id);
      if (next.length > 0) {
        onChange(next);
        onReorder(nextOrder);
      }
    } else {
      onChange([...selected, id]);
      // 勾選時移到排序最前面
      const nextOrder = [id, ...order.filter((x) => x !== id)];
      onReorder(nextOrder);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      onChange([]);
      onReorder([]);
    } else {
      onChange([...VALID_STATIONS]);
      onReorder([...VALID_STATIONS]);
    }
  };

  // ── HTML5 Drag & Drop ──
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetId) return;
    if (!selected.includes(draggedId)) return;

    const workingOrder = order.length > 0
      ? [...order.filter((x) => selected.includes(x))]
      : [...selected].sort((a, b) => VALID_STATIONS.indexOf(a) - VALID_STATIONS.indexOf(b));

    if (!workingOrder.includes(draggedId)) workingOrder.push(draggedId);
    if (!workingOrder.includes(targetId)) workingOrder.push(targetId);

    const draggedIdx = workingOrder.indexOf(draggedId);
    const targetIdx = workingOrder.indexOf(targetId);

    workingOrder.splice(draggedIdx, 1);
    workingOrder.splice(targetIdx, 0, draggedId);

    onReorder(workingOrder);
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">選擇監控站點</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
          />
          全選 / 全不選
        </label>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">按住拖曳可調整站點排列順序</p>

      <div className="space-y-1.5">
        {sortedAll.map((id) => {
          const checked = selected.includes(id);
          const name = STATION_NAMES[id] ?? id;
          return (
            <div
              key={id}
              draggable
              onDragStart={(e) => handleDragStart(e, id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, id)}
              className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${
                checked
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40'
                  : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
              }`}
            >
              <span className="text-gray-300 dark:text-gray-600 text-lg select-none shrink-0">⋮⋮</span>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(id)}
                className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 shrink-0"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                {name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}