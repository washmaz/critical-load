// runSimulation.js: browser driver for the Monte Carlo landing analysis (spreads touchdowns over Web Workers).
import { sampleTouchdowns, summarize } from './landingSim.js';
import { bodyVectorSeries } from './lunarSky.js';
import { loadScienceAround, scienceAt } from './tiles.js';

/**
 * @param target {lat, lon}; ellipse {semiMajorM, semiMinorM, azimuthDeg}; landingMs; opts (analysis opts + slopeMaxDeg, earthMinElevDeg)
 * @param onProgress (done, total)
 */
export async function runLandingSimulation({ target, ellipse, landingMs, opts, n = 1000, seed = 1, onProgress, signal }) {
  const tds = sampleTouchdowns({ lat: target.lat, lon: target.lon, ...ellipse, n, seed });
  const spread = Math.max(...tds.map((t) => Math.hypot(t.e, t.n)));
  const radiusM = 30000 + spread + 500;
  const bodies = bodyVectorSeries(landingMs, landingMs + opts.missionDays * 86400e3, opts.stepHours || 1);
  // NASA per-pixel layers (120 m) over the whole ellipse: permanent shadow, Sun/Earth averages, Diviner thermal + ice.
  const sci = await loadScienceAround(target.lat, target.lon, spread + 500);
  const facts = tds.map((t) => scienceAt(sci, t.lat, t.lon));
  const psr = facts.map((f) => f.psr);

  const nw = Math.max(1, Math.min(8, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4));
  const results = new Array(tds.length);
  let done = 0;
  await new Promise((resolve, reject) => {
    let finished = 0;
    const workers = [];
    const stop = () => workers.forEach((w) => w.terminate());
    if (signal) signal.addEventListener('abort', () => { stop(); reject(new Error('cancelled')); });
    for (let w = 0; w < nw; w++) {
      const share = tds.filter((_, i) => i % nw === w);
      const wk = new Worker(new URL('./simWorker.js', import.meta.url), { type: 'module' });
      workers.push(wk);
      wk.onmessage = (ev) => {
        const m = ev.data;
        if (m.error) { stop(); reject(new Error(m.error)); return; }
        if (m.partial) { for (const r of m.partial) results[r.i] = r; done += m.partial.length; onProgress && onProgress(done, tds.length); }
        if (m.done) { wk.terminate(); if (++finished === nw) resolve(); }
      };
      wk.onerror = (e) => { stop(); reject(new Error(e.message || 'worker failed')); };
      wk.postMessage({ id: w, center: target, radiusM, touchdowns: share, bodies, opts });
    }
  });
  const summary = summarize(results, psr, facts, opts.thermalLimits || null);
  const num = (a) => a.filter((v) => typeof v === 'number');
  const thermal = {
    tempAvgK: range(num(facts.map((f) => f.tempAvgK))), tempMaxK: range(num(facts.map((f) => f.tempMaxK))),
    iceWithin1mPct: (100 * facts.filter((f) => typeof f.iceDepthM === 'number' && f.iceDepthM <= 1).length) / facts.length,
    nasaSunPct: range(num(facts.map((f) => f.sunPct))), nasaEarthPct: range(num(facts.map((f) => f.earthPct))),
  };
  return { touchdowns: tds, results, summary, thermal, n: tds.length, workers: nw, spreadM: spread };
}
function range(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return { min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] }; }
