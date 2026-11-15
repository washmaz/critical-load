// Usage: node tools/science/ice_trap_from_tiles.mjs "$PWD" [LAT LON]  (no LAT/LON: compares against every stored nearestIceTrap)
// Distance = to the nearest pixel of the region (same as the stored LPSR 20 m values: within 0.21 km at 9 of 11 sites).
// Nearest permanently shadowed region >= 1 km2 from the repo's NASA PGDA LPSR 120 m tiles (sun plane value 254).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const REPO = process.argv[2];
const { setTileFetcher, loadScienceAround } = await import(REPO + '/src/engine/tiles.js');
const { llToXY } = await import(REPO + '/src/engine/horizonCore.js');
const { SITES } = await import(REPO + '/src/engine/sites.js');
const TERR = JSON.parse(readFileSync(REPO + '/src/data/site_terrain.json'));
const DIR = new URL('file://' + REPO + '/data/tiles/');
setTileFetcher(async (p) => { const b = readFileSync(new URL(p, DIR)); return b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b; });
const R = 1737400;
function xyToLL(x, y) { const rho = Math.hypot(x, y); const lat = 2 * Math.atan(rho / (2 * R)) - Math.PI / 2; return [lat * 180 / Math.PI, Math.atan2(x, y) * 180 / Math.PI]; }
async function trap(lat, lon, searchKm = 25) {
  const sci = await loadScienceAround(lat, lon, (searchKm + 15) * 1000);
  const g = sci.sun, W = g.w ?? g.width ?? g.cols, H = g.h ?? g.height ?? g.rows;
  const [x, y] = llToXY(lat, lon);
  const seen = new Uint8Array(W * H); let best = null;
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || g.data[i] !== 254) continue;
    const st = [i]; seen[i] = 1; let n = 0, sx = 0, sy = 0, minD = Infinity;
    while (st.length) { const k = st.pop(), r = (k / W) | 0, c = k % W; n++;
      const px = g.x0 + (g.c0 + c + 0.5) * g.pix, py = g.y0 - (g.r0 + r + 0.5) * g.pix; sx += px; sy += py; minD = Math.min(minD, Math.hypot(px - x, py - y));
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue; const kk = rr * W + cc; if (!seen[kk] && g.data[kk] === 254) { seen[kk] = 1; st.push(kk); } } }
    const area = n * g.pix * g.pix / 1e6; if (area < 1) continue;
    const cd = Math.hypot(sx / n - x, sy / n - y) / 1000;
    const ed = minD / 1000;
    if (ed <= searchKm && (!best || ed < best.distanceKm)) { const [clat, clon] = xyToLL(sx / n, sy / n); best = { areaKm2: Math.round(area * 10) / 10, distanceKm: Math.round(ed * 100) / 100, centroidKm: Math.round(cd * 100) / 100, clat: +clat.toFixed(4), clon: +(((clon % 360) + 360) % 360).toFixed(4) }; }
  }
  return best;
}
if (process.argv[3]) { console.log(JSON.stringify(await trap(+process.argv[3], +process.argv[4]))); }
else for (const [id, v] of Object.entries(TERR.sites)) { const s = SITES.find((q) => q.id === id); if (!v.nearestIceTrap) continue; console.log(id.padEnd(20), JSON.stringify(v.nearestIceTrap), '->', JSON.stringify(await trap(s.lat, s.lon))); }
