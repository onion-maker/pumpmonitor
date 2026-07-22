import { useEffect } from 'react';
import { useStore } from '../store/useStore';

/**
 * 監控暗色模式的 hook
 * 會自動為 document HTML 元素添加/移除 dark class。
 */
export const useTheme = () => {
  const darkMode = useStore((s) => s.darkMode);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return { darkMode };
};