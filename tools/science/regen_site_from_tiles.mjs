// Usage: node tools/science/regen_site_from_tiles.mjs "$PWD" LAT LON  (prints the site_terrain + site_science entries as JSON)
// Regenerate one curated site's site_terrain / site_science entries from the repo's NASA tiles,
// using the same engine that tests/anypoint.test.js validates against the offline pipeline.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const REPO = process.argv[2], LAT = +process.argv[3], LON = +process.argv[4];
const { setTileFetcher } = await import(REPO + '/src/engine/tiles.js');
const { pointFacts } = await import(REPO + '/src/engine/pointData.js');
const DIR = new URL('file://' + REPO + '/data/tiles/');
setTileFetcher(async (p) => { const b = readFileSync(new URL(p, DIR)); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; });
const { terrain, science } = await pointFacts(LAT, LON);
const r1 = (x) => Math.round(x * 10) / 10;
const t = {
  elevationM: r1(terrain.elevationM), observerHeightM: 2.0, azStepDeg: 0.5, azStartDeg: 0.25,
  horizonDeg: Array.from(terrain.horizon, (v) => Math.round(v * 1000) / 1000),
  slope: terrain.slope, nearestShadowKm: terrain.nearestShadowKm, yearly: terrain.yearly,
};
const n = science.nasaIllumination, d = science.diviner, y = terrain.yearly;
const s = {
  nasaIllumination: n, diviner: d, craters: null,
  validation: n ? { oursSunPct: y.terrainSunPct, nasaSunPct: n.sunPct, diffSun: r1(y.terrainSunPct - n.sunPct),
    oursEarthPct: y.terrainEarthPct, nasaEarthPct: n.earthPct, diffEarth: r1(y.terrainEarthPct - n.earthPct) } : null,
};
console.log(JSON.stringify({ terrain: t, science: s }));
