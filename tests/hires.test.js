
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setTileFetcher, loadTerrainAround, loadHires } from '../src/engine/tiles.js';
import { sampleTouchdowns, evaluateTouchdown, summarize } from '../src/engine/landingSim.js';
import { bodyVectorSeries } from '../src/engine/lunarSky.js';
import { slopeOverBaseline, llToXY } from '../src/engine/horizonCore.js';
import { DEFAULTS } from '../src/engine/analysis.js';
import { SITES } from '../src/engine/sites.js';
const DIR = new URL('../data/tiles/', import.meta.url);
const meta = existsSync(new URL('meta.json', DIR)) ? JSON.parse(readFileSync(new URL('meta.json', DIR))) : null;
const have = !!(meta && meta.hires && meta.hires.sites.Site01);
setTileFetcher(async (p) => { const b = readFileSync(new URL(p, DIR)); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; });

test('NASA 5 m site maps: 100 m-baseline slope agrees with the 80 m-DEM version; Monte Carlo uses the 5 m data', { skip: !have && 'no 5 m data' }, async () => {
  const s = SITES.find((x) => x.id === 'connecting-ridge'), [x, y] = llToXY(s.lat, s.lon);
  const g = await loadTerrainAround(s.lat, s.lon, 31000); g.hires = await loadHires(s.lat, s.lon, 500);
  assert.ok(g.hires && g.hires.sites.includes('Site01'));
  const a = g.hires.slope100(x, y), b = slopeOverBaseline(x, y, g.near, 100);
  console.log({ slope100_5mDEM: a, slope100_80mDEM: b, slope5: g.hires.slope5(x, y), err: g.hires.slopeErr(x, y) });
  assert.ok(Math.abs(a - b) < 2);
  const L = Date.parse('2026-11-14T21:00Z'), bodies = bodyVectorSeries(L, L + 14 * 86400e3, 1);
  const tds = sampleTouchdowns({ lat: s.lat, lon: s.lon, semiMajorM: 50, semiMinorM: 50, n: 40, seed: 1 });
  for (const mode of [100, 'nasa5m']) {
    const res = tds.map((td) => evaluateTouchdown(td, g, bodies, { ...DEFAULTS, missionDays: 14, slopeMaxDeg: 10, slopeMode: mode }));
    const sum = summarize(res, {});
    console.log(mode, sum.slopeSources, sum.slopeDeg, sum.fails.slope);
    assert.equal(sum.slopeSources[mode === 100 ? '5m-dem' : '5m'], 40);
  }
});
