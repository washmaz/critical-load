import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PRESETS } from '../engine/presets.js';
import { runLandingSimulation } from '../engine/runSimulation.js';
import { loadTerrainAround } from '../engine/tiles.js';
import { cell, llToXY } from '../engine/horizonCore.js';
import { K997 } from '../engine/landingSim.js';

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

export default function LandingSim({ site, landing, appOpts }) {
  const [presetId, setPresetId] = useState('nasa-artemis3');
  const P = PRESETS[presetId];
  const [ell, setEll] = useState({ semiMajorM: 100, semiMinorM: 100, azimuthDeg: 0 });
  const [slopeMax, setSlopeMax] = useState(10);
  const [run, setRun] = useState(null);       // { done, total, t0 }
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const ctrl = useRef(null);

  useEffect(() => {
    if (P.slopeMaxDeg != null) setSlopeMax(P.slopeMaxDeg);
    if (P.semiMajorM != null) setEll({ semiMajorM: P.semiMajorM, semiMinorM: P.semiMinorM, azimuthDeg: P.azimuthDeg ?? 0 });
  }, [presetId]);
  useEffect(() => { setRes(null); setErr(null); }, [site.lat, site.lon, landing]);

  const opts = useMemo(() => ({
    ...appOpts, stepHours: 1, slopeMaxDeg: slopeMax,
    ...(P.batteryHours != null ? { batteryHours: P.batteryHours } : {}),
    ...(P.relay != null ? { relay: P.relay } : {}),
    ...(P.earthMinElevDeg != null ? { earthMinElevDeg: P.earthMinElevDeg } : {}),
  }), [appOpts, slopeMax, presetId]);

  const start = async () => {
    setErr(null); setRes(null);
    const ac = new AbortController(); ctrl.current = ac;
    const t0 = performance.now();
    setRun({ done: 0, total: 1000, t0 });
    try {
      const out = await runLandingSimulation({
        target: { lat: site.lat, lon: site.lon }, ellipse: ell, landingMs: landing, opts, n: 1000, seed: 1,
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
  return (
    <section className="panel sim">
      <h2>Landing ellipse simulation <span className="muted small">1,000 simulated touchdowns, each checked on real NASA terrain</span></h2>
      <p className="hint">Where will the lander actually touch down? We scatter 1,000 touchdowns over the landing ellipse (99.7 % of them inside it)
        and check every one: NASA slope at that spot, NASA permanent shadow, and sunlight and Earth contact for this mission from that spot's own terrain horizon.</p>
      <div className="sim-controls">
        <div className="field"><label htmlFor="preset">Requirements</label>
          <select id="preset" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></div>
        <div className="field"><label htmlFor="sma">Ellipse half-length (m)</label>
          <input id="sma" type="number" min="1" max="20000" value={ell.semiMajorM} onChange={(e) => setEll({ ...ell, semiMajorM: Math.max(1, +e.target.value) })} /></div>
        <div className="field"><label htmlFor="smi">Ellipse half-width (m)</label>
          <input id="smi" type="number" min="1" max="20000" value={ell.semiMinorM} onChange={(e) => setEll({ ...ell, semiMinorM: Math.max(1, +e.target.value) })} /></div>
        <div className="field"><label htmlFor="saz">Long axis points (° from north)</label>
          <input id="saz" type="number" min="0" max="180" value={ell.azimuthDeg} onChange={(e) => setEll({ ...ell, azimuthDeg: +e.target.value })} /></div>
        <div className="field"><label htmlFor="slp">Max slope (°)</label>
          <input id="slp" type="number" min="1" max="45" step="0.5" value={slopeMax} onChange={(e) => setSlopeMax(+e.target.value)} /></div>
        <div className="field sim-go">
          {run ? <button onClick={() => ctrl.current && ctrl.current.abort()}>Cancel</button>
               : <button className="primary" onClick={start} disabled={ell.semiMinorM > ell.semiMajorM}>Run 1,000 touchdowns</button>}
        </div>
      </div>
      {ell.semiMinorM > ell.semiMajorM && <p className="error">Half-width can't be larger than half-length.</p>}
      {P.notes.length > 0 && <ul className="sim-notes small">{P.notes.map((n) => <li key={n}>{n}</li>)}
        {P.source && <li>Source: <a href={P.source.url} target="_blank" rel="noreferrer">{P.source.title}</a></li>}</ul>}
      {run && <div className="sim-progress" role="progressbar" aria-valuenow={run.done} aria-valuemax={run.total}>
        <div style={{ width: `${(100 * run.done) / run.total}%` }} />
        <span>{run.done} / {run.total} touchdowns · {((performance.now() - run.t0) / 1000).toFixed(0)} s</span></div>}
      {err && <p className="error">Simulation failed: {err}</p>}
      {s && <SimResult res={res} />}
    </section>
  );
}

function SimResult({ res }) {
  const s = res.summary, f = s.fails, n = s.n;
  const tone = s.pSafe >= 0.99 ? 'go' : s.pSafe >= 0.9 ? 'caution' : 'nogo';
  const bars = [
    ['Too steep', f.slope, `NASA slope over ${res.opts.slopeMaxDeg}°`],
    ['Permanent shadow', f.shadow, 'NASA LPSR: never sunlit'],
    ['Not enough power', f.power, res.opts.batteryHours === 0 ? 'any dark hour during the stay' : `dark longer than ${res.opts.batteryHours} h`],
    ['Comms gap too long', f.comms, res.opts.relay ? 'relay assumed' : `Earth hidden longer than ${res.opts.commsGapHours} h`],
  ];
  return (
    <div className="sim-result">
      <div className={`sim-headline ${tone}`}>
        <div className="sim-p">{pct(s.pSafe)}</div>
        <div>
          <p className="sim-p-label">of touchdowns are safe and meet every requirement</p>
          <p className="muted small">95 % confidence {pct(s.ci95[0])}–{pct(s.ci95[1])} (Wilson) · {n} touchdowns{s.noData ? ` (+${s.noData} with no NASA data)` : ''} · {res.workers} parallel workers · {res.seconds.toFixed(0)} s</p>
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
            <tr><td>NASA slope</td><td>median {s.slopeDeg.median.toFixed(1)}°, worst 5 % {s.slopeDeg.p95.toFixed(1)}°</td></tr>
            {res.thermal.tempAvgK && <tr><td>Ground temperature (Diviner)</td><td>avg {Math.round(res.thermal.tempAvgK.min)}–{Math.round(res.thermal.tempAvgK.max)} K, yearly max up to {Math.round(res.thermal.tempMaxK.max)} K <span className="muted small">(report only)</span></td></tr>}
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
