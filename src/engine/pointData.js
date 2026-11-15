// pointData.js: everything the site panels need for ANY point inside the NASA 80 S LOLA map, computed on the fly
// from the NASA tiles: terrain horizon, slope, one-year sunlight/Earth numbers (same definition as the offline pipeline),
// NASA PGDA long-term sunlight / Earth visibility, permanent shadow, and LRO Diviner temperature / ice.
import { computeHorizon, slopeStats, llToXY, cell } from './horizonCore.js';
import { loadTerrainAround, loadScienceAround, scienceAt } from './tiles.js';
import { bodyVectorSeries } from './lunarSky.js';
import { clearanceSeries } from './landingSim.js';

const YEAR_T0 = Date.parse('2026-11-14T21:00:00Z'); // same start, length and step as tools/science/terrain_light.py

function yearly(lat, lon, elevationM, horizonDeg) {
  const b = bodyVectorSeries(YEAR_T0, YEAR_T0 + 8760 * 3600e3 - 2 * 3600e3, 2);
  const flat = new Float32Array(horizonDeg.length);
  const ter = clearanceSeries(lat, lon, elevationM, horizonDeg, b);
  const smo = clearanceSeries(lat, lon, -2, flat, b); // smooth sphere: observer on the 1737.4 km sphere
  const pct = (a) => Math.round((1000 * a.filter((v) => v > 0).length) / a.length) / 10;
  const longest = (a) => { let best = 0, cur = 0; for (const v of a) { cur = v > 0 ? 0 : cur + 1; if (cur > best) best = cur; } return best * 2; };
  return {
    smoothSunPct: pct(Array.from(smo.sunClear)), terrainSunPct: pct(Array.from(ter.sunClear)),
    smoothLongestDarkH: longest(smo.sunClear), terrainLongestDarkH: longest(ter.sunClear),
    smoothEarthPct: pct(Array.from(smo.earthClear)), terrainEarthPct: pct(Array.from(ter.earthClear)),
  };
}

/** Distance (km) to the nearest 120 m cell matching pred, searching out to maxKm. */
export function nearest(sci, plane, lat, lon, maxKm, pred) {
  const [x, y] = llToXY(lat, lon), g = sci[plane];
  const r0 = Math.floor((g.y0 - y) / g.pix), c0 = Math.floor((x - g.x0) / g.pix), k = Math.ceil((maxKm * 1000) / g.pix);
  let best = Infinity;
  for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) {
    const v = cell(g, r0 + dr, c0 + dc);
    if (v === v && pred(v)) { const d = Math.hypot(dr, dc) * g.pix / 1000; if (d < best) best = d; }
  }
  return best <= maxKm ? Math.round(best * 100) / 100 : null;
}

export async function pointFacts(lat, lon) {
  const grids = await loadTerrainAround(lat, lon, 30000);
  const h = computeHorizon(lat, lon, grids.near, grids.far);
  const slope = slopeStats(lat, lon, grids.slope);
  const sci = await loadScienceAround(lat, lon, 15500);
  const here = scienceAt(sci, lat, lon);
  // 3 x 3 NASA pixels around the point (the "within 180 m" range shown for curated sites)
  const [x, y] = llToXY(lat, lon), g = sci.sun, r = Math.floor((g.y0 - y) / g.pix), c = Math.floor((x - g.x0) / g.pix);
  const sun3 = [], ear3 = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const s = cell(sci.sun, r + dr, c + dc), e = cell(sci.earth, r + dr, c + dc);
    if (s === s && s !== 255) sun3.push(s === 254 ? 0 : s / 2);
    if (e === e && e !== 255) ear3.push(e / 2);
  }
  // Diviner ice: share of ground within 5 km with stable ice in the top 1 m
  let n5 = 0, ice5 = 0; const k5 = Math.round(5000 / g.pix);
  for (let dr = -k5; dr <= k5; dr++) for (let dc = -k5; dc <= k5; dc++) {
    if (dr * dr + dc * dc > k5 * k5) continue;
    const v = cell(sci.ice, r + dr, c + dc); if (!(v === v) || v === 255) continue;
    n5++; if (v !== 250 && v <= 50) ice5++;
  }
  const terrain = {
    elevationM: h.elevationM, observerHeightM: 2, azStepDeg: 0.5, azStartDeg: 0.25,
    horizon: h.horizonDeg, heightKm: (h.elevationM + 2) / 1000, slope,
    yearly: yearly(lat, lon, h.elevationM, h.horizonDeg),
    nearestShadowKm: nearest(sci, 'sun', lat, lon, 15, (v) => v === 254),
    computedLive: true,
  };
  const science = {
    nasaIllumination: here.sunPct == null ? null : {
      sunPct: here.sunPct, earthPct: here.earthPct,
      sunRangePct: [Math.min(...sun3), Math.max(...sun3)], earthRangePct: [Math.min(...ear3), Math.max(...ear3)], psr: here.psr,
    },
    diviner: here.tempAvgK == null ? null : {
      tempAvgK: here.tempAvgK, tempMaxK: here.tempMaxK,
      iceDepthM: typeof here.iceDepthM === 'number' ? here.iceDepthM : null,
      nearestIceWithin1mKm: nearest(sci, 'ice', lat, lon, 15, (v) => v !== 250 && v <= 50),
      icePctWithin5km: n5 ? Math.round((1000 * ice5) / n5) / 10 : 0,
    },
    live: true,
  };
  return { terrain, science };
}

/** True if (lat, lon) lies inside the NASA LOLA 80 S map (where the any-point engine works). */
export function inTileCoverage(lat, lon) {
  if (!(lat < -75)) return false;
  const [x, y] = llToXY(lat, lon);
  return Math.abs(x) < 303000 && Math.abs(y) < 303000;
}
