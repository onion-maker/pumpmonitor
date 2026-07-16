import { useEffect, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { createSession } from '../firebase/session';

/** 檢查 Android 生物辨識是否可用 */
async function checkBiometric(): Promise<boolean> {
  try {
    const bridge = (window as any).AndroidBiometric;
    return bridge && typeof bridge.isAvailable === 'function'
      ? bridge.isAvailable()
      : false;
  } catch {
    return false;
  }
}

/** 啟動 Android 生物辨識 */
function authenticateBiometric(): Promise<'success' | 'failed' | 'error'> {
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
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const setIsLoggedIn = useStore((s) => s.setIsLoggedIn);
  const loadUserSettings = useStore((s) => s.loadUserSettings);

  // 只有使用者「已啟用」生物辨識時才顯示按鈕
  const biometricEnabled = useStore((s) => s.biometricEnabled);

  useEffect(() => {
    checkBiometric().then(setBiometricAvailable);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('請輸入帳號和密碼');
      return;
    }

    setLoading(true);
    try {
      const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
      const { getApp } = await import('firebase/app');
      const auth = getAuth(getApp());
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      // 載入該使用者的個人設定
      loadUserSettings(cred.user.uid);
      // 建立 Firestore session（單一裝置登入管制）
      await createSession(cred.user.uid);
      setIsLoggedIn(true);
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        setError('帳號或密碼錯誤');
      } else if (code === 'auth/too-many-requests') {
        setError('登入嘗試過多，請稍後再試');
      } else if (code === 'auth/invalid-email') {
        setError('Email 格式不正確');
      } else {
        setError('登入失敗，請檢查網路連線');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = useCallback(async () => {
    setBiometricLoading(true);
    setError(null);
    try {
      const result = await authenticateBiometric();
      if (result === 'success') {
        setIsLoggedIn(true);
      } else {
        setError('生物辨識驗證失敗');
      }
    } catch {
      setError('生物辨識驗證失敗');
    } finally {
      setBiometricLoading(false);
    }
  }, [setIsLoggedIn]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">水位監控系統</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">請登入您的帳號</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-700 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">⚠ {error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email 帳號</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@mail.com"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
          >
            {loading ? '登入中…' : '登入'}
          </button>
        </form>

        {/* 生物辨識 — 只有當使用者在設定中啟用後才顯示 */}
        {biometricAvailable && biometricEnabled && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleBiometric}
              disabled={biometricLoading}
              className="w-full py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zm6 6c0 2.21-1.343 4-6 4s-6-1.79-6-4c0-1.105.895-2 6-2s6 .895 6 2z" />
              </svg>
              {biometricLoading ? '驗證中…' : '指紋 / 臉部辨識登入'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}