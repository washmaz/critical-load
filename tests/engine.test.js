import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSkyState, skyAt } from '../src/engine/lunarSky.js';
import { analyzeSite, intervalsAbove, compareSites } from '../src/engine/analysis.js';
import { SITES, siteById } from '../src/engine/sites.js';

const T = '2026-11-14T18:00:00Z';

test('checkpoint 1 numbers unchanged (89.9S 0E)', () => {
  const s = getSkyState({ lat: -89.9, lon: 0 }, T);
  assert.ok(Math.abs(s.sun.alt - 1.509) < 0.01, `sun alt ${s.sun.alt}`);
  assert.ok(Math.abs(s.earth.alt + 3.742) < 0.01, `earth alt ${s.earth.alt}`);
});

test('skyAt matches getSkyState', () => {
  const site = siteById('apollo-11');
  const a = skyAt(site, T), b = getSkyState(site, T);
  assert.ok(Math.abs(a.sun.alt - b.sun.alt) < 1e-9);
});

test('intervalsAbove interpolates edges', () => {
  const t = Float64Array.from([0, 10, 20, 30]);
  const v = Float64Array.from([-1, 1, 1, -1]);
  const w = intervalsAbove(t, v, 0);
  assert.equal(w.length, 1);
  assert.equal(w[0].start, 5);
  assert.equal(w[0].end, 25);
});

test("Chang'e 4 never sees Earth -> CAUTION (relay) or worse", () => {
  const a = analyzeSite(siteById('change-4'), T, { slipDays: 0 });
  assert.equal(a.result.metrics.earthPct, 0);
  assert.notEqual(a.result.verdict.status, 'GO');
});

test('Apollo 11: ~50% sunlit over a full lunation', () => {
  const a = analyzeSite(siteById('apollo-11'), T, { slipDays: 0, missionDays: 29.53 });
  assert.ok(Math.abs(a.result.metrics.sunlitPct - 50) < 3, `sunlit ${a.result.metrics.sunlitPct}`);
  assert.ok(a.result.metrics.earthPct > 99, 'near side equator always sees Earth');
});

test('slip scan + recommender over ±30 days runs fast', () => {
  const t0 = Date.now();
  const a = analyzeSite(siteById('shackleton-rim'), T, { slipDays: 30 });
  const ms = Date.now() - t0;
  assert.ok(a.scan.length > 200);
  assert.ok(a.best.length >= 1);
  console.log(`±30 d scan: ${a.scan.length} candidates in ${ms} ms; summary`, a.summary);
  assert.ok(ms < 3000);
});

test('compare all sites', () => {
  const r = compareSites(SITES, T);
  console.log(r.map((x) => `${x.site.name}: ${x.verdict.status} sunlit ${x.metrics.sunlitPct.toFixed(0)}% dark ${x.metrics.longestDarkH.toFixed(0)}h earth ${x.metrics.earthPct.toFixed(0)}% gap ${x.metrics.longestCommsGapH.toFixed(0)}h`).join('\n'));
  assert.equal(r.length, SITES.length);
});

// ---- terrain (LOLA) -------------------------------------------------------
import { withTerrain, terrainFor, horizonAt } from '../src/engine/terrain.js';

test('terrain data loads for the 4 polar sites only', () => {
  for (const id of ['shackleton-rim', 'connecting-ridge', 'malapert-massif', 'im2-mons-mouton']) {
    const t = terrainFor(id);
    assert.ok(t && t.horizon.length === 720, id);
  }
  assert.equal(terrainFor('apollo-11'), null);
  assert.equal(withTerrain(siteById('apollo-11')).terrain, undefined);
});

test('horizonAt interpolates and wraps', () => {
  const t = terrainFor('connecting-ridge');
  assert.ok(Math.abs(horizonAt(t, 0.25) - t.horizon[0]) < 1e-6);
  assert.ok(Math.abs(horizonAt(t, 360.25) - t.horizon[0]) < 1e-6);
});

test('JS matches the Python pipeline: Connecting ridge, 30 days from 14 Nov 2026 21:00 UTC', () => {
  const base = siteById('connecting-ridge');
  const opt = { slipDays: 0, missionDays: 30, marginDeg: 0 };
  const smooth = analyzeSite(base, '2026-11-14T21:00:00Z', opt).result.metrics;
  const real = analyzeSite(withTerrain(base), '2026-11-14T21:00:00Z', opt).result.metrics;
  console.log(`connecting ridge 30 d: smooth sunlit ${smooth.sunlitPct.toFixed(1)}%, terrain ${real.sunlitPct.toFixed(1)}% (python 100 / 68.1); earth smooth ${smooth.earthPct.toFixed(1)} terrain ${real.earthPct.toFixed(1)} (python 39.0 / 31.7)`);
  assert.ok(smooth.sunlitPct > 99);
  assert.ok(Math.abs(real.sunlitPct - 68.1) < 2, `terrain sunlit ${real.sunlitPct}`);
  assert.ok(Math.abs(real.earthPct - 31.7) < 2, `terrain earth ${real.earthPct}`);
});

test('Malapert keeps Earth in view with terrain', () => {
  const real = analyzeSite(withTerrain(siteById('malapert-massif')), '2026-11-14T21:00:00Z', { slipDays: 0, missionDays: 30, marginDeg: 0 }).result.metrics;
  assert.ok(real.earthPct > 99, `earth ${real.earthPct}`);
});

test('Gateway descent opportunities: slip scan only uses dates every 6.5 days from the planner\'s epoch', async () => {
  const { analyzeSite } = await import('../src/engine/analysis.js');
  const L = Date.parse('2026-11-14T21:00Z'), E = Date.parse('2026-11-13T09:00Z');
  const a = analyzeSite({ lat: -85, lon: 30 }, L, { slipDays: 14, missionDays: 7, descentPeriodDays: 6.5, descentEpochMs: E });
  assert.ok(a.scan.length >= 4 && a.scan.length <= 5);
  for (const c of a.scan) { const k = (c.t - E) / (6.5 * 86400e3); assert.ok(Math.abs(k - Math.round(k)) < 1e-9); assert.ok(Math.abs(c.t - L) <= 14 * 86400e3 + 1); }
});
