import React, { useState } from 'react';
import { fmtDur, fmtPct, fmtShortUTC } from '../format.js';
import { scienceFor } from '../engine/science.js';

const cls = (s) => (s === 'GO' ? 'go' : s === 'CAUTION' ? 'caution' : 'nogo');
const FILTERS = { pole: 'South pole + Artemis III', all: 'All sites' };
const inFilter = (f, r) => f === 'all' || r.site.lat <= -75 || r.site.id === 'custom';
const groupTag = (r) => (r.site.name.includes(r.site.group?.replace(/s$/, '') ?? '§') ? '' : r.site.group);

function extras(r) {
  const t = r.site.terrain, sci = scienceFor(r.site.id);
  return {
    slope: t ? t.slope.atSiteDeg : null,
    ice: t && t.nearestIceTrap ? t.nearestIceTrap.distanceKm : null, // live custom points have no 1 km² ice-trap record
    nasaSun: sci && sci.nasaIllumination ? sci.nasaIllumination.sunPct : null,
    iceDepth: sci && sci.diviner ? sci.diviner.iceDepthM : undefined,
  };
}

export function compareCSV(rows, landing, opts) {
  const head = ['site', 'lat', 'lon', 'verdict', 'sunlit_pct', 'longest_dark_h', 'earth_in_view_pct', 'longest_comms_gap_h',
    'slope_deg', 'nearest_ice_trap_km', 'nasa_avg_sunlit_pct', 'source'];
  const q = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const lines = [
    `# Lunar Landing Site Navigator (Team Critical Load) - landing ${new Date(landing).toISOString()}, mission ${opts.missionDays} d, battery ${opts.batteryHours} h, max comms gap ${opts.commsGapHours} h, margin ${opts.marginDeg} deg, relay ${opts.relay ? 'yes' : 'no'}`,
    head.join(','),
    ...rows.map((r) => { const e = extras(r); const m = r.metrics; return [r.site.name, r.site.lat, r.site.lon, r.verdict.status, m.sunlitPct.toFixed(1), m.longestDarkH.toFixed(1),
      m.earthPct.toFixed(1), m.longestCommsGapH.toFixed(1), e.slope, e.ice, e.nasaSun, r.site.url || ''].map(q).join(','); }),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `site-comparison_${new Date(landing).toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
}

export default function SiteCompare({ rows, currentId, onPick, landing, opts }) {
  const [filter, setFilter] = useState('pole');
  const [picked, setPicked] = useState([]);
  const shown = rows.filter((r) => inFilter(filter, r));
  const best = {
    sunlitPct: Math.max(...shown.map((r) => r.metrics.sunlitPct)),
    longestDarkH: Math.min(...shown.map((r) => r.metrics.longestDarkH)),
    earthPct: Math.max(...shown.map((r) => r.metrics.earthPct)),
    longestCommsGapH: Math.min(...shown.map((r) => r.metrics.longestCommsGapH)),
  };
  const hi = (k, v) => (Math.abs(v - best[k]) < 1e-6 ? 'best' : '');
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-3)));
  const side = picked.map((id) => rows.find((r) => r.site.id === id)).filter(Boolean);
  return (
    <div>
      <div className="compare-tools">
        <div className="seg" role="group" aria-label="Which sites">
          {Object.entries(FILTERS).map(([k, lab]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{lab}</button>)}
        </div>
        <span className="muted small">Tick up to 3 sites to see them side by side.</span>
        <button className="ghost small" onClick={() => compareCSV(shown, landing, opts)}>Download CSV</button>
      </div>
      {side.length >= 2 && (
        <div className="side-by-side">
          {side.map((r) => { const e = extras(r); const m = r.metrics; return (
            <div key={r.site.id} className={`sbs ${cls(r.verdict.status)}`}>
              <p className="sbs-name">{r.site.name}</p>
              <span className={`pill ${cls(r.verdict.status)}`}>{r.verdict.status}</span>
              <dl>
                <dt>Sunlit</dt><dd>{fmtPct(m.sunlitPct)}</dd>
                <dt>Longest dark</dt><dd>{fmtDur(m.longestDarkH)}</dd>
                <dt>Earth in view</dt><dd>{fmtPct(m.earthPct)}</dd>
                <dt>Longest comms gap</dt><dd>{fmtDur(m.longestCommsGapH)}</dd>
                <dt>Slope</dt><dd>{e.slope != null ? `${e.slope}°` : '—'}</dd>
                <dt>Nearest ice trap</dt><dd>{e.ice != null ? `${e.ice} km` : '—'}</dd>
                <dt>NASA avg sunlit</dt><dd>{e.nasaSun != null ? `${Math.round(e.nasaSun)}%` : '—'}</dd>
              </dl>
              <button className="link" onClick={() => onPick(r.site.id)}>Open this site</button>
            </div>); })}
        </div>
      )}
      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th className="pickcol" aria-label="Pick" /><th className="numcol">#</th><th>Site</th><th>Verdict</th>
              <th title="Share of the mission with the Sun confidently above the horizon">Sunlit</th>
              <th title="Longest stretch without confident sunlight: sets battery size" className="hide-sm">Longest dark</th>
              <th title="Share of the mission with Earth confidently above the horizon">Earth in view</th>
              <th title="Longest stretch without direct-to-Earth contact">Comms gap</th>
              <th title="LOLA slope at the site (80 m)" className="hide-sm">Slope</th>
              <th title="Distance to the nearest permanently shadowed region larger than 1 km² (likely ice trap)" className="hide-sm">Ice trap</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, k) => { const e = extras(r); return (
              <tr key={r.site.id} className={r.site.id === currentId ? 'current' : ''} onClick={() => onPick(r.site.id)}>
                <td className="pickcol" onClick={(ev) => ev.stopPropagation()}>
                  <input type="checkbox" aria-label={`Compare ${r.site.name}`} checked={picked.includes(r.site.id)} onChange={() => toggle(r.site.id)} /></td>
                <td className="numcol">{k + 1}</td>
                <td><span className="site-name">{r.site.name}</span>{groupTag(r) && <span className="muted small hide-sm"> · {groupTag(r)}</span>}</td>
                <td><span className={`pill small ${cls(r.verdict.status)}`}>{r.verdict.status}</span></td>
                <td className={hi('sunlitPct', r.metrics.sunlitPct)}>{fmtPct(r.metrics.sunlitPct)}</td>
                <td className={`${hi('longestDarkH', r.metrics.longestDarkH)} hide-sm`}>{fmtDur(r.metrics.longestDarkH)}</td>
                <td className={hi('earthPct', r.metrics.earthPct)}>{fmtPct(r.metrics.earthPct)}</td>
                <td className={hi('longestCommsGapH', r.metrics.longestCommsGapH)}>{fmtDur(r.metrics.longestCommsGapH)}</td>
                <td className={`hide-sm ${e.slope != null && e.slope > 10 ? 'warn' : ''}`}>{e.slope != null ? `${e.slope}°` : '—'}</td>
                <td className="hide-sm">{e.ice != null ? `${e.ice} km` : '—'}</td>
              </tr>); })}
          </tbody>
        </table>
      </div>
      <p className="hint">Green cells are the best value in each column. Click a row to load that site. Slope and ice traps come from NASA LOLA (south of 80°S only).</p>
    </div>
  );
}
