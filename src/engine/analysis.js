// analysis.js — turns Sun/Earth positions into planning answers.
//
//   * windows:  when is the site confidently sunlit / in direct view of Earth?
//   * metrics:  % sunlit, longest dark stretch, % Earth visible, longest comms gap, time to sunset/Earthset
//   * verdict:  GO / CAUTION / NO-GO for a landing date, with plain-language reasons
//   * slip scan: the same verdict for every candidate landing date in a ± slip window
//   * recommender: best landing dates in the window, and best sites for a date
//
// Uncertainty handling (conservative by design):
//   A body is "up" only if its centre is more than `marginDeg` above the horizon in its direction
//   (the real LOLA terrain horizon when the site has terrain data, otherwise the smooth sphere).
//   Between −margin and +margin it is "marginal" and counts as NOT available for power or comms.
//   The margin stands in for what we do not model yet: the Sun's 0.53° disc, terrain, and model error.

import { sampleSeries } from './lunarSky.js';

const HOUR = 3600e3;
const DAY = 24 * HOUR;

export const DEFAULTS = {
  missionDays: 14,     // surface mission length analysed from the landing time
  marginDeg: 0.5,      // uncertainty band around the horizon (degrees)
  batteryHours: 48,    // longest dark stretch the lander can survive on batteries
  commsGapHours: 48,   // longest acceptable gap in direct-to-Earth contact
  relay: false,        // assume a lunar relay satellite covers comms gaps
  slipDays: 7,         // ± schedule uncertainty around the target landing date
  stepHours: 1,        // sampling step for the analysis
};

export const STATUS = { GO: 'GO', CAUTION: 'CAUTION', NOGO: 'NO-GO' };

// Intervals where vals > thr inside [i0, i1], with linearly interpolated edges (ms).
export function intervalsAbove(t, vals, thr, i0 = 0, i1 = t.length - 1) {
  const out = [];
  let start = vals[i0] > thr ? t[i0] : null;
  for (let i = i0; i < i1; i++) {
    const a = vals[i], b = vals[i + 1];
    const up = a <= thr && b > thr;
    const down = a > thr && b <= thr;
    if (up || down) {
      const f = (thr - a) / (b - a);
      const tc = t[i] + f * (t[i + 1] - t[i]);
      if (up) start = tc;
      else { out.push({ start, end: tc }); start = null; }
    }
  }
  if (start !== null) out.push({ start, end: t[i1] });
  return out;
}

function longestGap(intervals, from, to) {
  let gap = 0, cursor = from;
  for (const w of intervals) { gap = Math.max(gap, w.start - cursor); cursor = w.end; }
  return Math.max(gap, to - cursor);
}

const total = (intervals) => intervals.reduce((s, w) => s + (w.end - w.start), 0);

/** Metrics for samples i0..i1 of a series. */
export function sliceMetrics(series, i0, i1, marginDeg) {
  const { t } = series;
  const sunAlt = series.sunClear, earthAlt = series.earthClear; // clearance above the horizon
  const from = t[i0], to = t[i1], span = to - from;
  const sunUp = intervalsAbove(t, sunAlt, marginDeg, i0, i1);
  const sunAny = intervalsAbove(t, sunAlt, -marginDeg, i0, i1);
  const earthUp = intervalsAbove(t, earthAlt, marginDeg, i0, i1);
  const earthAny = intervalsAbove(t, earthAlt, -marginDeg, i0, i1);
  const sunlitAtStart = sunUp.length > 0 && sunUp[0].start === from;
  const earthAtStart = earthUp.length > 0 && earthUp[0].start === from;
  return {
    from, to,
    sunWindows: sunUp,
    earthWindows: earthUp,
    sunlitPct: (100 * total(sunUp)) / span,
    sunMarginalPct: (100 * (total(sunAny) - total(sunUp))) / span,
    longestDarkH: longestGap(sunUp, from, to) / HOUR,
    earthPct: (100 * total(earthUp)) / span,
    earthMarginalPct: (100 * (total(earthAny) - total(earthUp))) / span,
    longestCommsGapH: longestGap(earthUp, from, to) / HOUR,
    sunlitAtStart,
    earthAtStart,
    // First sunset / Earthset after landing (only if up at landing), else first rise.
    sunset: sunlitAtStart && sunUp[0].end < to ? sunUp[0].end : null,
    sunrise: !sunlitAtStart && sunUp.length ? sunUp[0].start : null,
    earthset: earthAtStart && earthUp[0].end < to ? earthUp[0].end : null,
    earthrise: !earthAtStart && earthUp.length ? earthUp[0].start : null,
  };
}

const fmtH = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${Math.round(h)} h`);

/** GO / CAUTION / NO-GO with reasons. Power is the deal-breaker; comms can be fixed with a relay. */
export function verdict(m, opts) {
  const o = { ...DEFAULTS, ...opts };
  const reasons = [];
  const powerOK = m.sunlitPct > 0 && m.longestDarkH <= o.batteryHours;
  const commsOK = o.relay || m.longestCommsGapH <= o.commsGapHours;
  if (m.sunlitPct === 0) reasons.push('No confident sunlight during the mission.');
  else if (!powerOK) reasons.push(`Longest dark stretch is ${fmtH(m.longestDarkH)}, longer than the ${o.batteryHours} h battery limit.`);
  else reasons.push(`Power OK: longest dark stretch ${fmtH(m.longestDarkH)} (limit ${o.batteryHours} h).`);
  if (o.relay) reasons.push('Comms assumed covered by a relay satellite.');
  else if (m.earthPct === 0) reasons.push('Earth never rises above the horizon: needs a relay satellite.');
  else if (!commsOK) reasons.push(`Longest comms gap is ${fmtH(m.longestCommsGapH)}, over the ${o.commsGapHours} h limit: needs a relay or a different date.`);
  else reasons.push(`Comms OK: longest gap ${fmtH(m.longestCommsGapH)} (limit ${o.commsGapHours} h).`);
  const status = !powerOK ? STATUS.NOGO : !commsOK ? STATUS.CAUTION : STATUS.GO;
  return { status, powerOK, commsOK, reasons };
}

const RANK = { [STATUS.GO]: 2, [STATUS.CAUTION]: 1, [STATUS.NOGO]: 0 };

/** Higher is better. Status first, then sunlight, then short dark and comms gaps. */
export function score(m, v, opts) {
  const o = { ...DEFAULTS, ...opts };
  return RANK[v.status] * 1000 + m.sunlitPct * 2 - m.longestDarkH * 0.5 + (o.relay ? 0 : m.earthPct - m.longestCommsGapH * 0.25);
}

/**
 * Full analysis for one site: the chosen landing date, plus every candidate date in the ± slip window.
 * @param {{lat:number, lon:number}} site
 * @param {Date|string|number} landing  target landing time (UTC)
 */
export function analyzeSite(site, landing, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const L = new Date(landing).getTime();
  const slipMs = o.slipDays * DAY;
  const missionMs = o.missionDays * DAY;
  const start = L - slipMs;
  const series = sampleSeries(site, start, L + slipMs + missionMs, o.stepHours);
  const idx = (ms) => Math.min(series.t.length - 1, Math.max(0, Math.round((ms - series.t[0]) / series.stepMs)));
  const evalAt = (ms) => {
    const m = sliceMetrics(series, idx(ms), idx(ms + missionMs), o.marginDeg);
    const v = verdict(m, o);
    return { t: ms, metrics: m, verdict: v, score: score(m, v, o) };
  };

  const landingResult = evalAt(L);

  // Candidate landing dates across the slip window.
  const scanStepH = o.slipDays <= 10 ? 3 : o.slipDays <= 35 ? 6 : 12;
  const scan = [];
  if (o.slipDays > 0) {
    for (let ms = start; ms <= L + slipMs + 1; ms += scanStepH * HOUR) scan.push(evalAt(ms));
  }

  return { site, landing: L, opts: o, series, idx, result: landingResult, scan, best: bestDates(scan, L), summary: summarizeScan(scan) };
}

/** Top 3 candidate dates, at least 2 days apart, best first. Prefers dates close to the target:
 *  every day of slip costs 1.5 score points, so a slightly better date far away loses to a good date nearby. */
export function bestDates(scan, target, n = 3) {
  const adj = (c) => c.score - 1.5 * (Math.abs(c.t - target) / DAY);
  const sorted = [...scan].sort((a, b) => adj(b) - adj(a));
  const picks = [];
  for (const c of sorted) {
    if (picks.every((p) => Math.abs(p.t - c.t) >= 2 * DAY)) picks.push(c);
    if (picks.length === n) break;
  }
  return picks;
}

/** How robust is the window? Share of candidate dates per status, worst case. */
export function summarizeScan(scan) {
  if (!scan.length) return null;
  const count = { GO: 0, CAUTION: 0, 'NO-GO': 0 };
  let worstDark = 0, worstComms = 0;
  for (const c of scan) {
    count[c.verdict.status]++;
    worstDark = Math.max(worstDark, c.metrics.longestDarkH);
    worstComms = Math.max(worstComms, c.metrics.longestCommsGapH);
  }
  const n = scan.length;
  return {
    n,
    goPct: (100 * count.GO) / n,
    cautionPct: (100 * count.CAUTION) / n,
    nogoPct: (100 * count['NO-GO']) / n,
    worstDarkH: worstDark,
    worstCommsGapH: worstComms,
  };
}

/** Rank several sites for the same landing date (no slip scan). */
export function compareSites(sites, landing, opts = {}) {
  return sites
    .map((s) => {
      const a = analyzeSite(s, landing, { ...opts, slipDays: 0 });
      return { site: s, ...a.result };
    })
    .sort((a, b) => b.score - a.score);
}
