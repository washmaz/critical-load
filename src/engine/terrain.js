// terrain.js — real horizons from NASA LRO LOLA topography (south polar sites only).
//
// For each curated site south of 80°S we pre-computed (Python, terrain_pipeline.zip in NASA Hub):
//   * the terrain horizon: highest terrain elevation angle in each 0.5° azimuth bin, ray-marched from 240 m
//     out to the edge of the LOLA LDEM_80S_80MPP_ADJ elevation map, for an observer 2 m above the surface;
//   * the local slope (LDSM_80S_80MPP_ADJ) and the nearest permanently shadowed region larger than 1 km²
//     (LPSR_80S_20MPP_ADJ_1km2), i.e. the nearest likely ice trap.
// Data: Barker et al. 2023, Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1; data doi:10.60903/gsfcpgda-lola-spole.

import DATA from '../data/site_terrain.json' with { type: 'json' };

export const TERRAIN_SOURCE = DATA.source;
export const TERRAIN_METHOD = DATA.method;

/** Terrain record for a curated site id, or null if we have none (e.g. sites north of 80°S, custom points). */
export function terrainFor(siteId) {
  const t = DATA.sites[siteId];
  if (!t) return null;
  return {
    ...t,
    // observer sits on the local terrain, so it is (elevation + 2 m) above the 1737.4 km reference sphere
    heightKm: (t.elevationM + t.observerHeightM) / 1000,
    horizon: Float32Array.from(t.horizonDeg),
  };
}

/** Terrain horizon elevation (deg) in compass direction az (deg from north, clockwise). Linear between bins. */
export function horizonAt(terrain, az) {
  if (!terrain) return 0;
  const n = terrain.horizon.length;
  const x = ((((az % 360) + 360) % 360) - terrain.azStartDeg) / terrain.azStepDeg;
  const i0 = Math.floor(x);
  const f = x - i0;
  const a = terrain.horizon[((i0 % n) + n) % n];
  const b = terrain.horizon[(((i0 + 1) % n) + n) % n];
  return a * (1 - f) + b * f;
}

/** Returns a copy of the site with its terrain attached (when available and wanted). */
export function withTerrain(site, use = true) {
  if (!use || !site) return site;
  const terrain = terrainFor(site.id);
  return terrain ? { ...site, terrain } : site;
}
