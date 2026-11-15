import React, { useRef } from 'react';
import { fmtShortUTC, DAY } from '../format.js';

// Mission timeline: Sun and Earth elevation vs time, plus Power and Comms lanes
// (green = available, amber = marginal, dark = not available).

const W = 1000, PAD_L = 52, PAD_R = 30, CH = 190, LANE = 16, GAP = 8;
const H = CH + 2 * LANE + 3 * GAP + 26;

function laneSegments(t, vals, i0, i1, margin, x) {
  const segs = [];
  let cur = null;
  for (let i = i0; i <= i1; i++) {
    const st = vals[i] > margin ? 'yes' : vals[i] < -margin ? 'no' : 'marg';
    if (!cur || cur.st !== st) {
      if (cur) cur.x2 = x(t[i]);
      cur = { st, x1: x(t[i]), x2: x(t[i]) };
      segs.push(cur);
    }
  }
  if (cur) cur.x2 = x(t[i1]);
  return segs;
}

export default function Timeline({ series, i0, i1, margin, scrubMs, onScrub }) {
  const ref = useRef(null);
  const { t, sunAlt, earthAlt } = series;
  const sunClear = series.sunClear || sunAlt, earthClear = series.earthClear || earthAlt;
  const t0 = t[i0], t1 = t[i1];
  const x = (ms) => PAD_L + ((ms - t0) / (t1 - t0)) * (W - PAD_L - PAD_R);

  let lo = -margin - 1, hi = margin + 1;
  for (let i = i0; i <= i1; i++) {
    lo = Math.min(lo, sunAlt[i], earthAlt[i]);
    hi = Math.max(hi, sunAlt[i], earthAlt[i], series.terrain ? series.sunHor[i] : -90);
  }
  const padv = (hi - lo) * 0.08;
  lo -= padv; hi += padv;
  const y = (v) => 10 + ((hi - v) / (hi - lo)) * (CH - 20);

  const line = (vals) => {
    let d = '';
    const stride = Math.max(1, Math.floor((i1 - i0) / 600));
    for (let i = i0; i <= i1; i += stride) d += `${d ? 'L' : 'M'}${x(t[i]).toFixed(1)},${y(vals[i]).toFixed(1)}`;
    return d;
  };

  const ticks = [];
  const spanDays = (t1 - t0) / DAY;
  const every = spanDays > 20 ? 4 : spanDays > 8 ? 2 : 1;
  for (let d = 0; d <= spanDays + 1e-9; d += every) ticks.push(t0 + d * DAY);

  const yTicks = niceTicks(lo, hi);
  const pick = (e) => {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const ms = t0 + ((px - PAD_L) / (W - PAD_L - PAD_R)) * (t1 - t0);
    onScrub(Math.min(t1, Math.max(t0, ms)));
  };
  const laneY1 = CH + GAP, laneY2 = CH + 2 * GAP + LANE;
  const color = { yes: null, marg: '#ffb020', no: '#232b45' };

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="timeline" onMouseDown={pick}
      onMouseMove={(e) => e.buttons === 1 && pick(e)} role="img" aria-label="Mission timeline of Sun and Earth elevation">
      <rect x={PAD_L} y={y(margin)} width={W - PAD_L - PAD_R} height={Math.max(1, y(-margin) - y(margin))} fill="#ffb020" opacity="0.15" />
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="#b9b9bb" strokeOpacity={v === 0 ? 0.7 : 0.15} />
          <text x={PAD_L - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}°</text>
        </g>
      ))}
      {series.terrain && <path d={line(series.sunHor)} fill="none" stroke="#b9bfcc" strokeWidth="1.5" strokeDasharray="5 4" />}
      {series.terrain && <path d={line(series.earthHor)} fill="none" stroke="#7d8aa5" strokeWidth="1.2" strokeDasharray="2 4" />}
      <path d={line(sunAlt)} fill="none" stroke="#ffc845" strokeWidth="2.5" />
      <path d={line(earthAlt)} fill="none" stroke="#288bff" strokeWidth="2.5" />
      {[['Power', sunClear, laneY1, '#ffc845'], ['Comms', earthClear, laneY2, '#288bff']].map(([lab, vals, ly, c]) => (
        <g key={lab}>
          <text x={PAD_L - 6} y={ly + 12} className="axis" textAnchor="end">{lab}</text>
          {laneSegments(t, vals, i0, i1, margin, x).map((s, k) => (
            <rect key={k} x={s.x1} y={ly} width={Math.max(0.5, s.x2 - s.x1)} height={LANE} fill={color[s.st] || c} opacity={s.st === 'yes' ? 0.85 : 1} />
          ))}
        </g>
      ))}
      {ticks.map((ms) => (
        <text key={ms} x={x(ms)} y={H - 6} className="axis" textAnchor="middle">{fmtShortUTC(ms).replace(/ \d\d:\d\d$/, '')}</text>
      ))}
      {scrubMs != null && (
        <g>
          <line x1={x(scrubMs)} x2={x(scrubMs)} y1={4} y2={laneY2 + LANE + 2} stroke="#ffffff" strokeWidth="1.5" />
          <circle cx={x(scrubMs)} cy={4} r="4" fill="#ffffff" />
        </g>
      )}
    </svg>
  );
}

function niceTicks(lo, hi) {
  const span = hi - lo;
  const step = span > 100 ? 30 : span > 40 ? 15 : span > 16 ? 5 : span > 6 ? 2 : 1;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  if (!out.includes(0) && lo < 0 && hi > 0) out.push(0);
  return out;
}
