import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { checkBiometric, authenticateBiometric, cleanupBiometric } from '../utils/biometric';

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

  // unmount 時清除 window 上的 residual callback
  useEffect(() => {
    return () => {
      cleanupBiometric();
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