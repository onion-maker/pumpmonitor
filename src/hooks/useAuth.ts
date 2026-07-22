import { useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';

/**
 * 處理生物辨識登入的 hook
 * 提供內建的生物辨識檢查與驗證功能。
 */
export const useAuth = () => {
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const currentUid = useStore((s) => s.currentUid);
  const setIsLoggedIn = useStore((s) => s.setIsLoggedIn);
  const loadUserSettings = useStore((s) => s.loadUserSettings);
  const clearUserSettings = useStore((s) => s.clearUserSettings);

  /** 檢查 Android 生物辨識是否可用 */
  const checkBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const bridge = (window as any).AndroidBiometric;
      return bridge && typeof bridge.isAvailable === 'function'
        ? bridge.isAvailable()
        : false;
    } catch {
      return false;
    }
  }, []);

  /** 驗證生物辨識 */
  const authenticateBiometric = useCallback((): Promise<'success' | 'failed' | 'error'> => {
    return new Promise((resolve) => {
      const bridge = (window as any).AndroidBiometric;
      if (!bridge || typeof bridge.authenticate !== 'function') {
        resolve('error');
        return;
      }

      (window as any).__biometricResult__ = (result: string) => {
        (window as any).__biometricResult__ = undefined;
        resolve(result as 'success' | 'failed' | 'error');
      };

      bridge.authenticate();

      setTimeout(() => {
        if ((window as any).__biometricResult__) {
          (window as any).__biometricResult__ = undefined;
          resolve('error');
        }
      }, 15000);
    });
  }, []);

  useEffect(() => {
    // 可選的：添加日誌或其他副作用
    return () => {
      // cleanup
    };
  }, []);

  return {
    isLoggedIn,
    currentUid,
    setIsLoggedIn,
    loadUserSettings,
    clearUserSettings,
    checkBiometric,
    authenticateBiometric,
  };
};