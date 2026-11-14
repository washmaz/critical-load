import React from 'react';
import { fmtDur, fmtPct } from '../format.js';

const cls = (s) => (s === 'GO' ? 'go' : s === 'CAUTION' ? 'caution' : 'nogo');

// All curated sites (plus a custom one) ranked for the same landing date and settings.
export default function SiteCompare({ rows, currentId, onPick }) {
  const best = {
    sunlitPct: Math.max(...rows.map((r) => r.metrics.sunlitPct)),
    longestDarkH: Math.min(...rows.map((r) => r.metrics.longestDarkH)),
    earthPct: Math.max(...rows.map((r) => r.metrics.earthPct)),
    longestCommsGapH: Math.min(...rows.map((r) => r.metrics.longestCommsGapH)),
  };
  const hi = (k, v) => (Math.abs(v - best[k]) < 1e-6 ? 'best' : '');
  return (
    <div className="table-wrap">
      <table className="compare">
        <thead>
          <tr>
            <th>#</th><th>Site</th><th>Verdict</th>
            <th title="Share of the mission with the Sun confidently above the horizon">Sunlit</th>
            <th title="Longest stretch without confident sunlight: sets battery size">Longest dark</th>
            <th title="Share of the mission with Earth confidently above the horizon">Earth in view</th>
            <th title="Longest stretch without direct-to-Earth contact">Longest comms gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={r.site.id} className={r.site.id === currentId ? 'current' : ''} onClick={() => onPick(r.site.id)}>
              <td>{k + 1}</td>
              <td><span className="site-name">{r.site.name}</span><span className="muted small"> · {r.site.group}</span></td>
              <td><span className={`pill small ${cls(r.verdict.status)}`}>{r.verdict.status}</span></td>
              <td className={hi('sunlitPct', r.metrics.sunlitPct)}>{fmtPct(r.metrics.sunlitPct)}</td>
              <td className={hi('longestDarkH', r.metrics.longestDarkH)}>{fmtDur(r.metrics.longestDarkH)}</td>
              <td className={hi('earthPct', r.metrics.earthPct)}>{fmtPct(r.metrics.earthPct)}</td>
              <td className={hi('longestCommsGapH', r.metrics.longestCommsGapH)}>{fmtDur(r.metrics.longestCommsGapH)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Green cells are the best value in each column. Click a row to load that site.</p>
    </div>
  );
}
