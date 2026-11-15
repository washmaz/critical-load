// science.js — extra NASA/USGS data per site: NASA's own illumination maps (cross-check),
// Diviner temperatures and ice depth, and nearby craters. Pre-computed offline (tools/science/).
import DATA from '../data/site_science.json' with { type: 'json' };
import { maybeGunzip } from './ephemerisStore.js';

export const SCIENCE_SOURCES = DATA.sources;
export const SCIENCE_METHOD = DATA.method;

/** Pre-computed records for a curated site id, or null. */
export const scienceFor = (siteId) => DATA.sites[siteId] ?? null;

// ---- Craters for custom coordinates ------------------------------------------------------------
// public/craters/robbins_3km.bin: every crater >= 3 km in the Robbins (2019) database (212,149 craters),
// 3 x uint16 each: (lat + 90) * 300, lon(0-360) * 150, diameter km * 10.
let craterPromise = null;
export function loadCraters(url = '/craters/robbins_3km.bin') {
  if (!craterPromise) {
    craterPromise = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(maybeGunzip)
      .then((buf) => new Uint16Array(buf))
      .catch((e) => { console.warn('[craters] unavailable:', e.message); craterPromise = null; return null; });
  }
  return craterPromise;
}

const R_KM = 1737.4, D2R = Math.PI / 180;
function gcKm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return R_KM * Math.acos(Math.max(-1, Math.min(1, c)));
}

/**
 * Craters >= 3 km near a point. Returns { inside: [{diamKm, distKm}], nearby: count within 10 km of the rim,
 * nearestRimKm } or null if the crater file could not be loaded.
 */
export function cratersNear(arr, lat, lon) {
  if (!arr) return null;
  const inside = []; let nearby = 0; let nearestRimKm = Infinity;
  for (let i = 0; i < arr.length; i += 3) {
    const clat = arr[i] / 300 - 90;
    if (Math.abs(clat - lat) > 5) continue;
    const clon = arr[i + 1] / 150, d = arr[i + 2] / 10;
    const dist = gcKm(lat, lon, clat, clon);
    const rim = Math.abs(dist - d / 2);
    if (dist < d / 2) inside.push({ diamKm: d, distKm: Math.round(dist * 10) / 10 });
    if (rim <= 10) nearby++;
    if (rim < nearestRimKm) nearestRimKm = rim;
  }
  inside.sort((a, b) => a.diamKm - b.diamKm);
  return { inside, nearby, nearestRimKm: Number.isFinite(nearestRimKm) ? Math.round(nearestRimKm * 10) / 10 : null };
}
