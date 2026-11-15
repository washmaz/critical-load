// landingSim.js: Monte Carlo landing-ellipse analysis for any point south of ~76 S.
// Each simulated touchdown gets its OWN exact terrain horizon (horizonCore.computeHorizon), its own local vertical,
// NASA slope (LDSM 80 m) and NASA permanent-shadow flag (LPSR 120 m), and is then judged with the app's normal
// power / comms rules (analysis.sliceMetrics + verdict) over the mission window.
import { R_M, computeHorizon, horizonAtDeg, cell, llToXY, slopeOverBaseline } from './horizonCore.js';
import { sliceMetrics, verdict } from './analysis.js';

/** A 2-D normal puts 99.7 % of samples inside the ellipse whose semi-axes are K997 standard deviations. */
export const K997 = Math.sqrt(-2 * Math.log(1 - 0.997)); // 3.4086

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Point at distance dM along bearing (deg from north, clockwise) on the sphere. */
export function destination(latDeg, lonDeg, dM, bearingDeg) {
  const p = (latDeg * Math.PI) / 180, l = (lonDeg * Math.PI) / 180, d = dM / R_M, b = (bearingDeg * Math.PI) / 180;
  const sp = Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(b);
  const lat = Math.asin(sp);
  const lon = l + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * sp);
  return [(lat * 180) / Math.PI, ((((lon * 180) / Math.PI) + 540) % 360) - 180];
}

/**
 * n touchdowns from a bivariate normal centred on the target. semiMajorM / semiMinorM are the 99.7 % ellipse semi-axes,
 * azimuthDeg the direction of the major axis (deg from north, clockwise). Deterministic for a given seed.
 */
export function sampleTouchdowns({ lat, lon, semiMajorM, semiMinorM, azimuthDeg = 0, n = 1000, seed = 1 }) {
  const rnd = mulberry32(seed), sa = semiMajorM / K997, sb = semiMinorM / K997;
  const th = (azimuthDeg * Math.PI) / 180, st = Math.sin(th), ct = Math.cos(th);
  const out = [];
  for (let i = 0; i < n; i++) {
    const u1 = Math.max(rnd(), 1e-12), u2 = rnd(), rr = Math.sqrt(-2 * Math.log(u1));
    const z1 = rr * Math.cos(2 * Math.PI * u2), z2 = rr * Math.sin(2 * Math.PI * u2);
    const u = sa * z1, v = sb * z2;                     // along major / minor axis (m)
    const e = u * st + v * ct, nn = u * ct - v * st;    // east / north (m)
    const [la, lo] = destination(lat, lon, Math.hypot(e, nn), (Math.atan2(e, nn) * 180) / Math.PI);
    out.push({ i, lat: la, lon: lo, e, n: nn, inEllipse: (u / semiMajorM) ** 2 + (v / semiMinorM) ** 2 <= 1 });
  }
  return out;
}

/** Sun / Earth clearance above THIS touchdown's terrain horizon at every step. bodies: { t, sun, earth } (km, Moon-fixed, xyz interleaved). */
export function clearanceSeries(lat, lon, elevationM, horizonDeg, bodies, obsHeightM = 2) {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180, cl = Math.cos(la), sl = Math.sin(la), co = Math.cos(lo), so = Math.sin(lo);
  const up = [cl * co, cl * so, sl], east = [-so, co, 0], north = [-sl * co, -sl * so, cl];
  const r = (R_M + elevationM + obsHeightM) / 1000, O = [up[0] * r, up[1] * r, up[2] * r];
  const n = bodies.t.length, sunClear = new Float64Array(n), earthClear = new Float64Array(n);
  const one = (V, i) => {
    const dx = V[3 * i] - O[0], dy = V[3 * i + 1] - O[1], dz = V[3 * i + 2] - O[2], d = Math.hypot(dx, dy, dz);
    const alt = (Math.asin((dx * up[0] + dy * up[1] + dz * up[2]) / d) * 180) / Math.PI;
    let az = (Math.atan2(dx * east[0] + dy * east[1] + dz * east[2], dx * north[0] + dy * north[1] + dz * north[2]) * 180) / Math.PI;
    if (az < 0) az += 360;
    return alt - horizonAtDeg(horizonDeg, az);
  };
  for (let i = 0; i < n; i++) { sunClear[i] = one(bodies.sun, i); earthClear[i] = one(bodies.earth, i); }
  return { t: bodies.t, sunClear, earthClear };
}

/**
 * Evaluate one touchdown. grids from tiles.loadTerrainAround; opts = analysis opts +
 *   slopeMaxDeg, slopeMode ('ldsm' = NASA LDSM 80 m pixel, or a baseline in metres such as 100), panelHeightM (solar arrays /
 *   antenna height above ground, default 2 m), earthMinElevDeg (optional).
 */
export function evaluateTouchdown(td, grids, bodies, opts) {
  const [x, y] = llToXY(td.lat, td.lon), g = grids.slope;
  const mode = opts.slopeMode ?? 'ldsm', hgt = opts.panelHeightM ?? 2;
  const slope = mode === 'ldsm' ? cell(g, Math.floor((g.y0 - y) / g.pix), Math.floor((x - g.x0) / g.pix)) : slopeOverBaseline(x, y, grids.near, mode);
  let h;
  try { h = computeHorizon(td.lat, td.lon, grids.near, grids.far, hgt); } catch { return { i: td.i, noData: true }; }
  const s = clearanceSeries(td.lat, td.lon, h.elevationM, h.horizonDeg, bodies, hgt);
  if (opts.earthMinElevDeg != null) { const shift = opts.earthMinElevDeg - opts.marginDeg; for (let k = 0; k < s.earthClear.length; k++) s.earthClear[k] -= shift; }
  const m = sliceMetrics(s, 0, s.t.length - 1, opts.marginDeg);
  const v = verdict(m, opts);
  return {
    i: td.i, elevationM: h.elevationM, slopeDeg: Number.isFinite(slope) ? slope : null,
    slopeOK: Number.isFinite(slope) && slope <= opts.slopeMaxDeg,
    sunlitPct: m.sunlitPct, longestDarkH: m.longestDarkH, earthPct: m.earthPct, longestCommsGapH: m.longestCommsGapH,
    powerOK: v.powerOK, commsOK: v.commsOK,
    litAtLanding: s.sunClear[0] > opts.marginDeg, earthAtLanding: s.earthClear[0] > opts.marginDeg,
  };
}

/** Wilson score interval for k successes in n trials (95 % by default). */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}

/** Combine per-touchdown results with the NASA permanent-shadow flags (psr[i] true/false). */
export function summarize(results, psr) {
  const ok = results.filter((r) => !r.noData);
  const fails = { slope: 0, shadow: 0, power: 0, comms: 0 };
  let safe = 0;
  for (const r of ok) {
    const sh = !!psr[r.i];
    r.psr = sh;
    if (!r.slopeOK) fails.slope++;
    if (sh) fails.shadow++;
    if (!r.powerOK) fails.power++;
    if (!r.commsOK) fails.comms++;
    r.safe = r.slopeOK && !sh && r.powerOK && r.commsOK;
    if (r.safe) safe++;
  }
  const n = ok.length, [lo, hi] = wilson(safe, n);
  const litAtLandingPct = n ? (100 * ok.filter((r) => r.litAtLanding).length) / n : 0;
  const earthAtLandingPct = n ? (100 * ok.filter((r) => r.earthAtLanding).length) / n : 0;
  const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : null; };
  return {
    n, noData: results.length - n, safe, pSafe: n ? safe / n : 0, ci95: [lo, hi], fails, litAtLandingPct, earthAtLandingPct,
    sunlitPct: { p5: q(ok.map((r) => r.sunlitPct), 0.05), median: q(ok.map((r) => r.sunlitPct), 0.5), p95: q(ok.map((r) => r.sunlitPct), 0.95) },
    earthPct: { p5: q(ok.map((r) => r.earthPct), 0.05), median: q(ok.map((r) => r.earthPct), 0.5), p95: q(ok.map((r) => r.earthPct), 0.95) },
    longestDarkH: { median: q(ok.map((r) => r.longestDarkH), 0.5), p95: q(ok.map((r) => r.longestDarkH), 0.95) },
    longestCommsGapH: { median: q(ok.map((r) => r.longestCommsGapH), 0.5), p95: q(ok.map((r) => r.longestCommsGapH), 0.95) },
    slopeDeg: { median: q(ok.map((r) => r.slopeDeg ?? 0), 0.5), p95: q(ok.map((r) => r.slopeDeg ?? 0), 0.95) },
  };
}
