import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SITES, DEFAULT_SITE_ID, siteById, validateLatLon, normLon } from './engine/sites.js';
import { PLACES, PLACE_GROUPS, placeById } from './places.js';
import { analyzeSite, compareSites, DEFAULTS } from './engine/analysis.js';
import { withTerrain, terrainFor } from './engine/terrain.js';
import { pointFacts, inTileCoverage } from './engine/pointData.js';
import LandingSim from './components/LandingSim.jsx';
import TeamReview from './components/TeamReview.jsx';
import { scienceFor, SCIENCE_SOURCES, loadCraters, cratersNear } from './engine/science.js';
import { loadTable, getStatus, horizonsUrl } from './engine/ephemerisStore.js';
import { skyAt, setEphemerisMode } from './engine/lunarSky.js';
import SkyDome from './components/SkyDome.jsx';
import Timeline from './components/Timeline.jsx';
import SlipWindow from './components/SlipWindow.jsx';
import SiteCompare from './components/SiteCompare.jsx';
import PolarMap from './components/PolarMap.jsx';
// 3D globe (three.js) is its own chunk: it only downloads when the 3D view is shown.
const MoonGlobe = lazy(() => import('./components/MoonGlobe.jsx'));
import TimeBar from './components/TimeBar.jsx';
import { fmtUTC, fmtShortUTC, fmtDur, fmtPct, fmtLat, fmtLon, toInputUTC, fromInputUTC, relTime, HOUR, DAY } from './format.js';

const SLIP_OPTIONS = [0, 3, 7, 14, 30, 90];
// One page, five views. Everything stays mounted (results and inputs are kept); only the selected view is shown.
const TABS = [
  { id: 'answer', label: 'Answer' },
  { id: 'timeline', label: 'Timeline & launch slips' },
  { id: 'landing', label: 'Landing simulation' },
  { id: 'team', label: 'Team review' },
  { id: 'compare', label: 'Compare sites' },
];

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
    gateway: p.get('gw') === '1',
    gwEpoch: p.has('gwe') ? Date.parse(p.get('gwe')) : NaN,
    map: p.get('map') === 'polar' ? 'polar' : 'globe',
    place: p.get('place') || null,
    tab: TABS.some((t) => t.id === p.get('tab')) ? p.get('tab') : 'answer',
    role: ROLES.some((r) => r.id === p.get('role')) ? p.get('role') : 'planner',
  };
}
function writeHash(s) {
  const p = new URLSearchParams();
  p.set('site', s.siteId);
  if (s.siteId === 'custom') { p.set('lat', s.customLat); p.set('lon', s.customLon); if (s.place) p.set('place', s.place); }
  p.set('t', new Date(s.landing).toISOString().slice(0, 16) + 'Z');
  p.set('slip', s.slipDays); p.set('mission', s.missionDays); p.set('margin', s.marginDeg);
  p.set('battery', s.batteryHours); p.set('comms', s.commsGapHours);
  if (s.relay) p.set('relay', '1');
  if (!s.terrain) p.set('terrain', '0');
  if (s.ephem === 'live') p.set('ephem', 'live');
  if (s.map === 'polar') p.set('map', 'polar');
  if (s.tab && s.tab !== 'answer') p.set('tab', s.tab);
  if (s.role && s.role !== 'planner') p.set('role', s.role);
  if (s.gateway) { p.set('gw', '1'); if (Number.isFinite(s.gwEpoch)) p.set('gwe', new Date(s.gwEpoch).toISOString().slice(0, 16) + 'Z'); }
  window.history.replaceState(null, '', `#${p.toString()}`);
}

const statusClass = (s) => (s === 'GO' ? 'go' : s === 'CAUTION' ? 'caution' : 'nogo');
const HEADLINE = {
  GO: 'Power and direct comms both hold for the whole mission.',
  CAUTION: 'Power holds, but direct-to-Earth comms has long gaps.',
  'NO-GO': 'Not enough sunlight: the lander would run out of battery.',
};

const STAY_OPTIONS = [7, 14];

// Role views: each person sees only what their job needs (Hick's law, progressive disclosure).
// Names follow the Team review teams. Presentation only: every role reads the same engine result.
const ROLES = [
  { id: 'planner', label: 'Mission planner', desc: 'The overall answer, the three numbers that decide it, and the tools to compare sites and dates.', tabs: ['answer', 'timeline', 'compare', 'team'] },
  { id: 'power', label: 'Power', desc: 'Sunlight on the solar panels and how long the battery must cover darkness.', tabs: ['answer', 'timeline'] },
  { id: 'comms', label: 'Comms', desc: 'When Earth is above the horizon for a direct-to-Earth (DTE) radio link, and the longest gap.', tabs: ['answer', 'timeline'] },
  { id: 'landing', label: 'Landing (GNC)', desc: 'Ground at the touchdown point and the 1,000-touchdown landing simulation.', tabs: ['answer', 'landing'] },
  { id: 'hazards', label: 'Hazards', desc: 'Slope, craters, permanent shadow and ground temperature around the site.', tabs: ['answer', 'landing'] },
];
const roleById = (id) => ROLES.find((r) => r.id === id) || ROLES[0];
// Hick's law: a short list first, everything else one click away.
const FEATURED = ['connecting-ridge', 'shackleton-rim', 'malapert-massif', 'nobile-rim-1', 'haworth'];

export default function App() {
  const [s, setS] = useState(readHash);
  const set = useCallback((patch) => setS((old) => ({ ...old, ...patch })), []);
  const [scrub, setScrub] = useState(null);
  const [stayCustom, setStayCustom] = useState(() => !STAY_OPTIONS.includes(s.missionDays));
  const [zoomPref, setZoomPref] = useState(null);
  const [customDraft, setCustomDraft] = useState({ lat: String(s.customLat), lon: String(s.customLon) });
  const [customErr, setCustomErr] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [allSites, setAllSites] = useState(() => !FEATURED.includes(s.siteId));
  const role = roleById(s.role);
  const tabs = TABS.filter((t) => role.tabs.includes(t.id));
  const tab = role.tabs.includes(s.tab) ? s.tab : 'answer';

  useEffect(() => writeHash(s), [s]);
  const [ephemTick, setEphemTick] = useState(0);
  const [craters, setCraters] = useState(null);
  useEffect(() => setScrub(null), [s.landing, s.siteId, s.missionDays]);

  // A named place (places.js) is a custom point with a name and a source; same engine path as a map click.
  const place = s.siteId === 'custom' && s.place ? placeById(s.place) : null;
  const baseSite = s.siteId === 'custom'
    ? (place
      ? { id: 'custom', name: place.name, group: place.group, lat: s.customLat, lon: s.customLon, url: place.url, source: place.source, note: place.note || (place.source.startsWith('IAU') ? 'Feature centre from the IAU gazetteer: a reference point, not a chosen landing spot.' : undefined) }
      : { id: 'custom', name: `Custom (${fmtLat(s.customLat)}, ${fmtLon(s.customLon)})`, group: 'Custom', lat: s.customLat, lon: s.customLon })
    : siteById(s.siteId) || siteById(DEFAULT_SITE_ID);
  const isCustom = s.siteId === 'custom';
  const covered = inTileCoverage(baseSite.lat, baseSite.lon);
  const hasTerrain = isCustom ? covered : !!terrainFor(baseSite.id);
  // Any point inside the NASA 80 S LOLA map: compute terrain horizon, slope and NASA facts on the fly from the data tiles.
  const [live, setLive] = useState(null);
  const liveKey = `${baseSite.lat},${baseSite.lon}`;
  useEffect(() => {
    if (!isCustom || !covered) { setLive(null); return undefined; }
    let ok = true;
    setLive({ key: liveKey, loading: true });
    pointFacts(baseSite.lat, baseSite.lon)
      .then((f) => { if (ok) setLive({ key: liveKey, ...f }); })
      .catch((e) => { if (ok) setLive({ key: liveKey, error: e.message }); });
    return () => { ok = false; };
  }, [isCustom, covered, liveKey]);
  const liveReady = !!(live && live.terrain && live.key === liveKey);
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
  const sciNow = isCustom ? (liveReady ? live.science : null) : scienceFor(baseSite.id);
  const siteNow = isCustom ? (s.terrain && liveReady ? { ...baseSite, terrain: live.terrain } : baseSite) : withTerrain(baseSite, s.terrain);
  // Presentation only: while NASA terrain for a newly picked point is still loading, keep showing the last finished
  // result (dimmed, with a "calculating" note) instead of a temporary smooth-Moon answer with the terrain panels
  // removed. That temporary state made the verdict flicker and the page collapse and re-grow (the "jerk").
  // The engine is called with exactly the same inputs as before once the terrain arrives.
  const liveFailed = !!(live && live.key === liveKey && live.error);
  const pending = isCustom && covered && s.terrain && !liveReady && !liveFailed;
  const shownRef = useRef(null);
  const shownKey = `${s.siteId}|${liveKey}|${s.terrain}|${liveReady}|${liveFailed}`;
  if ((!pending && (!shownRef.current || shownRef.current.key !== shownKey)) || !shownRef.current)
    shownRef.current = { site: siteNow, base: baseSite, sci: sciNow, id: s.siteId, key: shownKey };
  const updating = pending;
  const { site, sci } = shownRef.current;
  const shownBase = shownRef.current.base;
  const terrainOn = !!site.terrain;
  // Ground facts (slope, elevation, shadow) don't depend on the Smooth/Real horizon switch, so roles that need them always get them.
  const groundT = site.terrain || (site.id === 'custom' ? (liveReady ? live.terrain : null) : (withTerrain(shownBase, true).terrain || null));
  const shownHasTerrain = site.id === 'custom' ? inTileCoverage(site.lat, site.lon) : !!terrainFor(site.id);

  const opts = useMemo(() => ({
    slipDays: s.slipDays, missionDays: s.missionDays, marginDeg: s.marginDeg,
    batteryHours: s.batteryHours, commsGapHours: s.commsGapHours, relay: s.relay,
    ...(s.gateway ? { descentPeriodDays: 6.5, descentEpochMs: Number.isFinite(s.gwEpoch) ? s.gwEpoch : s.landing } : {}),
  }), [s.slipDays, s.missionDays, s.marginDeg, s.batteryHours, s.commsGapHours, s.relay, s.gateway, s.gwEpoch, s.landing]);
  const deps = [site.lat, site.lon, s.landing, s.slipDays, s.missionDays, s.marginDeg, s.batteryHours, s.commsGapHours, s.relay, terrainOn, s.ephem, ephemTick, s.gateway, s.gwEpoch];
  const a = useMemo(() => analyzeSite(site, s.landing, opts), deps);
  // Same question on a smooth Moon, so planners see what terrain changes (only when terrain is on).
  const smooth = useMemo(() => (terrainOn ? analyzeSite(shownBase, s.landing, { ...opts, slipDays: 0 }).result : null), deps);
  const compareRows = useMemo(() => compareSites(
    (site.id === 'custom' ? [...SITES.map((x) => withTerrain(x, s.terrain)), site] : SITES.map((x) => withTerrain(x, s.terrain))), s.landing, opts),
  [...deps, shownRef.current.id]);

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
    if (!err) set({ siteId: 'custom', customLat: lat, customLon: normLon(lon), place: null });
  };
  const shift = (days) => set({ landing: s.landing + days * DAY });
  // The locked demo (README / video): Connecting ridge, 2026-11-15 21:00 UTC, default settings, starting on the smooth Moon.
  const backToDemo = () => {
    setCustomErr(null);
    set({ tab: 'answer', role: 'planner', siteId: 'connecting-ridge', place: null, landing: Date.parse('2026-11-15T21:00:00Z'), terrain: false,
      slipDays: DEFAULTS.slipDays, missionDays: DEFAULTS.missionDays, marginDeg: DEFAULTS.marginDeg, batteryHours: DEFAULTS.batteryHours,
      commsGapHours: DEFAULTS.commsGapHours, relay: false, gateway: false, ephem: 'auto' });
    setStayCustom(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  useEffect(() => { if (s.siteId !== 'custom') { setCustomDraft({ lat: String(baseSite.lat), lon: String(baseSite.lon) }); setCustomErr(null); } }, [s.siteId]);
  const pickPoint = useCallback((lat, lon) => { setCustomDraft({ lat: String(lat), lon: String(lon) }); setCustomErr(null); set({ siteId: 'custom', customLat: lat, customLon: lon, place: null }); }, [set]);
  const pickSite = useCallback((id) => set({ siteId: id, place: null }), [set]);
  const onSiteSelect = (v) => {
    if (v.startsWith('place:')) {
      const pl = placeById(v.slice(6));
      if (pl) { setCustomDraft({ lat: String(pl.lat), lon: String(pl.lon) }); setCustomErr(null); set({ siteId: 'custom', customLat: pl.lat, customLon: pl.lon, place: pl.id }); }
    } else set({ siteId: v, place: null });
  };
  const pickTime = useCallback((t) => set({ landing: t }), [set]);
  const simPick = useCallback((lat, lon) => { pickPoint(lat, lon); set({ tab: 'answer' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [pickPoint, set]);
  const teamLoad = useCallback((x) => { if (x.id === 'custom') return; set({ siteId: x.id, place: null, tab: 'answer' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [set]);
  const teamSites = useMemo(() => [...SITES.filter((x) => inTileCoverage(x.lat, x.lon)), ...(site.id === 'custom' && inTileCoverage(site.lat, site.lon) ? [shownBase] : [])], [site, shownBase]);
  const statusById = useMemo(() => Object.fromEntries(compareRows.map((r) => [r.site.id, r.verdict.status])), [compareRows]);

  return (
    <div className="app">
      <header className="top">
        <div>
          <p className="eyebrow">NASA Space Apps 2026 · Team Critical Load</p>
          <h1>Lunar Landing Site Navigator</h1>
          <p className="tagline">Pick a site and a landing date. Get GO, CAUTION or NO-GO for sunlight (power) and a radio link to Earth.</p>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={backToDemo} title="Connecting ridge, 15 Nov 2026 21:00 UTC, starting on the smooth Moon">Back to demo</button>
          <button className="ghost" onClick={() => window.print()} title="Print or save this scenario as a PDF">Print / PDF</button>
          <button className="ghost" onClick={() => setShowAbout((x) => !x)}>{showAbout ? 'Close' : 'How it works'}</button>
        </div>
      </header>

      {showAbout && <About />}

      {/* ---------------- Controls ---------------- */}
      {/* ---------------- What and when (verdict comes right after) ---------------- */}
      <section className="panel topbar">
        <div className="field site-field">
          <label htmlFor="site"><span className="step">1</span>Landing site</label>
          <select id="site" value={place ? `place:${place.id}` : s.siteId} onChange={(e) => { if (e.target.value === 'more') setAllSites(true); else onSiteSelect(e.target.value); }}>
            {!allSites ? <>
              <optgroup label="Main south-pole sites">
                {FEATURED.map((id) => siteById(id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </optgroup>
              {!FEATURED.includes(s.siteId) && <option value={place ? `place:${place.id}` : s.siteId}>{baseSite.name}</option>}
              <option value="more">More sites and named places…</option>
            </> : <>
            {['South pole', 'Artemis III regions', 'Other sites'].map((g) => (
              <optgroup key={g} label={g}>
                {SITES.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </optgroup>
            ))}
            {PLACE_GROUPS.map((g) => (
              <optgroup key={g} label={`Named places: ${g.toLowerCase()}`}>
                {PLACES.filter((x) => x.group === g).map((x) => <option key={x.id} value={`place:${x.id}`}>{x.name}</option>)}
              </optgroup>
            ))}
            <option value="custom">Custom coordinates…</option>
            </>}
          </select>
          {allSites && <button type="button" className="linkish" onClick={() => setAllSites(false)}>Show main sites only</button>}
          <p className="site-meta">
            {fmtLat(baseSite.lat)}, {fmtLon(baseSite.lon)}
            {baseSite.url && <> · <a href={baseSite.url} target="_blank" rel="noreferrer">source</a></>}
            {baseSite.note && <span className="muted"> · {baseSite.note}</span>}
          </p>
          {/* Always shown (not only for "Custom"), so the top bar keeps one height and nothing below it jumps. */}
          <form className="custom" onSubmit={(e) => { e.preventDefault(); applyCustom(); }}>
            <span className="custom-label">Or any point:</span>
            <input aria-label="Latitude (degrees, south negative)" inputMode="decimal" value={customDraft.lat} onChange={(e) => setCustomDraft({ ...customDraft, lat: e.target.value })} placeholder="lat (−90…90)" />
            <input aria-label="Longitude (degrees east)" inputMode="decimal" value={customDraft.lon} onChange={(e) => setCustomDraft({ ...customDraft, lon: e.target.value })} placeholder="lon (°E)" />
            <button type="submit">Use</button>
            {customErr && <span className="error">{customErr}</span>}
          </form>
          <small className="field-help">Latitude −90 to 90 (south negative), longitude −180 to 180 °E, e.g. −89.45, −137.3.</small>
        </div>
        <div className="field">
          <label htmlFor="date"><span className="step">2</span>Landing date and time</label>
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
          <label htmlFor="mission"><span className="step">3</span>Surface stay <Tip text="How long the lander must work on the surface. NASA requires the site to stay lit and in view of Earth for the whole stay but publishes no stay length for Artemis III, so the mission team sets it." /></label>
          <select id="mission" value={stayCustom ? 'custom' : s.missionDays}
            onChange={(e) => { if (e.target.value === 'custom') setStayCustom(true); else { setStayCustom(false); set({ missionDays: +e.target.value }); } }}>
            {STAY_OPTIONS.map((d) => <option key={d} value={d}>{d === 7 ? '7 days (default)' : `${d} days (stricter)`}</option>)}
            <option value="custom">Custom…</option>
          </select>
          {stayCustom && <input id="mission-custom" type="number" min="0.5" max="30" step="0.5" value={s.missionDays} aria-label="Custom surface stay in days"
            onChange={(e) => { const v = +e.target.value; if (v >= 0.5 && v <= 30) set({ missionDays: v }); }} />}
          <label htmlFor="slip">Launch date uncertainty <Tip text="If the landing date can slip, the app checks every date in this window (Timeline tab)." /></label>
          <select id="slip" value={s.slipDays} onChange={(e) => set({ slipDays: +e.target.value })}>
            {SLIP_OPTIONS.map((d) => <option key={d} value={d}>{d === 0 ? 'None (exact date)' : `± ${d} days`}</option>)}
          </select>
        </div>
      </section>

      <details className="panel constraints">
        <summary>
          <span className="sum-title">Advanced settings</span>
          <span className="muted small">Horizon margin, Gateway descent windows, data source for Sun and Earth positions</span>
        </summary>
        <div className="constraints-grid">
          <label htmlFor="margin" title="A body only counts as up when it is this far above the smooth horizon. Covers the Sun's disc, terrain we don't model yet, and model error.">
            Horizon margin: ±{s.marginDeg}°
          </label>
          <input id="margin" type="range" min="0" max="3" step="0.25" value={s.marginDeg} onChange={(e) => set({ marginDeg: +e.target.value })} />
          <label className="check" title="NASA's Artemis III overview: with Gateway in its near-rectilinear halo orbit, a descent to the surface is possible about once every 6.5 days">
            <input type="checkbox" checked={s.gateway} onChange={(e) => set({ gateway: e.target.checked })} />
            Only Gateway descent opportunities (NASA: one every ~6.5 days)
          </label>
          {s.gateway && <>
            <label htmlFor="gwe">One descent opportunity at (UTC)</label>
            <input id="gwe" type="datetime-local" value={new Date(Number.isFinite(s.gwEpoch) ? s.gwEpoch : s.landing).toISOString().slice(0, 16)}
              onChange={(e) => { const t = Date.parse(e.target.value + 'Z'); if (Number.isFinite(t)) set({ gwEpoch: t }); }} />
            <p className="hint small">The orbit's timing isn't public, so you set one opportunity; the slip scan and date suggestions then only use opportunities every 6.5 days from it.</p>
          </>}
          <label className="check" title={hasTerrain ? 'Use the real horizon from NASA LOLA elevation data' : 'Terrain data covers the NASA LOLA south-polar map (about 80–90°S)'}>
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

      <section className="rolebar" aria-label="Your role">
        <div className="rolebar-row">
          <span className="rolebar-label">Show me the view for</span>
          <div className="seg role-seg" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <button key={r.id} role="radio" aria-checked={role.id === r.id} className={role.id === r.id ? 'on' : ''} onClick={() => set({ role: r.id })}>{r.label}</button>
            ))}
          </div>
        </div>
        <p className="rolebar-desc">{role.desc}</p>
      </section>

      {tabs.length > 1 && <nav className="tabs" role="tablist" aria-label="Views">
        {tabs.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`view-${t.id}`}
            className={tab === t.id ? 'on' : ''} onClick={() => set({ tab: t.id })}>{t.label}</button>
        ))}
      </nav>}

      {/* ---------------- Answer: verdict + numbers | map + sky ---------------- */}
      <div role="tabpanel" id="view-answer" aria-labelledby="tab-answer" hidden={tab !== 'answer'}>
      <section className="grid-2 main">
        <div className={`panel results ${updating ? 'is-updating' : ''}`} aria-busy={updating}>
          {updating && <p className="updating-note" role="status"><span className="spinner" aria-hidden="true" />Calculating real NASA terrain for {fmtLat(baseSite.lat)}, {fmtLon(baseSite.lon)}…</p>}
          <div className={`verdict ${statusClass(v.status)}`}>
            <span className="verdict-badge" key={v.status}><VerdictIcon status={v.status} />{v.status}</span>
            <div>
              <p className="verdict-head">{HEADLINE[v.status]}</p>
              <p className="muted small">{site.name} · landing {fmtUTC(s.landing)} · {s.missionDays === 29.53 ? '29.5' : s.missionDays}-day mission
                <span className="terrain-flag">{terrainOn ? 'Real terrain (LOLA)' : 'Smooth Moon'}</span></p>
            </div>
          </div>
          {hasTerrain && (
            <div className="terrain-switch" role="group" aria-label="Horizon model">
              <button className={!s.terrain ? 'on' : ''} aria-pressed={!s.terrain} onClick={() => set({ terrain: false })}>Smooth Moon</button>
              <button className={s.terrain ? 'on' : ''} aria-pressed={s.terrain} onClick={() => set({ terrain: true })}>Real NASA terrain</button>
            </div>
          )}
          {!shownHasTerrain && (
            <div className="notice" role="note">
              <strong>No NASA terrain data for this place.</strong> This answer is calculated on a smooth Moon, so hills and crater walls that could block the Sun or Earth are not included. Real NASA terrain (LRO LOLA) covers only the south pole, about 80–90°S.
            </div>
          )}
          {site.id === 'custom' && <div className="point-notes">
            <CustomCraterNote craters={craters} lat={site.lat} lon={site.lon} terrain={inTileCoverage(site.lat, site.lon)} />
            {liveFailed && !updating && <p className="hint small warn">Couldn't load NASA terrain here: {live.error}. Showing the smooth Moon.</p>}
          </div>}
          {smooth && <SmoothVs smooth={smooth} real={result} />}
          <RoleView role={role.id} a={a} m={m} v={v} s={s} set={set} i0={i0} terrainOn={terrainOn} t={site.terrain} sci={sci}
            ground={groundT} openLanding={() => set({ tab: 'landing' })} inCoverage={inTileCoverage(site.lat, site.lon)} />
        </div>
        <div className="side">
          <div className="panel where">
            <div className="where-head">
              <div><h2>Where it is</h2><p className="hint small sec-desc">Click a dot to pick a site, or click the map for any point.</p></div>
              <div className="seg map-tabs" role="tablist" aria-label="Map type">
                <button role="tab" aria-selected={s.map === 'globe'} className={s.map === 'globe' ? 'on' : ''} onClick={() => set({ map: 'globe' })}>3D Moon</button>
                <button role="tab" aria-selected={s.map === 'polar'} className={s.map === 'polar' ? 'on' : ''} onClick={() => set({ map: 'polar' })}>South pole map</button>
              </div>
            </div>
            {s.map === 'globe'
              ? <Suspense fallback={<div className="globe-box globe-loading"><p className="hint">Loading the 3D Moon…</p></div>}>
                  <MoonGlobe sites={SITES} statusById={statusById} currentId={s.siteId}
                    custom={s.siteId === 'custom' ? { lat: baseSite.lat, lon: baseSite.lon, name: place ? place.name : null } : null}
                    onPick={pickSite} onPickPoint={pickPoint} />
                </Suspense>
              : <PolarMap rows={compareRows} currentId={s.siteId} custom={s.siteId === 'custom' ? { lat: baseSite.lat, lon: baseSite.lon } : null}
                  onPick={pickSite} onPickPoint={pickPoint} />}
          </div>
          {!['landing', 'hazards'].includes(role.id) && <div className="panel">
            <h2>Sky at {fmtShortUTC(tNow)} UTC</h2>
            <p className="hint">{role.id === 'power' ? 'Where the Sun is against the real hills.' : role.id === 'comms' ? 'Where Earth is against the real hills.' : 'Where the Sun (solid line) and Earth (dashed) move during the stay.'} Press play on the time bar to move through time.</p>
            <SkyDome sun={sun} earth={earth} sunPath={sunPath} earthPath={earthPath} margin={s.marginDeg}
              zoom={zoom} onToggleZoom={() => setZoomPref(!zoom)} terrain={site.terrain} />
          </div>}
        </div>
      </section>

      </div>

      <div role="tabpanel" id="view-landing" aria-labelledby="tab-landing" hidden={tab !== 'landing'}>
        {inTileCoverage(site.lat, site.lon)
          ? <LandingSim site={site} landing={s.landing} appOpts={opts} onPickPoint={simPick} />
          : <section className="panel"><h2>Landing simulation</h2>
              <p className="hint">The 1,000-touchdown simulation checks slope, shadow and horizon at every touchdown point on NASA LOLA terrain, which exists only at the south pole (about 80–90°S).
                {' '}{site.name} is outside that map. Pick a south-pole site, or click inside the dashed 80°S ring on the 3D Moon.</p></section>}
      </div>

      <div role="tabpanel" id="view-team" aria-labelledby="tab-team" hidden={tab !== 'team'}>
        <TeamReview stayDays={s.missionDays} sites={teamSites} landing={s.landing} marginDeg={s.marginDeg} onLoad={teamLoad} />
      </div>

      <div role="tabpanel" id="view-timeline" aria-labelledby="tab-timeline" hidden={tab !== 'timeline'}>
      <section className="panel">
        <h2>Mission timeline</h2>
        <p className="hint">Elevation of the Sun (gold) and Earth (blue) from landing to end of mission.{terrainOn && ' Grey dashed line = height of the real terrain in the Sun\'s direction: when gold drops below it, the Sun is hidden.'} Lanes: coloured = available, amber = marginal (inside the ±{s.marginDeg}° band), dark = not available.</p>
        <div className="chart-scroll"><Timeline series={series} i0={i0} i1={i1} margin={s.marginDeg} scrubMs={tNow} onScrub={setScrub} /></div>
        <p className="hint small chart-scroll-hint">Swipe sideways to see the whole mission.</p>
      </section>

      <section className="panel">
        <h2>What if the launch slips?</h2>
        <SlipWindow analysis={a} onPick={pickTime} />
      </section>
      </div>

      <div role="tabpanel" id="view-compare" aria-labelledby="tab-compare" hidden={tab !== 'compare'}>
      <section className="panel">
        <h2>Compare sites for this landing date</h2>
        <SiteCompare rows={compareRows} currentId={s.siteId} onPick={pickSite} landing={s.landing} opts={opts} />
      </section>
      </div>

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
          Artemis III regions: <a href="https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/" target="_blank" rel="noreferrer">NASA (Oct 2024)</a> · Built with Vite + React ·
          Type and colour: <a href="https://www.nasa.gov/nasa-brand-center/brand-guidelines/" target="_blank" rel="noreferrer">NASA Brand Center</a> web typefaces (Inter, Public Sans, DM Mono) and Horizon colour tokens. Not a NASA product; no NASA insignia used.</p>
      </footer>
      <TimeBar t0={series.t[i0]} t1={series.t[i1]} value={tNow} onChange={setScrub} site={site} />
    </div>
  );
}

// Presentation only: words for the "elevation at landing" cards, built from numbers the engine already returns
// (clearance above the horizon in the body's direction, and the window start/end from sliceMetrics).
// "Up" uses the same rule as the verdict: clearance above +margin. Inside +/-margin is the uncertainty band.
const signedDeg = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}°`;
function windowNote({ body, clear, margin, terrain, upAtStart, end, start, landing }) {
  const hor = terrain ? 'terrain' : 'horizon';
  const where = clear > margin ? `${clear.toFixed(2)}° clear of the ${hor}`
    : clear >= -margin ? `inside the ±${margin}° band at the ${hor}`
    : terrain ? `hidden ${(-clear).toFixed(2)}° behind terrain` : 'below the horizon';
  const next = upAtStart
    ? (end ? `drops into the ±${margin}° band ${relTime(landing, end)}` : 'stays up all mission')
    : (start ? `confidently up ${relTime(landing, start)}` : 'never confidently up this mission');
  return `${body} ${where}; ${next}`;
}

// One-line help for jargon, shown from a "?" next to the label (hover, focus or tap).
const HELP = {
  'Sun elevation at landing': 'Angle of the Sun above the local horizon at touchdown. With real terrain it is measured against the hills in the Sun\'s direction.',
  'Solar illumination this stay': 'Share of the surface stay with the Sun confidently above the horizon (beyond the ± margin). Power depends on this.',
  'Longest continuous darkness': 'Longest unbroken time without sunlight during the stay (NASA Glenn power studies call this “continuous darkness”). If it is longer than the battery can cover, the verdict is NO-GO.',
  'Earth elevation at landing': 'Angle of Earth above the local horizon at touchdown. Direct radio to Earth needs Earth in view.',
  'DTE visibility this stay': 'Share of the stay with Earth above the horizon, so a direct-to-Earth (DTE) radio link is possible.',
  'Longest DTE gap': 'Longest unbroken time with Earth hidden, so no direct-to-Earth link. A relay satellite would cover these gaps.',
  'Solar illumination over a year': 'Share of one year the Sun clears the real terrain here, from our model with NASA LOLA elevation.',
  'DTE visibility over a year': 'Share of one year Earth clears the real terrain here.',
  'Ground elevation': 'Height of the ground above the Moon\'s 1737.4 km reference sphere (NASA LOLA).',
  'Slope at site': 'Steepness of the ground at the point, from NASA LOLA. Landers have a maximum slope they can stand on (often about 8–12°).',
  'Nearest ice trap': 'Distance to the nearest permanently shadowed region (PSR): ground that never sees the Sun and can hold water ice.',
  'Nearest permanent shadow': 'Distance to the nearest permanently shadowed region (PSR) on NASA\'s LPSR map. PSRs are very cold and can trap water ice.',
  'NASA map: sunlit (long-term)': 'NASA Goddard\'s 18.6-year average sunlight at this spot (Mazarico et al. 2011): an independent check on our numbers.',
  'NASA map: Earth in view (long-term)': 'NASA Goddard\'s long-term average Earth visibility at this spot: an independent check.',
  'Water ice (Diviner)': 'Depth where water ice would stay frozen, from LRO Diviner temperatures. Shallower ice is easier to reach.',
  'Ground temperature (Diviner)': 'Surface temperature measured by NASA LRO\'s Diviner instrument. Report only: NASA publishes no limit.',
  'Craters ≥ 1 km within 5 km': 'Number of craters at least 1 km wide nearby (Robbins 2019 USGS catalogue): a rough measure of rough ground.',
};
export function Tip({ text }) {
  if (!text) return null;
  return <span className="tip" tabIndex={0} role="note" aria-label={text} data-tip={text}>?</span>;
}

function Metric({ label, value, sub, tone }) {
  return (
    <div className={`metric ${tone}`}>
      <p className="metric-label">{label} <Tip text={HELP[label]} /></p>
      <p className="metric-value" key={value}>{value}</p>
      {sub && <p className="metric-sub">{sub}</p>}
    </div>
  );
}

// Shape as well as colour: check = GO, triangle = CAUTION, cross = NO-GO.
export function VerdictIcon({ status }) {
  const d = status === 'GO' ? 'M5 10.5l3.2 3.2L15 7' : status === 'CAUTION' ? 'M10 6.5v4.5M10 13.6v.2' : 'M6.5 6.5l7 7M13.5 6.5l-7 7';
  return (
    <svg className="vicon" viewBox="0 0 20 20" aria-hidden="true">
      {status === 'CAUTION' ? <path d="M10 2.5L18 17H2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        : <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlipBanner({ smooth, real, changes }) {
  const cls = (x) => (x === 'GO' ? 'go' : x === 'CAUTION' ? 'caution' : 'nogo');
  return (
    <div className="flip" role="status">
      <p className="flip-title">Real terrain changes the answer</p>
      <div className="flip-row">
        <div className={`flip-chip ${cls(smooth.verdict.status)}`}><span>Smooth Moon</span><strong><VerdictIcon status={smooth.verdict.status} />{smooth.verdict.status}</strong></div>
        <span className="flip-arrow" aria-hidden="true">→</span>
        <div className={`flip-chip ${cls(real.verdict.status)}`}><span>Real NASA terrain</span><strong><VerdictIcon status={real.verdict.status} />{real.verdict.status}</strong></div>
      </div>
      {changes.length > 0 && <p className="flip-detail">{changes.join(' · ')}</p>}
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
  if (!sameVerdict) return <FlipBanner smooth={smooth} real={real} changes={changes} />;
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
      <h3 className="group-head">Over a year at this spot <span className="muted small">our model with real NASA LOLA terrain{t.computedLive ? ', computed live for this point' : ''}</span></h3>
      <div className="terrain-facts">
        <Metric label="Sunlit over a year" value={`${Math.round(y.terrainSunPct)}%`} sub={`Smooth Moon would say ${Math.round(y.smoothSunPct)}%`} tone="sun" />
        <Metric label="Earth in view over a year" value={`${Math.round(y.terrainEarthPct)}%`} sub={`Smooth Moon would say ${Math.round(y.smoothEarthPct)}%`} tone="earth" />
        <Metric label="Ground elevation" value={`${t.elevationM >= 0 ? '+' : '−'}${Math.abs(Math.round(t.elevationM)).toLocaleString()} m`} sub="vs 1737.4 km reference sphere" tone="sun" />
        <Metric label="Slope at site" value={`${t.slope.atSiteDeg}°`} sub={`Steepest within 1 km: ${t.slope.maxWithin1kmDeg}°`} tone={t.slope.atSiteDeg > 10 ? 'bad' : 'earth'} />
        {t.nearestIceTrap
          ? <Metric label="Nearest ice trap" value={`${t.nearestIceTrap.distanceKm} km`} sub={`Permanently shadowed region, ${t.nearestIceTrap.areaKm2} km²`} tone="earth" />
          : <Metric label="Nearest permanent shadow" value={t.nearestShadowKm == null ? 'over 15 km' : `${t.nearestShadowKm} km`} sub="NASA LPSR map, 120 m pixels" tone="earth" />}
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
        {n && n.psr
          ? <Metric label="NASA map: sunlit (long-term)" value="Permanent shadow"
              sub={`Permanently shadowed pixel (NASA LPSR, 120 m).${n.nearbySunPct ? ` Nearby (within 180 m): ${Math.round(n.nearbySunPct[0])}–${Math.round(n.nearbySunPct[1])}% sunlit.` : ''}${y ? ` Our ${Math.round(y.terrainSunPct)}% above can't see a shadowed dip this small: our horizon starts 240 m out on the 80 m map.` : ''}`} tone="sun" />
          : n && <Metric label="NASA map: sunlit (long-term)" value={`${Math.round(n.sunPct)}%`}
              sub={`${y ? `vs our ${Math.round(y.terrainSunPct)}% above. ` : ''}NASA 18.6-yr average; within 180 m: ${Math.round(n.sunRangePct[0])}–${Math.round(n.sunRangePct[1])}%`} tone="sun" />}
        {n && <Metric label="NASA map: Earth in view (long-term)" value={n.psr ? `${Math.round(n.earthPct)}% at this pixel` : `${Math.round(n.earthPct)}%`}
          sub={n.psr && n.nearbyEarthPct ? `${y ? `vs our ${Math.round(y.terrainEarthPct)}% above. ` : ''}Nearby (within 180 m): up to ${Math.round(n.nearbyEarthPct[1])}%`
            : `${y ? `vs our ${Math.round(y.terrainEarthPct)}% above. ` : ''}Within 180 m: ${Math.round(n.earthRangePct[0])}–${Math.round(n.earthRangePct[1])}%`} tone="earth" />}
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

// ---------------- Role views (presentation only) ----------------
function Section({ title, desc, children }) {
  return (
    <section className="rsec">
      <h3 className="rsec-title">{title}</h3>
      <p className="sec-desc">{desc}</p>
      {children}
    </section>
  );
}
function Line({ ok, children }) {
  return <p className={`role-line ${ok ? 'ok' : 'bad'}`}><VerdictIcon status={ok ? 'GO' : 'NO-GO'} />{children}</p>;
}

function RoleView({ role, a, m, v, s, set, i0, terrainOn, t, sci, ground, openLanding, inCoverage }) {
  const mt = { terrain: terrainOn, margin: s.marginDeg, landing: s.landing };
  // Same rules as the engine's verdict (analysis.js), worded per role.
  const powerLine = v.powerOK
    ? <Line ok>Power OK: longest continuous darkness {fmtDur(m.longestDarkH)}, battery covers {fmtDur(s.batteryHours)}.</Line>
    : <Line ok={false}>{m.sunlitPct === 0 ? 'No confident sunlight during the stay.' : `Longest continuous darkness ${fmtDur(m.longestDarkH)} is longer than the battery covers (${fmtDur(s.batteryHours)}).`}</Line>;
  const commsLine = s.relay ? <Line ok>DTE gaps covered: relay satellite assumed.</Line>
    : m.earthPct === 0 ? <Line ok={false}>Earth never rises above the horizon: needs a relay satellite.</Line>
    : v.commsOK ? <Line ok>DTE OK: longest gap {fmtDur(m.longestCommsGapH)} (limit {fmtDur(s.commsGapHours)}).</Line>
    : <Line ok={false}>Longest DTE gap {fmtDur(m.longestCommsGapH)} is over the {fmtDur(s.commsGapHours)} limit: needs a relay or a different date.</Line>;

  const M = {
    sunEl: <Metric key="sunEl" label="Sun elevation at landing" value={signedDeg(a.series.sunAlt[i0])}
      sub={windowNote({ body: 'Sun', clear: a.series.sunClear[i0], ...mt, upAtStart: m.sunlitAtStart, end: m.sunset, start: m.sunrise })} tone="sun" />,
    illum: <Metric key="illum" label="Solar illumination this stay" value={fmtPct(m.sunlitPct)} sub={`+ ${fmtPct(m.sunMarginalPct)} marginal`} tone="sun" />,
    dark: <Metric key="dark" label="Longest continuous darkness" value={fmtDur(m.longestDarkH)} sub={`Battery covers ${fmtDur(s.batteryHours)}`} tone={m.longestDarkH > s.batteryHours ? 'bad' : 'sun'} />,
    earthEl: <Metric key="earthEl" label="Earth elevation at landing" value={signedDeg(a.series.earthAlt[i0])}
      sub={windowNote({ body: 'Earth', clear: a.series.earthClear[i0], ...mt, upAtStart: m.earthAtStart, end: m.earthset, start: m.earthrise })} tone="earth" />,
    dteVis: <Metric key="dteVis" label="DTE visibility this stay" value={fmtPct(m.earthPct)} sub={`+ ${fmtPct(m.earthMarginalPct)} marginal`} tone="earth" />,
    dteGap: <Metric key="dteGap" label="Longest DTE gap" value={fmtDur(m.longestCommsGapH)} sub={s.relay ? 'Relay assumed' : `Limit ${fmtDur(s.commsGapHours)}`} tone={!s.relay && m.longestCommsGapH > s.commsGapHours ? 'bad' : 'earth'} />,
  };
  const y = t && t.yearly, n = sci && sci.nasaIllumination, d = sci && sci.diviner, c = sci && sci.craters, g = ground;
  if (y) {
    M.ySun = <Metric key="ySun" label="Solar illumination over a year" value={`${Math.round(y.terrainSunPct)}%`} sub={`Smooth Moon would say ${Math.round(y.smoothSunPct)}%`} tone="sun" />;
    M.yEarth = <Metric key="yEarth" label="DTE visibility over a year" value={`${Math.round(y.terrainEarthPct)}%`} sub={`Smooth Moon would say ${Math.round(y.smoothEarthPct)}%`} tone="earth" />;
  }
  if (n) {
    M.nSun = n.psr
      ? <Metric key="nSun" label="NASA map: sunlit (long-term)" value="Permanent shadow" sub="Permanently shadowed pixel (NASA LPSR, 120 m)" tone="sun" />
      : <Metric key="nSun" label="NASA map: sunlit (long-term)" value={`${Math.round(n.sunPct)}%`} sub={`NASA 18.6-yr average; within 180 m: ${Math.round(n.sunRangePct[0])}–${Math.round(n.sunRangePct[1])}%`} tone="sun" />;
    M.nEarth = <Metric key="nEarth" label="NASA map: Earth in view (long-term)" value={`${Math.round(n.earthPct)}%`}
      sub={n.earthRangePct ? `Within 180 m: ${Math.round(n.earthRangePct[0])}–${Math.round(n.earthRangePct[1])}%` : 'NASA long-term average'} tone="earth" />;
  }
  if (g) {
    M.slope = <Metric key="slope" label="Slope at site" value={`${g.slope.atSiteDeg}°`} sub={`Steepest within 1 km: ${g.slope.maxWithin1kmDeg}°`} tone={g.slope.atSiteDeg > 10 ? 'bad' : 'earth'} />;
    M.elev = <Metric key="elev" label="Ground elevation" value={`${g.elevationM >= 0 ? '+' : '−'}${Math.abs(Math.round(g.elevationM)).toLocaleString()} m`} sub="vs 1737.4 km reference sphere" tone="earth" />;
    M.psr = g.nearestIceTrap
      ? <Metric key="psr" label="Nearest ice trap" value={`${g.nearestIceTrap.distanceKm} km`} sub={`Permanently shadowed region, ${g.nearestIceTrap.areaKm2} km²`} tone="earth" />
      : <Metric key="psr" label="Nearest permanent shadow" value={g.nearestShadowKm == null ? 'over 15 km' : `${g.nearestShadowKm} km`} sub="NASA LPSR map, 120 m pixels" tone="earth" />;
  }
  if (c) M.craters = <Metric key="craters" label="Craters ≥ 1 km within 5 km" value={`${c.countAtLeast1kmWithin5km}`} sub={`${c.insideCrater ? `Inside a ${c.insideCrater.diamKm} km crater · ` : ''}nearest crater rim ${c.nearestRimKm} km (Robbins 2019)`} tone={c.nearestRimKm < 0.3 ? 'bad' : 'earth'} />;
  if (d) {
    M.temp = <Metric key="temp" label="Ground temperature (Diviner)" value={`avg ${cDeg(d.tempAvgK)}`} sub={`Yearly maximum ${cDeg(d.tempMaxK)} · report only, no NASA limit`} tone="sun" />;
    M.ice = <Metric key="ice" label="Water ice (Diviner)" value={d.iceDepthM === null ? 'None in top 2.9 m' : d.iceDepthM === 0 ? 'At the surface' : `${d.iceDepthM} m down`}
      sub={d.nearestIceWithin1mKm !== null ? `Ice within 1 m of the surface: ${d.nearestIceWithin1mKm} km away` : 'No shallow ice within 15 km'} tone="earth" />;
  }
  const pick = (...keys) => keys.map((k) => M[k]).filter(Boolean);
  const noGround = <p className="hint small">No NASA terrain data here (only about 80–90°S), so slope and shadow can't be checked.</p>;

  const battery = (
    <div className="role-input">
      <label htmlFor="battery">Battery covers darkness for up to <Tip text="The longest time without sunlight the lander's battery can keep it alive. Set by the power team." /></label>
      <select id="battery" value={s.batteryHours} onChange={(e) => set({ batteryHours: +e.target.value })}>
        {[12, 24, 48, 72, 120, 240].map((h) => <option key={h} value={h}>{fmtDur(h)}</option>)}
      </select>
    </div>
  );
  const comms = (
    <div className="role-input">
      <label htmlFor="comms">Longest DTE gap the mission accepts <Tip text="How long the lander can go without a direct-to-Earth (DTE) radio link. Set by the comms team." /></label>
      <select id="comms" value={s.commsGapHours} onChange={(e) => set({ commsGapHours: +e.target.value })}>
        {[6, 12, 24, 48, 72, 120].map((h) => <option key={h} value={h}>{fmtDur(h)}</option>)}
      </select>
      <label className="check"><input type="checkbox" checked={s.relay} onChange={(e) => set({ relay: e.target.checked })} /> Relay satellite available (covers all DTE gaps)</label>
    </div>
  );

  if (role === 'power') return (
    <>
      <Section title="Power: sunlight on the panels" desc="Will the solar panels get enough sunlight for the whole stay? Set how long the battery can cover darkness.">
        {battery}{powerLine}
        <div className="cards">{pick('sunEl', 'illum', 'dark')}</div>
      </Section>
      {(M.ySun || M.nSun) && <details className="more"><summary>Show long-term sunlight</summary>
        <p className="sec-desc">How sunny this spot is over a whole year, and NASA Goddard's independent map for comparison.</p>
        <div className="cards">{pick('ySun', 'nSun')}</div></details>}
    </>
  );
  if (role === 'comms') return (
    <>
      <Section title="Comms: direct-to-Earth (DTE) link" desc="Can the lander radio Earth directly, and what is the longest silence? Set the longest gap the mission accepts.">
        {comms}{commsLine}
        <div className="cards">{pick('earthEl', 'dteVis', 'dteGap')}</div>
      </Section>
      {(M.yEarth || M.nEarth) && <details className="more"><summary>Show long-term Earth visibility</summary>
        <p className="sec-desc">How often Earth is in view here over a whole year, and NASA Goddard's independent map for comparison.</p>
        <div className="cards">{pick('yEarth', 'nEarth')}</div></details>}
    </>
  );
  if (role === 'landing') return (
    <>
      <Section title="Touchdown point" desc="The ground right where the lander touches down, from NASA LOLA elevation (80 m pixels).">
        {g ? <div className="cards">{pick('slope', 'elev')}</div> : noGround}
      </Section>
      <Section title="Landing simulation" desc="Drops 1,000 simulated touchdowns around the target and checks slope, shadow and horizon at each one.">
        {inCoverage ? <button className="primary" onClick={openLanding}>Open the landing simulation</button> : noGround}
      </Section>
    </>
  );
  if (role === 'hazards') return (
    <>
      <Section title="Ground hazards" desc="Steep ground, nearby craters and permanent shadow around the site.">
        {(g || c) ? <div className="cards">{pick('slope', 'craters', 'psr')}</div> : noGround}
      </Section>
      {M.temp && <Section title="Thermal" desc="Surface temperature measured by NASA LRO Diviner. Report only: NASA publishes no limit.">
        <div className="cards">{pick('temp')}</div>
      </Section>}
    </>
  );
  // Mission planner
  return (
    <>
      <Section title="Why" desc="The two checks behind the verdict: power (sunlight) and the radio link to Earth.">
        {powerLine}{commsLine}
      </Section>
      <Section title="Key numbers" desc="The three numbers the verdict is based on, for this surface stay.">
        <div className="cards">{pick('illum', 'dark', 'dteGap')}</div>
      </Section>
      <details className="more"><summary>Show details</summary>
        <Section title="Mission limits" desc="Set by the power and comms teams. Changing them updates the verdict.">
          <div className="role-inputs">{battery}{comms}</div>
        </Section>
        <Section title="At landing" desc="Where the Sun and Earth are at touchdown, and DTE visibility for the stay.">
          <div className="cards">{pick('sunEl', 'earthEl', 'dteVis')}</div>
        </Section>
        {(M.ySun || M.slope) && <Section title="This spot over a year and on the ground" desc="Long-term sunlight and Earth visibility with real terrain, plus slope and nearest ice.">
          <div className="cards">{pick('ySun', 'yEarth', 'slope', 'psr', 'ice')}</div>
        </Section>}
        {M.nSun && <Section title="NASA's independent check" desc="NASA Goddard's long-term maps, made with a different method. A few % difference is expected.">
          <div className="cards">{pick('nSun', 'nEarth')}</div>
        </Section>}
      </details>
    </>
  );
}
