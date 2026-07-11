/**
 * App 更新提示對話框
 */
interface Props {
  latestVersion: string;
  releaseNotes: string;
  onUpdate: () => void;
  onSkip: () => void;
}

export default function UpdateDialog({ latestVersion, releaseNotes, onUpdate, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 animate-scaleIn">
        {/* 圖示 */}
        <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-gray-900 text-center mb-1">
          發現新版本
        </h2>
        <p className="text-sm text-gray-500 text-center mb-4">
          {latestVersion} 可用
        </p>

        {/* 更新說明 */}
        {releaseNotes && (
          <div className="bg-gray-50 rounded-lg p-3 mb-5 max-h-32 overflow-y-auto">
            <p className="text-xs font-medium text-gray-700 mb-1">更新內容：</p>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
              {releaseNotes}
            </pre>
          </div>
        )}

        {/* 按鈕 */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onUpdate}
            className="w-full py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-95 transition-all"
          >
            立即更新
          </button>
          <button
            onClick={onSkip}
            className="w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-700 active:scale-95 transition-all"
          >
            稍後再說
          </button>
        </div>
      </div>
    </div>
  );
}