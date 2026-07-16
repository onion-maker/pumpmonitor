import { useRef, useState } from 'react';
import { encodeAudioAsBase64 } from '../utils/audio';

interface Props {
  currentBase64: string | null;
  onUpload: (base64: string) => void;
  onClear: () => void;
  label?: string;
}

export default function AudioUploader({
  currentBase64,
  onUpload,
  onClear,
  label = '警報音頻',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg)$/i)) {
      setError('僅接受 .mp3 / .wav / .ogg 格式');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('檔案大小不得超過 2MB');
      return;
    }

    try {
      const base64 = await encodeAudioAsBase64(file);
      onUpload(base64);
      setFileName(file.name);
    } catch {
      setError('讀取音頻檔案失敗');
    }
  };

  const handleRemove = () => {
    onClear();
    setFileName(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        {label} — .mp3 / .wav / .ogg（最大 2MB）
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all"
        >
          {currentBase64 ? '更換' : '上傳'}
        </button>

        {currentBase64 && (
          <>
            <span className="text-xs text-green-600">
              ✅ {fileName || '已上傳'}
            </span>
            <button
              onClick={handleRemove}
              className="text-xs text-red-500 hover:text-red-700 transition-colors"
            >
              移除
            </button>
            <button
              onClick={() => {
                const a = new Audio(currentBase64);
                a.play().catch(() => {});
              }}
              className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              ▶ 試聽
            </button>
          </>
        )}

        {!currentBase64 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">未設定（無聲音）</span>
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-500">⚠ {error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,.ogg"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}