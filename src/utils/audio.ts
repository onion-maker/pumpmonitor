/**
 * 多站獨立音頻管理
 * 每個站最多一個音頻在播放，用 Map 管理
 */
const audioMap = new Map<string, HTMLAudioElement>();

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

/** 播放指定站點的警報音（loop） */
export function playStationAlarm(stationno: string, base64: string): void {
  // 先停止該站可能正在播放的音頻
  stopStationAlarm(stationno);
  const audio = new Audio(base64);
  audio.loop = true;
  audio.play().catch(() => {
    // 瀏覽器可能阻擋自動播放，靜默處理
  });
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