// Full-size runs of the landing simulation and "find me a spot" with the same engine the website uses
// (1,000 touchdowns, exact horizon per touchdown). Writes JSON after every site so partial results survive.
// Usage: node tools/runs/run_all.mjs TILESDIR OUTDIR
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setTileFetcher, loadTerrainAround, loadScienceAround, scienceAt, loadHires } from '../../src/engine/tiles.js';
import { sampleTouchdowns, evaluateTouchdown, summarize } from '../../src/engine/landingSim.js';
import { screenCandidates, rankVerified, DEFAULT_WEIGHTS, ICE_RANGE_M } from '../../src/engine/findSpot.js';
import { nearest } from '../../src/engine/pointData.js';
import { bodyVectorSeries } from '../../src/engine/lunarSky.js';
import { DEFAULTS } from '../../src/engine/analysis.js';
import { PRESETS } from '../../src/engine/presets.js';
import { SITES } from '../../src/engine/sites.js';

const [TILES, OUT] = process.argv.slice(2);
setTileFetcher(async (p) => { const b = readFileSync(TILES + '/' + p); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; });
const P = PRESETS['nasa-artemis3'];
const LANDING = Date.parse('2026-11-14T21:00:00Z'), MISSION_D = +(process.env.MISSION_DAYS || 14), N = 1000;
import { ACCURACY, PANEL_HEIGHTS } from '../../src/engine/presets.js';
const opts = { ...DEFAULTS, missionDays: MISSION_D, slipDays: 0, slopeMaxDeg: P.slopeMaxDeg, slopeMode: P.slopeMode, panelHeightM: PANEL_HEIGHTS.esa2.m, batteryHours: P.batteryHours, relay: P.relay };
const ell = { semiMajorM: ACCURACY[P.accuracy].semiMajorM, semiMinorM: ACCURACY[P.accuracy].semiMinorM, azimuthDeg: 0 };
const bodies = bodyVectorSeries(LANDING, LANDING + MISSION_D * 86400e3, 1);
const meta = { landing: new Date(LANDING).toISOString(), missionDays: MISSION_D, touchdowns: N, seed: 1, preset: 'NASA Artemis III', opts, ellipse: ell,
  ephemeris: 'astronomy-engine (live), hourly', engine: 'src/engine (same code as the website)' };

async function simulate(lat, lon) {
  const t0 = Date.now();
  const grids = await loadTerrainAround(lat, lon, 31000);
  grids.hires = await loadHires(lat, lon, 400); // NASA 5 m site maps where they exist
  const sci = await loadScienceAround(lat, lon, 1500);
  const tds = sampleTouchdowns({ lat, lon, ...ell, n: N, seed: 1 });
  const res = tds.map((td) => evaluateTouchdown(td, grids, bodies, opts));
  const psr = tds.map((t) => scienceAt(sci, t.lat, t.lon).psr);
  const s = summarize(res, psr);
  return { summary: s, seconds: (Date.now() - t0) / 1000, hiresSites: grids.hires ? grids.hires.sites : [] };
}

const OUTFILE = OUT + (MISSION_D !== 14 ? '/runs-v3-' + MISSION_D + 'd.json' : '/runs-v3.json');
import { existsSync as _ex } from 'node:fs';
// RESUME: keep finished sites / searches from an earlier, interrupted run
const out = _ex(OUTFILE) ? JSON.parse(readFileSync(OUTFILE)) : { meta, sites: [], searches: [] };
out.meta = meta;
const save = () => writeFileSync(OUTFILE, JSON.stringify(out, null, 1));
const polar = SITES.filter((s) => s.lat < -80);
for (const s of polar) {
  if (out.sites.some((x) => x.id === s.id)) continue;
  const r = await simulate(s.lat, s.lon);
  out.sites.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, ...r });
  console.log(s.id, (100 * r.summary.pSafe).toFixed(1) + '%', r.summary.fails, r.seconds.toFixed(0) + ' s');
  save();
}
for (const id of ['connecting-ridge', 'shackleton-rim', 'nobile-rim-1']) {
  if (out.searches.some((x) => x.center === id)) continue;
  const s = SITES.find((x) => x.id === id), t0 = Date.now(), R = 5000;
  const sci = await loadScienceAround(s.lat, s.lon, R + ICE_RANGE_M + 500);
  const g = await loadTerrainAround(s.lat, s.lon, R + 1500);
  const scr = screenCandidates({ center: s, radiusM: R, sci, slope: g.slope, near: g.near, slopeMode: opts.slopeMode, ellipse: ell, slopeMaxDeg: opts.slopeMaxDeg, weights: DEFAULT_WEIGHTS, keep: 30 });
  const items = [];
  for (const cand of scr.candidates.slice(0, 3)) items.push({ cand, sim: await simulate(cand.lat, cand.lon) });
  const ranked = rankVerified(items, DEFAULT_WEIGHTS, (it) => nearest(sci, 'ice', it.cand.lat, it.cand.lon, 5, (v) => v !== 250 && v <= 50));
  out.searches.push({ center: id, radiusKm: R / 1000, weights: DEFAULT_WEIGHTS, screened: scr.screened, cells: scr.cells, rejected: scr.rejected,
    ranked: ranked.map((r) => ({ lat: r.cand.lat, lon: r.cand.lon, nasaSunPct: r.cand.sunPct, nasaEarthPct: r.cand.earthPct, stage1Score: r.cand.score,
      pSafe: r.sim.summary.pSafe, ci95: r.sim.summary.ci95, sunlitMedian: r.sim.summary.sunlitPct.median, earthMedian: r.sim.summary.earthPct.median,
      longestDarkMedianH: r.sim.summary.longestDarkH.median, fails: r.sim.summary.fails, iceKm: r.iceKm, score: r.score })),
    seconds: (Date.now() - t0) / 1000 });
  console.log('search', id, out.searches.at(-1).ranked.map((r) => [(100 * r.pSafe).toFixed(1), r.score.toFixed(3)]));
  save();
}
out.done = new Date().toISOString(); save(); console.log('ALL DONE');
