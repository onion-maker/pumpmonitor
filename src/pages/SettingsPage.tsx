import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import StationSelector from '../components/StationSelector';
import OperationLogs from '../components/OperationLogs';
import { PUMP_STATUS_LABEL, DEFAULT_BACKGROUND_INTERVAL_SEC } from '../config/stations';

interface Props {
  onLogout: () => void;
}

export default function SettingsPage({ onLogout }: Props) {
  const selectedStations = useStore((s) => s.selectedStations);
  const stationOrder = useStore((s) => s.stationOrder);
  const biometricEnabled = useStore((s) => s.biometricEnabled);
  const darkMode = useStore((s) => s.darkMode);
  const setDarkMode = useStore((s) => s.setDarkMode);
  const setSelectedStations = useStore((s) => s.setSelectedStations);
  const setStationOrder = useStore((s) => s.setStationOrder);
  const setBiometricEnabled = useStore((s) => s.setBiometricEnabled);
  const backgroundIntervalSec = useStore((s) => s.backgroundIntervalSec);
  const setBackgroundIntervalSec = useStore((s) => s.setBackgroundIntervalSec);
  const setPage = useStore((s) => s.setPage);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    try {
      const bridge = (window as any).AndroidBiometric;
      if (bridge && typeof bridge.isAvailable === 'function') {
        setBiometricAvailable(bridge.isAvailable());
      }
    } catch {
      // 非 Android 環境
    }
  }, []);

  useEffect(() => {
    try {
      const bridge = (window as any).AndroidPump;
      if (bridge && typeof bridge.getAppVersionName === 'function') {
        const v = bridge.getAppVersionName();
        setAppVersion(`v${v}`);
      } else {
        setAppVersion('v1.0.0 (開發版)');
      }
    } catch {
      setAppVersion('v1.0.0 (開發版)');
    }
  }, []);

  const handleSave = () => {
    if (selectedStations.length === 0) return;
    setPage('main');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700" style={{ paddingTop: 'var(--sat)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">設定</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage('main')}
              className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all"
            >
              取消
            </button>
            <button
              onClick={onLogout}
              className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 active:scale-95 transition-all"
            >
              登出
            </button>
            <button
              onClick={handleSave}
              disabled={selectedStations.length === 0}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 active:scale-95 transition-all"
            >
              確定
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* 站點選擇 */}
        <StationSelector
            selected={selectedStations}
            order={stationOrder}
            onChange={setSelectedStations}
            onReorder={setStationOrder}
          />

        <hr className="border-gray-200 dark:border-gray-700 my-6" />

        {/* 生物辨識開關 */}
        {biometricAvailable && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">安全設定</h2>
            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">啟用指紋 / 臉部辨識</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  開啟後，下次登入可直接使用生物辨識快速登入
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={biometricEnabled}
                  onChange={(e) => setBiometricEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        )}

        <hr className="border-gray-200 dark:border-gray-700 my-6" />

        {/* 夜間暗色模式 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">顯示設定</h2>
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">夜間暗色模式</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                夜間使用時，切換為深色背景減少眼睛疲勞
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(e) => setDarkMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 dark:after:border-gray-500 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
            </label>
          </div>
        </div>

        <hr className="border-gray-200 dark:border-gray-700 my-6" />

        {/* 背景服務檢查頻率 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">背景檢查設定</h2>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">背景檢查頻率</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  手機休眠時，每隔多久檢查一次水位與機組狀態
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setBackgroundIntervalSec(Math.max(30, backgroundIntervalSec - 10))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all text-lg font-bold"
                >−</button>
                <input
                  type="number"
                  value={backgroundIntervalSec}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 30 && v <= 600) {
                      setBackgroundIntervalSec(v);
                    }
                  }}
                  min={30}
                  max={600}
                  step={10}
                  className="w-16 h-8 px-1 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded text-center outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-800 dark:bg-gray-800 dark:text-gray-200"
                />
                <button
                  type="button"
                  onClick={() => setBackgroundIntervalSec(Math.min(600, backgroundIntervalSec + 10))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all text-lg font-bold"
                >+</button>
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">秒</span>
              </div>
            </div>

            {/* 橫向滑軌 */}
            <input
              type="range"
              min={30}
              max={600}
              step={10}
              value={backgroundIntervalSec}
              onChange={(e) => setBackgroundIntervalSec(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600 mb-2"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 px-0.5">
              <span>30秒</span>
              <span>300秒</span>
              <span>600秒（10分）</span>
            </div>

            <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 rounded px-2 py-1.5 mt-3">
              <span>⚠</span>
              <span>
                頻率越高越耗電，建議 60~300 秒。最小值 30 秒，預設 {DEFAULT_BACKGROUND_INTERVAL_SEC} 秒。
              </span>
            </div>
          </div>
        </div>

        <hr className="border-gray-200 dark:border-gray-700 my-6" />

        {/* 背景服務運作提示（Xiaomi / HyperOS 用戶） */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">背景服務注意事項</h2>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-2">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              ⚠ 手機休眠時若收不到警報，請確認以下設定：
            </p>
            <ol className="text-xs text-amber-700 dark:text-amber-300 list-decimal list-inside space-y-1">
              <li>
                <span className="font-medium">自啟動</span>：設定 → 應用程式 → 水位機組警報系統 → 開啟「自啟動」
              </li>
              <li>
                <span className="font-medium">電池無限制</span>：設定 → 應用程式 → 水位機組警報系統 → 電池 → 「無限制」
              </li>
              <li>
                <span className="font-medium">鎖定最近任務</span>：多工畫面 → 長按水位機組警報系統 → 鎖頭圖示 🔒
              </li>
              <li>
                <span className="font-medium">通知權限</span>：設定 → 通知 → 水位機組警報系統 → 開啟所有通知類別
              </li>
            </ol>
          </div>
        </div>

        <hr className="border-gray-200 my-6" />

        {/* 操作紀錄 */}
        <OperationLogs />

        {/* 抽水機狀態顏色對照表 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">抽水機狀態顏色說明</h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gray-300 shadow-sm shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{PUMP_STATUS_LABEL['0']}</p>
                  <p className="text-xs text-gray-400">泵浦未運轉</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-500 shadow-sm shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{PUMP_STATUS_LABEL['1']}</p>
                  <p className="text-xs text-gray-400">由圖控系統操作運轉</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-blue-500 shadow-sm shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{PUMP_STATUS_LABEL['2']}</p>
                  <p className="text-xs text-gray-400">由全自動模式控制運轉</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-orange-500 shadow-sm shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{PUMP_STATUS_LABEL['3']}</p>
                  <p className="text-xs text-gray-400">現場人員手動操作運轉</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* App 版本號 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">關於</h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">應用程式版本</span>
              <span className="text-sm font-mono text-gray-900">{appVersion}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-700">
            💡 設定完成後按下「確定」返回主頁面。每張卡片上可直接修改警報水位，
            當內水位超過警報值或抽水機狀態變更時，將觸發警報音。
          </p>
        </div>
      </main>
    </div>
  );
}