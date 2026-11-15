import React, { useState } from 'react';
import { TEAMS, DEFAULT_TEAM_INPUTS, siteData, evaluate, sensitivity, newCriterion } from '../engine/teamReview.js';

const FIELDS = {
  mission: [['stayDays', 'Surface stay (days)'], ['slipDays', 'Slip window ± (days)'], ['poleWithinDeg', 'Max distance from pole (°, blank = none)']],
  power: [['batteryHours', 'Battery: longest dark (h)'], ['panelHeightM', 'Solar arrays height (m)']],
  comms: [['commsGapHours', 'Longest comms gap (h)'], ['relay', 'Relay satellite available']],
  landing: [['slopeMaxDeg', 'Slope limit (°)'], ['slopeBaselineM', 'Slope baseline (m, or "ldsm")'], ['radiusM', 'Landing area radius (m, 99.7 %)']],
  thermal: [['minAvgK', 'Lowest avg temp (K, blank = none)'], ['maxSurfaceK', 'Highest max temp (K, blank = none)']],
  science: [],
};
// What goes in each box: units, allowed range and an example (presentation only).
const HELP = {
  stayDays: 'Days on the surface, 0.5–30. E.g. 7',
  slipDays: 'Days the landing date may move either way, 0–90. E.g. 7',
  poleWithinDeg: 'Degrees of latitude from the pole, 0–10. E.g. 6 (NASA Artemis III: within 6°)',
  batteryHours: 'Hours the lander survives without sunlight. E.g. 48',
  panelHeightM: 'Height of arrays above ground, metres, 0–50. E.g. 2',
  commsGapHours: 'Longest allowed gap with no Earth in view, hours. E.g. 48',
  relay: 'Tick if a relay satellite covers comms (gaps then do not count)',
  slopeMaxDeg: 'Steepest ground allowed, degrees, 1–45. E.g. 10',
  slopeBaselineM: 'Distance slope is measured over, metres (e.g. 100), or "ldsm" for the NASA 5 m map',
  radiusM: 'Radius that holds 99.7 % of landings, metres. E.g. 100',
  minAvgK: 'Kelvin, optional. Fails sites colder than this on average. E.g. 100',
  maxSurfaceK: 'Kelvin, optional. Fails sites hotter than this at peak. E.g. 390',
  weight: 'How much this team counts in the ranking: 0 = ignore, 5 = most',
};

function TeamReview({ sites, landing, marginDeg, stayDays, onLoad }) {
  const [inp, setInp] = useState(() => ({ ...DEFAULT_TEAM_INPUTS, mission: { ...DEFAULT_TEAM_INPUTS.mission, stayDays: stayDays ?? DEFAULT_TEAM_INPUTS.mission.stayDays } }));
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

  const [cur, setCur] = useState('mission');
  const summary = (t) => {
    const x = inp[t];
    if (t === 'mission') return `Stay ${x.stayDays ?? '–'} d · slip ±${x.slipDays ?? '–'} d · ${x.poleWithinDeg == null ? 'any distance from pole' : `within ${x.poleWithinDeg}° of pole`}`;
    if (t === 'power') return `Battery ${x.batteryHours ?? '–'} h · arrays ${x.panelHeightM ?? '–'} m`;
    if (t === 'comms') return `Gap ${x.commsGapHours ?? '–'} h · ${x.relay ? 'relay' : 'no relay'}`;
    if (t === 'landing') return `Slope ${x.slopeMaxDeg ?? '–'}° · radius ${x.radiusM ?? '–'} m`;
    if (t === 'thermal') return x.minAvgK == null && x.maxSurfaceK == null ? 'No limits set · pass/fail only' : `min ${x.minAvgK ?? '–'} K · max ${x.maxSurfaceK ?? '–'} K`;
    return TEAMS[t].criterion;
  };
  const meta = TEAMS[cur];
  const nCustom = (inp.custom || []).length;

  return (
    <section className="team team2">
      <div className="sec-head">
        <h2>Team review</h2>
        <p className="sub">Each team sets its own hard limits and how much it counts (0–5). We check {sites.length} south-pole sites for your landing date, rank them, show where teams disagree, and test whether the winner survives changes.
          {' '}Default weights are our team's starting point, not NASA's: NASA sets hard requirements, not trade weights.</p>
      </div>
      <div className="team2-cols">
        <nav className="team2-list" aria-label="Teams">
          {Object.entries(TEAMS).map(([t, m]) => (
            <button key={t} className={cur === t ? 'on' : ''} aria-current={cur === t ? 'true' : undefined} onClick={() => setCur(t)}>
              <span className="t2-name">{m.label}<span className="t2-sum">{summary(t)}</span></span>
              <span className="t2-w mono">{t === 'thermal' ? '—' : `w ${inp[t].weight}`}</span>
            </button>
          ))}
          <button className={cur === 'custom' ? 'on' : ''} aria-current={cur === 'custom' ? 'true' : undefined} onClick={() => setCur('custom')}>
            <span className="t2-name">Custom criteria<span className="t2-sum">{nCustom ? `${nCustom} added` : 'For anything without a NASA dataset'}</span></span>
            <span className="t2-w mono">{nCustom || '+'}</span>
          </button>
        </nav>
        <div className="team2-edit panel">
          {cur === 'custom' ? <CustomCriteria inp={inp} setInp={setInp} sites={sites} /> : (
            <fieldset className="team2-box">
              <legend>{meta.label}</legend>
              <p className="sub">Ranked on: {meta.criterion.charAt(0).toLowerCase() + meta.criterion.slice(1)}.</p>
              {FIELDS[cur].map(([k, label]) => (
                <div key={k} className="team2-field">
                  {k === 'relay'
                    ? <label className="check"><input type="checkbox" checked={inp[cur][k]} onChange={(e) => set(cur, k, e.target.checked)} />{label}</label>
                    : <><label htmlFor={`team-${cur}-${k}`}>{label}</label>
                      <input id={`team-${cur}-${k}`} type={k === 'slopeBaselineM' ? 'text' : 'number'} value={inp[cur][k] ?? ''} placeholder="none"
                        onChange={(e) => set(cur, k, k === 'slopeBaselineM' ? (e.target.value === 'ldsm' ? 'ldsm' : num(e.target.value) ?? 100) : num(e.target.value))} /></>}
                  {HELP[k] && <small className="f-help">{HELP[k]}</small>}
                </div>
              ))}
              {cur !== 'thermal'
                ? <div className="team2-weight">
                    <label htmlFor={`team-${cur}-w`}>How much this team counts <span className="mono">{inp[cur].weight} / 5</span></label>
                    <input id={`team-${cur}-w`} type="range" min="0" max="5" step="1" value={inp[cur].weight} onChange={(e) => set(cur, 'weight', +e.target.value)} />
                    <div className="t2-scale"><span>0 · ignore</span><span>5 · most</span></div>
                  </div>
                : <p className="f-help">Pass or fail only, no ranking weight: NASA publishes no temperature limit for landing sites.</p>}
            </fieldset>
          )}
        </div>
      </div>
      <div className="team2-run">
        <button className="primary" onClick={run} disabled={!!st}>Run team review ({sites.length} sites)</button>
        {st && <p className="hint">{st}</p>}
        {err && <p className="error">{err}</p>}
      </div>
      {res ? <div className="panel"><TeamResult res={res} onLoad={onLoad} /></div>
        : !st && <div className="sim2-empty"><h3>Not run yet</h3><p className="sub">You will get a ranked list, each site's result per team, the clashes between teams, and whether the winner survives limits ×0.75 / ×1.25 and weights ×0.5 / ×1.5.</p></div>}
    </section>
  );
}

function CustomCriteria({ inp, setInp, sites }) {
  const list = inp.custom || [];
  const put = (id, patch) => setInp({ ...inp, custom: list.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const setVal = (c, siteId, v) => put(c.id, { values: { ...c.values, [siteId]: v } });
  return (
    <fieldset className="team2-box custom-criteria">
      <legend>Custom criteria</legend>
      <p className="muted small">For anything a team needs judged that the app has no NASA dataset for (for example a traverse to a science target).
        Name it, rate each site, set a weight. <strong>Score</strong> criteria (0–100) enter the weighted ranking; <strong>pass/fail</strong> criteria act as a hard limit.
        Unrated sites are left out of that criterion and flagged. These change the ranking and the clashes only: sunlight, Earth view, slope, shadow and the Monte Carlo still come from NASA data.</p>
      {list.map((c) => (
        <div key={c.id} className="criterion">
          <div className="criterion-head">
            <label className="team-field">Name <input type="text" value={c.name} placeholder="e.g. Boulder density" onChange={(e) => put(c.id, { name: e.target.value })} /></label>
            <label className="team-field">Owning team <input type="text" value={c.owner} placeholder="e.g. Science" onChange={(e) => put(c.id, { owner: e.target.value })} /></label>
            <label className="team-field">Type
              <select value={c.kind} onChange={(e) => put(c.id, { kind: e.target.value, values: {} })}>
                <option value="score">Score 0–100</option><option value="pass">Pass / fail</option>
              </select></label>
            {c.kind === 'score' && <label className="team-field">Weight (0–5)
              <input type="number" min="0" max="5" value={c.weight} onChange={(e) => put(c.id, { weight: Math.max(0, Math.min(5, +e.target.value)) })} /></label>}
            <button onClick={() => setInp({ ...inp, custom: list.filter((x) => x.id !== c.id) })}>Remove</button>
          </div>
          <div className="criterion-sites">
            {sites.map((s) => (
              <label key={s.id} className="team-field">{s.name}
                {c.kind === 'score'
                  ? <input type="number" min="0" max="100" placeholder="unrated" value={c.values[s.id] ?? ''}
                      onChange={(e) => setVal(c, s.id, e.target.value === '' ? null : Math.max(0, Math.min(100, +e.target.value)))} />
                  : <select value={c.values[s.id] == null ? '' : c.values[s.id] ? 'pass' : 'fail'} onChange={(e) => setVal(c, s.id, e.target.value === '' ? null : e.target.value === 'pass')}>
                      <option value="">unrated</option><option value="pass">pass</option><option value="fail">fail</option>
                    </select>}
              </label>))}
          </div>
        </div>
      ))}
      <button onClick={() => setInp({ ...inp, custom: [...list, newCriterion(list.length + 1)] })}>+ Add a criterion</button>
    </fieldset>
  );
}

function TeamResult({ res, onLoad }) {
  const { ev, sen } = res, keys = Object.keys(ev.labels);
  const name = (id) => (ev.rows.find((r) => r.site.id === id) || {}).site?.name || id;
  return (
    <div className="team-result">
      <table className="sim-table team-table">
        <thead><tr><th>#</th><th>Site</th><th>Score</th>{keys.map((k) => <th key={k}>{ev.labels[k]}</th>)}<th /></tr></thead>
        <tbody>{(() => {
          const pass = ev.rows.filter((r) => !r.fails.length), fail = ev.rows.filter((r) => r.fails.length);
          const row = (r, rank) => (
            <tr key={r.site.id} className={r.fails.length ? 'excluded' : ''}>
              <td>{rank}</td><td>{r.site.name}</td><td className="mono">{r.fails.length ? <span className="muted">({r.score.toFixed(3)})</span> : r.score.toFixed(3)}</td>
              {keys.map((k) => { const v = r.teams[k]; return (
                <td key={k} className={`mono small ${v.unrated ? '' : v.pass ? 'ok' : 'bad'}`} title={v.why}>{v.unrated ? '–' : v.pass ? '✓' : '✗'}{v.score != null ? ` ${(100 * v.score).toFixed(0)}%` : ''}<br /><span className="muted">{v.why}</span></td>); })}
              <td>{onLoad && <button onClick={() => onLoad(r.site)}>Load</button>}</td>
            </tr>);
          return [
            <tr key="h-pass" className="team-group"><td colSpan={keys.length + 4}>{pass.length ? `Pass every team's limits (${pass.length}), ranked by weighted score` : 'No site passes every team\'s limits'}</td></tr>,
            ...pass.map((r, i) => row(r, i + 1)),
            ...(fail.length ? [<tr key="h-fail" className="team-group"><td colSpan={keys.length + 4}>Fail at least one limit ({fail.length}): not ranked; score shown in brackets for reference only</td></tr>] : []),
            ...fail.map((r) => row(r, '–')),
          ];
        })()}</tbody>
      </table>
      <h3>Where the teams disagree</h3>
      <ul className="small">
        {Object.entries(ev.favourites).map(([k, id]) => <li key={k}><strong>{ev.labels[k]}</strong> prefers {name(id)}</li>)}
        {ev.unrated.map((u) => <li key={u.name}><strong>{u.name}</strong> not rated for {u.sites.join(', ')} (left out of that criterion)</li>)}
        {ev.clashes.map((c) => <li key={c.site}><strong>{c.site}</strong>: passes {c.passedBy.join(', ')}; rejected by {c.failedBy.join(', ')}</li>)}
      </ul>
      <h3>Sensitivity <span className="muted small">does the winner survive reasonable input changes?</span></h3>
      <p className="small">Top site <strong>{sen.baseTop}</strong>{sen.baseTopPasses ? '' : ' (fails at least one team: no site passes every limit)'} stays on top in <strong>{sen.stablePct.toFixed(0)}%</strong> of {sen.cases.length} one-at-a-time changes (limits ×0.75 / ×1.25, weights ×0.5 / ×1.5).</p>
      {sen.cases.some((c) => !c.same) && <ul className="small">{sen.cases.filter((c) => !c.same).map((c) => <li key={c.label}>{c.label} → {c.top} on top</li>)}</ul>}
      <p className="hint small">Method: each site is judged at its target point with the app's power and comms rules (real NASA LOLA terrain horizon at the arrays' height), NASA slope over the chosen baseline, NASA permanent shadow and Diviner data.
        Sites that fail any team's hard limit are not ranked. This review checks each site's target point (slope over the whole landing area); run the 1,000-touchdown simulation on a site for the full landing-spread check, which can still fail a site that passes here.</p>
    </div>
  );
}

export default React.memo(TeamReview);
