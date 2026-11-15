// Time-step test: does sampling every 1 h (the app default) miss anything that 10-minute sampling catches?
// Part A: single-point analysis at the 11 polar sites with real terrain, at the landing date and every candidate date in a
//         +-7 day slip window. Part B: 200 Monte Carlo touchdowns at the two ridge sites, judged at both steps.
// Usage: node tools/runs/timestep_test.mjs TILESDIR OUTFILE
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { analyzeSite, DEFAULTS } from '../../src/engine/analysis.js';
import { withTerrain } from '../../src/engine/terrain.js';
import { SITES } from '../../src/engine/sites.js';
import { setTileFetcher, loadTerrainAround } from '../../src/engine/tiles.js';
import { sampleTouchdowns, evaluateTouchdown } from '../../src/engine/landingSim.js';
import { bodyVectorSeries } from '../../src/engine/lunarSky.js';

const [TILES, OUT] = process.argv.slice(2);
setTileFetcher(async (p) => { const b = readFileSync(TILES + '/' + p); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; });
const L = Date.parse('2026-11-14T21:00:00Z');
const base = { ...DEFAULTS, missionDays: 14, slipDays: 7 };
const out = { landing: new Date(L).toISOString(), steps: ['1 h', '10 min'], partA: [], partB: [] };
for (const s of SITES.filter((x) => x.lat < -80)) {
  const site = withTerrain(s, true);
  const a1 = analyzeSite(site, L, { ...base, stepHours: 1 }), a6 = analyzeSite(site, L, { ...base, stepHours: 1 / 6 });
  const m1 = a1.result.metrics, m6 = a6.result.metrics;
  // candidate dates in the slip window: compare verdicts at the same times
  const byT = new Map(a6.scan.map((c) => [c.t, c.verdict.status]));
  const scanCompared = a1.scan.filter((c) => byT.has(c.t)), scanDiff = scanCompared.filter((c) => byT.get(c.t) !== c.verdict.status).length;
  out.partA.push({ id: s.id,
    verdict: [a1.result.verdict.status, a6.result.verdict.status],
    sunlitPct: [m1.sunlitPct, m6.sunlitPct], longestDarkH: [m1.longestDarkH, m6.longestDarkH],
    earthPct: [m1.earthPct, m6.earthPct], longestCommsGapH: [m1.longestCommsGapH, m6.longestCommsGapH],
    slipDatesCompared: scanCompared.length, slipVerdictsDifferent: scanDiff });
  console.log(s.id, a1.result.verdict.status, a6.result.verdict.status, m1.longestDarkH.toFixed(2), m6.longestDarkH.toFixed(2), 'slip diffs', scanDiff, '/', scanCompared.length);
  writeFileSync(OUT, JSON.stringify(out, null, 1));
}
const b1 = bodyVectorSeries(L, L + 14 * 86400e3, 1), b6 = bodyVectorSeries(L, L + 14 * 86400e3, 1 / 6);
for (const id of ['connecting-ridge', 'shackleton-rim']) {
  const s = SITES.find((x) => x.id === id), g = await loadTerrainAround(s.lat, s.lon, 31000);
  const o = { ...DEFAULTS, missionDays: 14, slopeMaxDeg: 10, slopeMode: 100, panelHeightM: 2, batteryHours: 48 };
  const tds = sampleTouchdowns({ lat: s.lat, lon: s.lon, semiMajorM: 50, semiMinorM: 50, n: 200, seed: 1 });
  let diffPower = 0, diffComms = 0, maxDarkDiff = 0;
  for (const td of tds) {
    const r1 = evaluateTouchdown(td, g, b1, o), r6 = evaluateTouchdown(td, g, b6, o);
    if (r1.powerOK !== r6.powerOK) diffPower++; if (r1.commsOK !== r6.commsOK) diffComms++;
    maxDarkDiff = Math.max(maxDarkDiff, Math.abs(r1.longestDarkH - r6.longestDarkH));
  }
  out.partB.push({ id, touchdowns: tds.length, powerVerdictDifferent: diffPower, commsVerdictDifferent: diffComms, maxLongestDarkDiffH: maxDarkDiff });
  console.log('MC', id, diffPower, diffComms, maxDarkDiff.toFixed(2));
  writeFileSync(OUT, JSON.stringify(out, null, 1));
}
out.done = true; writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log('DONE');
