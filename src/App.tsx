import { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from './store/useStore';
import MainPage from './pages/MainPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import { startBackgroundService, stopBackgroundService, syncSettingsToNative, isNative } from './utils/backgroundAlarm';
import { validateSession, clearSession } from './firebase/session';
import { checkForUpdate, downloadAndInstall } from './utils/appUpdate';
import { GITHUB_OWNER, GITHUB_REPO } from './config/stations';
import UpdateDialog from './components/UpdateDialog';
import type { UpdateCheckResult } from './utils/appUpdate';

export default function App() {
  const page = useStore((s) => s.page);
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const setIsLoggedIn = useStore((s) => s.setIsLoggedIn);
  const loadUserSettings = useStore((s) => s.loadUserSettings);
  const saveUserSettings = useStore((s) => s.saveUserSettings);
  const clearUserSettings = useStore((s) => s.clearUserSettings);
  const [isReady, setIsReady] = useState(false);
  const sessionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const lastSyncedRef = useRef('');

  /** 被踢出處理 */
  const handleKickedOut = useCallback(async (reason?: string) => {
    if (sessionCheckRef.current) {
      clearInterval(sessionCheckRef.current);
      sessionCheckRef.current = null;
    }
    saveUserSettings();
    clearUserSettings();
    if (isNative()) {
      stopBackgroundService();
    }
    setIsLoggedIn(false);
    try {
      const { getAuth, signOut } = await import('firebase/auth');
      const { getApp } = await import('firebase/app');
      await signOut(getAuth(getApp()));
    } catch { /* ignore */ }
    alert(reason || '此帳號已在另一裝置登入，您已被強制登出');
  }, [saveUserSettings, clearUserSettings, setIsLoggedIn]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { getAuth, onAuthStateChanged } = await import('firebase/auth');
        const { getApp } = await import('firebase/app');
        const auth = getAuth(getApp());

        onAuthStateChanged(auth, async (user) => {
          if (user && user.uid) {
            // 載入該使用者的個人設定
            loadUserSettings(user.uid);
            setIsLoggedIn(true);
            // 驗證 session（避免剛好另一裝置已登入蓋掉）
            const valid = await validateSession();
            if (!valid) {
              handleKickedOut();
              return;
            }
            // 登入後啟動背景服務 + 同步設定（先同步再啟動，避免 race）
            if (isNative()) {
              const state = useStore.getState();
              syncSettingsToNative({
                selectedStations: state.selectedStations,
                stationAlarmLevels: state.stationAlarmLevels,
                backgroundIntervalSec: state.backgroundIntervalSec,
              });
              startBackgroundService();
            }
          }
          setIsReady(true);
        });
      } catch {
        // Firebase 尚未設定，跳過登入
        setIsReady(true);
      }
    };

    checkAuth();
  }, [setIsLoggedIn, loadUserSettings]);

  // ── App 更新檢查（登入後檢查一次） ──
  useEffect(() => {
    if (!isReady || !isLoggedIn) return;
    if (!isNative()) return;

    let cancelled = false;
    checkForUpdate(GITHUB_OWNER, GITHUB_REPO).then((result) => {
      if (cancelled) return;
      if (result.hasUpdate && !result.error) {
        setUpdateInfo(result);
      }
    });

    return () => { cancelled = true; };
  }, [isReady, isLoggedIn]);

  // 設定變更時同步到 Native 背景服務（防抖 1 秒，僅設定實際有變時才同步）
  useEffect(() => {
    if (!isNative() || !isLoggedIn) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sync = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const state = useStore.getState();
        const snapshot = JSON.stringify({
          selectedStations: state.selectedStations,
          stationAlarmLevels: state.stationAlarmLevels,
          backgroundIntervalSec: state.backgroundIntervalSec,
        });
        // 設定沒變就不同步（避免每輪 poll 觸發）
        if (snapshot === lastSyncedRef.current) return;
        lastSyncedRef.current = snapshot;
        syncSettingsToNative({
          selectedStations: state.selectedStations,
          stationAlarmLevels: state.stationAlarmLevels,
          backgroundIntervalSec: state.backgroundIntervalSec,
        });
      }, 1000);
    };
    const unsub = useStore.subscribe(sync);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [isLoggedIn]);

  // ── Session 驗證：定時檢查（每 30 秒） + App 回到前景時檢查 ──
  useEffect(() => {
    if (!isLoggedIn) return;

    const check = async () => {
      const valid = await validateSession();
      if (!valid) {
        handleKickedOut();
      }
    };

    // 定時輪詢
    sessionCheckRef.current = setInterval(check, 30000);

    // 前景切換（螢幕解鎖、從其他 App 返回）
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        check();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (sessionCheckRef.current) {
        clearInterval(sessionCheckRef.current);
        sessionCheckRef.current = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isLoggedIn, handleKickedOut]);

  // 登出時儲存設定 + 停止背景服務 + 清除 Firestore session
  const handleLogout = async () => {
    saveUserSettings();
    clearUserSettings();
    if (isNative()) {
      stopBackgroundService();
    }
    await clearSession();  // 清除 Firestore session
    setIsLoggedIn(false);
    try {
      const { getAuth, signOut } = await import('firebase/auth');
      const { getApp } = await import('firebase/app');
      await signOut(getAuth(getApp()));
    } catch {
      // Firebase 未設定也繼續
    }
  };

  const handleUpdate = () => {
    if (updateInfo?.apkUrl) {
      downloadAndInstall(updateInfo.apkUrl);
    }
    setUpdateInfo(null);
  };

  const handleSkipUpdate = () => {
    setUpdateInfo(null);
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-500">載入中…</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  return page === 'main'
    ? (
      <>
        <MainPage />
        {updateInfo && (
          <UpdateDialog
            latestVersion={updateInfo.latestVersion}
            releaseNotes={updateInfo.releaseNotes}
            onUpdate={handleUpdate}
            onSkip={handleSkipUpdate}
          />
        )}
      </>
    )
    : <SettingsPage onLogout={handleLogout} />;
}