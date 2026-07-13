import { useEffect, useState } from 'react';
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
  const [clock, setClock] = useState('');

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
        {/* 第一行：標題 + 按鈕 */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-900 leading-tight">
              <span className="block">水情警報系統</span>
              <span className="block text-sm font-medium text-gray-500">(第一分區)</span>
            </h1>

          <div className="flex items-center gap-2">
            {/* 測試警報（開發用） */}
            {!isAlarming && (
              <button onClick={simulateAlarm} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 active:scale-95 transition-all">
                🧪 測試警報
              </button>
            )}
            {/* 設定 */}
            <button onClick={() => setPage('settings')} className="flex items-center gap-1 p-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-95 transition-all" title="設定">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>
            <button onClick={onRefresh} disabled={isLoading} className="flex items-center gap-1 p-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 active:scale-95 transition-all" title="重新整理">
              <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 第二行：系統時間 + 連線狀態 */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {/* 系統時間 */}
          <span>🕐 {clock}</span>

          {/* 連線狀態 */}
          <span className={`inline-flex items-center gap-1 ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? '連線正常' : '連線異常'}
          </span>

          {/* 錯誤訊息 */}
          {fetchError && <span className="text-red-500">⚠ {fetchError}</span>}
        </div>

        {/* 第三行：最後更新時間（獨立一行，避免因時間長度跳動） */}
        {lastUpdateTime && (
          <div className="text-xs text-gray-400 mt-0.5">
            最後更新：{lastUpdateTime}
          </div>
        )}
      </div>
    </header>
  );
}