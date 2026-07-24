/**
 * 多站獨立音頻管理
 * 每個站最多一個音頻在播放，用 Map 管理
 */
const audioMap = new Map<string, HTMLAudioElement>();

/** Lazy fetch MP3 為 Blob URL，只 fetch 一次 */
let cachedAudioUrl: string | null = null;
let fetchPromise: Promise<string> | null = null;

async function resolveAudioSource(src: string): Promise<string> {
  // 已經是 base64 data URL，直接回傳
  if (src.startsWith('data:')) return src;
  // 已經是 Blob URL，直接回傳
  if (src.startsWith('blob:')) return src;
  // 已 cached
  if (cachedAudioUrl) return cachedAudioUrl;
  // 正在 fetch 中
  if (fetchPromise) return fetchPromise;
  // lazy fetch MP3 並 cache 為 Blob URL
  fetchPromise = fetch(src)
    .then((r) => r.blob())
    .then((blob) => {
      cachedAudioUrl = URL.createObjectURL(blob);
      return cachedAudioUrl;
    })
    .finally(() => { fetchPromise = null; });
  return fetchPromise;
}

/** 將上傳的 File 編碼為 base64 data URL */
export function encodeAudioAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(new Error('讀取音頻檔案失敗'));
    reader.readAsDataURL(file);
  });
}

/** 播放指定站點的警報音（loop），支援 base64 / URL / Blob URL。
 *  同站號同 source 會 reuse 既有 Audio，避免重複建立 HTMLAudioElement */
export async function playStationAlarm(stationno: string, src: string): Promise<void> {
  const existing = audioMap.get(stationno);
  // 同站同 source → 只需 resume（已在 loop 中，可能被 pause 過）
  if (existing && existing.src === src) {
    existing.play().catch(() => {});
    return;
  }
  if (existing && existing.src !== src) {
    // source 換了（例如從預設音效換成自訂音效），重建
    existing.pause();
    existing.currentTime = 0;
    audioMap.delete(stationno);
  }
  const resolved = await resolveAudioSource(src);
  const audio = new Audio(resolved);
  audio.loop = true;
  audio.play().catch(() => {});
  audioMap.set(stationno, audio);
}

/** 停止指定站點的警報音 */
export function stopStationAlarm(stationno: string): void {
  const audio = audioMap.get(stationno);
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audioMap.delete(stationno);
  }
}

/** 停止所有站點的警報音 */
export function stopAllAlarms(): void {
  for (const [, audio] of audioMap) {
    audio.pause();
    audio.currentTime = 0;
  }
  audioMap.clear();
}

/** 取得目前正在播放音頻的站號列表 */
export function getPlayingStations(): string[] {
  return Array.from(audioMap.keys());
}