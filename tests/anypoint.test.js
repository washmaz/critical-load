// Validates the in-browser any-point engine (tiles + horizonCore) against the offline Python pipeline
// (src/data/site_terrain.json: horizons, elevation, slope for the curated polar sites). Skips if data/tiles is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setTileFetcher, loadTerrainAround, loadScienceAround, scienceAt } from '../src/engine/tiles.js';
import SCI from '../src/data/site_science.json' with { type: 'json' };
import { computeHorizon, slopeStats } from '../src/engine/horizonCore.js';
import { SITES } from '../src/engine/sites.js';
import TERR from '../src/data/site_terrain.json' with { type: 'json' };

const DIR = new URL('../data/tiles/', import.meta.url);
const have = existsSync(new URL('meta.json', DIR));
setTileFetcher(async (p) => { const b = readFileSync(new URL(p, DIR)); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; });

test('any-point horizon reproduces the offline pipeline at every curated polar site', { skip: !have && 'data/tiles not present' }, async () => {
  const rows = [];
  for (const [id, ref] of Object.entries(TERR.sites)) {
    const s = SITES.find((x) => x.id === id);
    const g = await loadTerrainAround(s.lat, s.lon);
    const t0 = Date.now();
    const h = computeHorizon(s.lat, s.lon, g.near, g.far);
    const ms = Date.now() - t0;
    let maxd = 0, sum = 0;
    for (let i = 0; i < 720; i++) { const d = Math.abs(h.horizonDeg[i] - ref.horizonDeg[i]); maxd = Math.max(maxd, d); sum += d; }
    const sl = slopeStats(s.lat, s.lon, g.slope);
    rows.push({ id, ms, elev: +(h.elevationM - ref.elevationM).toFixed(2), meanAbs: +(sum / 720).toFixed(4), maxAbs: +maxd.toFixed(4), slope: sl, refSlope: ref.slope });
    assert.ok(Math.abs(h.elevationM - ref.elevationM) < 0.3, `${id} elevation`);
    assert.ok(maxd < 0.05, `${id} horizon max diff ${maxd}`);
    // slope tiles store 0.25 deg steps, so allow quantisation (+-0.125) plus 0.1 deg display rounding
    for (const k of Object.keys(ref.slope)) assert.ok(Math.abs(sl[k] - ref.slope[k]) <= 0.2, `${id} slope ${k}: ${sl[k]} vs ${ref.slope[k]}`);
  }
  console.log(JSON.stringify(rows, null, 1));
});

test('science tiles return NASA PGDA and Diviner values at every curated polar site', { skip: !have && 'data/tiles not present' }, async () => {
  for (const [id, ref] of Object.entries(SCI.sites)) {
    const s = SITES.find((x) => x.id === id);
    if (!s || s.lat > -80) continue;
    const v = scienceAt(await loadScienceAround(s.lat, s.lon, 500), s.lat, s.lon);
    const n = ref.nasaIllumination, d = ref.diviner;
    assert.ok(Math.abs(v.sunPct - n.sunPct) <= 0.5, `${id} sun ${v.sunPct} vs ${n.sunPct}`);
    assert.ok(Math.abs(v.earthPct - n.earthPct) <= 0.5, `${id} earth ${v.earthPct} vs ${n.earthPct}`);
    assert.ok(Math.abs(v.tempAvgK - d.tempAvgK) <= 0.5, `${id} Tavg ${v.tempAvgK} vs ${d.tempAvgK}`);
    // Tmax is stored in 2 K steps, and the 120 m cell takes the ~500 m Diviner triangle containing the cell centre,
    // so a site within ~85 m of a triangle edge can read the neighbouring triangle (a few K different).
    assert.ok(Math.abs(v.tempMaxK - d.tempMaxK) <= 2.5, `${id} Tmax ${v.tempMaxK} vs ${d.tempMaxK}`);
    if (d.iceDepthM == null) assert.equal(v.iceDepthM, 'deeper than 2.87 m', `${id} ice`);
    else assert.ok(Math.abs(v.iceDepthM - d.iceDepthM) <= 0.015, // 2 cm storage step; reference rounded to 1 cm
      `${id} ice ${v.iceDepthM} vs ${d.iceDepthM}`);
  }
});

test('pointFacts at a curated site matches the pre-computed yearly numbers', { skip: !have && 'no tiles' }, async () => {
  const { pointFacts } = await import('../src/engine/pointData.js');
  for (const id of ['connecting-ridge', 'nobile-rim-1', 'malapert-massif']) {
    const s = SITES.find((x) => x.id === id), ref = TERR.sites[id];
    const t0 = Date.now(); const f = await pointFacts(s.lat, s.lon); const ms = Date.now() - t0;
    const y = f.terrain.yearly, r = ref.yearly;
    console.log(id, ms, 'ms', y, r);
    assert.ok(Math.abs(y.terrainSunPct - r.terrainSunPct) <= 0.5, `${id} terrain sun ${y.terrainSunPct} vs ${r.terrainSunPct}`);
    assert.ok(Math.abs(y.smoothSunPct - r.smoothSunPct) <= 0.5, `${id} smooth sun`);
    assert.ok(Math.abs(y.terrainEarthPct - r.terrainEarthPct) <= 0.5, `${id} terrain earth`);
    assert.ok(Math.abs(y.terrainLongestDarkH - r.terrainLongestDarkH) <= 4, `${id} longest dark ${y.terrainLongestDarkH} vs ${r.terrainLongestDarkH}`);
  }
});
