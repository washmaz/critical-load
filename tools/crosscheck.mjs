// Cross-check: JPL DE421 tables vs astronomy-engine live, every 6 h over the whole table, all sites.
// Run from the repo root: node tools/crosscheck.mjs
import { readFile } from 'node:fs/promises';
import { configureEphemeris, loadManifest, loadTable, sampleTable, sunEarthAt } from '../src/engine/ephemerisStore.js';
import { liveAltAz } from './lib/lunarSky_v1.mjs';
configureEphemeris({ baseUrl: new URL('../public/ephem/', import.meta.url).pathname, fetchBytes: async (p) => { const b = await readFile(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
const m = await loadManifest();
const ang = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
console.log('site'.padEnd(18), 'self-check', ' sunAlt max/rms', ' earthAlt max/rms', ' sunSky max', ' earthSky max', ' state flips sun/earth');
for (const e of Object.values(m.sites)) {
  const site = { lat: e.lat, lon: e.lon };
  const table = await loadTable(site, liveAltAz);
  let n = 0; const s = { sa: 0, ss: 0, ea: 0, es: 0, sk: 0, ek: 0, fs: 0, fe: 0 };
  for (let i = 0; i < table.n; i += 6) {
    const t = new Date(table.t0 + i * table.step), a = sampleTable(table, t), b = liveAltAz(site, t);
    const dsa = a.sun.alt - b.sun.alt, dea = a.earth.alt - b.earth.alt;
    s.sa = Math.max(s.sa, Math.abs(dsa)); s.ss += dsa * dsa; s.ea = Math.max(s.ea, Math.abs(dea)); s.es += dea * dea;
    s.sk = Math.max(s.sk, Math.hypot(dsa, ang(a.sun.az, b.sun.az) * Math.cos(b.sun.alt * Math.PI / 180)));
    s.ek = Math.max(s.ek, Math.hypot(dea, ang(a.earth.az, b.earth.az) * Math.cos(b.earth.alt * Math.PI / 180)));
    if ((a.sun.alt > 0) !== (b.sun.alt > 0)) s.fs++;
    if ((a.earth.alt > 0) !== (b.earth.alt > 0)) s.fe++;
    n++;
  }
  const f = (x) => x.toFixed(3);
  console.log(e.id.padEnd(18), f(table.check.maxDiffDeg).padStart(10), `  ${f(s.sa)}/${f(Math.sqrt(s.ss / n))}`, `   ${f(s.ea)}/${f(Math.sqrt(s.es / n))}`, `     ${f(s.sk)}`, `       ${f(s.ek)}`, `      ${s.fs}/${s.fe} of ${n}`);
}
const site = { lat: -89.684, lon: -163.261 }, t0 = Date.parse('2027-01-01T00:00:00Z');
for (const mode of ['precomputed', 'live']) {
  const st = performance.now(); let up = 0;
  for (let h = 0; h < 8760; h++) if (sunEarthAt(site, new Date(t0 + h * 3600e3), mode, liveAltAz).sun.alt > 0) up++;
  console.log(`1-year hourly scan, ${mode}: ${(performance.now() - st).toFixed(0)} ms (sun up ${(up / 87.6).toFixed(1)}%)`);
}
