/**
 * 背景警報工具 — 與 Android 原生 PumpMonitorService 通訊
 *
 * 提供前端的設定同步、服務啟停，確保手機螢幕關閉時仍能收到警報通知。
 */

interface Bridge {
  startService: () => void;
  stopService: () => void;
  isServiceRunning: () => boolean;
  syncSettings: (json: string) => void;
}

/** 取得 Android 原生橋接物件（不存在時回傳 null） */
function getBridge(): Bridge | null {
  try {
    return (window as any).AndroidPump ?? null;
  } catch {
    return null;
  }
}

/** 是否在 Android 原生環境中 */
export function isNative(): boolean {
  return getBridge() !== null;
}

/** 啟動背景服務 */
export function startBackgroundService(): void {
  const bridge = getBridge();
  if (bridge) {
    bridge.startService();
  }
}

/** 停止背景服務 */
export function stopBackgroundService(): void {
  const bridge = getBridge();
  if (bridge) {
    bridge.stopService();
  }
}

/** 背景服務是否正在執行 */
export function isBackgroundServiceRunning(): boolean {
  const bridge = getBridge();
  return bridge ? bridge.isServiceRunning() : false;
}

/**
 * 將使用者設定同步到 Native SharedPreferences
 * 供背景服務讀取（水位門檻、選取站點）
 */
export function syncSettingsToNative(params: {
  selectedStations: string[];
  stationAlarmLevels: Record<string, number>;
}): void {
  const bridge = getBridge();
  if (!bridge) return;

  const payload = JSON.stringify({
    selectedStations: JSON.stringify(params.selectedStations),
    stationAlarmLevels: JSON.stringify(params.stationAlarmLevels),
  });

  bridge.syncSettings(payload);
}