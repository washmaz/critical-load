// ephemerisStore.js — two independent sources for Sun/Earth positions, with automatic fallback.
//
//   'precomputed'  hourly tables built offline from JPL DE421 + DE421 lunar libration in the
//                  MOON_ME_DE421 frame (tools/precompute_ephemeris.py, Skyfield). One small binary
//                  file per preset site (~150 KB, ~50 KB gzipped), fetched once and cached. Lookups are
//                  array reads + interpolation, so a 1-year scan takes milliseconds.
//   'live'         astronomy-engine computed in the browser (IAU 2015 Moon orientation). Works for any
//                  coordinates and any date, no network needed.
//   'auto'         (default) table when it covers the site and date AND passed its self-check, else live.
//
// Redundancy: when a table loads, selfCheck() compares it with the live engine at spread-out times.
// If they disagree by more than CHECK_TOLERANCE_DEG the table is switched off for that site and the
// app falls back to live, with the reason kept in getStatus(). Nothing fails silently.

export const CHECK_TOLERANCE_DEG = 0.1;

// Data files may be served gzipped (smaller deploys). Unpack in the browser when the gzip magic bytes are present.
export async function maybeGunzip(buf) {
  const u = new Uint8Array(buf);
  if (u.length < 2 || u[0] !== 0x1f || u[1] !== 0x8b || typeof DecompressionStream === 'undefined') return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}


let cfg = {
  baseUrl: '/ephem/',
  fetchBytes: async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return maybeGunzip(await r.arrayBuffer());
  },
};
let manifestPromise = null;
const tables = new Map();   // key -> table | null
const pending = new Map();  // key -> Promise
const status = new Map();   // key -> { state, detail }

export function configureEphemeris(options) {
  cfg = { ...cfg, ...options };
  manifestPromise = null; tables.clear(); pending.clear(); status.clear();
}

/** Same key as tools/precompute_ephemeris.py, so tables match sites by coordinates, not by id. */
export function siteKey(lat, lon) {
  return `${lat.toFixed(4)}_${lon.toFixed(4)}`.replaceAll('-', 'm');
}

export async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = cfg.fetchBytes(cfg.baseUrl + 'manifest.json')
      .then((buf) => JSON.parse(new TextDecoder().decode(buf)))
      .catch((e) => { console.warn('[ephemeris] manifest unavailable, using live only:', e.message); return null; });
  }
  return manifestPromise;
}

/**
 * Fetch and decode the precomputed table for a site. Resolves to the table, or null when the site
 * has no table or the download fails (the app then uses live). `liveFn(site, date)` enables self-check.
 */
export function loadTable(site, liveFn) {
  const key = siteKey(site.lat, site.lon);
  if (tables.has(key)) return Promise.resolve(tables.get(key));
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    const m = await loadManifest();
    const entry = m?.sites?.[key];
    if (!entry) { status.set(key, { state: 'none', detail: 'No precomputed table for these coordinates' }); tables.set(key, null); return null; }
    try {
      const buf = await cfg.fetchBytes(cfg.baseUrl + entry.file);
      const n = m.n;
      if (buf.byteLength !== n * 8) throw new Error(`size ${buf.byteLength}, expected ${n * 8}`);
      const table = {
        key, n, entry,
        t0: Date.parse(m.start), step: m.stepSeconds * 1000,
        sunAlt: new Int16Array(buf, 0, n), sunAz: new Uint16Array(buf, 2 * n, n),
        earthAlt: new Int16Array(buf, 4 * n, n), earthAz: new Uint16Array(buf, 6 * n, n),
        source: m.ephemeris, frame: m.frame,
      };
      if (liveFn) {
        const chk = selfCheck(table, site, liveFn);
        table.check = chk;
        if (!chk.ok) {
          status.set(key, { state: 'disabled', detail: `Self-check failed (max diff ${chk.maxDiffDeg.toFixed(3)}°), using live`, check: chk });
          tables.set(key, null);
          return null;
        }
      }
      status.set(key, { state: 'ready', detail: `JPL DE421 table, ${new Date(table.t0).toISOString().slice(0, 10)} to ${new Date(table.t0 + (n - 1) * table.step).toISOString().slice(0, 10)}`, check: table.check });
      tables.set(key, table);
      return table;
    } catch (e) {
      status.set(key, { state: 'error', detail: `Table download failed (${e.message}), using live` });
      tables.set(key, null);
      return null;
    } finally { pending.delete(key); }
  })();
  pending.set(key, p);
  return p;
}

/** Synchronous: the loaded table for a site, or null. */
export function getLoadedTable(site) {
  return tables.get(siteKey(site.lat, site.lon)) ?? null;
}

export function getStatus(site) {
  return status.get(siteKey(site.lat, site.lon)) ?? { state: 'loading', detail: 'Loading precomputed table' };
}

const D2R = Math.PI / 180;
// Interpolate directions as unit vectors (not alt/az separately), so a body passing near the zenith
// does not pick up a cusp error. Max error vs direct DE421 at the half-hour: 0.005 deg.
function lerpDir(alt1, az1, alt2, az2, f) {
  const v = (alt, az) => [Math.cos(alt * D2R) * Math.sin(az * D2R), Math.cos(alt * D2R) * Math.cos(az * D2R), Math.sin(alt * D2R)];
  const a = v(alt1, az1), b = v(alt2, az2);
  const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f;
  let az = Math.atan2(x, y) / D2R; if (az < 0) az += 360;
  return { alt: Math.atan2(z, Math.hypot(x, y)) / D2R, az };
}

/** Interpolated Sun/Earth alt/az from a table, or null when the date is outside it. */
export function sampleTable(table, date) {
  const ms = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const x = (ms - table.t0) / table.step;
  if (!(x >= 0 && x <= table.n - 1)) return null;
  const i = Math.min(Math.floor(x), table.n - 2), f = x - i;
  const c = 0.01;
  return {
    sun: lerpDir(table.sunAlt[i] * c, table.sunAz[i] * c, table.sunAlt[i + 1] * c, table.sunAz[i + 1] * c, f),
    earth: lerpDir(table.earthAlt[i] * c, table.earthAz[i] * c, table.earthAlt[i + 1] * c, table.earthAz[i + 1] * c, f),
  };
}

/**
 * Sun/Earth alt/az at one time from the chosen source.
 * @param mode 'auto' | 'precomputed' | 'live'
 * @returns {{sun:{alt,az}, earth:{alt,az}, source:'precomputed'|'live'} | null}
 *          null only for mode 'precomputed' when no table covers the site/date.
 */
export function sunEarthAt(site, date, mode, liveFn) {
  if (mode !== 'live') {
    const table = getLoadedTable(site);
    const s = table && sampleTable(table, date);
    if (s) return { ...s, source: 'precomputed' };
    if (mode === 'precomputed') return null;
  }
  return { ...liveFn(site, date), source: 'live' };
}

const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * Compare table vs live at `samples` times spread across the table. Azimuth differences are
 * scaled by cos(alt) so they are true angles on the sky (azimuth is ill-defined near the zenith).
 */
export function selfCheck(table, site, liveFn, samples = 24) {
  let maxDiffDeg = 0, worst = null;
  for (let k = 0; k < samples; k++) {
    const i = Math.round(((k + 0.5) / samples) * (table.n - 1));
    const t = new Date(table.t0 + i * table.step);
    const tab = sampleTable(table, t), live = liveFn(site, t);
    for (const b of ['sun', 'earth']) {
      const dAlt = Math.abs(tab[b].alt - live[b].alt);
      const dAz = angDiff(tab[b].az, live[b].az) * Math.cos(live[b].alt * D2R);
      const d = Math.hypot(dAlt, dAz);
      if (d > maxDiffDeg) { maxDiffDeg = d; worst = { t: t.toISOString(), body: b, dAlt, dAz }; }
    }
  }
  return { ok: maxDiffDeg <= CHECK_TOLERANCE_DEG, maxDiffDeg, samples, worst };
}

/**
 * Link to JPL Horizons for an independent check: apparent azimuth/elevation of the Sun (10) or
 * Earth (399) seen from a point on the Moon (coord@301), airless. Opens in a new tab.
 */
export function horizonsUrl(site, start, stop, body = '10', step = '1 h') {
  const iso = (d) => new Date(d).toISOString().slice(0, 16).replace('T', ' ');
  const q = {
    format: 'text', COMMAND: `'${body}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${site.lon},${site.lat},0'`,
    START_TIME: `'${iso(start)}'`, STOP_TIME: `'${iso(stop)}'`, STEP_SIZE: `'${step}'`,
    QUANTITIES: "'4'", ANG_FORMAT: "'DEG'", APPARENT: "'AIRLESS'", CSV_FORMAT: "'YES'",
  };
  return 'https://ssd.jpl.nasa.gov/api/horizons.api?' +
    Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
