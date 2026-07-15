import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { POLL_INTERVAL_MS } from '../config/stations';

/** 距離下次自動更新的倒數秒數 */
export default function RefreshTimer() {
  const lastUpdateTime = useStore((s) => s.lastUpdateTime);
  const monitoringEnabled = useStore((s) => s.monitoringEnabled);
  const [remain, setRemain] = useState(POLL_INTERVAL_MS / 1000);
  const [showUpdating, setShowUpdating] = useState(false);

  // 監控暫停時不顯示倒數行
  if (!monitoringEnabled) return null;

  // 當 lastUpdateTime 改變（代表剛完成一次更新），重設計時器
  useEffect(() => {
    setRemain(POLL_INTERVAL_MS / 1000);
    setShowUpdating(true);
    const t = setTimeout(() => setShowUpdating(false), 1500);
    return () => clearTimeout(t);
  }, [lastUpdateTime]);

  // 每秒倒數
  useEffect(() => {
    const id = setInterval(() => {
      setRemain((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 倒數到 0 時顯示「更新中…」，等 lastUpdateTime 改變後自動重置
  if (remain === 0 || showUpdating) {
    return (
      <div className="text-center py-2">
        <span className="text-xs text-gray-400">更新中…</span>
      </div>
    );
  }

  return (
    <div className="text-center py-2">
      <span className="text-xs text-gray-400">{remain} 秒後自動更新</span>
    </div>
  );
}