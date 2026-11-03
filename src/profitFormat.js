// Formatting and fetch helpers shared by the profit dashboard tabs.
const TZ = 'America/Denver';

export const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

export function shiftDay(ymd, delta) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

export function money(n, { cents = true } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return `${n < 0 ? '-' : ''}$${abs}`;
}

export const pct = n => (n === null || n === undefined ? '—' : `${n.toFixed(1)}%`);
export const tone = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
export const shortDay = ymd => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function timeAgo(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export async function readJson(res) {
  if (!res) throw new Error('Signed out');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
