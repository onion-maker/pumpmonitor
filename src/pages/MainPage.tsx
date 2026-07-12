import { useStore } from '../store/useStore';
import { usePumpData } from '../hooks/usePumpData';
import Header from '../components/Header';
import RefreshTimer from '../components/RefreshTimer';
import StationCard from '../components/StationCard';
import AlarmBanner from '../components/AlarmBanner';

export default function MainPage() {
  const { refresh, isLoading, isInitialLoading } = usePumpData();
  const stationData = useStore((s) => s.stationData);
  const selectedStations = useStore((s) => s.selectedStations);
  const stationOrder = useStore((s) => s.stationOrder);
  const fetchError = useStore((s) => s.fetchError);
  const isAlarming = useStore((s) => s.isAlarming);
  const alarmingStations = useStore((s) => s.alarmingStations);
  const dismissAllAlarms = useStore((s) => s.dismissAllAlarms);

  // 過濾使用者選取的站點，依 stationOrder 排序
  const visibleStations = stationData
    .filter((s) => selectedStations.includes(s.stationno))
    .sort((a, b) => {
      if (stationOrder.length > 0) {
        const ai = stationOrder.indexOf(a.stationno);
        const bi = stationOrder.indexOf(b.stationno);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
      return 0;
    });

  return (
    <div className="min-h-screen bg-gray-50">
      <AlarmBanner />
      <Header onRefresh={refresh} isLoading={isLoading} />
      <RefreshTimer />

      {/* ── 警報確認浮動按鈕 ── */}
      {isAlarming && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-red-600/95 backdrop-blur-sm border-t border-red-400 shadow-[0_-4px_12px_rgba(220,38,38,0.3)]" style={{ paddingBottom: 'var(--sab)' }}>
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <span className="text-lg animate-pulse">🚨</span>
              <span className="font-semibold">
                {alarmingStations.length} 個站點警報中
              </span>
              <span className="text-sm text-red-200">
                （警報音持續播放中）
              </span>
            </div>
            <button
              onClick={dismissAllAlarms}
              className="px-6 py-2.5 text-base font-bold text-red-700 bg-white rounded-xl shadow-lg hover:bg-red-50 active:scale-95 transition-all animate-pulse"
            >
              ⚠ 警報確認
            </button>
          </div>
        </div>
      )}

      <main className={`max-w-7xl mx-auto px-4 pb-8 ${isAlarming ? 'pb-20' : ''}`}>
        {isInitialLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <svg className="w-10 h-10 text-blue-500 animate-spin mb-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-500">正在載入抽水站資料…</p>
          </div>
        ) : fetchError && visibleStations.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-red-500 text-lg mb-2">⚠ 無法取得資料</p>
            <p className="text-gray-400 text-sm mb-4">{fetchError}</p>
            <button
              onClick={refresh}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-95 transition-all"
            >
              重試
            </button>
          </div>
        ) : visibleStations.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg mb-2">當前沒有選取的站點</p>
            <p className="text-gray-400 text-sm">
              請前往設定頁面勾選您要監控的抽水站
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleStations.map((s) => (
              <StationCard key={s.stationno} station={s} />
            ))}
          </div>
        )}
      </main>

    </div>
  );
}