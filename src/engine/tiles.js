// tiles.js: loads the NASA data tiles (data/tiles in the public repo) and exposes raster accessors for horizonCore.js.
// Tiles are fetched only when needed and cached. Format: data/tiles/meta.json (written by tools/tiles/*.py).
import { maybeGunzip } from './ephemerisStore.js';
import { llToXY, cell } from './horizonCore.js';

export const TILE_BASE = 'https://raw.githubusercontent.com/washmaz/critical-load/main/data/tiles/';
const T = 256;

let fetchBytes = async (path) => {
  const r = await fetch(TILE_BASE + path);
  if (!r.ok) throw new Error(`tile ${path}: HTTP ${r.status}`);
  return maybeGunzip(await r.arrayBuffer());
};
/** Tests swap in a local-file reader. */
export function setTileFetcher(fn) { fetchBytes = fn; }

const cache = new Map();
function load(key, path, decode) {
  if (!cache.has(key)) cache.set(key, fetchBytes(path).then((b) => decode(new Uint8Array(b))).catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}

function undelta(u8, n) {
  // row-wise deltas mod 65536, all low bytes then all high bytes -> elevation in metres (NaN = no data)
  const out = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    let v = 0;
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      v = (v + (u8[i] | (u8[n * n + i] << 8))) & 0xffff;
      out[i] = v === 0 ? NaN : v / 4 - 8000;
    }
  }
  return out;
}
const decTerrain = (u8) => {
  const elev = undelta(u8, T), s = u8.subarray(2 * T * T, 3 * T * T), slope = new Float32Array(T * T);
  for (let i = 0; i < T * T; i++) slope[i] = s[i] === 255 ? NaN : s[i] / 4;
  return { elev, slope };
};
const decFar = (u8) => undelta(u8, T);
const decSci = (u8) => u8.slice(0, 5 * T * T);

let META = null;
export async function loadMeta() {
  if (!META) META = fetchBytes('meta.json').then((b) => JSON.parse(new TextDecoder().decode(b)));
  return META;
}

/** Dense mosaic of tiles rows tr0..tr1, cols tc0..tc1 -> grid accessor (see horizonCore.cell). */
function mosaic(spec, tr0, tr1, tc0, tc1, tilesMap, pick) {
  const w = (tc1 - tc0 + 1) * T, h = (tr1 - tr0 + 1) * T, data = new Float32Array(w * h).fill(NaN);
  for (let tr = tr0; tr <= tr1; tr++) for (let tc = tc0; tc <= tc1; tc++) {
    const t = tilesMap.get(tr * 1000 + tc); if (!t) continue;
    const src = pick(t);
    for (let r = 0; r < T; r++) data.set(src.subarray(r * T, r * T + T), ((tr - tr0) * T + r) * w + (tc - tc0) * T);
  }
  return { pix: spec.pix, x0: spec.x0, y0: spec.y0, n: spec.n, data, w, h, r0: tr0 * T, c0: tc0 * T };
}

/** Load everything needed for a terrain horizon + slope at (lat, lon): 80 m tiles within ~30 km and the whole 320 m map. */
export async function loadTerrainAround(lat, lon, radiusM = 30000) {
  const meta = await loadMeta();
  const [x, y] = llToXY(lat, lon);
  const s = meta.terrain, have = new Set(s.tiles.map(([r, c]) => r * 1000 + c));
  const r0 = Math.max(0, Math.floor((s.y0 - (y + radiusM)) / s.pix / T)), r1 = Math.floor((s.y0 - (y - radiusM)) / s.pix / T);
  const c0 = Math.max(0, Math.floor((x - radiusM - s.x0) / s.pix / T)), c1 = Math.floor((x + radiusM - s.x0) / s.pix / T);
  const want = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (have.has(r * 1000 + c)) want.push([r, c]);
  const nearMap = new Map(), farMap = new Map();
  await Promise.all([
    ...want.map(([r, c]) => load(`t${r}_${c}`, `terrain/t${r}_${c}.bin`, decTerrain).then((t) => nearMap.set(r * 1000 + c, t))),
    ...meta.far.tiles.map(([r, c]) => load(`f${r}_${c}`, `far/f${r}_${c}.bin`, decFar).then((t) => farMap.set(r * 1000 + c, t))),
  ]);
  const nf = Math.ceil(meta.far.n / T) - 1;
  return {
    near: mosaic(s, r0, r1, c0, c1, nearMap, (t) => t.elev),
    slope: mosaic(s, r0, r1, c0, c1, nearMap, (t) => t.slope),
    far: mosaic(meta.far, 0, nf, 0, nf, farMap, (t) => t),
    tilesLoaded: want.length + meta.far.tiles.length,
  };
}

/** Only the 80 m elevation + slope tiles within radiusM (no far field): enough for slope checks. */
export async function loadNearOnly(lat, lon, radiusM = 2000) {
  const meta = await loadMeta();
  const [x, y] = llToXY(lat, lon);
  const s = meta.terrain, have = new Set(s.tiles.map(([r, c]) => r * 1000 + c));
  const r0 = Math.max(0, Math.floor((s.y0 - (y + radiusM)) / s.pix / T)), r1 = Math.floor((s.y0 - (y - radiusM)) / s.pix / T);
  const c0 = Math.max(0, Math.floor((x - radiusM - s.x0) / s.pix / T)), c1 = Math.floor((x + radiusM - s.x0) / s.pix / T);
  const m = new Map(), jobs = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (have.has(r * 1000 + c))
    jobs.push(load(`t${r}_${c}`, `terrain/t${r}_${c}.bin`, decTerrain).then((t) => m.set(r * 1000 + c, t)));
  await Promise.all(jobs);
  return { near: mosaic(s, r0, r1, c0, c1, m, (t) => t.elev), slope: mosaic(s, r0, r1, c0, c1, m, (t) => t.slope) };
}

/** Science tiles (120 m) covering a box of half-size radiusM around (lat, lon). Returns plane accessors. */
export async function loadScienceAround(lat, lon, radiusM = 3000) {
  const meta = await loadMeta();
  const [x, y] = llToXY(lat, lon);
  const s = meta.science, have = new Set(s.tiles.map(([r, c]) => r * 1000 + c));
  const r0 = Math.max(0, Math.floor((s.y0 - (y + radiusM)) / s.pix / T)), r1 = Math.floor((s.y0 - (y - radiusM)) / s.pix / T);
  const c0 = Math.max(0, Math.floor((x - radiusM - s.x0) / s.pix / T)), c1 = Math.floor((x + radiusM - s.x0) / s.pix / T);
  const m = new Map(), jobs = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (have.has(r * 1000 + c))
    jobs.push(load(`s${r}_${c}`, `science/s${r}_${c}.bin`, decSci).then((t) => m.set(r * 1000 + c, t)));
  await Promise.all(jobs);
  const plane = (k) => mosaic(s, r0, r1, c0, c1, m, (t) => Float32Array.from(t.subarray(k * T * T, (k + 1) * T * T)));
  return { sun: plane(0), earth: plane(1), tavg: plane(2), tmaxHalf: plane(3), ice: plane(4) };
}

/** Raw 120 m science values at a point, decoded to physical units. */
export function scienceAt(sci, lat, lon) {
  const [x, y] = llToXY(lat, lon);
  const g = sci.sun, r = Math.floor((g.y0 - y) / g.pix), c = Math.floor((x - g.x0) / g.pix);
  const sun = cell(sci.sun, r, c), earth = cell(sci.earth, r, c), ta = cell(sci.tavg, r, c), tm = cell(sci.tmaxHalf, r, c), ice = cell(sci.ice, r, c);
  return {
    psr: sun === 254,
    sunPct: sun === 255 || Number.isNaN(sun) ? null : sun === 254 ? 0 : sun / 2,
    earthPct: earth === 255 || Number.isNaN(earth) ? null : earth / 2,
    tempAvgK: ta === 255 || Number.isNaN(ta) ? null : ta,
    tempMaxK: tm === 255 || Number.isNaN(tm) ? null : tm * 2,
    iceDepthM: ice === 255 || Number.isNaN(ice) ? null : ice === 250 ? 'deeper than 2.87 m' : ice / 50,
  };
}

/**
 * NASA 5 m site maps (PGDA product 78) around (lat, lon), where they exist. Returns null if no site map covers the area,
 * else { covers(x, y), slope5(x, y), slopeErr(x, y), slope100(x, y), site } (map coordinates; NaN where no data).
 */
export async function loadHires(lat, lon, radiusM = 500) {
  const meta = await loadMeta();
  if (!meta.hires) return null;
  const [x, y] = llToXY(lat, lon);
  const maps = [];
  for (const [site, s] of Object.entries(meta.hires.sites)) {
    const x1 = s.x0 + s.w * s.pix, y1 = s.y0 - s.h * s.pix;
    if (x + radiusM < s.x0 || x - radiusM > x1 || y - radiusM > s.y0 || y + radiusM < y1) continue;
    const fineHave = new Set(s.fine.map(([r, c]) => r * 1000 + c)), coarseHave = new Set(s.coarse.map(([r, c]) => r * 1000 + c));
    const P = s.pix * T, PC = s.coarsePix * T;
    const fr0 = Math.max(0, Math.floor((s.y0 - (y + radiusM)) / P)), fr1 = Math.floor((s.y0 - (y - radiusM)) / P);
    const fc0 = Math.max(0, Math.floor((x - radiusM - s.x0) / P)), fc1 = Math.floor((x + radiusM - s.x0) / P);
    const cr0 = Math.max(0, Math.floor((s.y0 - (y + radiusM)) / PC)), cr1 = Math.floor((s.y0 - (y - radiusM)) / PC);
    const cc0 = Math.max(0, Math.floor((x - radiusM - s.x0) / PC)), cc1 = Math.floor((x + radiusM - s.x0) / PC);
    const fine = new Map(), coarse = new Map(), jobs = [];
    for (let r = fr0; r <= fr1; r++) for (let c = fc0; c <= fc1; c++) if (fineHave.has(r * 1000 + c))
      jobs.push(load(`H${site}${r}_${c}`, `${meta.hires.path}/${site}/h${r}_${c}.bin`, (u8) => u8.slice(0, T * T)).then((t) => fine.set(r * 1000 + c, t)));
    for (let r = cr0; r <= cr1; r++) for (let c = cc0; c <= cc1; c++) if (coarseHave.has(r * 1000 + c))
      jobs.push(load(`C${site}${r}_${c}`, `${meta.hires.path}/${site}/c${r}_${c}.bin`, (u8) => u8.slice(0, 2 * T * T)).then((t) => coarse.set(r * 1000 + c, t)));
    await Promise.all(jobs);
    maps.push({ site, s, fine, coarse });
  }
  if (!maps.length) return null;
  const find = (x, y) => maps.find(({ s }) => x >= s.x0 && x < s.x0 + s.w * s.pix && y <= s.y0 && y > s.y0 - s.h * s.pix);
  const fineAt = (m, x, y) => {
    const r = Math.floor((m.s.y0 - y) / m.s.pix), c = Math.floor((x - m.s.x0) / m.s.pix);
    const t = m.fine.get(((r / T) | 0) * 1000 + ((c / T) | 0)); if (!t) return NaN;
    const v = t[(r % T) * T + (c % T)]; return v === 255 ? NaN : v / 4;
  };
  const coarseCell = (m, r, c, plane) => {
    if (r < 0 || c < 0 || r >= m.s.coarseH || c >= m.s.coarseW) return NaN;
    const t = m.coarse.get(((r / T) | 0) * 1000 + ((c / T) | 0)); if (!t) return NaN;
    const v = t[plane * T * T + (r % T) * T + (c % T)]; return v === 255 ? NaN : v / (plane === 0 ? 20 : 4);
  };
  return {
    sites: maps.map((m) => m.site),
    covers: (x, y) => !!find(x, y),
    slope5: (x, y) => { const m = find(x, y); return m ? fineAt(m, x, y) : NaN; },
    slopeErr: (x, y) => { const m = find(x, y); if (!m) return NaN; return coarseCell(m, Math.floor((m.s.y0 - y) / m.s.coarsePix), Math.floor((x - m.s.x0) / m.s.coarsePix), 0); },
    slope100: (x, y) => { // bilinear between 20 m block centres
      const m = find(x, y); if (!m) return NaN;
      const rf = (m.s.y0 - y) / m.s.coarsePix - 0.5, cf = (x - m.s.x0) / m.s.coarsePix - 0.5, r0 = Math.floor(rf), c0 = Math.floor(cf), fr = rf - r0, fc = cf - c0;
      const a = coarseCell(m, r0, c0, 1), b = coarseCell(m, r0, c0 + 1, 1), c = coarseCell(m, r0 + 1, c0, 1), d = coarseCell(m, r0 + 1, c0 + 1, 1);
      return a * (1 - fr) * (1 - fc) + b * (1 - fr) * fc + c * fr * (1 - fc) + d * fr * fc;
    },
  };
}
