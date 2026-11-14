export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

const pad = (n) => String(n).padStart(2, '0');

export function fmtUTC(ms, withTime = true) {
  const d = new Date(ms);
  const s = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return withTime ? `${s} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC` : s;
}

export function fmtShortUTC(ms) {
  const d = new Date(ms);
  const mon = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${d.getUTCDate()} ${mon} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function fmtDur(h) {
  if (h == null || !Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  const d = Math.floor(h / 24);
  const r = Math.round(h - d * 24);
  return r ? `${d} d ${r} h` : `${d} d`;
}

export const fmtDeg = (x, digits = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}°`;
export const fmtPct = (x) => `${Math.round(x)}%`;

export function fmtLat(lat) {
  return `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? 'S' : 'N'}`;
}
export function fmtLon(lon) {
  return `${Math.abs(lon).toFixed(3)}° ${lon < 0 ? 'W' : 'E'}`;
}

// <input type="datetime-local"> value, interpreted as UTC.
export function toInputUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export function fromInputUTC(v) {
  const ms = Date.parse(`${v}:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function relTime(fromMs, toMs) {
  if (toMs == null) return null;
  const h = (toMs - fromMs) / HOUR;
  return h >= 0 ? `in ${fmtDur(h)}` : `${fmtDur(-h)} ago`;
}
