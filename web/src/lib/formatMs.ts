export function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${m}m ${s.toFixed(1)}s`;
}
