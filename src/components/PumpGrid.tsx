import type { PumpStatus } from '../types';

interface PumpInfo {
  id: number;
  status: PumpStatus;
}

interface Props {
  pumps: PumpInfo[];
}

const STATUS_CONFIG: Record<PumpStatus, { label: string; className: string }> = {
  '0': { label: '停機', className: 'bg-gray-300' },
  '1': { label: '圖控運轉', className: 'bg-green-500 animate-pulse' },
  '2': { label: '全自動運轉', className: 'bg-blue-500 animate-pulse' },
  '3': { label: '現場手動運轉', className: 'bg-orange-500 animate-pulse' },
};

export default function PumpGrid({ pumps }: Props) {
  if (pumps.length === 0) {
    return (
      <div className="mb-3">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">抽水機</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">無抽水機資料</p>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">抽水機</p>
      <div className="grid grid-cols-4 gap-2">
        {pumps.map((p) => {
          const cfg = STATUS_CONFIG[p.status];
          return (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full ${cfg.className} shadow-sm`} title={cfg.label} />
              <span className="text-xs text-gray-500 dark:text-gray-400">#{p.id}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}