export function formatTimestamp(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }

  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${String(n)}` : String(n));
  return `${pad(m)}:${pad(s)}`;
}
