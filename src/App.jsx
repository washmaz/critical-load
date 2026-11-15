import React, { useEffect, useMemo, useState } from 'react';
import { SITES, DEFAULT_SITE_ID, siteById, validateLatLon, normLon } from './engine/sites.js';
import { analyzeSite, compareSites, DEFAULTS } from './engine/analysis.js';
import { withTerrain, terrainFor } from './engine/terrain.js';
import { scienceFor, SCIENCE_SOURCES, loadCraters, cratersNear } from './engine/science.js';
import { loadTable, getStatus, horizonsUrl } from './engine/ephemerisStore.js';
import { skyAt, setEphemerisMode } from './engine/lunarSky.js';
import SkyDome from './components/SkyDome.jsx';
import Timeline from './components/Timeline.jsx';
import SlipWindow from './components/SlipWindow.jsx';
import SiteCompare from './components/SiteCompare.jsx';
import PolarMap from './components/PolarMap.jsx';
import TimeBar from './components/TimeBar.jsx';
import { fmtUTC, fmtShortUTC, fmtDur, fmtPct, fmtLat, fmtLon, toInputUTC, fromInputUTC, relTime, HOUR, DAY } from './format.js';

const SLIP_OPTIONS = [0, 3, 7, 14, 30, 90];

// ---- URL state (shareable scenarios) ------------------------------------
function readHash() {
  const p = new URLSearchParams(window.location.hash.slice(1));
  const num = (k, d) => (p.has(k) && Number.isFinite(+p.get(k)) ? +p.get(k) : d);
  const now = Math.floor(Date.now() / HOUR) * HOUR;
  return {
    siteId: p.get('site') || DEFAULT_SITE_ID,
    customLat: num('lat', -89.5),
    customLon: num('lon', 0),
    landing: p.has('t') ? Date.parse(p.get('t')) || now : now,
    slipDays: num('slip', DEFAULTS.slipDays),
    missionDays: num('mission', DEFAULTS.missionDays),
    marginDeg: num('margin', DEFAULTS.marginDeg),
    batteryHours: num('battery', DEFAULTS.batteryHours),
    commsGapHours: num('comms', DEFAULTS.commsGapHours),
    relay: p.get('relay') === '1',
    terrain: p.get('terrain') !== '0',   // real LOLA terrain on by default
    ephem: p.get('ephem') === 'live' ? 'live' : 'auto',
  };
}
function writeHash(s) {
  const p = new URLSearchParams();
  p.set('site', s.siteId);
  if (s.siteId === 'custom') { p.set('lat', s.customLat); p.set('lon', s.customLon); }
  p.set('t', new Date(s.landing).toISOString().slice(0, 16) + 'Z');
  p.set('slip', s.slipDays); p.set('mission', s.missionDays); p.set('margin', s.marginDeg);
  p.set('battery', s.batteryHours); p.set('comms', s.commsGapHours);
  if (s.relay) p.set('relay', '1');
  if (!s.terrain) p.set('terrain', '0');
  if (s.ephem === 'live') p.set('ephem', 'live');
  window.history.replaceState(null, '', `#${p.toString()}`);
}

const statusClass = (s) => (s === 'GO' ? 'go' : s === 'CAUTION' ? 'caution' : 'nogo');
const HEADLINE = {
  GO: 'Power and direct comms both hold for the whole mission.',
  CAUTION: 'Power holds, but direct-to-Earth comms has long gaps.',
  'NO-GO': 'Not enough sunlight: the lander would run out of battery.',
};

export default function App() {
  const [s, setS] = useState(readHash);
  const set = (patch) => setS((old) => ({ ...old, ...patch }));
  const [scrub, setScrub] = useState(null);
  const [zoomPref, setZoomPref] = useState(null);
  const [customDraft, setCustomDraft] = useState({ lat: String(s.customLat), lon: String(s.customLon) });
  const [customErr, setCustomErr] = useState(null);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => writeHash(s), [s]);
  const [ephemTick, setEphemTick] = useState(0);
  const [craters, setCraters] = useState(null);
  useEffect(() => setScrub(null), [s.landing, s.siteId, s.missionDays]);

  const baseSite = s.siteId === 'custom'
    ? { id: 'custom', name: `Custom (${fmtLat(s.customLat)}, ${fmtLon(s.customLon)})`, group: 'Custom', lat: s.customLat, lon: s.customLon }
    : siteById(s.siteId) || siteById(DEFAULT_SITE_ID);
  const hasTerrain = !!terrainFor(baseSite.id);
  setEphemerisMode(s.ephem);
  // Load the NASA JPL table for this site (if one exists) and re-run the analysis when it arrives.
  useEffect(() => {
    let live = true;
    const liveFn = (x, d) => { const r = skyAt({ lat: x.lat, lon: x.lon }, d); return { sun: r.sun, earth: r.earth }; };
    loadTable({ lat: baseSite.lat, lon: baseSite.lon }, liveFn).then(() => { if (live) setEphemTick((n) => n + 1); });
    return () => { live = false; };
  }, [baseSite.lat, baseSite.lon]);
  useEffect(() => { if (s.siteId === 'custom') loadCraters().then(setCraters); }, [s.siteId]);
  const ephemStatus = getStatus({ lat: baseSite.lat, lon: baseSite.lon });
  const sci = scienceFor(baseSite.id);
  const site = withTerrain(baseSite, s.terrain);
  const terrainOn = !!site.terrain;

  const opts = {
    slipDays: s.slipDays, missionDays: s.missionDays, marginDeg: s.marginDeg,
    batteryHours: s.batteryHours, commsGapHours: s.commsGapHours, relay: s.relay,
  };
  const deps = [site.lat, site.lon, s.landing, s.slipDays, s.missionDays, s.marginDeg, s.batteryHours, s.commsGapHours, s.relay, terrainOn, s.ephem, ephemTick];
  const a = useMemo(() => analyzeSite(site, s.landing, opts), deps);
  // Same question on a smooth Moon, so planners see what terrain changes (only when terrain is on).
  const smooth = useMemo(() => (terrainOn ? analyzeSite(baseSite, s.landing, { ...opts, slipDays: 0 }).result : null), deps);
  const compareRows = useMemo(() => compareSites(
    (s.siteId === 'custom' ? [...SITES, baseSite] : SITES).map((x) => withTerrain(x, s.terrain)), s.landing, opts),
  [...deps, s.siteId]);

  const { series, result } = a;
  const m = result.metrics, v = result.verdict;
  const i0 = a.idx(s.landing), i1 = a.idx(s.landing + s.missionDays * DAY);
  const tNow = scrub ?? s.landing;
  const k = a.idx(tNow);
  const sun = { alt: series.sunAlt[k], az: series.sunAz[k], clear: series.sunClear[k] };
  const earth = { alt: series.earthAlt[k], az: series.earthAz[k], clear: series.earthClear[k] };
  const stride = Math.max(1, Math.floor((i1 - i0) / 400));
  const sunPath = [], earthPath = [];
  for (let i = i0; i <= i1; i += stride) {
    sunPath.push({ alt: series.sunAlt[i], az: series.sunAz[i] });
    earthPath.push({ alt: series.earthAlt[i], az: series.earthAz[i] });
  }
  const zoom = zoomPref ?? Math.abs(site.lat) > 75;

  const applyCustom = () => {
    const lat = parseFloat(customDraft.lat), lon = parseFloat(customDraft.lon);
    const err = validateLatLon(lat, lon);
    setCustomErr(err);
    if (!err) set({ siteId: 'custom', customLat: lat, customLon: normLon(lon) });
  };
  const shift = (days) => set({ landing: s.landing + days * DAY });

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">NASA Space Apps 2026 · Team Critical Load</p>
          <h1>Lunar Landing Site Navigator</h1>
          <p className="tagline">Is there power? Can we talk to Earth? For how long? And does it still work if the launch slips?</p>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={() => window.print()} title="Print or save this scenario as a PDF">Print / PDF</button>
          <button className="ghost" onClick={() => setShowAbout((x) => !x)}>{showAbout ? 'Close' : 'How it works'}</button>
        </div>
      </header>

      {showAbout && <About />}

      {/* ---------------- Controls ---------------- */}
      {/* ---------------- What and when (verdict comes right after) ---------------- */}
      <section className="panel topbar">
        <div className="field site-field">
          <label htmlFor="site">Landing site</label>
          <select id="site" value={s.siteId} onChange={(e) => set({ siteId: e.target.value })}>
            {['South pole', 'Artemis III regions', 'Other sites'].map((g) => (
              <optgroup key={g} label={g}>
                {SITES.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </optgroup>
            ))}
            <option value="custom">Custom coordinates…</option>
          </select>
          <p className="site-meta">
            {fmtLat(site.lat)}, {fmtLon(site.lon)}
            {site.url && <> · <a href={site.url} target="_blank" rel="noreferrer">source</a></>}
            {site.note && <span className="muted"> · {site.note}</span>}
          </p>
          {s.siteId === 'custom' && (
            <div className="custom">
              <input aria-label="Latitude" value={customDraft.lat} onChange={(e) => setCustomDraft({ ...customDraft, lat: e.target.value })} placeholder="lat (−90…90)" />
              <input aria-label="Longitude" value={customDraft.lon} onChange={(e) => setCustomDraft({ ...customDraft, lon: e.target.value })} placeholder="lon (°E)" />
              <button onClick={applyCustom}>Use</button>
              {customErr && <span className="error">{customErr}</span>}
            </div>
          )}
          {s.siteId === 'custom' && <CustomCraterNote craters={craters} lat={site.lat} lon={site.lon} terrain={hasTerrain} />}
        </div>
        <div className="field">
          <label htmlFor="date">Target landing</label>
          <div className="utc-input">
            <input id="date" type="datetime-local" value={toInputUTC(s.landing)}
              onChange={(e) => { const ms = fromInputUTC(e.target.value); if (ms) set({ landing: ms }); }} />
            <span className="utc-tag">UTC</span>
          </div>
          <p className="hint small">{fmtUTC(s.landing)}</p>
          <div className="jumps">
            <button onClick={() => shift(-29.53)} title="One lunar day earlier">−1 lunar day</button>
            <button onClick={() => shift(-1)}>−1 d</button>
            <button onClick={() => set({ landing: Math.floor(Date.now() / HOUR) * HOUR })}>Now</button>
            <button onClick={() => shift(1)}>+1 d</button>
            <button onClick={() => shift(29.53)} title="One lunar day later">+1 lunar day</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="slip">Schedule uncertainty</label>
          <select id="slip" value={s.slipDays} onChange={(e) => set({ slipDays: +e.target.value })}>
            {SLIP_OPTIONS.map((d) => <option key={d} value={d}>{d === 0 ? 'None (exact date)' : `± ${d} days`}</option>)}
          </select>
          <label htmlFor="mission">Mission length</label>
          <select id="mission" value={s.missionDays} onChange={(e) => set({ missionDays: +e.target.value })}>
            {[3, 7, 14, 29.53].map((d) => <option key={d} value={d}>{d === 29.53 ? '1 lunar day cycle (29.5 d)' : `${d} days`}</option>)}
          </select>
        </div>
      </section>

      <details className="panel constraints">
        <summary>
          <span className="sum-title">Mission constraints and data options</span>
          <span className="muted small">battery {fmtDur(s.batteryHours)} · max comms gap {fmtDur(s.commsGapHours)} · margin ±{s.marginDeg}° · {s.relay ? 'relay on' : 'no relay'} · {terrainOn ? 'real terrain' : 'smooth Moon'} · {s.ephem === 'live' ? 'live positions' : 'JPL tables'}</span>
        </summary>
        <div className="constraints-grid">
          <label htmlFor="margin" title="A body only counts as up when it is this far above the smooth horizon. Covers the Sun's disc, terrain we don't model yet, and model error.">
            Horizon margin: ±{s.marginDeg}°
          </label>
          <input id="margin" type="range" min="0" max="3" step="0.25" value={s.marginDeg} onChange={(e) => set({ marginDeg: +e.target.value })} />
          <label htmlFor="battery">Battery survives dark for</label>
          <select id="battery" value={s.batteryHours} onChange={(e) => set({ batteryHours: +e.target.value })}>
            {[12, 24, 48, 72, 120, 240].map((h) => <option key={h} value={h}>{fmtDur(h)}</option>)}
          </select>
          <label htmlFor="comms">Max comms gap</label>
          <select id="comms" value={s.commsGapHours} onChange={(e) => set({ commsGapHours: +e.target.value })}>
            {[6, 12, 24, 48, 72, 120].map((h) => <option key={h} value={h}>{fmtDur(h)}</option>)}
          </select>
          <label className="check">
            <input type="checkbox" checked={s.relay} onChange={(e) => set({ relay: e.target.checked })} />
            Assume a relay satellite (comms always covered)
          </label>
          <label className="check" title={hasTerrain ? 'Use the real horizon from NASA LOLA elevation data' : 'Terrain data is only available for the south-polar sites (80–90°S)'}>
            <input type="checkbox" checked={s.terrain} onChange={(e) => set({ terrain: e.target.checked })} />
            Use real terrain (NASA LOLA){!hasTerrain && <span className="muted"> · not available for this site</span>}
          </label>
          <label htmlFor="ephem" title="Where the Sun and Earth positions come from">Sun &amp; Earth positions</label>
          <select id="ephem" value={s.ephem} onChange={(e) => set({ ephem: e.target.value })}>
            <option value="auto">NASA JPL DE421 table (fast), live backup</option>
            <option value="live">Live calculation (astronomy-engine)</option>
          </select>
          <p className="hint small">
            {s.ephem === 'live' ? 'Computing live in your browser.' : ephemStatus.state === 'ready'
              ? `Using the JPL table (agrees with live to ${ephemStatus.check ? ephemStatus.check.maxDiffDeg.toFixed(3) : '0.01'}°).`
              : `${ephemStatus.detail}; using live calculation.`}
            {' '}<a href={horizonsUrl(site, s.landing, s.landing + 24 * 3600e3, '10')} target="_blank" rel="noreferrer">Check the Sun on JPL Horizons</a>
            {' · '}<a href={horizonsUrl(site, s.landing, s.landing + 24 * 3600e3, '399')} target="_blank" rel="noreferrer">Earth</a>
          </p>
        </div>
      </details>

      {/* ---------------- Verdict + numbers | map + sky ---------------- */}
      <section className="grid-2 main">
        <div className="panel">
          <div className={`verdict ${statusClass(v.status)}`}>
            <span className="verdict-badge">{v.status}</span>
            <div>
              <p className="verdict-head">{HEADLINE[v.status]}</p>
              <p className="muted small">{site.name} · landing {fmtUTC(s.landing)} · {s.missionDays === 29.53 ? '29.5' : s.missionDays}-day mission
                <span className="terrain-flag">{terrainOn ? 'Real terrain (LOLA)' : 'Smooth Moon'}</span></p>
            </div>
          </div>
          <ul className="reasons">{v.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {smooth && <SmoothVs smooth={smooth} real={result} />}
          <h3 className="group-head">This mission <span className="muted small">from landing to end of mission ({s.missionDays === 29.53 ? '29.5' : s.missionDays} days)</span></h3>
          <div className="cards">
            <Metric label="Sun elevation at landing" value={`${a.series.sunAlt[i0] >= 0 ? '+' : '−'}${Math.abs(a.series.sunAlt[i0]).toFixed(2)}°`}
              sub={m.sunlitAtStart ? (m.sunset ? `Sunset ${relTime(s.landing, m.sunset)}` : 'No sunset during mission') : (m.sunrise ? `Sunrise ${relTime(s.landing, m.sunrise)}` : 'No sunrise during mission')} tone="sun" />
            <Metric label="Sunlit this mission" value={fmtPct(m.sunlitPct)} sub={`+ ${fmtPct(m.sunMarginalPct)} marginal`} tone="sun" />
            <Metric label="Longest dark stretch" value={fmtDur(m.longestDarkH)} sub={`Battery limit ${fmtDur(s.batteryHours)}`} tone={m.longestDarkH > s.batteryHours ? 'bad' : 'sun'} />
            <Metric label="Earth elevation at landing" value={`${a.series.earthAlt[i0] >= 0 ? '+' : '−'}${Math.abs(a.series.earthAlt[i0]).toFixed(2)}°`}
              sub={m.earthAtStart ? (m.earthset ? `Earthset ${relTime(s.landing, m.earthset)}` : 'No Earthset during mission') : (m.earthrise ? `Earthrise ${relTime(s.landing, m.earthrise)}` : 'Earth never rises')} tone="earth" />
            <Metric label="Earth in view this mission" value={fmtPct(m.earthPct)} sub={`+ ${fmtPct(m.earthMarginalPct)} marginal`} tone="earth" />
            <Metric label="Longest comms gap" value={fmtDur(m.longestCommsGapH)} sub={s.relay ? 'Relay assumed' : `Limit ${fmtDur(s.commsGapHours)}`} tone={!s.relay && m.longestCommsGapH > s.commsGapHours ? 'bad' : 'earth'} />
          </div>
          {terrainOn && <TerrainFacts t={site.terrain} />}
          {sci && <ScienceFacts sci={sci} terrain={site.terrain} />}
        </div>
        <div className="side">
          <div className="panel">
            <h2>Where it is</h2>
            <PolarMap rows={compareRows} currentId={s.siteId} custom={s.siteId === 'custom' ? { lat: site.lat, lon: site.lon } : null}
              onPick={(id) => set({ siteId: id })}
              onPickPoint={(lat, lon) => { setCustomDraft({ lat: String(lat), lon: String(lon) }); setCustomErr(null); set({ siteId: 'custom', customLat: lat, customLon: lon }); }} />
          </div>
          <div className="panel">
            <h2>Sky at {fmtShortUTC(tNow)} UTC</h2>
            <p className="hint">Press play on the time bar at the bottom, or drag across the mission timeline. Lines show the paths of the Sun (solid) and Earth (dashed).</p>
            <SkyDome sun={sun} earth={earth} sunPath={sunPath} earthPath={earthPath} margin={s.marginDeg}
              zoom={zoom} onToggleZoom={() => setZoomPref(!zoom)} terrain={site.terrain} />
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Mission timeline</h2>
        <p className="hint">Elevation of the Sun (gold) and Earth (blue) from landing to end of mission.{terrainOn && ' Grey dashed line = height of the real terrain in the Sun\'s direction: when gold drops below it, the Sun is hidden.'} Lanes: coloured = available, amber = marginal (inside the ±{s.marginDeg}° band), dark = not available.</p>
        <Timeline series={series} i0={i0} i1={i1} margin={s.marginDeg} scrubMs={tNow} onScrub={setScrub} />
      </section>

      <section className="panel">
        <h2>What if the launch slips?</h2>
        <SlipWindow analysis={a} onPick={(t) => set({ landing: t })} />
      </section>

      <section className="panel">
        <h2>Compare sites for this landing date</h2>
        <SiteCompare rows={compareRows} currentId={s.siteId} onPick={(id) => set({ siteId: id })} landing={s.landing} opts={opts} />
      </section>

      <footer className="foot">
        <p><strong>Honest limits:</strong> “Up” means the body's centre is more than ±{s.marginDeg}° above the horizon in its direction.
          For the south-polar sites (south of 80°S) that horizon is real terrain from NASA LOLA elevation data (80 m pixels, observer 2 m above the ground; detail closer than 240 m is not modelled, so the exact landing spot matters).
          Everywhere else it is a smooth lunar sphere, so crater rims and ridges can block a body we show as up. Times are UTC.</p>
        <p>Ephemeris: <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noreferrer">astronomy-engine</a> (MIT) ·
          Moon orientation: IAU WGCCRE 2015 (Archinal et al. 2018) ·
          Terrain: NASA LRO LOLA south-pole maps (<a href="https://pgda.gsfc.nasa.gov/products/90" target="_blank" rel="noreferrer">Barker et al. 2023, PSJ 4, 183</a>) ·
          Ephemeris tables: JPL DE421 (Folkner et al. 2008) via Skyfield ·
          Sunlight and Earth-visibility check: <a href="https://pgda.gsfc.nasa.gov/products/69" target="_blank" rel="noreferrer">NASA PGDA (Mazarico et al. 2011)</a> ·
          Temperatures and ice: <a href="https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/" target="_blank" rel="noreferrer">NASA LRO Diviner</a> ·
          Craters: <a href="https://astrogeology.usgs.gov/search/map/moon_crater_database_v1_robbins" target="_blank" rel="noreferrer">Robbins 2019 (USGS)</a> ·
          Artemis III regions: <a href="https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/" target="_blank" rel="noreferrer">NASA (Oct 2024)</a> · Built with Vite + React.</p>
      </footer>
      <TimeBar t0={series.t[i0]} t1={series.t[i1]} value={tNow} onChange={setScrub} site={site} />
    </div>
  );
}

function Metric({ label, value, sub, tone }) {
  return (
    <div className={`metric ${tone}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {sub && <p className="metric-sub">{sub}</p>}
    </div>
  );
}

function SmoothVs({ smooth, real }) {
  const sm = smooth.metrics, rm = real.metrics;
  const sameVerdict = smooth.verdict.status === real.verdict.status;
  const d = (a, b) => Math.abs(a - b) >= 1;
  const changes = [];
  if (d(sm.sunlitPct, rm.sunlitPct)) changes.push(`sunlight ${fmtPct(sm.sunlitPct)} → ${fmtPct(rm.sunlitPct)}`);
  if (d(sm.longestDarkH, rm.longestDarkH)) changes.push(`longest dark ${fmtDur(sm.longestDarkH)} → ${fmtDur(rm.longestDarkH)}`);
  if (d(sm.earthPct, rm.earthPct)) changes.push(`Earth in view ${fmtPct(sm.earthPct)} → ${fmtPct(rm.earthPct)}`);
  return (
    <p className={`smooth-vs ${sameVerdict ? '' : 'changed'}`}>
      {sameVerdict
        ? <>Same verdict ({real.verdict.status}) with or without real terrain.{changes.length ? <> Terrain changes {changes.join(', ')}.</> : ' The numbers barely move.'}</>
        : <><strong>Terrain changes the answer:</strong> a smooth Moon says <strong>{smooth.verdict.status}</strong>, real terrain says <strong>{real.verdict.status}</strong> ({changes.join(', ')}).</>}
    </p>
  );
}

function TerrainFacts({ t }) {
  const y = t.yearly;
  return (
    <>
      <h3 className="group-head">Over a year at this spot <span className="muted small">our model with real NASA LOLA terrain</span></h3>
      <div className="terrain-facts">
        <Metric label="Sunlit over a year" value={`${Math.round(y.terrainSunPct)}%`} sub={`Smooth Moon would say ${Math.round(y.smoothSunPct)}%`} tone="sun" />
        <Metric label="Earth in view over a year" value={`${Math.round(y.terrainEarthPct)}%`} sub={`Smooth Moon would say ${Math.round(y.smoothEarthPct)}%`} tone="earth" />
        <Metric label="Ground elevation" value={`${t.elevationM >= 0 ? '+' : '−'}${Math.abs(Math.round(t.elevationM)).toLocaleString()} m`} sub="vs 1737.4 km reference sphere" tone="sun" />
        <Metric label="Slope at site" value={`${t.slope.atSiteDeg}°`} sub={`Steepest within 1 km: ${t.slope.maxWithin1kmDeg}°`} tone={t.slope.atSiteDeg > 10 ? 'bad' : 'earth'} />
        <Metric label="Nearest ice trap" value={`${t.nearestIceTrap.distanceKm} km`} sub={`Permanently shadowed region, ${t.nearestIceTrap.areaKm2} km²`} tone="earth" />
      </div>
    </>
  );
}

const cDeg = (k) => `${Math.round(k - 273.15)} °C`;

function ScienceFacts({ sci, terrain }) {
  const n = sci.nasaIllumination, d = sci.diviner, c = sci.craters, y = terrain && terrain.yearly;
  const ice = d && (d.iceDepthM === null ? 'None in top 2.9 m' : d.iceDepthM === 0 ? 'At the surface' : `${d.iceDepthM} m down`);
  return (
    <div className="science">
      <h3 className="group-head">NASA's independent check <span className="muted small">NASA Goddard maps, LRO Diviner, USGS craters</span></h3>
      <div className="terrain-facts">
        {n && <Metric label="NASA map: sunlit (long-term)" value={`${Math.round(n.sunPct)}%`}
          sub={`${y ? `vs our ${Math.round(y.terrainSunPct)}% above. ` : ''}NASA 18.6-yr average; within 180 m: ${Math.round(n.sunRangePct[0])}–${Math.round(n.sunRangePct[1])}%`} tone="sun" />}
        {n && <Metric label="NASA map: Earth in view (long-term)" value={`${Math.round(n.earthPct)}%`}
          sub={`${y ? `vs our ${Math.round(y.terrainEarthPct)}% above. ` : ''}Within 180 m: ${Math.round(n.earthRangePct[0])}–${Math.round(n.earthRangePct[1])}%`} tone="earth" />}
        {d && <Metric label="Water ice (Diviner)" value={ice}
          sub={d.nearestIceWithin1mKm !== null ? `Ice within 1 m of the surface: ${d.nearestIceWithin1mKm} km away · ${d.icePctWithin5km}% of ground within 5 km` : 'No shallow ice within 15 km'} tone="earth" />}
        {d && <Metric label="Ground temperature (Diviner)" value={`avg ${cDeg(d.tempAvgK)}`} sub={`Yearly maximum ${cDeg(d.tempMaxK)}`} tone="sun" />}
        {c && <Metric label="Craters ≥ 1 km within 5 km" value={`${c.countAtLeast1kmWithin5km}`}
          sub={`${c.insideCrater ? `Inside a ${c.insideCrater.diamKm} km crater · ` : ''}nearest crater rim ${c.nearestRimKm} km (Robbins 2019)`} tone={c.nearestRimKm < 0.3 ? 'bad' : 'earth'} />}
      </div>
      <p className="hint small">NASA's map is an independent check made by NASA Goddard with a different method and time span, so a few % difference is expected; a big gap means the exact spot sits on a steep edge where a few hundred metres matters.</p>
    </div>
  );
}

function CustomCraterNote({ craters, lat, lon, terrain }) {
  const near = useMemo(() => cratersNear(craters, lat, lon), [craters, lat, lon]);
  if (!craters) return <p className="hint small">Loading the Robbins crater database (USGS)…</p>;
  if (!near) return null;
  const inside = near.inside[0];
  return (
    <p className={`hint small ${inside ? 'warn' : ''}`}>
      {inside ? <><strong>Inside a {inside.diamKm} km crater</strong> ({inside.distKm} km from its centre). </> : 'Not inside any crater 3 km or larger. '}
      {near.nearby} crater rims within 10 km; nearest rim {near.nearestRimKm} km away (Robbins 2019, craters ≥ 3 km).
      {!terrain && ' No terrain model here, so crater walls can hide the Sun or Earth.'}
    </p>
  );
}

function About() {
  return (
    <section className="panel about">
      <h2>How it works</h2>
      <ol>
        <li><strong>Positions.</strong> For each time, we compute where the Sun and Earth sit in the sky at the site (elevation above the horizon, compass direction), using the IAU model of the Moon's orientation, including its wobble (libration).</li>
        <li><strong>Windows.</strong> We sample every hour of the mission and find when the Sun is up (power) and Earth is up (direct radio link).</li>
        <li><strong>Real terrain.</strong> At the south pole the Sun and Earth skim the horizon, so hills decide everything. For the polar sites we use NASA's LOLA laser-altimeter elevation map to find how high the terrain rises in every compass direction, and a body only counts as up when it clears that.</li>
        <li><strong>Margin.</strong> Near the horizon we don't trust a yes/no answer, so anything within ±margin of the horizon is “marginal” and is not counted as available.</li>
        <li><strong>Verdict.</strong> Power is the deal-breaker: if the longest dark stretch is longer than the battery can survive, it's NO-GO. Comms gaps can be fixed with a relay satellite, so they give CAUTION.</li>
        <li><strong>Slip window.</strong> We repeat everything for every possible landing time in your uncertainty window and recommend the strongest dates.</li>
      </ol>
      <h3>Data sources</h3>
      <ul className="sources">
        <li><strong>Terrain, slope, ice traps:</strong> NASA LRO LOLA south-pole maps, 80 m (Barker et al. 2023, PSJ 4, 183) · <a href="https://pgda.gsfc.nasa.gov/products/90" target="_blank" rel="noreferrer">NASA PGDA</a></li>
        <li><strong>Sunlight and Earth-visibility check:</strong> {SCIENCE_SOURCES.nasaIllumination}</li>
        <li><strong>Temperature and ice depth:</strong> {SCIENCE_SOURCES.diviner}</li>
        <li><strong>Craters:</strong> {SCIENCE_SOURCES.craters}</li>
        <li><strong>Sun and Earth positions:</strong> JPL DE421 planetary and lunar ephemeris (Folkner et al. 2008, via Skyfield) with astronomy-engine as the live backup; spot checks on <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">JPL Horizons</a></li>
        <li><strong>Artemis III regions:</strong> <a href="https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/" target="_blank" rel="noreferrer">NASA, 28 Oct 2024</a>. NASA does not publish exact points, so each preset is the sunniest spot with slope under 8° in that region's area, picked with NASA data (search area listed under each site).</li>
      </ul>
      <h3>Site sources</h3>
      <ul className="sources">
        {SITES.map((x) => <li key={x.id}><strong>{x.name}</strong>: <a href={x.url} target="_blank" rel="noreferrer">{x.source}</a></li>)}
      </ul>
    </section>
  );
}
