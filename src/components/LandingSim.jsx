import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PRESETS, ACCURACY, PANEL_HEIGHTS, OWNERS } from '../engine/presets.js';
import { runLandingSimulation } from '../engine/runSimulation.js';
import { loadTerrainAround } from '../engine/tiles.js';
import { cell, llToXY } from '../engine/horizonCore.js';
import { K997 } from '../engine/landingSim.js';
import { screenCandidates, rankVerified, DEFAULT_WEIGHTS, HARD_FILTERS, localFrame, ICE_RANGE_M } from '../engine/findSpot.js';
import { loadScienceAround } from '../engine/tiles.js';
import { nearest } from '../engine/pointData.js';

const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const fmtH = (h) => (h == null ? '–' : h >= 48 ? `${(h / 24).toFixed(1)} d` : `${Math.round(h)} h`);

/** Share of 80 m pixels within radiusKm with NASA slope below limitDeg (moonwalk check). */
async function evaShare(lat, lon, radiusKm, limitDeg) {
  const g = (await loadTerrainAround(lat, lon, 30000)).slope;
  const [x, y] = llToXY(lat, lon), r0 = Math.floor((g.y0 - y) / g.pix), c0 = Math.floor((x - g.x0) / g.pix), k = Math.round((radiusKm * 1000) / g.pix);
  let n = 0, ok = 0;
  for (let dr = -k; dr <= k; dr++) for (let dc = -k; dc <= k; dc++) {
    if (dr * dr + dc * dc > k * k) continue;
    const v = cell(g, r0 + dr, c0 + dc); if (!(v === v)) continue; n++; if (v < limitDeg) ok++;
  }
  return n ? ok / n : null;
}

function LandingSim({ site, landing, appOpts, onPickPoint }) {
  const [mode, setMode] = useState('check');
  const [nRuns, setNRuns] = useState(1000);
  const [presetId, setPresetId] = useState('nasa-artemis3');
  const P = PRESETS[presetId];
  const [acc, setAcc] = useState('strict50');
  const [ell, setEll] = useState({ semiMajorM: 50, semiMinorM: 50, azimuthDeg: 0 });
  const [slopeMax, setSlopeMax] = useState(10);
  const [slopeMode, setSlopeMode] = useState(100);
  const [panelKey, setPanelKey] = useState('esa2');
  const [panelCustom, setPanelCustom] = useState(2);
  const [tMin, setTMin] = useState('');   // optional: lowest acceptable Diviner annual-average temperature (K)
  const [tMax, setTMax] = useState('');   // optional: highest acceptable Diviner annual-maximum surface temperature (K)
  const thermalLimits = (tMin !== '' || tMax !== '') ? { minAvgK: tMin === '' ? null : +tMin, maxSurfaceK: tMax === '' ? null : +tMax } : null;
  const panelM = panelKey === 'custom' ? panelCustom : PANEL_HEIGHTS[panelKey].m;
  const pickAcc = (k) => { setAcc(k); if (ACCURACY[k].semiMajorM) setEll({ semiMajorM: ACCURACY[k].semiMajorM, semiMinorM: ACCURACY[k].semiMinorM, azimuthDeg: 0 }); };
  const [run, setRun] = useState(null);       // { done, total, t0 }
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const ctrl = useRef(null);

  useEffect(() => {
    if (P.slopeMaxDeg != null) setSlopeMax(P.slopeMaxDeg);
    if (P.slopeMode != null) setSlopeMode(P.slopeMode);
    if (P.accuracy) pickAcc(P.accuracy);
    if (P.panelHeight) setPanelKey(P.panelHeight);
  }, [presetId]);
  useEffect(() => { setRes(null); setErr(null); }, [site.lat, site.lon, landing]);

  const opts = useMemo(() => ({
    ...appOpts, stepHours: 1, slopeMaxDeg: slopeMax, slopeMode, panelHeightM: panelM, thermalLimits,
    ...(P.batteryHours != null ? { batteryHours: P.batteryHours } : {}),
    ...(P.relay != null ? { relay: P.relay } : {}),
    ...(P.earthMinElevDeg != null ? { earthMinElevDeg: P.earthMinElevDeg } : {}),
  }), [appOpts, slopeMax, presetId, slopeMode, panelM, tMin, tMax]);

  const start = async () => {
    setErr(null); setRes(null);
    const ac = new AbortController(); ctrl.current = ac;
    const t0 = performance.now();
    setRun({ done: 0, total: nRuns, t0 });
    try {
      const out = await runLandingSimulation({
        target: { lat: site.lat, lon: site.lon }, ellipse: ell, landingMs: landing, opts, n: nRuns, seed: 1,
        onProgress: (d, t) => setRun({ done: d, total: t, t0 }), signal: ac.signal,
      });
      const checks = [];
      if (P.poleWithinDeg != null) checks.push({ label: `Within ${P.poleWithinDeg}° of the pole`, ok: site.lat <= -90 + P.poleWithinDeg, value: `${(90 + site.lat).toFixed(2)}° from the pole` });
      if (P.evaSlopeDeg != null) {
        const sh = await evaShare(site.lat, site.lon, P.evaRadiusKm, P.evaSlopeDeg);
        checks.push({ label: `Moonwalk ground: slope under ${P.evaSlopeDeg}° within ${P.evaRadiusKm} km`, ok: null, value: sh == null ? 'no data' : `${pct(sh, 0)} of the ground (NASA LOLA 80 m)` });
      }
      setRes({ ...out, checks, seconds: (performance.now() - t0) / 1000, opts, ell, presetId });
    } catch (e) { if (e.message !== 'cancelled') setErr(e.message); }
    setRun(null);
  };

  const s = res && res.summary;
  const accLabel = acc === 'custom' ? `Custom ellipse ${ell.semiMajorM} × ${ell.semiMinorM} m` : ACCURACY[acc].label;
  const slopeLabel = String(slopeMode) === 'ldsm' ? 'NASA LDSM slope map (80 m)' : slopeMode === 'nasa5m' ? 'Lander footprint, NASA 5 m map + uncertainty' : `${slopeMode} m baseline, NASA 5 m map where mapped, else 80 m`;
  return (
    <section className="sim sim2">
      <div className="sec-head sim2-head">
        <div>
          <h2>Landing ellipse</h2>
          <p className="sub">Where could the lander actually touch down? We scatter 1,000 touchdowns over the landing area and check slope, permanent shadow, sunlight and Earth view at every one, on real NASA terrain.</p>
        </div>
        <div className="sim-tabs" role="tablist" aria-label="Landing ellipse mode">
          <button role="tab" aria-selected={mode === 'check'} className={mode === 'check' ? 'on' : ''} onClick={() => setMode('check')}>Check this site</button>
          <button role="tab" aria-selected={mode === 'find'} className={mode === 'find' ? 'on' : ''} onClick={() => setMode('find')}>Find a better spot nearby</button>
        </div>
      </div>
      <div className="sim2-cols">
        <div className="sim2-form panel">
          <div className="sec-head"><h3>1 · Start from a lander</h3><p className="sub">Published limits fill the fields below. You can change any of them.</p></div>
          <div className="f"><label htmlFor="preset">Requirements</label>
            <select id="preset" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {P.source && <p className="f-help">Source: <a href={P.source.url} target="_blank" rel="noreferrer">{P.source.title}</a></p>}
          </div>

          <div className="sec-head sim2-step"><h3>2 · The choices that matter most</h3></div>
          <div className="f" role="group" aria-labelledby="acc-l"><span id="acc-l" className="f-label">Landing accuracy <span className="muted">(radius holding 99.7% of touchdowns)</span></span>
            <div className="seg2">
              {[['strict50', '50 m'], ['r100', '100 m'], ['custom', 'Custom']].map(([k, t]) => (
                <button key={k} type="button" aria-pressed={acc === k} className={acc === k ? 'on' : ''} onClick={() => pickAcc(k)}>{t}</button>))}
            </div>
            <p className="f-help">{acc === 'custom' ? 'Set the half-length and half-width under Ellipse shape.' : ACCURACY[acc].label}</p></div>
          <div className="sim2-stack">
            <div className="f"><label htmlFor="slp">Max slope <span className="muted">(°, 1–45)</span></label>
              <input id="slp" type="number" min="1" max="45" step="0.5" value={slopeMax} onChange={(e) => setSlopeMax(+e.target.value)} /></div>
            <div className="f"><label htmlFor="pnl">Array height</label>
              <select id="pnl" value={panelKey} onChange={(e) => setPanelKey(e.target.value)}>
                {Object.entries(PANEL_HEIGHTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {panelKey === 'custom' && <input type="number" min="0" max="50" step="0.1" value={panelCustom} aria-label="Custom array height in metres (0–50)" onChange={(e) => setPanelCustom(Math.max(0, Math.min(50, +e.target.value)))} />}
            </div>
          </div>
          <p className="f-help">Higher solar arrays and antennas see over nearby hills.</p>

          <div className="sim2-folds">
            <details>
              <summary><span>Ellipse shape</span><span className="muted">{accLabel} · axis {ell.azimuthDeg}°</span></summary>
              <div className="sim2-grid3">
                <div className="f"><label htmlFor="sma">Half-length (m)</label>
                  <input id="sma" type="number" min="1" max="20000" value={ell.semiMajorM} onChange={(e) => { setAcc('custom'); setEll({ ...ell, semiMajorM: Math.max(1, +e.target.value) }); }} /></div>
                <div className="f"><label htmlFor="smi">Half-width (m)</label>
                  <input id="smi" type="number" min="1" max="20000" value={ell.semiMinorM} onChange={(e) => { setAcc('custom'); setEll({ ...ell, semiMinorM: Math.max(1, +e.target.value) }); }} /></div>
                <div className="f"><label htmlFor="saz">Long axis (° from N)</label>
                  <input id="saz" type="number" min="0" max="180" value={ell.azimuthDeg} onChange={(e) => { setAcc('custom'); setEll({ ...ell, azimuthDeg: +e.target.value }); }} /></div>
              </div>
              <p className="f-help">Metres, 1–20,000. Same length and width = a circle. Axis 0–180°, clockwise from north.</p>
            </details>
            <details>
              <summary><span>How slope is measured</span><span className="muted">{slopeLabel}</span></summary>
              <div className="f"><label htmlFor="slb">Slope measured over</label>
                <select id="slb" value={String(slopeMode)} onChange={(e) => setSlopeMode(e.target.value === 'ldsm' || e.target.value === 'nasa5m' ? e.target.value : +e.target.value)}>
                  <option value="100">100 m baseline (NASA 5 m elevation where mapped, else 80 m)</option>
                  <option value="nasa5m">Lander footprint: NASA 5 m site map + NASA uncertainty</option>
                  <option value="ldsm">NASA LDSM slope map (80 m pixels)</option>
                </select>
                <p className="f-help">Longer distance = smoother slope. The NASA 5 m map is the most detailed.</p></div>
            </details>
            <details>
              <summary><span>Temperature limits</span><span className="muted">{tMin === '' && tMax === '' ? 'None set · report only' : `min ${tMin || '–'} K · max ${tMax || '–'} K`}</span></summary>
              <p className="f-help">NASA publishes no pass/fail temperature limit for landing sites, so temperatures are reported only. If your hardware has limits, enter them: a touchdown fails if the LRO Diviner annual-average temperature (2 cm depth) is below your minimum or the yearly maximum is above your maximum.</p>
              <div className="sim2-pair">
                <div className="f"><label htmlFor="tmin">Lowest average (K, 0–400)</label>
                  <input id="tmin" type="number" min="0" max="400" placeholder="no limit" value={tMin} onChange={(e) => setTMin(e.target.value)} /></div>
                <div className="f"><label htmlFor="tmax">Highest maximum (K, 0–500)</label>
                  <input id="tmax" type="number" min="0" max="500" placeholder="no limit" value={tMax} onChange={(e) => setTMax(e.target.value)} /></div>
              </div>
            </details>
            {P.notes.length > 0 && <details>
              <summary><span>What this preset sets</span><span className="muted">{P.notes.length} notes</span></summary>
              <ul className="sim-notes small">{P.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </details>}
          </div>
          {ell.semiMinorM > ell.semiMajorM && <p className="error">Half-width can't be larger than half-length.</p>}
          {mode === 'check' && <div className="f"><label htmlFor="nruns">Number of touchdowns <span className="muted">(100–10,000)</span></label>
            <input id="nruns" type="number" min="100" max="10000" step="100" value={nRuns} onChange={(e) => setNRuns(Math.max(100, Math.min(10000, Math.round(+e.target.value) || 1000)))} />
            <p className="f-help">1,000 gives each percentage to about ±3 %. 10,000 gives about ±1 % but takes about 10× longer in your browser.</p></div>}
          {mode === 'check' && <div className="sim-go">
            {run ? <button className="sim2-run" onClick={() => ctrl.current && ctrl.current.abort()}>Cancel</button>
                 : <button className="primary sim2-run" onClick={start} disabled={ell.semiMinorM > ell.semiMajorM}>Run {nRuns.toLocaleString('en-US')} touchdowns</button>}
          </div>}
        </div>

        <div className="sim2-out">
          {mode === 'find' && <div className="panel"><FindSpot site={site} landing={landing} opts={opts} ell={ell} preset={P} onPickPoint={onPickPoint} /></div>}
          {mode === 'check' && run && <div className="sim-progress" role="progressbar" aria-valuenow={run.done} aria-valuemax={run.total}>
            <div style={{ width: `${(100 * run.done) / run.total}%` }} />
            <span>{run.done} / {run.total} touchdowns · {((performance.now() - run.t0) / 1000).toFixed(0)} s</span></div>}
          {mode === 'check' && err && <p className="error">Simulation failed: {err}</p>}
          {mode === 'check' && s && <div className="panel"><SimResult res={res} /></div>}
          {mode === 'check' && !s && !run && (
            <div className="sim2-empty">
              <h3>Not run yet for this site and date</h3>
              <p className="sub">When it finishes you will see:</p>
              <ul>
                <li>The share of touchdowns that are safe and meet every requirement, with its 95% confidence range</li>
                <li>Why touchdowns fail: slope, permanent shadow, power, comms</li>
                <li>A map of every touchdown, pass or fail</li>
              </ul>
            </div>
          )}
          <Assumptions opts={opts} ell={ell} acc={acc} panelKey={panelKey} panelM={panelM} appOpts={appOpts} preset={P} />
        </div>
      </div>
    </section>
  );
}

export function SimResult({ res }) {
  const s = res.summary, f = s.fails, n = s.n;
  const siteFails = (res.checks || []).filter((c) => c.ok === false);
  const tone = siteFails.length ? 'nogo' : s.pSafe >= 0.99 ? 'go' : s.pSafe >= 0.9 ? 'caution' : 'nogo';
  const bars = [
    ['Too steep', f.slope, `slope over ${res.opts.slopeMaxDeg}° (${res.opts.slopeMode === 'ldsm' ? 'NASA LDSM 80 m' : res.opts.slopeMode === 'nasa5m' ? 'NASA 5 m map + uncertainty' : `${res.opts.slopeMode} m baseline`})`],
    ['Permanent shadow', f.shadow, 'NASA LPSR: never sunlit'],
    ['Not enough power', f.power, res.opts.batteryHours === 0 ? 'any dark hour during the stay' : `dark longer than ${res.opts.batteryHours} h`],
    ...(s.thermalChecked ? [['Outside your thermal limits', f.thermal, `Diviner: avg < ${res.opts.thermalLimits.minAvgK ?? '–'} K or max > ${res.opts.thermalLimits.maxSurfaceK ?? '–'} K${s.thermalNoData ? ` (${s.thermalNoData} no data)` : ''}`]] : []),
    ['Comms gap too long', f.comms, res.opts.relay ? 'relay assumed' : `Earth hidden longer than ${res.opts.commsGapHours} h`],
  ];
  return (
    <div className="sim-result">
      <div className={`sim-headline ${tone}`}>
        <div className="sim-p">{pct(s.pSafe)}</div>
        <div>
          <p className="sim-p-label">of touchdowns are safe and meet every requirement{siteFails.length ? ', but the site itself fails a requirement:' : ''}</p>
          {siteFails.map((c) => <p key={c.label} className="sim-sitefail">✗ {c.label}: {c.value}</p>)}
          <p className="muted small">Ellipse {res.ell.semiMajorM} × {res.ell.semiMinorM} m · arrays at {res.opts.panelHeightM} m · 95 % confidence {pct(s.ci95[0])}–{pct(s.ci95[1])} (Wilson) · {n} touchdowns{s.noData ? ` (+${s.noData} with no NASA data)` : ''} · {res.workers} parallel workers · {res.seconds.toFixed(0)} s</p>
        </div>
      </div>
      <div className="grid-2 sim-grid">
        <div>
          <h3>Why touchdowns fail <span className="muted small">a touchdown can fail more than one</span></h3>
          {bars.map(([label, k, sub]) => (
            <div className="sim-bar" key={label}>
              <span className="sim-bar-label">{label}<span className="muted small"> · {sub}</span></span>
              <span className="sim-bar-track"><span style={{ width: `${(100 * k) / Math.max(1, n)}%` }} /></span>
              <span className="sim-bar-val">{pct(k / Math.max(1, n), 1)}</span>
            </div>
          ))}
          <h3>Across the ellipse</h3>
          <table className="sim-table"><tbody>
            <tr><td>Sunlit this mission</td><td>{s.sunlitPct.p5.toFixed(0)}% – {s.sunlitPct.p95.toFixed(0)}% <span className="muted small">(5th–95th pct, median {s.sunlitPct.median.toFixed(0)}%)</span></td></tr>
            <tr><td>Longest dark</td><td>median {fmtH(s.longestDarkH.median)}, worst 5 % {fmtH(s.longestDarkH.p95)}</td></tr>
            <tr><td>Longest comms gap</td><td>median {fmtH(s.longestCommsGapH.median)}, worst 5 % {fmtH(s.longestCommsGapH.p95)}</td></tr>
            <tr><td>Slope data used</td><td>{Object.entries(s.slopeSources || {}).map(([k, v]) => `${({ '5m': 'NASA 5 m site map', '5m-dem': '100 m baseline from NASA 5 m elevation', '80m-dem': '100 m baseline from NASA 80 m elevation', '80m-ldsm': 'NASA LDSM 80 m' })[k] || k}: ${(100 * v / s.n).toFixed(0)}%`).join(' · ')}</td></tr>
            <tr><td>Slope ({res.opts.slopeMode === 'ldsm' ? 'NASA LDSM' : res.opts.slopeMode === 'nasa5m' ? 'NASA 5 m, with uncertainty' : `${res.opts.slopeMode} m baseline`})</td><td>median {s.slopeDeg.median.toFixed(1)}°, worst 5 % {s.slopeDeg.p95.toFixed(1)}°</td></tr>
            {res.thermal.tempAvgK && <tr><td>Ground temperature (Diviner)</td><td>avg {Math.round(res.thermal.tempAvgK.min)}–{Math.round(res.thermal.tempAvgK.max)} K, yearly max up to {Math.round(res.thermal.tempMaxK.max)} K <span className="muted small">({s.thermalChecked ? 'checked against your limits' : 'report only: no published limit'})</span></td></tr>}
            <tr><td>Sun up at touchdown <span className="muted small">(NASA: approach lighting is beneficial)</span></td><td>{s.litAtLandingPct.toFixed(0)}% of touchdowns · Earth up {s.earthAtLandingPct.toFixed(0)}%</td></tr>
            <tr><td>Water ice within 1 m (Diviner)</td><td>{res.thermal.iceWithin1mPct.toFixed(0)}% of touchdowns</td></tr>
            {res.checks.map((c) => <tr key={c.label}><td>{c.label}</td><td>{c.ok === true ? '✓ ' : c.ok === false ? '✗ ' : ''}{c.value}</td></tr>)}
          </tbody></table>
        </div>
        <Scatter res={res} />
      </div>
      <p className="hint small">Method: touchdowns from a 2-D normal (half-axes = {K997.toFixed(2)} σ so 99.7 % fall inside), fixed seed so runs repeat exactly.
        Each touchdown gets its own terrain horizon from NASA LOLA (80 m to 29 km, 320 m beyond), the same engine validated against our offline pipeline (within 0.05°).
        Sun and Earth positions: astronomy-engine, checked against JPL Horizons. Not assessable from orbit-scale data: boulders and roughness smaller than the 80 m pixels.</p>
    </div>
  );
}

function Scatter({ res }) {
  const S = 300, { touchdowns: td, results: rs, ell } = res;
  const lim = Math.max(ell.semiMajorM, 1) * 1.25, sc = (S / 2 - 12) / lim;
  const X = (e) => S / 2 + e * sc, Y = (n) => S / 2 - n * sc;
  const th = (ell.azimuthDeg * Math.PI) / 180;
  const pts = [];
  for (let k = 0; k <= 72; k++) { const a = (2 * Math.PI * k) / 72, u = ell.semiMajorM * Math.cos(a), v = ell.semiMinorM * Math.sin(a); pts.push(`${X(u * Math.sin(th) + v * Math.cos(th))},${Y(u * Math.cos(th) - v * Math.sin(th))}`); }
  const bar = Math.pow(10, Math.floor(Math.log10(lim)));
  return (
    <figure className="sim-scatter">
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Simulated touchdowns: green safe, red unsafe">
        <rect width={S} height={S} fill="#000" />
        <polyline points={pts.join(' ')} fill="none" stroke="#fff" strokeOpacity="0.6" strokeDasharray="4 4" />
        {td.map((t, i) => { const r = rs[i]; if (!r || r.noData) return null;
          return r.safe ? <circle key={i} cx={X(t.e)} cy={Y(t.n)} r="2.2" fill="#47da84" fillOpacity="0.8" />
            : <path key={i} d={`M${X(t.e) - 2.5},${Y(t.n) - 2.5}l5,5m0,-5l-5,5`} stroke="#ff5c52" strokeWidth="1.4" />; })}
        <path d={`M${S / 2 - 5},${S / 2}h10M${S / 2},${S / 2 - 5}v10`} stroke="#fff" />
        <text x="8" y="16" className="pmap-label">N ↑</text>
        <g transform={`translate(10,${S - 12})`}><line x1="0" y1="0" x2={bar * sc} y2="0" stroke="#fff" strokeWidth="2" /><text x="0" y="-5" className="pmap-label">{bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}</text></g>
      </svg>
      <figcaption className="muted small">Each mark is one simulated touchdown (green = safe, red ✗ = fails a requirement). Dashed line: the 99.7 % ellipse. + is the target.</figcaption>
    </figure>
  );
}

const WLABEL = { safety: 'Landing safety', power: 'Power (sunlight)', comms: 'Comms (Earth in view)', resources: 'Water ice nearby' };

function FindSpot({ site, landing, opts, ell, preset, onPickPoint }) {
  const [radiusKm, setRadiusKm] = useState(5);
  const [nVerify, setNVerify] = useState(3);
  const [w, setW] = useState(DEFAULT_WEIGHTS);
  const [st, setSt] = useState(null);   // progress
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const ctrl = useRef(null);
  useEffect(() => { setOut(null); setErr(null); }, [site.lat, site.lon, landing]);

  const go = async () => {
    setErr(null); setOut(null);
    const ac = new AbortController(); ctrl.current = ac; const t0 = performance.now();
    try {
      setSt({ phase: 'Screening NASA maps…', t0 });
      const R = radiusKm * 1000;
      const sci = await loadScienceAround(site.lat, site.lon, R + ICE_RANGE_M + 500);
      const g = await loadTerrainAround(site.lat, site.lon, R + ell.semiMajorM + 1000);
      const scr = screenCandidates({ center: site, radiusM: R, sci, slope: g.slope, near: g.near, slopeMode: opts.slopeMode ?? 'ldsm', ellipse: ell, slopeMaxDeg: opts.slopeMaxDeg, weights: w, keep: 30, poleWithinDeg: preset && preset.poleWithinDeg });
      if (!scr.candidates.length) { setOut({ scr, ranked: [], seconds: (performance.now() - t0) / 1000 }); setSt(null); return; }
      const todo = scr.candidates.slice(0, nVerify), items = [];
      for (let i = 0; i < todo.length; i++) {
        if (ac.signal.aborted) throw new Error('cancelled');
        const cand = todo[i];
        const sim = await runLandingSimulation({
          target: { lat: cand.lat, lon: cand.lon }, ellipse: ell, landingMs: landing, opts, n: 1000, seed: 1, signal: ac.signal,
          onProgress: (d, t) => setSt({ phase: `Full check of candidate ${i + 1} of ${todo.length}: ${d} / ${t} touchdowns`, t0, frac: (i + d / t) / todo.length }),
        });
        items.push({ cand, sim, rank0: i + 1 });
      }
      const ranked = rankVerified(items, w, (it) => nearest(sci, 'ice', it.cand.lat, it.cand.lon, ICE_RANGE_M / 1000, (v) => v !== 250 && v <= 50));
      setOut({ scr, ranked, seconds: (performance.now() - t0) / 1000 });
    } catch (e) { if (e.message !== 'cancelled') setErr(e.message); }
    setSt(null);
  };

  return (
    <div className="find">
      <p className="hint">Searches every 120 m NASA pixel within the radius. <strong>Stage 1</strong> keeps only ground NASA's 18.6-year maps show is sunlit at least {HARD_FILTERS.minSunPct}% and sees Earth at least {HARD_FILTERS.minEarthPct}% of the time (NASA Artemis III guidance), never permanently shadowed, and scores it with your weights using NASA slope over the whole landing ellipse.
        <strong> Stage 2</strong> runs the full 1,000-touchdown check above on the best few, well apart, for your mission dates, and ranks them.</p>
      <div className="sim-controls find-controls">
        <div className="field"><label htmlFor="frad">Search radius (km)</label>
          <input id="frad" type="number" min="0.5" max="20" step="0.5" value={radiusKm} onChange={(e) => setRadiusKm(Math.min(20, Math.max(0.5, +e.target.value)))} /><small className="field-help">Kilometres around the point, 0.5–20. E.g. 3</small></div>
        <div className="field"><label htmlFor="fn">Candidates to fully check</label>
          <select id="fn" value={nVerify} onChange={(e) => setNVerify(+e.target.value)}>{[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{k} (~{(k * 1.7).toFixed(0)} min)</option>)}</select><small className="field-help">Best spots to run the full 1,000-landing check on</small></div>
        {Object.keys(WLABEL).map((k) => (
          <div className="field" key={k}><label htmlFor={`w-${k}`}>Weight: {WLABEL[k]}</label>
            <input id={`w-${k}`} type="range" min="0" max="5" step="1" value={w[k]} onChange={(e) => setW({ ...w, [k]: +e.target.value })} />
            <span className="muted small">{w[k]}</span></div>
        ))}
        <div className="field sim-go">
          {st ? <button onClick={() => ctrl.current && ctrl.current.abort()}>Cancel</button>
              : <button className="primary" onClick={go} disabled={ell.semiMinorM > ell.semiMajorM}>Find spots</button>}
        </div>
      </div>
      <p className="muted small">Score = (Σ weight × criterion) / Σ weights. Criteria, each 0–1: landing safety (stage 1: share of the ellipse under the slope limit; stage 2: P(safe)), power (NASA long-term sunlit %; stage 2: median sunlit this mission), comms (NASA long-term Earth-visible %; stage 2: median this mission), water ice (1 at the ice, 0 beyond 5 km; Diviner, ice within 1 m of the surface).</p>
      {st && <div className="sim-progress"><div style={{ width: `${100 * (st.frac || 0)}%` }} /><span>{st.phase} · {((performance.now() - st.t0) / 1000).toFixed(0)} s</span></div>}
      {err && <p className="error">Search failed: {err}</p>}
      {out && <FindResult out={out} site={site} radiusKm={radiusKm} onPickPoint={onPickPoint} stayDays={opts.missionDays} ellM={ell.semiMajorM} />}
    </div>
  );
}

export function FindResult({ out, site, radiusKm, onPickPoint, stayDays, ellM }) {
  const [sx, sy] = llToXY(site.lat, site.lon);
  const distKm = (c) => { const [x, y] = llToXY(c.lat, c.lon); return Math.hypot(x - sx, y - sy) / localFrame(sx, sy).k / 1000; };
  const { scr, ranked } = out, rj = scr.rejected;
  return (
    <div className="find-result">
      <p className="small">Screened {scr.cells.toLocaleString()} NASA pixels: {rj.earth.toLocaleString()} fail Earth ≥ {HARD_FILTERS.minEarthPct}%, {rj.sun.toLocaleString()} fail Sun ≥ {HARD_FILTERS.minSunPct}%, {rj.psr.toLocaleString()} permanently shadowed{rj.pole ? `, ${rj.pole.toLocaleString()} outside the pole limit` : ''}{rj.noData ? `, ${rj.noData} no data` : ''};
        {' '}{scr.screened.toLocaleString()} pass. Fully checked {ranked.length} · {out.seconds.toFixed(0)} s.</p>
      {!ranked.length ? <p className="error">No ground in this radius passes NASA's Sun / Earth filters. Try a larger radius or another centre.</p> : (
        <div className="grid-2 sim-grid">
          <table className="sim-table find-table">
            <thead><tr><th>#</th><th>Stage 1 #</th><th>Where</th><th>From your site</th><th>P(safe)</th><th>Sunlit / Earth this mission</th><th>Ice</th><th>Score</th><th /></tr></thead>
            <tbody>{ranked.map((r, i) => {
              const s = r.sim.summary, c = r.cand;
              return (
                <tr key={i}>
                  <td><strong>{i + 1}</strong></td>
                  <td className="mono">{r.rank0}</td>
                  <td className="mono small">{Math.abs(c.lat).toFixed(4)}°S {Math.abs(c.lon).toFixed(4)}°{c.lon < 0 ? 'W' : 'E'}<br /><span className="muted">NASA long-term: Sun {c.sunPct}% · Earth {c.earthPct}%</span></td>
                  <td className="mono">{distKm(c).toFixed(2)} km</td>
                  <td className="mono">{(100 * s.pSafe).toFixed(1)}%<br /><span className="muted small">{(100 * s.ci95[0]).toFixed(1)}–{(100 * s.ci95[1]).toFixed(1)}%</span></td>
                  <td className="mono">{s.sunlitPct.median.toFixed(0)}% / {s.earthPct.median.toFixed(0)}%<br /><span className="muted small">dark ≤ {Math.round(s.longestDarkH.median)} h</span></td>
                  <td className="mono">{r.iceKm == null ? '> 5 km' : `${r.iceKm} km`}</td>
                  <td className="mono">{r.score.toFixed(3)}</td>
                  <td>{onPickPoint && <button onClick={() => onPickPoint(+c.lat.toFixed(5), +c.lon.toFixed(5))}>Load</button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <FindMap site={site} radiusKm={radiusKm} scr={scr} ranked={ranked} />
        </div>
      )}
      <p className="hint small">Why the order can change: stage 1 ranks by NASA's 18.6-year averages (how often a spot is lit or sees Earth in general), stage 2 by your exact mission dates. A spot that is sunny on average can still have a long dark spell during your particular {stayDays}-day stay, so the final rank (stage 2) is the one to use. "Load" opens a candidate as your site.</p>
      <p className="hint small"><strong>These are new landing targets, not adjustments of yours.</strong> Your landing area is a {ellM} m radius; a spot more than that from your site is a different site, and its own landing area is what the 1,000-touchdown check above tested.</p>
    </div>
  );
}

function FindMap({ site, radiusKm, scr, ranked }) {
  const S = 300, [cx, cy] = llToXY(site.lat, site.lon), f = localFrame(cx, cy), R = radiusKm * 1000, sc = (S / 2 - 14) / R;
  const P = (x, y) => { const dx = x - cx, dy = y - cy; const e = (dx * f.east[0] + dy * f.east[1]) / f.k, n = (dx * f.north[0] + dy * f.north[1]) / f.k; return [S / 2 + e * sc, S / 2 - n * sc]; };
  const col = (p) => (p >= 0.99 ? '#47da84' : p >= 0.9 ? '#ffb020' : '#ff5c52');
  const bar = Math.pow(10, Math.floor(Math.log10(R)));
  return (
    <figure className="sim-scatter">
      <svg viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Search area with candidate landing spots">
        <rect width={S} height={S} fill="#000" />
        <circle cx={S / 2} cy={S / 2} r={R * sc} fill="none" stroke="#fff" strokeOpacity="0.5" strokeDasharray="4 4" />
        {scr.candidates.map((c, i) => { const [x, y] = P(c.x, c.y); return <circle key={i} cx={x} cy={y} r="3" fill="#b9b9bb" fillOpacity="0.6" />; })}
        {ranked.map((r, i) => { const [x, y] = P(r.cand.x, r.cand.y); return (
          <g key={i}><circle cx={x} cy={y} r="9" fill={col(r.sim.summary.pSafe)} stroke="#000" strokeWidth="2" />
            <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#000">{i + 1}</text></g>); })}
        <path d={`M${S / 2 - 6},${S / 2}h12M${S / 2},${S / 2 - 6}v12`} stroke="#fff" strokeWidth="1.5" />
        <text x="8" y="16" className="pmap-label">N ↑</text>
        <g transform={`translate(10,${S - 12})`}><line x1="0" y1="0" x2={bar * sc} y2="0" stroke="#fff" strokeWidth="2" /><text x="0" y="-5" className="pmap-label">{bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}</text></g>
      </svg>
      <figcaption className="muted small">+ = your current site. Grey = best-scoring screened spots (stage 1). Numbered = fully checked, coloured by P(safe): green ≥ 99%, amber ≥ 90%, red below.</figcaption>
    </figure>
  );
}

function Assumptions({ opts, ell, acc, panelKey, panelM, appOpts, preset }) {
  const rows = [
    ['Landing date and time', 'set at the top of the page', 'Your setting', OWNERS.dates],
    ['Surface stay', `${appOpts.missionDays} days`, 'Your setting: NASA\'s Artemis III overview gives no stay length', OWNERS.stay],
    ['Battery: longest dark the lander survives', opts.batteryHours === 0 ? '0 h (lit the whole stay)' : `${opts.batteryHours} h`, preset.batteryHours != null ? `Preset: ${preset.label}` : 'Your setting', OWNERS.battery],
    ['Solar arrays / antenna height', `${panelM} m`, panelKey === 'custom' ? 'Your setting' : PANEL_HEIGHTS[panelKey].source.title, OWNERS.panel],
    ['Longest comms gap allowed', opts.relay ? 'relay assumed' : `${opts.commsGapHours} h`, preset.relay != null ? `Preset: ${preset.label} (no relay)` : 'Your setting', OWNERS.comms],
    ['Earth must clear the terrain by', `${opts.earthMinElevDeg ?? opts.marginDeg}°`, opts.earthMinElevDeg != null ? 'ESA study' : 'Uncertainty margin (your setting)', OWNERS.comms],
    ['Landing accuracy (99.7 % ellipse)', `${ell.semiMajorM} m × ${ell.semiMinorM} m half-axes`, ACCURACY[acc].label, OWNERS.accuracy],
    ['Slope limit', `${opts.slopeMaxDeg}°`, preset.slopeMaxDeg != null ? `Preset: ${preset.label}` : 'Your setting', OWNERS.slope],
    ['Slope measured over', opts.slopeMode === 'ldsm' ? 'NASA LDSM, 80 m pixels' : opts.slopeMode === 'nasa5m' ? 'NASA 5 m site map (lander footprint), NASA RMS error sampled' : `${opts.slopeMode} m baseline`, opts.slopeMode === 100 ? 'NASA Artemis III wording ("over 100 m"); NASA 5 m elevation where mapped' : opts.slopeMode === 'nasa5m' ? 'NASA PGDA product 78; outside the mapped boxes falls back to LDSM (shown in results)' : 'NASA map as published', OWNERS.slopeBase],
    ['Thermal limits', opts.thermalLimits ? `avg ≥ ${opts.thermalLimits.minAvgK ?? '–'} K, max ≤ ${opts.thermalLimits.maxSurfaceK ?? '–'} K` : 'none (report only)', opts.thermalLimits ? 'Your setting' : 'NASA publishes no landing-site limit', 'Thermal engineering'],
    ['Sun / Earth "up" means', `centre more than ${opts.marginDeg}° above the terrain`, 'Your setting (centre rule; ESA\'s 50 %-of-disc rule is the 0° case)', OWNERS.margin],
  ];
  // Basis: "Published source" when the value comes from a cited NASA/ESA/ISRO document or dataset, "Your input" when the user typed or picked it,
  // "Team choice" when it is a modelling convention our team adopted (stated openly so reviewers can challenge it).
  const basis = (c) => /^Your setting|^Uncertainty margin|^Your input/.test(c) ? 'Your input' : /NASA|ESA|ISRO|PGDA|LDSM|Preset/.test(c) ? 'Published source' : 'Team choice';
  const fixed = [
    ['Landing accuracy read as', '99.7 % (3-sigma) circle', 'Team choice: NASA gives "within 100 m" without a confidence level', 'Team choice', OWNERS.accuracy],
    ['Observer height for the horizon', '2 m above the ground', 'Team choice: typical lander deck / array height', 'Team choice', OWNERS.panel],
  ];
  const all = [...rows.map(([a, b, c, d]) => [a, b, c, basis(c), d]), ...fixed];
  return (
    <details className="assumptions">
      <summary>Assumptions in this run ({all.length}): source, your input or team choice</summary>
      <table className="sim-table"><thead><tr><th>Input</th><th>Value</th><th>Basis</th><th>Where it comes from</th><th>Owner</th></tr></thead>
        <tbody>{all.map(([a, b, c, k, d]) => <tr key={a}><td>{a}</td><td className="mono">{b}</td><td><span className={`basis ${k === 'Team choice' ? 'team' : ''}`}>{k}</span></td><td className="small">{c}</td><td className="small">{d}</td></tr>)}</tbody></table>
      <p className="hint small">Not modelled yet, so a real review would still need: boulders smaller than NASA's 5 m map pixels (5 m site maps cover 27 boxes; elsewhere the limit is 80 m),
        the descent opportunities set by the Gateway orbit (NASA: one every ~6.5 days), and approach-path lighting (only the Sun at touchdown is checked).</p>
    </details>
  );
}

export default React.memo(LandingSim);
