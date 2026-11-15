// Automated demo check (engine side): the locked demo moment must keep its answer.
// Connecting ridge, 2026-11-15 21:00 UTC, app defaults on first load:
//   smooth Moon -> CAUTION; real NASA terrain -> NO-GO; at landing the Sun is above the smooth horizon but behind terrain
//   (that is what draws the "Sun hidden by terrain" marker). The live-UI check (laptop + phone) is still done before tagging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSite, DEFAULTS } from '../src/engine/analysis.js';
import { withTerrain } from '../src/engine/terrain.js';
import { siteById } from '../src/engine/sites.js';

const L = Date.parse('2026-11-15T21:00:00Z');

for (const missionDays of [7, 14]) {
  test(`demo moment keeps its verdicts (${missionDays}-day stay)`, () => {
    const base = siteById('connecting-ridge'), opts = { ...DEFAULTS, missionDays };
    const real = analyzeSite(withTerrain(base, true), L, opts);
    const smooth = analyzeSite(base, L, { ...opts, slipDays: 0 }).result;
    assert.equal(smooth.verdict.status, 'CAUTION', `smooth: ${smooth.verdict.status}`);
    assert.equal(real.result.verdict.status, 'NO-GO', `real: ${real.result.verdict.status}`);
    const k = real.idx(L), alt = real.series.sunAlt[k], clear = real.series.sunClear[k];
    // marker rule in SkyDome: terrain on, Sun above the smooth horizon, clearance below -margin
    assert.ok(alt > 0, `Sun altitude ${alt.toFixed(2)}° should be above the smooth horizon`);
    assert.ok(clear < -opts.marginDeg, `Sun clearance ${clear.toFixed(2)}° should be below -${opts.marginDeg}° (behind terrain)`);
    console.log(`demo ${missionDays} d: smooth ${smooth.verdict.status}, real ${real.result.verdict.status}, Sun ${alt.toFixed(2)}° up, ${(-clear).toFixed(2)}° behind terrain`);
  });
}
