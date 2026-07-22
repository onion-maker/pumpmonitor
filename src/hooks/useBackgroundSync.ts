import { useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { isNative } from '../utils/backgroundAlarm';

/**
 * 背景同步 hook
 * 當 App 從背景切換到前景時，確保設定已同步到 Android 服務。
 */
export const useBackgroundSync = () => {
  const monitoringEnabled = useStore((s) => s.monitoringEnabled);
  const setMonitoringEnabled = useStore((s) => s.setMonitoringEnabled);

  /** 同步設定到 native 端（供外部調用） */
  const syncSettingsToNative = useCallback(() => {
    if (!isNative()) return;
    try {
      const bridge = (window as any).AndroidPump;
      if (bridge && typeof bridge.syncSettingsToNative === 'function') {
        const settings = { monitoringEnabled };
        bridge.syncSettingsToNative(JSON.stringify(settings));
      }
    } catch {
      // ignore
    }
  }, [monitoringEnabled]);

  useEffect(() => {
    // 監聽視覺化變化，App 前景切換時同步
    const handleVisibilityChange = () => {
      if (!document.hidden && monitoringEnabled) {
        syncSettingsToNative();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [monitoringEnabled, syncSettingsToNative]);

  return {
    monitoringEnabled,
    setMonitoringEnabled,
    syncSettingsToNative,
  };
};