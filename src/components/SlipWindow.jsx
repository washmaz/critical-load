import React from 'react';
import { fmtShortUTC, fmtDur, fmtPct, DAY } from '../format.js';

const COLORS = { GO: '#47da84', CAUTION: 'url(#slipCaution)', 'NO-GO': 'url(#slipNogo)' };
const W = 1000, H = 64, PAD = 30;

// One coloured bar per candidate landing date across the ± slip window.
function SlipWindow({ analysis, onPick }) {
  const { scan, best, summary, landing, opts } = analysis;
  if (!scan.length) {
    return <p className="muted">Set a slip window above (e.g. ±7 days) to see how robust this landing date is.</p>;
  }
  const t0 = scan[0].t, t1 = scan[scan.length - 1].t;
  const x = (ms) => PAD + ((ms - t0) / (t1 - t0 || 1)) * (W - 2 * PAD);
  const w = Math.max(1, (W - 2 * PAD) / scan.length);
  const ticks = [];
  const span = (t1 - t0) / DAY;
  const every = span > 120 ? 30 : span > 40 ? 7 : span > 14 ? 3 : 1;
  for (let d = 0; d <= span + 1e-9; d += every) ticks.push(t0 + d * DAY);

  return (
    <div>
      <div className="slip-summary">
        <span className="pill go">{fmtPct(summary.goPct)} GO</span>
        <span className="pill caution">{fmtPct(summary.cautionPct)} CAUTION</span>
        <span className="pill nogo">{fmtPct(summary.nogoPct)} NO-GO</span>
        <span className="muted">
          Worst case in this window: dark for {fmtDur(summary.worstDarkH)}, no direct comms for {fmtDur(summary.worstCommsGapH)}.
        </span>
      </div>
      <div className="chart-scroll">
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="slip" role="img" aria-label="Viability of each candidate landing date">
        <defs>
          {/* patterns as well as colours, so the bar reads without colour vision: GO solid, CAUTION dotted, NO-GO hatched */}
          <pattern id="slipCaution" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#ffb020" /><circle cx="3" cy="3" r="1.1" fill="#7a4d00" />
          </pattern>
          <pattern id="slipNogo" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#ff5c52" /><rect width="2" height="6" fill="#7a1f1f" />
          </pattern>
        </defs>
        {scan.map((c) => (
          <rect key={c.t} x={x(c.t) - w / 2} y={8} width={w + 0.6} height={H - 16} fill={COLORS[c.verdict.status]}
            opacity="0.85" onClick={() => onPick(c.t)} style={{ cursor: 'pointer' }}>
            <title>{`${fmtShortUTC(c.t)} UTC — ${c.verdict.status}\nSunlit ${fmtPct(c.metrics.sunlitPct)}, longest dark ${fmtDur(c.metrics.longestDarkH)}\nEarth ${fmtPct(c.metrics.earthPct)}, longest comms gap ${fmtDur(c.metrics.longestCommsGapH)}`}</title>
          </rect>
        ))}
        {best.map((b, k) => (
          <g key={b.t}>
            <polygon points={`${x(b.t) - 7},2 ${x(b.t) + 7},2 ${x(b.t)},12`} fill="#ffffff" />
            <text x={x(b.t)} y={H + 2} className="axis" textAnchor="middle" fill="#ffffff">#{k + 1}</text>
          </g>
        ))}
        <line x1={x(landing)} x2={x(landing)} y1={2} y2={H - 4} stroke="#000000" strokeWidth="3" />
        <line x1={x(landing)} x2={x(landing)} y1={2} y2={H - 4} stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 2" />
        {ticks.map((ms) => (
          <text key={ms} x={x(ms)} y={H + 18} className="axis" textAnchor="middle">{fmtShortUTC(ms).replace(/ \d\d:\d\d$/, '')}</text>
        ))}
      </svg>
      </div>
      <p className="hint small chart-scroll-hint">Swipe sideways to see every date.</p>
      <p className="hint">Solid green = GO, dotted amber = CAUTION, hatched red = NO-GO. Each bar is a possible landing time (±{opts.slipDays} days around your target, dashed line). Click a bar to load that date.</p>
      {(() => {
        const nGo = best.filter((b) => b.verdict.status === 'GO').length;
        return nGo === best.length
          ? <h3>Recommended landing dates in this window</h3>
          : nGo === 0
            ? <><h3>Least-bad landing dates in this window</h3>
                <p className="hint">No landing time in this window is GO with your settings. These are the strongest of what is there; widen the window or change a limit to find a GO date.</p></>
            : <h3>Best landing dates in this window <span className="muted small">({nGo} of {best.length} are GO)</span></h3>;
      })()}
      <ol className="best">
        {best.map((b) => {
          const dd = (b.t - landing) / DAY;
          return (
            <li key={b.t}>
              <button className="link strong" onClick={() => onPick(b.t)}>{fmtShortUTC(b.t)} UTC</button>
              <span className={`pill small ${b.verdict.status === 'GO' ? 'go' : b.verdict.status === 'CAUTION' ? 'caution' : 'nogo'}`}>{b.verdict.status}</span>
              <span className="muted">
                {Math.abs(dd) < 0.05 ? 'your target date' : `${dd > 0 ? '+' : '−'}${Math.abs(dd).toFixed(1)} days from target`} ·
                sunlit {fmtPct(b.metrics.sunlitPct)}, longest dark {fmtDur(b.metrics.longestDarkH)} ·
                Earth {fmtPct(b.metrics.earthPct)}, longest gap {fmtDur(b.metrics.longestCommsGapH)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default React.memo(SlipWindow);
