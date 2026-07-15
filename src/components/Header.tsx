import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';

interface Props {
  onRefresh: () => void;
  isLoading: boolean;
}

export default function Header({ onRefresh, isLoading }: Props) {
  const lastUpdateTime = useStore((s) => s.lastUpdateTime);
  const fetchError = useStore((s) => s.fetchError);
  const setPage = useStore((s) => s.setPage);
  const simulateAlarm = useStore((s) => s.simulateAlarm);
  const isAlarming = useStore((s) => s.isAlarming);
  const stationData = useStore((s) => s.stationData);
  const monitoringEnabled = useStore((s) => s.monitoringEnabled);
  const setMonitoringEnabled = useStore((s) => s.setMonitoringEnabled);
  const [clock, setClock] = useState('');

  const handleToggleMonitoring = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setMonitoringEnabled(e.target.checked);
  }, [setMonitoringEnabled]);

  // 系統時鐘（每秒更新）
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // 連線狀態：有資料且無錯誤 = OK
  const isConnected = stationData.length > 0 && !fetchError;

  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-200" style={{ paddingTop: 'var(--sat)' }}>
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* 第一行：標題 + 監控開關 */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
              <span className="block">水情警報系統</span>
              <span className="block text-sm font-medium text-gray-500">(第一分區)</span>
            </h1>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{monitoringEnabled ? '監控中' : '已暫停'}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={monitoringEnabled}
                onChange={handleToggleMonitoring}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
            {/* 測試警報 */}
            {!isAlarming && (
              <button onClick={simulateAlarm} className="flex items-center gap-0.5 text-xs text-orange-400 hover:text-orange-600 active:scale-95 transition-all" title="測試警報">
                <span>🧪</span><span>測試</span>
              </button>
            )}
          </div>
        </div>

        {/* 第二、三行合併：狀態（左） | 設定 + 重整（右，跨兩行垂直居中） */}
        <div className="flex justify-between gap-2">
          <div className="min-w-0">
            {/* 連線狀態 + 時鐘 */}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>🕐 {clock}</span>
              <span className={`inline-flex items-center gap-1 shrink-0 ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                {isConnected ? '連線正常' : '連線異常'}
              </span>
              {fetchError && <span className="text-red-500 truncate">⚠ {fetchError}</span>}
            </div>
            {/* 最後更新時間 */}
            {lastUpdateTime && (
              <div className="text-xs text-gray-400 mt-0.5">
                最後更新：{lastUpdateTime}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setPage('settings')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg active:scale-95 transition-all" title="設定">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>
            <button onClick={onRefresh} disabled={isLoading} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-30 active:scale-95 transition-all" title="重新整理">
              <svg className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}