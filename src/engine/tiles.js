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
