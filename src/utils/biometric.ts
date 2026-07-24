/**
 * Android 生物辨識（指紋/臉部）橋接工具
 * 透過 Capacitor WebView 的 window.AndroidBiometric 介面與原生 Java 溝通
 */

/** 檢查 Android 生物辨識是否可用 */
export async function checkBiometric(): Promise<boolean> {
  try {
    const bridge = (window as any).AndroidBiometric;
    return bridge && typeof bridge.isAvailable === 'function'
      ? bridge.isAvailable()
      : false;
  } catch {
    return false;
  }
}

/** 啟動 Android 生物辨識，15 秒 timeout */
export function authenticateBiometric(): Promise<'success' | 'failed' | 'error'> {
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

/** 清除 window 上的 residual callback（unmount 時呼叫） */
export function cleanupBiometric(): void {
  (window as any).__biometricResult__ = undefined;
}