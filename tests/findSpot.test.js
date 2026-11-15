// "Find me a spot": screening respects the hard filters and the ellipse slope check; stage 2 ranking runs end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setTileFetcher, loadTerrainAround, loadScienceAround, scienceAt } from '../src/engine/tiles.js';
import { screenCandidates, ellipseSlopeShare, localFrame, rankVerified, DEFAULT_WEIGHTS } from '../src/engine/findSpot.js';
import { llToXY } from '../src/engine/horizonCore.js';
import { SITES } from '../src/engine/sites.js';

const DIR = new URL('../data/tiles/', import.meta.url);
const have = existsSync(new URL('meta.json', DIR));
setTileFetcher(async (p) => { const b = readFileSync(new URL(p, DIR)); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; });

test('local frame: north points away from the pole, scale factor ~1 near the pole', () => {
  const [x, y] = llToXY(-89, 0); const f = localFrame(x, y);
  assert.ok(Math.abs(f.north[0]) < 1e-9 && f.north[1] > 0.999 && Math.abs(f.k - 1) < 1e-3);
});

test('screen around Malapert: every candidate passes the NASA hard filters and is well separated', { skip: !have && 'no tiles' }, async () => {
  const s = SITES.find((x) => x.id === 'malapert-massif');
  const sci = await loadScienceAround(s.lat, s.lon, 4000 + 5500);
  const g = await loadTerrainAround(s.lat, s.lon, 6000);
  const ell = { semiMajorM: 100, semiMinorM: 100, azimuthDeg: 0 };
  const t0 = Date.now();
  const out = screenCandidates({ center: s, radiusM: 4000, sci, slope: g.slope, ellipse: ell, slopeMaxDeg: 10, keep: 10 });
  console.log({ ms: Date.now() - t0, cells: out.cells, screened: out.screened, rejected: out.rejected, top: out.candidates.slice(0, 3) });
  assert.ok(out.candidates.length > 0);
  for (const c of out.candidates) {
    const v = scienceAt(sci, c.lat, c.lon);
    assert.ok(v.sunPct >= 5 && v.earthPct >= 25 && !v.psr);
    const [x, y] = llToXY(c.lat, c.lon); assert.ok(Math.hypot(x - c.x, y - c.y) < 1e-3);
    const sl = ellipseSlopeShare(c.x, c.y, g.slope, ell, 10); assert.equal(sl.share, c.slopeShare);
  }
  for (let i = 0; i < out.candidates.length; i++) for (let j = i + 1; j < out.candidates.length; j++)
    assert.ok(Math.hypot(out.candidates[i].x - out.candidates[j].x, out.candidates[i].y - out.candidates[j].y) >= 499);
  for (let i = 1; i < out.candidates.length; i++) assert.ok(out.candidates[i - 1].score >= out.candidates[i].score);
});

test('rankVerified orders by the weighted score', () => {
  const mk = (p, sun, earth) => ({ sim: { summary: { pSafe: p, sunlitPct: { median: sun }, earthPct: { median: earth } } } });
  const r = rankVerified([mk(0.5, 90, 90), mk(0.99, 60, 60)], DEFAULT_WEIGHTS);
  assert.ok(r[0].sim.summary.pSafe === 0.99);
});

test('pole limit: with the Artemis III 6° limit, no candidate lies farther than 6° from the pole', { skip: !have && 'no tiles' }, async () => {
  const s = SITES.find((x) => x.id === 'nobile-rim-2'); // target point 6.28° from the pole
  const sci = await loadScienceAround(s.lat, s.lon, 3000 + 5500);
  const g = await loadTerrainAround(s.lat, s.lon, 4000);
  const ell = { semiMajorM: 50, semiMinorM: 50, azimuthDeg: 0 };
  const scr = screenCandidates({ center: s, radiusM: 3000, sci, slope: g.slope, near: g.near, slopeMode: 'ldsm', ellipse: ell, slopeMaxDeg: 10, keep: 30, poleWithinDeg: 6 });
  assert.ok(scr.rejected.pole > 0, 'some ground in the radius is outside 6°');
  for (const c of scr.candidates) assert.ok(c.lat <= -84 + 1e-9, `candidate at ${c.lat}`);
  const free = screenCandidates({ center: s, radiusM: 3000, sci, slope: g.slope, near: g.near, slopeMode: 'ldsm', ellipse: ell, slopeMaxDeg: 10, keep: 30 });
  assert.equal(free.rejected.pole, 0);
});
