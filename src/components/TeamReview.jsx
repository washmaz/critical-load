import React, { useState } from 'react';
import { TEAMS, DEFAULT_TEAM_INPUTS, siteData, evaluate, sensitivity } from '../engine/teamReview.js';

const FIELDS = {
  mission: [['stayDays', 'Surface stay (days)'], ['slipDays', 'Slip window ± (days)'], ['poleWithinDeg', 'Max distance from pole (°, blank = none)']],
  power: [['batteryHours', 'Battery: longest dark (h)'], ['panelHeightM', 'Solar arrays height (m)']],
  comms: [['commsGapHours', 'Longest comms gap (h)'], ['relay', 'Relay satellite available']],
  landing: [['slopeMaxDeg', 'Slope limit (°)'], ['slopeBaselineM', 'Slope baseline (m, or "ldsm")'], ['radiusM', 'Landing area radius (m, 99.7 %)']],
  thermal: [['minAvgK', 'Lowest avg temp (K, blank = none)'], ['maxSurfaceK', 'Highest max temp (K, blank = none)']],
  science: [],
};

export default function TeamReview({ sites, landing, marginDeg, onLoad }) {
  const [inp, setInp] = useState(DEFAULT_TEAM_INPUTS);
  const [st, setSt] = useState(null);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const set = (t, k, v) => setInp({ ...inp, [t]: { ...inp[t], [k]: v } });
  const num = (v) => (v === '' || v == null ? null : +v);

  const run = async () => {
    setErr(null); setRes(null);
    const I = { ...inp, marginDeg };
    try {
      const data = [];
      for (let i = 0; i < sites.length; i++) { setSt(`Gathering NASA data for ${sites[i].name} (${i + 1}/${sites.length})…`); data.push(await siteData(sites[i], landing, I)); }
      setSt('Ranking and sensitivity…');
      setRes({ ev: evaluate(data, I), sen: sensitivity(data, I), inp: I });
    } catch (e) { setErr(e.message); }
    setSt(null);
  };

  return (
    <section className="panel team">
      <h2>Team review <span className="muted small">each team sets its own limits and weight; the site combines them</span></h2>
      <p className="hint">This mirrors a site-selection review: every team owns its requirements (hard limits a site must pass) and says how much its criterion matters (weight 0–5).
        Sites are checked at the target point for your landing date, ranked, and the clashes between teams are shown. A sensitivity sweep then tests whether the winner survives reasonable changes to the inputs.</p>
      <div className="team-grid">
        {Object.entries(TEAMS).map(([t, meta]) => (
          <fieldset key={t} className="team-box">
            <legend>{meta.label}</legend>
            {FIELDS[t].map(([k, label]) => (
              <label key={k} className="team-field">{label}
                {k === 'relay'
                  ? <input type="checkbox" checked={inp[t][k]} onChange={(e) => set(t, k, e.target.checked)} />
                  : <input type={k === 'slopeBaselineM' ? 'text' : 'number'} value={inp[t][k] ?? ''} placeholder="none"
                      onChange={(e) => set(t, k, k === 'slopeBaselineM' ? (e.target.value === 'ldsm' ? 'ldsm' : num(e.target.value) ?? 100) : num(e.target.value))} />}
              </label>
            ))}
            {t !== 'thermal' && <label className="team-field">Weight (0–5)
              <input type="number" min="0" max="5" value={inp[t].weight} onChange={(e) => set(t, 'weight', Math.max(0, Math.min(5, +e.target.value)))} /></label>}
            <p className="muted small">{meta.criterion}</p>
          </fieldset>
        ))}
      </div>
      <button className="primary" onClick={run} disabled={!!st}>Run team review ({sites.length} sites)</button>
      {st && <p className="hint">{st}</p>}
      {err && <p className="error">{err}</p>}
      {res && <TeamResult res={res} onLoad={onLoad} />}
    </section>
  );
}

function TeamResult({ res, onLoad }) {
  const { ev, sen } = res, keys = Object.keys(TEAMS);
  const name = (id) => (ev.rows.find((r) => r.site.id === id) || {}).site?.name || id;
  return (
    <div className="team-result">
      <table className="sim-table team-table">
        <thead><tr><th>#</th><th>Site</th><th>Score</th>{keys.map((k) => <th key={k}>{TEAMS[k].label}</th>)}<th /></tr></thead>
        <tbody>{ev.rows.map((r, i) => (
          <tr key={r.site.id} className={r.fails.length ? 'excluded' : ''}>
            <td>{i + 1}</td><td>{r.site.name}</td><td className="mono">{r.score.toFixed(3)}</td>
            {keys.map((k) => { const v = r.teams[k]; return (
              <td key={k} className={`mono small ${v.pass ? 'ok' : 'bad'}`} title={v.why}>{v.pass ? '✓' : '✗'}{v.score != null ? ` ${(100 * v.score).toFixed(0)}%` : ''}<br /><span className="muted">{v.why}</span></td>); })}
            <td>{onLoad && <button onClick={() => onLoad(r.site)}>Load</button>}</td>
          </tr>))}</tbody>
      </table>
      <h3>Where the teams disagree</h3>
      <ul className="small">
        {Object.entries(ev.favourites).map(([k, id]) => <li key={k}><strong>{TEAMS[k].label}</strong> prefers {name(id)}</li>)}
        {ev.clashes.map((c) => <li key={c.site}><strong>{c.site}</strong>: passes {c.passedBy.join(', ')}; rejected by {c.failedBy.join(', ')}</li>)}
      </ul>
      <h3>Sensitivity <span className="muted small">does the winner survive reasonable input changes?</span></h3>
      <p className="small">Top site <strong>{sen.baseTop}</strong>{sen.baseTopPasses ? '' : ' (fails at least one team)'} stays on top in <strong>{sen.stablePct.toFixed(0)}%</strong> of {sen.cases.length} one-at-a-time changes (limits ×0.75 / ×1.25, weights ×0.5 / ×1.5).</p>
      {sen.cases.some((c) => !c.same) && <ul className="small">{sen.cases.filter((c) => !c.same).map((c) => <li key={c.label}>{c.label} → {c.top} on top</li>)}</ul>}
      <p className="hint small">Method: each site is judged at its target point with the app's power and comms rules (real NASA LOLA terrain horizon at the arrays' height), NASA slope over the chosen baseline, NASA permanent shadow and Diviner data.
        Sites that fail any team's hard limit are listed below the ones that pass. Run the 1,000-touchdown simulation on a site for the full landing-spread check.</p>
    </div>
  );
}
