/** Human-readable interval: "<1分", "10分", "3時間", "4日", "2か月", "1.2年". */
export function formatInterval(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return '<1分';
  if (min < 60) return `${Math.round(min)}分`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)}時間`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}日`;
  if (d < 365) return `${Math.round(d / 30)}か月`;
  return `${(d / 365).toFixed(1)}年`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
