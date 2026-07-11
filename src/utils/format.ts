/** 格式化水位數值，保留 2 位小數 + 單位 */
export function formatWaterLevel(value: number | null): string {
  if (value === null) return '--';
  return `${value.toFixed(2)} m`;
}

/**
 * 根據水位與警報值計算橫條百分比 (0~100)
 * 預設最大顯示範圍為 alarmLevel × 2
 */
export function calcLevelPercent(value: number | null, alarmLevel: number): number {
  if (value === null) return 0;
  const max = alarmLevel * 2;
  const pct = (value / max) * 100;
  return Math.min(Math.max(pct, 0), 100);
}