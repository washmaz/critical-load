// findSpot.js: "find me a spot". Stage 1 screens every 120 m NASA pixel around a centre with NASA's own maps
// (long-term Sun / Earth visibility, permanent shadow, NASA slope over the whole landing ellipse, Diviner ice nearby),
// applies the hard filters (Sun >= 5 %, Earth >= 25 % on NASA's 18.6-year averages, not permanently shadowed),
// scores what is left with the planner's weights, and keeps well-separated candidates. Stage 2 (runSimulation.js)
// then runs the full 1,000-touchdown check on the best few for the actual mission dates.
import { llToXY, xyToLL, cell, localFrame, slopeOverBaseline } from './horizonCore.js';

export const DEFAULT_WEIGHTS = { safety: 5, power: 3, comms: 3, resources: 1 };
export const HARD_FILTERS = { minSunPct: 5, minEarthPct: 25 };

export { localFrame };

/**
 * Share of 80 m pixels inside the landing ellipse centred at (x, y) whose slope is <= limit.
 * slopeMode 'ldsm' = NASA LDSM value of the pixel; a number (e.g. 100) = slope over that baseline from LOLA elevation (needs near).
 */
export function ellipseSlopeShare(x, y, slope, { semiMajorM: a, semiMinorM: b, azimuthDeg = 0 }, limitDeg, slopeMode = 'ldsm', near = null) {
  const at = (r, c) => (slopeMode === 'ldsm' ? cell(slope, r, c) : slopeOverBaseline(slope.x0 + (c + 0.5) * slope.pix, slope.y0 - (r + 0.5) * slope.pix, near, slopeMode));
  const { east, north, k } = localFrame(x, y), th = (azimuthDeg * Math.PI) / 180, st = Math.sin(th), ct = Math.cos(th);
  const reach = a * k + slope.pix;
  const r0 = Math.floor((slope.y0 - (y + reach)) / slope.pix), r1 = Math.floor((slope.y0 - (y - reach)) / slope.pix);
  const c0 = Math.floor((x - reach - slope.x0) / slope.pix), c1 = Math.floor((x + reach - slope.x0) / slope.pix);
  let n = 0, ok = 0, worst = 0;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const px = slope.x0 + (c + 0.5) * slope.pix - x, py = slope.y0 - (r + 0.5) * slope.pix - y;
    const e = (px * east[0] + py * east[1]) / k, nn = (px * north[0] + py * north[1]) / k;
    const u = e * st + nn * ct, v = e * ct - nn * st;
    if ((u / a) ** 2 + (v / b) ** 2 > 1) continue;
    const s = at(r, c); if (!(s === s)) continue;
    n++; if (s <= limitDeg) ok++; if (s > worst) worst = s;
  }
  if (!n) { // ellipse smaller than one pixel: use the pixel the target sits in
    const s = slopeMode === 'ldsm' ? cell(slope, Math.floor((slope.y0 - y) / slope.pix), Math.floor((x - slope.x0) / slope.pix)) : slopeOverBaseline(x, y, near, slopeMode);
    if (!(s === s)) return null;
    return { share: s <= limitDeg ? 1 : 0, pixels: 1, worstDeg: s };
  }
  return { share: ok / n, pixels: n, worstDeg: worst };
}

/** Chamfer (3-4) distance in metres from every cell of a box to the nearest cell where isTarget(row, col). Screening only (error < 8 %). */
function chamferField(r0, c0, h, w, pix, isTarget) {
  const INF = 1e9, d = new Float64Array(h * w).fill(INF);
  for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) if (isTarget(r0 + i, c0 + j)) d[i * w + j] = 0;
  const A = pix, B = pix * 4 / 3;
  for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
    let v = d[i * w + j];
    if (j > 0) v = Math.min(v, d[i * w + j - 1] + A);
    if (i > 0) { v = Math.min(v, d[(i - 1) * w + j] + A); if (j > 0) v = Math.min(v, d[(i - 1) * w + j - 1] + B); if (j < w - 1) v = Math.min(v, d[(i - 1) * w + j + 1] + B); }
    d[i * w + j] = v;
  }
  for (let i = h - 1; i >= 0; i--) for (let j = w - 1; j >= 0; j--) {
    let v = d[i * w + j];
    if (j < w - 1) v = Math.min(v, d[i * w + j + 1] + A);
    if (i < h - 1) { v = Math.min(v, d[(i + 1) * w + j] + A); if (j < w - 1) v = Math.min(v, d[(i + 1) * w + j + 1] + B); if (j > 0) v = Math.min(v, d[(i + 1) * w + j - 1] + B); }
    d[i * w + j] = v;
  }
  return d;
}

export const ICE_RANGE_M = 5000; // ice within 1 m of the surface counts fully at 0 km, nothing beyond 5 km

/**
 * Stage 1 screen. sci = tiles.loadScienceAround(...) planes, slope = 80 m slope grid.
 * Returns { candidates (best first, at least minSepM apart), screened, rejected: {psr, sun, earth, noData, pole} }. poleWithinDeg (optional) drops ground farther than that from the pole.
 */
export function screenCandidates({ center, radiusM, sci, slope, near = null, slopeMode = 'ldsm', ellipse, slopeMaxDeg, weights = DEFAULT_WEIGHTS, keep = 30, minSepM, poleWithinDeg = null }) {
  const g = sci.sun, [cx, cy] = llToXY(center.lat, center.lon);
  const pad = Math.ceil(ICE_RANGE_M / g.pix);
  const k0 = localFrame(cx, cy).k, R = Math.ceil((radiusM * k0) / g.pix);
  const rc = Math.floor((g.y0 - cy) / g.pix), cc = Math.floor((cx - g.x0) / g.pix);
  const r0 = rc - R - pad, c0 = cc - R - pad, h = 2 * (R + pad) + 1, w = h;
  const ice = chamferField(r0, c0, h, w, g.pix, (r, c) => { const v = cell(sci.ice, r, c); return v === v && v !== 250 && v !== 255 && v <= 50; });
  const W = weights, wsum = W.safety + W.power + W.comms + W.resources || 1;
  const rej = { psr: 0, sun: 0, earth: 0, noData: 0, pole: 0 }, list = [];
  // pole limit (e.g. Artemis III: within 6°): on the polar stereographic grid, latitude depends only on distance from the pole
  const rhoMax = poleWithinDeg == null ? Infinity : 2 * 1737400 * Math.tan(Math.PI / 4 + (-90 + poleWithinDeg) * Math.PI / 360);
  for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
    const r = rc + dr, c = cc + dc;
    const x = g.x0 + (c + 0.5) * g.pix, y = g.y0 - (r + 0.5) * g.pix;
    if (Math.hypot(x - cx, y - cy) > radiusM * k0) continue;
    if (Math.hypot(x, y) > rhoMax) { rej.pole++; continue; }
    const s = cell(sci.sun, r, c), e = cell(sci.earth, r, c);
    if (!(s === s) || s === 255 || !(e === e) || e === 255) { rej.noData++; continue; }
    if (s === 254) { rej.psr++; continue; }
    const sunPct = s / 2, earthPct = e / 2;
    if (sunPct < HARD_FILTERS.minSunPct) { rej.sun++; continue; }
    if (earthPct < HARD_FILTERS.minEarthPct) { rej.earth++; continue; }
    const sl = ellipseSlopeShare(x, y, slope, ellipse, slopeMaxDeg, slopeMode, near);
    if (!sl) { rej.noData++; continue; }
    const iceM = ice[(r - r0) * w + (c - c0)], iceProx = Math.max(0, 1 - iceM / ICE_RANGE_M);
    const score = (W.safety * sl.share + W.power * sunPct / 100 + W.comms * earthPct / 100 + W.resources * iceProx) / wsum;
    const [lat, lon] = xyToLL(x, y);
    list.push({ lat, lon, x, y, sunPct, earthPct, slopeShare: sl.share, slopeWorstDeg: sl.worstDeg, iceKmApprox: iceM < 1e8 ? iceM / 1000 : null, score });
  }
  list.sort((p, q) => q.score - p.score);
  const sep = (minSepM ?? Math.max(500, 2 * ellipse.semiMajorM)) * k0, picked = [];
  for (const p of list) {
    if (picked.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= sep)) picked.push(p);
    if (picked.length >= keep) break;
  }
  return { candidates: picked, screened: list.length, rejected: rej, cells: list.length + rej.psr + rej.sun + rej.earth + rej.noData };
}

/** Stage 2 ranking from full simulations. Each item: { cand, sim } with sim from runLandingSimulation. */
export function rankVerified(items, weights = DEFAULT_WEIGHTS, iceKm = () => null) {
  const W = weights, wsum = W.safety + W.power + W.comms + W.resources || 1;
  return items.map((it) => {
    const s = it.sim.summary, d = iceKm(it);
    const ice = d == null ? 0 : Math.max(0, 1 - (d * 1000) / ICE_RANGE_M);
    const score = (W.safety * s.pSafe + W.power * s.sunlitPct.median / 100 + W.comms * s.earthPct.median / 100 + W.resources * ice) / wsum;
    return { ...it, iceKm: d, score };
  }).sort((a, b) => b.score - a.score);
}
