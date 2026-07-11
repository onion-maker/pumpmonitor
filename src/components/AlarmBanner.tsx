import { useStore } from '../store/useStore';

const REASON_ICONS: Record<string, string> = {
  water_level: '🚨',
  pump_start: '🟢',
  pump_stop: '🔴',
};

export default function AlarmBanner() {
  const alarmingStations = useStore((s) => s.alarmingStations);
  const dismissStationAlarm = useStore((s) => s.dismissStationAlarm);
  const dismissAllAlarms = useStore((s) => s.dismissAllAlarms);

  if (alarmingStations.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white shadow-lg animate-slideDown" style={{ paddingTop: 'var(--sat)' }}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* 頂部標題列 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl animate-pulse">🚨</span>
            <span className="font-bold">
              警報！{alarmingStations.length} 個站點觸發警報
            </span>
          </div>
          <button
            onClick={dismissAllAlarms}
            className="px-3 py-1 text-sm font-medium bg-red-500 hover:bg-red-400 rounded-lg transition-colors active:scale-95"
          >
            全部確認
          </button>
        </div>

        {/* 各站警報明細 */}
        <div className="space-y-1">
          {alarmingStations.map((alarm) => (
            <div
              key={alarm.stationno}
              className="flex items-center justify-between bg-red-500/40 rounded-lg px-3 py-1.5"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  {alarm.stationName}
                  <span className="text-red-200 ml-1">#{alarm.stationno}</span>
                </span>
                {alarm.reasons.map((r, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-xs bg-red-400/40 px-2 py-0.5 rounded-full"
                  >
                    {REASON_ICONS[r.type] ?? '⚠'} {r.detail}
                  </span>
                ))}
              </div>
              <button
                onClick={() => dismissStationAlarm(alarm.stationno)}
                className="ml-2 text-xs text-red-200 hover:text-white transition-colors shrink-0"
                title={`關閉 ${alarm.stationName} 警報`}
              >
                ✕ 關閉
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}