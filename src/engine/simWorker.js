// simWorker.js: evaluates a share of the simulated touchdowns off the main thread.
// Each worker loads the NASA terrain tiles it needs itself (the browser HTTP cache makes repeats cheap).
import { loadTerrainAround } from './tiles.js';
import { evaluateTouchdown } from './landingSim.js';

let grids = null, key = '';
self.onmessage = async (ev) => {
  const { id, center, radiusM, touchdowns, bodies, opts } = ev.data;
  try {
    const k = `${center.lat.toFixed(5)},${center.lon.toFixed(5)},${radiusM}`;
    if (k !== key) { grids = await loadTerrainAround(center.lat, center.lon, radiusM); key = k; }
    const out = [];
    for (let j = 0; j < touchdowns.length; j++) {
      out.push(evaluateTouchdown(touchdowns[j], grids, bodies, opts));
      if (j % 5 === 4 || j === touchdowns.length - 1) { self.postMessage({ id, progress: out.length, partial: out.splice(0) }); }
    }
    self.postMessage({ id, done: true });
  } catch (e) {
    self.postMessage({ id, error: String(e && e.message || e) });
  }
};
