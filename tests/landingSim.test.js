// Monte Carlo landing simulation: consistency with the app's single-point analysis, sampling statistics, timing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setTileFetcher, loadTerrainAround } from '../src/engine/tiles.js';
import { sampleTouchdowns, evaluateTouchdown, summarize, wilson, K997 } from '../src/engine/landingSim.js';
import { bodyVectorSeries } from '../src/engine/lunarSky.js';
import { analyzeSite, DEFAULTS } from '../src/engine/analysis.js';
import { withTerrain } from '../src/engine/terrain.js';
import { SITES } from '../src/engine/sites.js';

const DIR = new URL('../data/tiles/', import.meta.url);
const have = existsSync(new URL('meta.json', DIR));
setTileFetcher(async (p) => { const b = readFileSync(new URL(p, DIR)); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; });

test('99.7 % of sampled touchdowns fall inside the ellipse; Wilson interval sane', () => {
  const td = sampleTouchdowns({ lat: -89.4, lon: -136.2, semiMajorM: 300, semiMinorM: 100, azimuthDeg: 30, n: 20000, seed: 7 });
  const f = td.filter((d) => d.inEllipse).length / td.length;
  assert.ok(Math.abs(f - 0.997) < 0.002, `inside fraction ${f}`);
  assert.ok(Math.abs(K997 - 3.4086) < 1e-3);
  const [lo, hi] = wilson(950, 1000); assert.ok(lo > 0.93 && hi < 0.965 && lo < 0.95 && hi > 0.95);
});

test('a zero-size ellipse reproduces the single-point analysis (Connecting ridge demo date)', { skip: !have && 'no tiles' }, async () => {
  const s = SITES.find((x) => x.id === 'connecting-ridge'), L = Date.parse('2026-11-14T21:00Z');
  const o = { ...DEFAULTS, slipDays: 0, missionDays: 14 };
  const ref = analyzeSite(withTerrain(s, true), L, o).result.metrics;
  const bodies = bodyVectorSeries(L, L + o.missionDays * 86400e3, 1);
  const grids = await loadTerrainAround(s.lat, s.lon, 31000);
  const [td] = sampleTouchdowns({ lat: s.lat, lon: s.lon, semiMajorM: 1e-6, semiMinorM: 1e-6, n: 1 });
  const r = evaluateTouchdown(td, grids, bodies, { ...o, slopeMaxDeg: 10 });
  console.log({ ref: { sun: ref.sunlitPct, dark: ref.longestDarkH, earth: ref.earthPct, gap: ref.longestCommsGapH }, sim: r });
  assert.ok(Math.abs(r.sunlitPct - ref.sunlitPct) < 1.0);
  assert.ok(Math.abs(r.longestDarkH - ref.longestDarkH) < 1.0);
  assert.ok(Math.abs(r.earthPct - ref.earthPct) < 1.0);
});

test('50-touchdown run at Connecting ridge (timing + summary)', { skip: !have && 'no tiles' }, async () => {
  const s = SITES.find((x) => x.id === 'connecting-ridge'), L = Date.parse('2026-11-14T21:00Z');
  const o = { ...DEFAULTS, missionDays: 14, slopeMaxDeg: 10 };
  const bodies = bodyVectorSeries(L, L + o.missionDays * 86400e3, 1);
  const grids = await loadTerrainAround(s.lat, s.lon, 31000);
  const tds = sampleTouchdowns({ lat: s.lat, lon: s.lon, semiMajorM: 100, semiMinorM: 100, n: 50, seed: 3 });
  const t0 = Date.now(); const res = tds.map((td) => evaluateTouchdown(td, grids, bodies, o)); const ms = Date.now() - t0;
  const sum = summarize(res, {});
  console.log({ msPerTouchdown: ms / tds.length, ...sum });
  assert.equal(sum.n, 50);
});
