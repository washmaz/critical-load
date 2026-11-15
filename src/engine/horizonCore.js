// horizonCore.js: terrain horizon, slope and NASA per-pixel facts for ANY point south of ~76 S.
// Pure functions (no DOM, no fetch) so the same code runs in the browser worker and in Node tests.
// Method = tools/science/terrain_light.py (validated against NASA PGDA; see DATA_LAYER.md):
//   * observer 2 m above the LOLA surface; 720 azimuth bins of 0.5 deg, bin centres at 0.25 deg + k * 0.5 deg
//   * rays from 240 m: 40 m steps to 4 km, then x1.01 per step out to 600 km (stops at the map edge)
//   * terrain within 29 km from the 80 m map, beyond that from the 320 m map; bilinear between pixel centres
//   * elevation angle measured on the sphere (curvature included); horizon = highest angle along the ray
export const R_M = 1737400;
export const NAZ = 720;
export const OBS_H = 2.0;
const NEAR_MAX = 29000;

export function llToXY(latDeg, lonDeg) {
  const la = (latDeg * Math.PI) / 180, lo = (lonDeg * Math.PI) / 180;
  const rho = 2 * R_M * Math.tan(Math.PI / 4 + la / 2);
  return [rho * Math.sin(lo), rho * Math.cos(lo)];
}
export function xyToLL(x, y) {
  const rho = Math.hypot(x, y);
  const lat = 2 * Math.atan(rho / (2 * R_M)) - Math.PI / 2;
  return [(lat * 180) / Math.PI, (Math.atan2(x, y) * 180) / Math.PI];
}

let DIST = null;
export function rayDistances() {
  if (DIST) return DIST;
  const d = [];
  for (let v = 240; v < 4000 - 1e-9; v += 40) d.push(v);
  while (d[d.length - 1] < 600000) d.push(d[d.length - 1] * 1.01);
  DIST = Float64Array.from(d);
  return DIST;
}

/**
 * Raster grid accessor used everywhere below. Dense form (fast): { pix, x0, y0, n, data: Float32Array, w, h, r0, c0 }
 * where data holds rows r0..r0+h-1 and columns c0..c0+w-1 of the full n x n grid (NaN = no data).
 */
export function cell(g, r, c) {
  const rr = r - g.r0, cc = c - g.c0;
  if (rr < 0 || cc < 0 || rr >= g.h || cc >= g.w) return NaN;
  return g.data[rr * g.w + cc];
}

/** Bilinear sample between pixel centres. Matches numpy bil() in tools/science/terrain_light.py. */
export function bilinear(g, x, y) {
  const r = (g.y0 - y) / g.pix - 0.5, c = (x - g.x0) / g.pix - 0.5;
  const r0 = Math.floor(r), c0 = Math.floor(c);
  if (r0 < 0 || c0 < 0 || r0 >= g.n - 1 || c0 >= g.n - 1) return NaN;
  const rr = r0 - g.r0, cc = c0 - g.c0;
  if (rr < 0 || cc < 0 || rr >= g.h - 1 || cc >= g.w - 1) return NaN;
  const fr = r - r0, fc = c - c0, i = rr * g.w + cc, d = g.data;
  return d[i] * (1 - fr) * (1 - fc) + d[i + 1] * (1 - fr) * fc + d[i + g.w] * fr * (1 - fc) + d[i + g.w + 1] * fr * fc;
}

/**
 * Terrain horizon at (lat, lon). near = 80 m grid accessor, far = 320 m grid accessor.
 * Returns { elevationM, horizonDeg: Float32Array(720) }.
 */
export function computeHorizon(latDeg, lonDeg, near, far) {
  const [x0, y0] = llToXY(latDeg, lonDeg);
  const h0 = bilinear(near, x0, y0);
  if (!Number.isFinite(h0)) throw new Error('No LOLA elevation at this point (outside the 80 S map or a data gap).');
  const lat0 = (latDeg * Math.PI) / 180, lon0 = (lonDeg * Math.PI) / 180;
  const sl0 = Math.sin(lat0), cl0 = Math.cos(lat0), so0 = Math.sin(lon0), co0 = Math.cos(lon0);
  const rO = R_M + h0 + OBS_H;
  const Ox = rO * cl0 * co0, Oy = rO * cl0 * so0, Oz = rO * sl0;
  // local east, north, up
  const ex = -so0, ey = co0, ez = 0;
  const ux = cl0 * co0, uy = cl0 * so0, uz = sl0;
  const nx = uy * ez - uz * ey, ny = uz * ex - ux * ez, nz = ux * ey - uy * ex;
  const D = rayDistances(), nd = D.length;
  const sD = new Float64Array(nd), cD = new Float64Array(nd);
  for (let k = 0; k < nd; k++) { const a = D[k] / R_M; sD[k] = Math.sin(a); cD[k] = Math.cos(a); }
  const out = new Float32Array(NAZ);
  for (let i = 0; i < NAZ; i++) {
    const Z = (((i + 0.5) * 360) / NAZ) * (Math.PI / 180);
    const sZ = Math.sin(Z), cZ = Math.cos(Z);
    let best = -Infinity;
    for (let k = 0; k < nd; k++) {
      const sla = sl0 * cD[k] + cl0 * sD[k] * cZ;
      const lat = Math.asin(sla);
      const lon = lon0 + Math.atan2(sZ * sD[k] * cl0, cD[k] - sl0 * sla);
      const slo = Math.sin(lon), clo = Math.cos(lon);
      const rho = 2 * R_M * Math.tan(Math.PI / 4 + lat / 2);
      const H = D[k] <= NEAR_MAX ? bilinear(near, rho * slo, rho * clo) : bilinear(far, rho * slo, rho * clo);
      if (!(H === H)) continue; // NaN: outside the map or no data
      const cla = Math.cos(lat), rr = R_M + H;
      const vx = rr * cla * clo - Ox, vy = rr * cla * slo - Oy, vz = rr * sla - Oz;
      const up = vx * ux + vy * uy + vz * uz;
      const e = vx * ex + vy * ey + vz * ez, n = vx * nx + vy * ny + vz * nz;
      const alt = Math.atan2(up, Math.hypot(e, n));
      if (alt > best) best = alt;
    }
    out[i] = (best * 180) / Math.PI;
  }
  return { elevationM: h0, horizonDeg: out };
}

/** LDSM slope statistics as in the pipeline: mean of 3x3 at the site pixel, 90th percentile and max within 1 km (12 px). */
export function slopeStats(latDeg, lonDeg, slope) {
  const [x, y] = llToXY(latDeg, lonDeg);
  const c = Math.floor((x - slope.x0) / slope.pix), r = Math.floor((slope.y0 - y) / slope.pix), k = 12;
  let s3 = 0, n3 = 0; const disk = [];
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
    const v = cell(slope, r + dy, c + dx);
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && Number.isFinite(v)) { s3 += v; n3++; }
    if (dx * dx + dy * dy <= k * k && Number.isFinite(v)) disk.push(v);
  }
  disk.sort((a, b) => a - b);
  const pct = (p) => { if (!disk.length) return NaN; const i = (p / 100) * (disk.length - 1), i0 = Math.floor(i); return disk[i0] + (disk[Math.min(i0 + 1, disk.length - 1)] - disk[i0]) * (i - i0); };
  const r1 = (v) => Math.round(v * 10) / 10;
  return { atSiteDeg: r1(s3 / n3), p90Within1kmDeg: r1(pct(90)), maxWithin1kmDeg: r1(disk[disk.length - 1]) };
}

/** Linear interpolation in a 720-bin horizon (same as terrain.horizonAt). */
export function horizonAtDeg(hz, az) {
  const x = ((((az % 360) + 360) % 360) - 0.25) / 0.5;
  const i0 = Math.floor(x), f = x - i0, n = hz.length;
  return hz[((i0 % n) + n) % n] * (1 - f) + hz[(((i0 + 1) % n) + n) % n] * f;
}
