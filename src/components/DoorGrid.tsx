import type { DoorStatus } from '../types';

interface DoorInfo {
  id: number;
  status: DoorStatus;
}

interface Props {
  doors: DoorInfo[];
}

const STATUS_CONFIG: Record<DoorStatus, { label: string; icon: string; className: string }> = {
  '0': { label: '開啟', icon: '↑', className: 'bg-green-100 text-green-700 border-green-300' },
  '1': { label: '關閉', icon: '↓', className: 'bg-gray-100 text-gray-700 border-gray-300' },
  '2': { label: '半開', icon: '◐', className: 'bg-red-100 text-red-700 border-red-300' },
};

export default function DoorGrid({ doors }: Props) {
  if (doors.length === 0) {
    return (
      <div className="mb-1">
        <p className="text-sm text-gray-500 mb-1">閘門</p>
        <p className="text-xs text-gray-400 italic">無閘門資料</p>
      </div>
    );
  }

  return (
    <div className="mb-1">
      <p className="text-sm text-gray-600 mb-2">閘門</p>
      <div className="flex flex-wrap gap-2">
        {doors.map((d) => {
          const cfg = STATUS_CONFIG[d.status];
          return (
            <span
              key={d.id}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}
              title={cfg.label}
            >
              {cfg.icon} #{d.id} {cfg.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}