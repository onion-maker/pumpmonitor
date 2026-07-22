import { useEffect, useCallback } from 'react';
import { GITHUB_OWNER, GITHUB_REPO } from '../config/stations';

/**
 * 檢查 GitHub releases
 * 每 24 小時檢查一次是否需要更新。
 */
export const useVersionCheck = () => {
  /** 執行版本檢查 */
  const checkVersion = useCallback(async () => {
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });

      if (!response.ok) return null;

      const data = await response.json();
      return data.tag_name?.replace(/^v/, '') || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // 初始檢查
    checkVersion();

    // 每 24 小時檢查一次
    const interval = setInterval(checkVersion, 24 * 60 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [checkVersion]);

  return { checkVersion };
};
