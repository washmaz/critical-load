// teamReview.js: the multi-team review. Each team owns its inputs and its weight; every site is checked against every
// team's hard requirements, scored on each team's criterion, combined into one ranking, and the clashes between teams
// are listed. A one-at-a-time sensitivity sweep shows whether the top site survives reasonable changes to the inputs.
import { computeHorizon, llToXY, cell, slopeOverBaseline, localFrame } from './horizonCore.js';
import { loadTerrainAround, loadNearOnly, loadScienceAround, scienceAt } from './tiles.js';
import { analyzeSite } from './analysis.js';
import { terrainFor } from './terrain.js';
import { nearest } from './pointData.js';

export const TEAMS = {
  mission: { label: 'Mission planning', criterion: 'Share of dates in the slip window that are GO (schedule robustness)' },
  power: { label: 'Power (EPS)', criterion: 'Sunlit share of the stay' },
  comms: { label: 'Communications', criterion: 'Share of the stay with Earth in view' },
  landing: { label: 'Landing (GNC + hazards)', criterion: 'Share of the landing area under the slope limit' },
  thermal: { label: 'Thermal', criterion: 'Pass / fail only, against your limits' },
  science: { label: 'Science & resources', criterion: 'Closeness of water ice within 1 m (Diviner), 1 at the ice, 0 beyond 5 km' },
};

export const DEFAULT_TEAM_INPUTS = {
  mission: { stayDays: 14, slipDays: 7, poleWithinDeg: 6, weight: 2 },
  power: { batteryHours: 48, panelHeightM: 2, weight: 3 },
  comms: { commsGapHours: 48, relay: false, weight: 3 },
  landing: { slopeMaxDeg: 10, slopeBaselineM: 100, radiusM: 50, weight: 4 },
  thermal: { minAvgK: null, maxSurfaceK: null, weight: 0 },
  science: { weight: 1 },
};

/** Slope samples inside a circular landing area (radiusM) around the site, on the 80 m grid, over the chosen baseline. */
function slopeSamples(lat, lon, grids, radiusM, baselineM) {
  const [x, y] = llToXY(lat, lon), f = localFrame(x, y), g = grids.slope, reach = radiusM * f.k + g.pix;
  const r0 = Math.floor((g.y0 - (y + reach)) / g.pix), r1 = Math.floor((g.y0 - (y - reach)) / g.pix);
  const c0 = Math.floor((x - reach - g.x0) / g.pix), c1 = Math.floor((x + reach - g.x0) / g.pix);
  const vals = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const px = g.x0 + (c + 0.5) * g.pix, py = g.y0 - (r + 0.5) * g.pix;
    if (Math.hypot(px - x, py - y) / f.k > radiusM) continue;
    const v = baselineM === 'ldsm' ? cell(g, r, c) : slopeOverBaseline(px, py, grids.near, baselineM);
    if (v === v) vals.push(v);
  }
  const at = baselineM === 'ldsm' ? cell(g, Math.floor((g.y0 - y) / g.pix), Math.floor((x - g.x0) / g.pix)) : slopeOverBaseline(x, y, grids.near, baselineM);
  if (!vals.length && at === at) vals.push(at);
  return { atTarget: at, samples: vals };
}

/**
 * Gather everything each team needs for one site (the expensive part, done once per input set).
 * Uses the validated pre-computed horizon when the arrays are at 2 m on a curated site; otherwise computes it from NASA tiles.
 */
export async function siteData(site, landingMs, inp) {
  const pre = terrainFor(site.id);
  let terrain;
  if (pre && inp.power.panelHeightM === pre.observerHeightM) terrain = pre;
  else {
    const g = await loadTerrainAround(site.lat, site.lon, 30000);
    const h = computeHorizon(site.lat, site.lon, g.near, g.far, inp.power.panelHeightM);
    terrain = { elevationM: h.elevationM, observerHeightM: inp.power.panelHeightM, azStepDeg: 0.5, azStartDeg: 0.25, horizon: h.horizonDeg, heightKm: (h.elevationM + inp.power.panelHeightM) / 1000 };
  }
  const opts = { missionDays: inp.mission.stayDays, slipDays: inp.mission.slipDays, batteryHours: inp.power.batteryHours, commsGapHours: inp.comms.commsGapHours, relay: inp.comms.relay, marginDeg: inp.marginDeg ?? 0.5, stepHours: 1 };
  const a = analyzeSite({ ...site, terrain }, landingMs, opts);
  const grids = await loadNearOnly(site.lat, site.lon, inp.landing.radiusM + 300);
  const sl = slopeSamples(site.lat, site.lon, grids, inp.landing.radiusM, inp.landing.slopeBaselineM);
  const sci = await loadScienceAround(site.lat, site.lon, 5600);
  const here = scienceAt(sci, site.lat, site.lon);
  const iceKm = nearest(sci, 'ice', site.lat, site.lon, 5, (v) => v !== 250 && v <= 50);
  return {
    site, metrics: a.result.metrics, scan: a.scan.map((c) => ({ t: c.t, metrics: c.metrics })),
    slopeAtTarget: sl.atTarget, slopeSamples: sl.samples, psr: here.psr, tempAvgK: here.tempAvgK, tempMaxK: here.tempMaxK, iceKm,
    degFromPole: 90 + site.lat,
  };
}

const goAt = (m, inp) => m.sunlitPct > 0 && m.longestDarkH <= inp.power.batteryHours && (inp.comms.relay || m.longestCommsGapH <= inp.comms.commsGapHours);

/** Cheap re-scoring of gathered site data for any limits / weights (used for the ranking and the sensitivity sweep). */
export function evaluate(data, inp) {
  const rows = data.map((d) => {
    const m = d.metrics, fails = [];
    const res = {
      mission: { pass: inp.mission.poleWithinDeg == null || d.degFromPole <= inp.mission.poleWithinDeg, score: d.scan.length ? d.scan.filter((c) => goAt(c.metrics, inp)).length / d.scan.length : (goAt(m, inp) ? 1 : 0),
        why: inp.mission.poleWithinDeg == null ? '' : `${d.degFromPole.toFixed(2)}° from the pole (limit ${inp.mission.poleWithinDeg}°)` },
      power: { pass: m.sunlitPct > 0 && m.longestDarkH <= inp.power.batteryHours, score: m.sunlitPct / 100, why: `longest dark ${m.longestDarkH.toFixed(0)} h (limit ${inp.power.batteryHours} h)` },
      comms: { pass: inp.comms.relay || m.longestCommsGapH <= inp.comms.commsGapHours, score: m.earthPct / 100, why: inp.comms.relay ? 'relay assumed' : `longest gap ${m.longestCommsGapH.toFixed(0)} h (limit ${inp.comms.commsGapHours} h)` },
      landing: { pass: d.slopeAtTarget === d.slopeAtTarget && d.slopeAtTarget <= inp.landing.slopeMaxDeg && !d.psr,
        score: d.slopeSamples.length ? d.slopeSamples.filter((v) => v <= inp.landing.slopeMaxDeg).length / d.slopeSamples.length : 0,
        why: `${d.psr ? 'target in NASA permanent shadow; ' : ''}slope at target ${d.slopeAtTarget.toFixed(1)}° (limit ${inp.landing.slopeMaxDeg}°)` },
      thermal: { pass: (inp.thermal.minAvgK == null || d.tempAvgK == null || d.tempAvgK >= inp.thermal.minAvgK) && (inp.thermal.maxSurfaceK == null || d.tempMaxK == null || d.tempMaxK <= inp.thermal.maxSurfaceK),
        score: null, why: d.tempAvgK == null ? 'no Diviner data' : `avg ${d.tempAvgK} K, max ${d.tempMaxK} K` },
      science: { pass: true, score: d.iceKm == null ? 0 : Math.max(0, 1 - d.iceKm / 5), why: d.iceKm == null ? 'no shallow ice within 5 km' : `shallow ice ${d.iceKm} km away` },
    };
    for (const [k, v] of Object.entries(res)) if (!v.pass) fails.push(k);
    let num = 0, den = 0;
    for (const k of Object.keys(TEAMS)) if (res[k].score != null) { num += inp[k].weight * res[k].score; den += inp[k].weight; }
    return { site: d.site, teams: res, fails, score: den ? num / den : 0 };
  });
  rows.sort((a, b) => (a.fails.length - b.fails.length) || (b.score - a.score));
  // each team's favourite site (by its own criterion) and where the teams disagree
  const fav = {};
  for (const k of Object.keys(TEAMS)) {
    if (k === 'thermal') continue;
    let best = null;
    for (const r of rows) if (best == null || r.teams[k].score > best.teams[k].score) best = r;
    fav[k] = best && best.site.id;
  }
  const clashes = rows.filter((r) => r.fails.length && r.fails.length < Object.keys(TEAMS).length).map((r) => ({
    site: r.site.name, failedBy: r.fails.map((k) => TEAMS[k].label), passedBy: Object.keys(TEAMS).filter((k) => !r.fails.includes(k)).map((k) => TEAMS[k].label) }));
  return { rows, favourites: fav, clashes };
}

/** One-at-a-time sensitivity: each numeric limit x0.75 / x1.25 and each weight x0.5 / x1.5. Re-scores only (no re-simulation). */
export function sensitivity(data, inp) {
  const base = evaluate(data, inp).rows[0];
  const cases = [];
  const limits = [['power', 'batteryHours'], ['comms', 'commsGapHours'], ['landing', 'slopeMaxDeg']];
  for (const [t, k] of limits) for (const f of [0.75, 1.25]) cases.push({ label: `${TEAMS[t].label}: ${k} ×${f}`, inp: { ...inp, [t]: { ...inp[t], [k]: inp[t][k] * f } } });
  for (const t of Object.keys(TEAMS)) if (inp[t].weight > 0) for (const f of [0.5, 1.5]) cases.push({ label: `${TEAMS[t].label} weight ×${f}`, inp: { ...inp, [t]: { ...inp[t], weight: inp[t].weight * f } } });
  const out = cases.map((c) => { const top = evaluate(data, c.inp).rows[0]; return { label: c.label, top: top.site.name, same: top.site.id === base.site.id, topPasses: top.fails.length === 0 }; });
  return { baseTop: base.site.name, baseTopPasses: base.fails.length === 0, cases: out, stablePct: (100 * out.filter((c) => c.same).length) / out.length };
}
