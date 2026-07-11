/**
 * App 更新檢查工具
 *
 * 透過 AndroidPump Bridge 檢查 GitHub Release，發現新版本時提示使用者更新。
 */

interface Bridge {
  checkUpdate: (owner: string, repo: string) => void;
  downloadAndInstall: (apkUrl: string) => void;
  getAppVersionCode: () => number;
  getAppVersionName: () => string;
}

function getBridge(): Bridge | null {
  try {
    return (window as any).AndroidPump ?? null;
  } catch {
    return null;
  }
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion: string;
  apkUrl: string;
  releaseNotes: string;
  error: string;
}

/**
 * 檢查是否有新版本
 * @param owner GitHub 擁有者（你的帳號）
 * @param repo  GitHub 專案名稱
 * @returns Promise<UpdateCheckResult>
 */
export function checkForUpdate(owner: string, repo: string): Promise<UpdateCheckResult> {
  const bridge = getBridge();
  if (!bridge) {
    return Promise.resolve({
      hasUpdate: false,
      latestVersion: '',
      apkUrl: '',
      releaseNotes: '',
      error: '不在 Android 原生環境中',
    });
  }

  return new Promise((resolve) => {
    // 設定 callback（先清除舊的）
    (window as any).__updateCallback__ = (jsonStr: string) => {
      (window as any).__updateCallback__ = undefined;
      try {
        const data = JSON.parse(jsonStr) as UpdateCheckResult;
        resolve(data);
      } catch {
        resolve({
          hasUpdate: false,
          latestVersion: '',
          apkUrl: '',
          releaseNotes: '',
          error: '解析結果失敗',
        });
      }
    };

    // 超時保護
    const timer = setTimeout(() => {
      if ((window as any).__updateCallback__) {
        (window as any).__updateCallback__ = undefined;
        resolve({
          hasUpdate: false,
          latestVersion: '',
          apkUrl: '',
          releaseNotes: '',
          error: '檢查逾時',
        });
      }
    }, 15000);

    bridge.checkUpdate(owner, repo);

    // 正常完成時清除 timeout
    const origCb = (window as any).__updateCallback__;
    (window as any).__updateCallback__ = (jsonStr: string) => {
      clearTimeout(timer);
      if (origCb) origCb(jsonStr);
    };
  });
}

/**
 * 下載 APK 並觸發安裝
 */
export function downloadAndInstall(apkUrl: string): void {
  const bridge = getBridge();
  if (bridge && apkUrl) {
    bridge.downloadAndInstall(apkUrl);
  }
}