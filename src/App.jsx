import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SITES, DEFAULT_SITE_ID, siteById, validateLatLon, normLon } from './engine/sites.js';
import { PLACES, PLACE_GROUPS, placeById } from './places.js';
import { analyzeSite, compareSites, DEFAULTS } from './engine/analysis.js';
import { withTerrain, terrainFor } from './engine/terrain.js';
import { pointFacts, inTileCoverage } from './engine/pointData.js';
import LandingSim from './components/LandingSim.jsx';
import TeamReview, { TeamModules } from './components/TeamReview.jsx';
import { DEFAULT_TEAM_INPUTS } from './engine/teamReview.js';
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
  { id: 'answer', label: 'Overview' },
  { id: 'timeline', label: 'Over time' },
  { id: 'landing', label: 'Landing ellipse' },
  { id: 'team', label: 'Rank sites' },
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
    ephem: 'auto',
    gateway: false,
    gwEpoch: p.has('gwe') ? Date.parse(p.get('gwe')) : NaN,
    map: p.get('map') === 'polar' ? 'polar' : 'globe',
    place: p.get('place') || null,
    tab: TABS.some((t) => t.id === p.get('tab')) ? p.get('tab') : 'answer',
    role: ['planning', 'power', 'comms', 'landing', 'thermal', 'science'].includes(p.get('role')) ? p.get('role') : 'all',
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
  if (s.role && s.role !== 'all') p.set('role', s.role);
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

export default function App() {
  const [s, setS] = useState(readHash);
  const set = useCallback((patch) => setS((old) => ({ ...old, ...patch })), []);
  const [scrub, setScrub] = useState(null);
  const [stayCustom, setStayCustom] = useState(() => !STAY_OPTIONS.includes(s.missionDays));
  const [zoomPref, setZoomPref] = useState(null);
  const [customDraft, setCustomDraft] = useState({ lat: String(s.customLat), lon: String(s.customLon) });
  const [customErr, setCustomErr] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  // Team criteria (one source of truth). Limits that also set the verdict (stay, slip, battery, comms gap, relay) live in `s`
  // so the GO / CAUTION / NO-GO answer and the site ranking always use the same numbers.
  const [openStep, setOpenStep] = useState(1);
  const [focusKey, setFocusKey] = useState(0);
  const [tour, setTour] = useState(null);
  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') { setShowAbout(false); setTour(null); } };
    window.addEventListener('keydown', onEsc); return () => window.removeEventListener('keydown', onEsc);
  }, []);
  useEffect(() => {
    const h = document.querySelector('.appbar'); if (!h || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--hdr', `${h.offsetHeight}px`));
    ro.observe(h); return () => ro.disconnect();
  }, []);
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    const el = document.querySelector('.acc.open');
    if (el && el.offsetParent) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [openStep]);
  const [back, setBack] = useState(null); // { y } when the user jumped from the Overview to another tab
  const jump = useCallback((tab) => { setBack({ y: window.scrollY }); set({ tab }); window.scrollTo({ top: 0 }); }, [set]);
  const goBack = () => { const y = back ? back.y : 0; setBack(null); set({ tab: 'answer' }); requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y }))); };
  const [teamInp, setTeamInp] = useState(() => JSON.parse(JSON.stringify(DEFAULT_TEAM_INPUTS)));

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
  const coordsOpen = showCoords || (isCustom && !place);
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
    set({ tab: 'answer', siteId: 'connecting-ridge', place: null, landing: Date.parse('2026-11-15T21:00:00Z'), terrain: false,
      slipDays: DEFAULTS.slipDays, missionDays: DEFAULTS.missionDays, marginDeg: DEFAULTS.marginDeg, batteryHours: DEFAULTS.batteryHours,
      commsGapHours: DEFAULTS.commsGapHours, relay: false, gateway: false, ephem: 'auto' });
    setStayCustom(false);
    setOpenStep(3); window.scrollTo({ top: 0 });
  };
  useEffect(() => { if (s.siteId !== 'custom') { setCustomDraft({ lat: String(baseSite.lat), lon: String(baseSite.lon) }); setCustomErr(null); } }, [s.siteId]);
  const pickPoint = useCallback((lat, lon) => { setCustomDraft({ lat: String(lat), lon: String(lon) }); setCustomErr(null); set({ siteId: 'custom', customLat: lat, customLon: lon, place: null }); }, [set]);
  const pickSite = useCallback((id) => set({ siteId: id, place: null }), [set]);
  const onSiteSelect = (v) => {
    setFocusKey((k) => k + 1);
    if (v.startsWith('place:')) {
      const pl = placeById(v.slice(6));
      if (pl) { setCustomDraft({ lat: String(pl.lat), lon: String(pl.lon) }); setCustomErr(null); set({ siteId: 'custom', customLat: pl.lat, customLon: pl.lon, place: pl.id }); }
    } else set({ siteId: v, place: null });
  };
  const pickTime = useCallback((t) => set({ landing: t }), [set]);
  const simPick = useCallback((lat, lon) => { pickPoint(lat, lon); set({ tab: 'answer' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [pickPoint, set]);
  // Open a site on the Overview: fly the Moon to it and show its answer step.
  const openSite = useCallback((id) => { setBack(null); setFocusKey((k) => k + 1); setOpenStep(3); set({ siteId: id, place: null, tab: 'answer', map: 'globe' }); window.scrollTo({ top: 0 }); }, [set]);
  const teamLoad = useCallback((x) => { if (x.id === 'custom') return; openSite(x.id); }, [openSite]);
  const teamSites = useMemo(() => [...SITES.filter((x) => inTileCoverage(x.lat, x.lon)), ...(site.id === 'custom' && inTileCoverage(site.lat, site.lon) ? [shownBase] : [])], [site, shownBase]);
  const teamAll = useMemo(() => ({ ...teamInp,
    mission: { ...teamInp.mission, stayDays: s.missionDays, slipDays: s.slipDays },
    power: { ...teamInp.power, batteryHours: s.batteryHours },
    comms: { ...teamInp.comms, commsGapHours: s.commsGapHours, relay: s.relay } }), [teamInp, s.missionDays, s.slipDays, s.batteryHours, s.commsGapHours, s.relay]);
  const setTeamField = useCallback((t, k, val) => {
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const shared = { 'mission.stayDays': ['missionDays', 0.5, 30], 'mission.slipDays': ['slipDays', 0, 90], 'power.batteryHours': ['batteryHours', 0, 720], 'comms.commsGapHours': ['commsGapHours', 1, 720] };
    const key = `${t}.${k}`;
    if (key === 'comms.relay') { set({ relay: !!val }); return; }
    if (shared[key]) { if (val == null || !Number.isFinite(+val)) return; const [f, lo, hi] = shared[key]; set({ [f]: clamp(+val, lo, hi) }); return; }
    setTeamInp((o) => ({ ...o, [t]: { ...o[t], [k]: val } }));
  }, [set]);
  const statusById = useMemo(() => Object.fromEntries(compareRows.map((r) => [r.site.id, r.verdict.status])), [compareRows]);

  // ---- Overview (presentation only): three questions built from numbers the engine already returns ----
  const terrainData = site.terrain || (shownHasTerrain ? (site.id === 'custom' ? (liveReady ? live.terrain : null) : terrainFor(site.id)) : null);
  const slope = terrainData && terrainData.slope;
  const stayTxt = s.missionDays === 29.53 ? '29.5' : s.missionDays;
  const powerChip = v.powerOK
    ? { cls: 'go', txt: `Within the ${fmtDur(s.batteryHours)} battery limit` }
    : m.sunlitPct === 0 ? { cls: 'nogo', txt: 'No confident sunlight' } : { cls: 'nogo', txt: `Over the ${fmtDur(s.batteryHours)} battery limit` };
  const commsChip = s.relay ? { cls: 'neutral', txt: 'Relay satellite assumed' }
    : v.commsOK ? { cls: 'go', txt: `Within the ${fmtDur(s.commsGapHours)} limit` }
    : { cls: 'caution', txt: `Over the ${fmtDur(s.commsGapHours)} limit: needs a relay` };
  const slopeLimit = teamInp.landing.slopeMaxDeg ?? 10;
  const show = ROLE_CARDS[s.role] || ROLE_CARDS.all;
  const role = ROLES.find((r) => r.id === s.role) || ROLES[0];
 const ephemLine = ephemStatus.state === 'ready'
    ? `JPL DE421 table, cross-checked live (max difference ${ephemStatus.check ? ephemStatus.check.maxDiffDeg.toFixed(3) : '0.01'}°)`
    : 'live calculation (DE421 table unavailable)';
  const MAP_SWITCH = (<div className="seg map-tabs" role="tablist" aria-label="Map type">
                  <button role="tab" aria-selected={s.map === 'globe'} className={s.map === 'globe' ? 'on' : ''} onClick={() => set({ map: 'globe' })}>3D Moon</button>
                  <button role="tab" aria-selected={s.map === 'polar'} className={s.map === 'polar' ? 'on' : ''} onClick={() => set({ map: 'polar' })}>South pole map</button>
                </div>);
  const scenarioLine = `${site.name} · ${fmtUTC(s.landing)} · ${stayTxt}-day stay · slip ±${s.slipDays} d`;

  return (
    <div className="app2">
      <a className="skip" href="#answer">Skip to the answer</a>
      <header className="appbar">
        <div className="brand">
          <div className="brand-row"><h1 className="brand-name">Lunar Landing Site Navigator</h1><span className="brand-team">Team Critical Load</span></div>
          <p className="brand-sub">Sunlight for power and line of sight to Earth over the whole surface stay, from NASA LRO terrain and JPL ephemerides.</p>
        </div>
        <nav className="tabs2" role="tablist" aria-label="Views">
          {TABS.map((t) => (
            <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={s.tab === t.id} aria-controls={`view-${t.id}`}
              className={s.tab === t.id ? 'on' : ''} onClick={() => { setBack(null); setShowAbout(false); setTour(null); set({ tab: t.id }); window.scrollTo({ top: 0 }); }}>{t.label}</button>
          ))}
        </nav>
        <a href="#answer" className={`mini-verdict ${statusClass(v.status)}`} title="Jump to the answer" onClick={(e) => { e.preventDefault(); setBack(null); set({ tab: 'answer' }); setOpenStep(3); window.scrollTo({ top: 0 }); }}><VerdictIcon status={v.status} />{v.status}</a>
        <div className="appbar-actions">
          <button onClick={() => { setShowAbout(false); backToDemo(); setTour(0); }} title="A four-step guided example: Connecting ridge, 15 Nov 2026 21:00 UTC">Load demo</button>
          <button onClick={() => { setTour(null); setShowAbout(true); }} aria-haspopup="dialog">How it works</button>
        </div>
      </header>

      {showAbout && <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) setShowAbout(false); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="about-h">
          <button className="modal-close" onClick={() => setShowAbout(false)} autoFocus>✕ Close</button>
          <About />
        </div>
      </div>}
      {tour !== null && s.tab === 'answer' && <DemoTour step={tour} status={v.status} terrain={s.terrain} site={site.name}
        onStep={(n) => { if (n === 2 || n === 3) set({ terrain: n === 3 }); if (n <= 1) set({ terrain: false }); setOpenStep(3); setTour(n); }}
        onWhy={() => { setTour(null); setOpenStep(4); }} onClose={() => setTour(null)} />}

      <main className="layout content">
        {s.tab !== 'answer' && (
          <div className="scn-bar">
            {back && <button className="back-btn" onClick={goBack}>← Back to where you were</button>}
            <span><strong>{site.name}</strong> · {fmtUTC(s.landing)} · {stayTxt}-day stay · ±{fmtSlip(s.slipDays)}</span>
            {!back && <button className="linkbtn" onClick={() => { set({ tab: 'answer' }); window.scrollTo({ top: 0 }); }}>Change site, time or criteria</button>}
          </div>
        )}

        {/* ================= Overview: the Moon fills the background; the steps open one at a time on the right ================= */}
        <div role="tabpanel" id="view-answer" aria-labelledby="tab-answer" hidden={s.tab !== 'answer'}>
          <div className="stage">
            <div className="stage-bg" aria-label="Moon map">
              {s.map === 'globe'
                ? <Suspense fallback={<div className="globe-box globe-loading"><p className="hint">Loading the 3D Moon…</p></div>}>
                    <MoonGlobe sites={SITES} statusById={statusById} currentId={s.siteId}
                      custom={s.siteId === 'custom' ? { lat: baseSite.lat, lon: baseSite.lon, name: place ? place.name : null } : null}
                      onPick={pickSite} onPickPoint={pickPoint} focusKey={focusKey} currentStatus={v.status} lead={MAP_SWITCH} />
                  </Suspense>
                : <><div className="stage-controls">{MAP_SWITCH}</div><div className="polar-wrap"><PolarMap rows={compareRows} currentId={s.siteId} custom={s.siteId === 'custom' ? { lat: baseSite.lat, lon: baseSite.lon } : null}
                    onPick={pickSite} onPickPoint={pickPoint} /></div></>}
            </div>

            <div className="stage-panel">
              {/* ---- Step 1 ---- */}
              <section className={`acc ${openStep === 1 ? 'open' : ''}`}>
                <button className="acc-head" aria-expanded={openStep === 1} onClick={() => setOpenStep(1)}>
                  <span className="step-num">1</span>
                  <span className="acc-t"><b>Site and landing time</b><small>{site.name} · {fmtUTC(s.landing)} · ±{fmtSlip(s.slipDays)}</small></span>
                </button>
                {openStep === 1 && <div className="acc-body">
                  <SitePicker value={place ? `place:${place.id}` : s.siteId} label={site.name} onPick={onSiteSelect} />
                  <div className="f-row">
                    <span className="mono muted">{fmtLat(baseSite.lat)} · {fmtLon(baseSite.lon)}</span>
                    <button className="linkbtn" onClick={() => setShowCoords((x) => !x)} aria-expanded={coordsOpen}>{coordsOpen ? 'Hide coordinates' : 'Enter coordinates'}</button>
                  </div>
                  {baseSite.note && <p className="f-help">{baseSite.note}{baseSite.url && <> <a href={baseSite.url} target="_blank" rel="noreferrer">Source</a></>}</p>}
                  {coordsOpen && (
                    <form className="coords" onSubmit={(e) => { e.preventDefault(); applyCustom(); }}>
                      <label>Latitude (°)<input inputMode="decimal" value={customDraft.lat} onChange={(e) => setCustomDraft({ ...customDraft, lat: e.target.value })} placeholder="−89.45" /></label>
                      <label>Longitude (°E)<input inputMode="decimal" value={customDraft.lon} onChange={(e) => setCustomDraft({ ...customDraft, lon: e.target.value })} placeholder="−137.3" /></label>
                      <button type="submit">Check</button>
                      <p className="f-help">Latitude −90 to 90 (south negative), longitude −180 to 180 °E.</p>
                      {customErr && <p className="error">{customErr}</p>}
                    </form>
                  )}
                  <div className="f">
                    <label htmlFor="date">Landing time <span className="muted">(UTC)</span></label>
                    <input id="date" type="datetime-local" step="60" value={toInputUTC(s.landing)}
                      onChange={(e) => { const ms = fromInputUTC(e.target.value); if (ms) set({ landing: ms }); }} />
                    <p className="f-help">Your time: {localTime(s.landing)}</p>
                  </div>
                  <SlipBox days={s.slipDays} onChange={(d) => set({ slipDays: d })} />
                  {!shownHasTerrain && <p className="notice small"><strong>No NASA terrain at this site.</strong> LRO LOLA terrain covers about 80–90° S only; this site is assessed on a smooth Moon.</p>}
                  <button className="primary acc-next" onClick={() => setOpenStep(2)}>Next: team criteria</button>
                </div>}
              </section>

              {/* ---- Step 2 ---- */}
              <section className={`acc ${openStep === 2 ? 'open' : ''}`}>
                <button className="acc-head" aria-expanded={openStep === 2} onClick={() => setOpenStep(2)}>
                  <span className="step-num">2</span>
                  <span className="acc-t"><b>Team criteria</b><small>Stay {stayTxt} d · battery {fmtDur(s.batteryHours)} · comms gap {fmtDur(s.commsGapHours)} · slope {slopeLimit}°</small></span>
                </button>
                {openStep === 2 && <div className="acc-body">
                  <p className="f-help">Open your team's card. Limits tagged "Sets the verdict" change GO / CAUTION / NO-GO; weights only change the site ranking.</p>
                  <TeamModules role="all" inp={teamAll} setField={setTeamField} collapsible />
                  <details className="module adv">
                    <summary><span className="mod-name">Advanced: model settings</span><span className="mod-sum">Horizon margin {s.marginDeg}°</span></summary>
                    <div className="ms-grid">
                      <label htmlFor="margin">Horizon margin (°) <Tip text="The Sun or Earth only counts as visible when its centre is at least this far above the terrain horizon. Covers the solar disc, terrain finer than the map and model error. Default 0.5°." /></label>
                      <input id="margin" type="number" min="0" max="5" step="0.1" inputMode="decimal" value={s.marginDeg}
                        onChange={(e) => { const x = +e.target.value; if (Number.isFinite(x) && x >= 0 && x <= 5) set({ marginDeg: x }); }} />
                      <span className="ms-label">Sun and Earth positions</span>
                      <span className="ms-val">{ephemLine}</span>
                    </div>
                  </details>
                  <button className="primary acc-next" onClick={() => setOpenStep(3)}>Next: see the answer</button>
                </div>}
              </section>

              {/* ---- Step 3 ---- */}
              <section className={`acc ${openStep === 3 ? 'open' : ''}`} id="answer">
                <button className="acc-head" aria-expanded={openStep === 3} onClick={() => setOpenStep(3)}>
                  <span className="step-num">3</span>
                  <span className="acc-t"><b>The answer</b><small className={statusClass(v.status)}><VerdictIcon status={v.status} />{v.status} · {HEADLINE[v.status]}</small></span>
                </button>
                {openStep === 3 && <div className="acc-body">
                  <section className={`hero hero-compact ${statusClass(v.status)} ${updating ? 'is-updating' : ''}`} aria-labelledby="verdict-h" aria-busy={updating}>
                    <div className="hero-top">
                      <p id="verdict-h" className="hero-status" key={v.status} aria-live="polite"><VerdictIcon status={v.status} />{v.status}</p>
                      <div className="hero-text">
                        <p className="hero-head">{HEADLINE[v.status]}</p>
                        <p className="hero-meta">{site.name} · {fmtUTC(s.landing)} · {stayTxt}-day stay</p>
                      </div>
                    </div>
                    {updating && <p className="updating-note" role="status"><span className="spinner" aria-hidden="true" />Computing the NASA terrain horizon…</p>}
                    {shownHasTerrain && (
                      <div className="hero-switch">
                        <div className="terrain-switch" role="group" aria-label="Horizon model">
                          <button className={!s.terrain ? 'on' : ''} aria-pressed={!s.terrain} onClick={() => set({ terrain: false })}>Smooth Moon</button>
                          <button className={s.terrain ? 'on' : ''} aria-pressed={s.terrain} onClick={() => set({ terrain: true })}>Real NASA terrain</button>
                        </div>
                        <p className="hero-flip"><FlipLine smooth={smooth} real={result} terrainOn={terrainOn} /></p>
                      </div>
                    )}
                    <ul className="rrows">
                      <ResultRow icon="sun" q="Sunlight for power" value={fmtDur(m.longestDarkH)} unit={`longest dark · limit ${fmtDur(s.batteryHours)}`} chip={{ cls: powerChip.cls, txt: v.powerOK ? 'Within limit' : m.sunlitPct === 0 ? 'No sunlight' : 'Over limit' }} />
                      <ResultRow icon="earth" q="Line of sight to Earth" value={fmtDur(m.longestCommsGapH)} unit={s.relay ? 'longest gap · relay assumed' : `longest gap · limit ${fmtDur(s.commsGapHours)}`} chip={{ cls: commsChip.cls, txt: s.relay ? 'Relay' : v.commsOK ? 'Within limit' : 'Needs relay' }} />
                      <ResultRow icon="ground" q="Slope at the site" value={slope ? `${slope.atSiteDeg}°` : '—'} unit={slope ? `limit ${slopeLimit}°` : 'no terrain data'}
                        chip={slope ? (slope.atSiteDeg > slopeLimit ? { cls: 'nogo', txt: 'Over limit' } : { cls: 'go', txt: 'Within limit' }) : { cls: 'neutral', txt: 'Not checked' }} />
                    </ul>
                    <p className="hero-trust">Terrain: NASA LRO LOLA 80 m · Ephemeris: {ephemLine} · First-pass screening, not a certified tool</p>
                  </section>
                  {site.id === 'custom' && <div className="point-notes">
                    <CustomCraterNote craters={craters} lat={site.lat} lon={site.lon} terrain={inTileCoverage(site.lat, site.lon)} />
                    {liveFailed && !updating && <p className="hint small warn">NASA terrain could not be loaded here ({live.error}); showing the smooth Moon.</p>}
                  </div>}
                  <button className="primary acc-next" onClick={() => setOpenStep(4)}>Next: why (sky plot and numbers)</button>
                </div>}
              </section>

              {/* ---- Step 4 ---- */}
              <section className={`acc ${openStep === 4 ? 'open' : ''}`}>
                <button className="acc-head" aria-expanded={openStep === 4} onClick={() => setOpenStep(4)}>
                  <span className="step-num">4</span>
                  <span className="acc-t"><b>Why: sky plot and evidence</b><small>Sun and Earth against the terrain horizon, full numbers, next checks</small></span>
                </button>
                {openStep === 4 && <div className="acc-body">
                  <div className="sec-head">
                    <h3>Sky plot: Sun and Earth over the real horizon</h3>
                    <p className="sub">View straight up from the landing site; north at the top. The jagged outer ring is the terrain horizon. The Sun's path is solid, Earth's is dashed. Press play to step through the stay and watch them pass behind the terrain.</p>
                  </div>
                  <SkyDome sun={sun} earth={earth} sunPath={sunPath} earthPath={earthPath} margin={s.marginDeg}
                    zoom={zoom} onToggleZoom={() => setZoomPref(!zoom)} terrain={site.terrain} />
                  <TimeBar t0={series.t[i0]} t1={series.t[i1]} value={tNow} onChange={setScrub} />
                  <div className="more">
                    <details className="more-row">
                      <summary><span className="more-t">All mission numbers</span><span className="more-s">Sun and Earth at landing, % of the stay</span></summary>
                      <div className="cards">
                        <Metric label="Sun elevation at landing" value={signedDeg(series.sunAlt[i0])}
                          sub={windowNote({ body: 'Sun', clear: series.sunClear[i0], margin: s.marginDeg, terrain: terrainOn, upAtStart: m.sunlitAtStart, end: m.sunset, start: m.sunrise, landing: s.landing })} tone="sun" />
                        <Metric label="Sunlit this mission" value={fmtPct(m.sunlitPct)} sub={`+ ${fmtPct(m.sunMarginalPct)} marginal`} tone="sun" />
                        <Metric label="Longest dark stretch" value={fmtDur(m.longestDarkH)} sub={`Battery limit ${fmtDur(s.batteryHours)}`} tone={m.longestDarkH > s.batteryHours ? 'bad' : 'sun'} />
                        <Metric label="Earth elevation at landing" value={signedDeg(series.earthAlt[i0])}
                          sub={windowNote({ body: 'Earth', clear: series.earthClear[i0], margin: s.marginDeg, terrain: terrainOn, upAtStart: m.earthAtStart, end: m.earthset, start: m.earthrise, landing: s.landing })} tone="earth" />
                        <Metric label="Earth in view this mission" value={fmtPct(m.earthPct)} sub={`+ ${fmtPct(m.earthMarginalPct)} marginal`} tone="earth" />
                        <Metric label="Longest comms gap" value={fmtDur(m.longestCommsGapH)} sub={s.relay ? 'Relay assumed' : `Limit ${fmtDur(s.commsGapHours)}`} tone={!s.relay && m.longestCommsGapH > s.commsGapHours ? 'bad' : 'earth'} />
                      </div>
                    </details>
                    {terrainOn && (
                      <details className="more-row">
                        <summary><span className="more-t">Annual illumination</span>
                          <span className="more-s">Sunlit {Math.round(site.terrain.yearly.terrainSunPct)}% · Earth {Math.round(site.terrain.yearly.terrainEarthPct)}% (smooth Moon {Math.round(site.terrain.yearly.smoothSunPct)}% / {Math.round(site.terrain.yearly.smoothEarthPct)}%)</span></summary>
                        <TerrainFacts t={site.terrain} />
                      </details>
                    )}
                    {sci && (
                      <details className="more-row">
                        <summary><span className="more-t">Independent NASA check, ice, temperature</span><span className="more-s">{sciSummary(sci)}</span></summary>
                        <ScienceFacts sci={sci} terrain={site.terrain} />
                      </details>
                    )}
                    <details className="more-row">
                      <summary><span className="more-t">Limits of this assessment</span><span className="more-s">What the model does not include</span></summary>
                      <p className="limits-text">Visible means the centre of the Sun or Earth is more than {s.marginDeg}° above the horizon in its direction.
                        South of 80° S the horizon is NASA LOLA terrain (80 m pixels, observer 2 m above the surface); features closer than 240 m are not resolved.
                        Elsewhere the horizon is a smooth lunar sphere. First-pass screening, not a certified tool. All times UTC.</p>
                    </details>
                  </div>
                  <div className="next-actions">
                    <button className="primary" onClick={() => jump('team')}>Rank all sites</button>
                    <button onClick={() => jump('landing')}>Touchdown simulation</button>
                    <button onClick={() => jump('timeline')}>Landing-time window</button>
                  </div>
                </div>}
              </section>
            </div>
          </div>
        </div>

        <div role="tabpanel" id="view-timeline" aria-labelledby="tab-timeline" hidden={s.tab !== 'timeline'}>
          <section className="panel">
            <div className="sec-head">
              <h2>Over the stay</h2>
              <p className="sub">Height of the Sun (gold) and Earth (blue) from landing to the end of the stay.{terrainOn && ' Grey dashed line = real terrain in the Sun\'s direction: when gold drops below it, the Sun is hidden.'} Lanes: coloured = available, amber = marginal (inside ±{s.marginDeg}°), dark = not available.</p>
            </div>
            <div className="chart-scroll"><Timeline series={series} i0={i0} i1={i1} margin={s.marginDeg} scrubMs={tNow} onScrub={setScrub} /></div>
            <p className="hint small chart-scroll-hint">Swipe sideways to see the whole stay.</p>
            <TimeBar t0={series.t[i0]} t1={series.t[i1]} value={tNow} onChange={setScrub} />
          </section>
          <section className="panel">
            <div className="sec-head">
              <h2>What if the launch slips?</h2>
              <p className="sub">Every landing time in your ± {s.slipDays}-day window, checked the same way. Click a date to load it.</p>
            </div>
            <SlipWindow analysis={a} onPick={pickTime} />
          </section>
        </div>

        <div role="tabpanel" id="view-landing" aria-labelledby="tab-landing" hidden={s.tab !== 'landing'}>
          {inTileCoverage(site.lat, site.lon)
            ? <LandingSim site={site} landing={s.landing} appOpts={opts} onPickPoint={simPick} />
            : <section className="panel"><div className="sec-head"><h2>Landing ellipse</h2>
                <p className="sub">The 1,000-touchdown check needs NASA LOLA terrain, which exists only at the south pole (about 80–90° S).
                  {' '}{site.name} is outside that map. Pick a south-pole site, or click inside the dashed 80° S ring on the 3D Moon.</p></div></section>}
        </div>

        <div role="tabpanel" id="view-team" aria-labelledby="tab-team" hidden={s.tab !== 'team'}>
          <TeamReview sites={teamSites} landing={s.landing} marginDeg={s.marginDeg} onLoad={teamLoad} role="all"
            inp={teamAll} setInp={setTeamInp} setField={setTeamField} />
        </div>

        <div role="tabpanel" id="view-compare" aria-labelledby="tab-compare" hidden={s.tab !== 'compare'}>
          <section className="panel">
            <div className="sec-head">
              <h2>Compare sites for this landing time</h2>
              <p className="sub">Every preset site with the same date, stay and limits. Click a row to load it.</p>
            </div>
            <SiteCompare rows={compareRows} currentId={s.siteId} onPick={pickSite} onOpen={openSite} landing={s.landing} opts={opts} />
          </section>
        </div>

        <footer className="foot2">Not a NASA product; no NASA insignia used. Data, method and sources: <button className="linkbtn" onClick={() => setShowAbout(true)}>How it works</button> · <a href="/critical-load-guide.pdf" target="_blank" rel="noreferrer">Full guide (PDF)</a> · <button className="linkbtn" onClick={() => window.print()}>Print or save as PDF</button></footer>
      </main>
    </div>
  );
}

// ---- Overview helpers (presentation only) ----
const SLIP_UNITS = [['min', 'minutes', 1 / 1440], ['h', 'hours', 1 / 24], ['d', 'days', 1]];
function fmtSlip(days) {
  if (days >= 1 && Math.abs(days - Math.round(days)) < 1e-9) return `${days} d`;
  if (days * 24 >= 1 && Math.abs(days * 24 - Math.round(days * 24)) < 1e-6) return `${Math.round(days * 24)} h`;
  return `${Math.round(days * 1440)} min`;
}
function localTime(ms) {
  try { return new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
  catch { return new Date(ms).toString(); }
}

// Landing-time uncertainty: one ± number and a unit. Stored in days (the engine's unit); every landing time in the window is checked.
function SlipBox({ days, onChange }) {
  const pick = () => (days >= 1 && Number.isInteger(days) ? 'd' : days * 24 >= 1 && Math.abs(days * 24 - Math.round(days * 24)) < 1e-6 ? 'h' : 'min');
  const [unit, setUnit] = useState(pick);
  const f = SLIP_UNITS.find((u) => u[0] === unit)[2];
  const val = Math.round((days / f) * 100) / 100;
  return (
    <div className="f">
      <label htmlFor="slip-n">Landing-time uncertainty (±)</label>
      <div className="slip-row">
        <span className="pm" aria-hidden="true">±</span>
        <input id="slip-n" type="number" min="0" step="1" inputMode="decimal" value={val}
          onChange={(e) => { const x = +e.target.value; if (Number.isFinite(x) && x >= 0 && x * f <= 90) onChange(x * f); }} />
        <select aria-label="Unit" value={unit} onChange={(e) => { const nf = SLIP_UNITS.find((u) => u[0] === e.target.value)[2]; setUnit(e.target.value); onChange(Math.min(90, val * nf)); }}>
          {SLIP_UNITS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      <p className="f-help">Every landing time in this window is also checked (Over time tab). Up to 90 days.</p>
    </div>
  );
}

// Landing-site picker: categories first; open one to see its sites.
function SitePicker({ value, label, onPick }) {
  const [open, setOpen] = useState(false);
  const groups = [
    ...['South pole', 'Artemis III regions', 'Other sites'].map((g) => ({ name: g, items: SITES.filter((x) => x.group === g).map((x) => ({ id: x.id, name: x.name })) })),
    ...PLACE_GROUPS.map((g) => ({ name: `Named places: ${g.toLowerCase()}`, items: PLACES.filter((x) => x.group === g).map((x) => ({ id: `place:${x.id}`, name: x.name })) })),
  ];
  const pick = (id) => { setOpen(false); onPick(id); };
  return (
    <div className="f site-picker">
      <span className="f-label" id="site-l">Landing site</span>
      <button className="sp-btn" aria-expanded={open} aria-labelledby="site-l site-cur" onClick={() => setOpen((o) => !o)}>
        <span id="site-cur">{label}</span><span aria-hidden="true" className="sp-caret">{open ? '▴' : '▾'}</span></button>
      {open && (
        <div className="sp-panel">
          {groups.map((g) => (
            <details key={g.name} className="sp-group" open={g.items.some((x) => x.id === value) || undefined}>
              <summary>{g.name} <span className="muted">({g.items.length})</span></summary>
              <ul>{g.items.map((x) => <li key={x.id}><button className={x.id === value ? 'on' : ''} onClick={() => pick(x.id)}>{x.name}</button></li>)}</ul>
            </details>
          ))}
          <button className="sp-custom" onClick={() => pick('custom')}>Custom coordinates…</button>
        </div>
      )}
    </div>
  );
}

function ResultRow({ icon, q, value, unit, chip }) {
  return (
    <li className="rrow">
      <span className="rr-q"><QIcon kind={icon} />{q}</span>
      <span className="rr-v"><b>{value}</b><small>{unit}</small></span>
      <span className={`q-chip ${chip.cls}`}>{chip.txt}</span>
    </li>
  );
}

const ROLES = [
  { id: 'all', label: 'See everything', sub: 'Every team, every check' },
  { id: 'planning', label: 'Mission planning', sub: 'Stay, slip window, distance from pole' },
  { id: 'power', label: 'Power (EPS)', sub: 'Battery, solar arrays' },
  { id: 'comms', label: 'Communications', sub: 'Gaps in the link to Earth, relay' },
  { id: 'landing', label: 'Landing (GNC + hazards)', sub: 'Slope, landing accuracy' },
  { id: 'thermal', label: 'Thermal', sub: 'Temperature limits' },
  { id: 'science', label: 'Science', sub: 'Water ice nearby' },
];
const ROLE_CARDS = {
  all: { power: true, comms: true, landing: true }, planning: { power: true, comms: true, landing: true },
  power: { power: true }, comms: { comms: true }, landing: { landing: true }, thermal: { landing: true }, science: { landing: true },
};

function QIcon({ kind }) {
  if (kind === 'sun') return <svg className="qicon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10 1.5v2.5M10 16v2.5M1.5 10H4M16 10h2.5M4 4l1.8 1.8M14.2 14.2L16 16M4 16l1.8-1.8M14.2 5.8L16 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
  if (kind === 'earth') return <svg className="qicon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2.5 10h15M10 2.5c2.5 2.6 2.5 12.4 0 15M10 2.5c-2.5 2.6-2.5 12.4 0 15" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
  return <svg className="qicon" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 16l5-7 3 4 3-5 5 8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}

function QCard({ icon, kicker, q, value, label, chip, detail, help, onMore, more }) {
  return (
    <article className="qcard">
      <div>
        <p className="q-kicker"><QIcon kind={icon} />{kicker}</p>
        <h3 className="q-title">{q}</h3>
      </div>
      <div>
        <p className="q-value" key={value}>{value}</p>
        <p className="q-label">{label} <Tip text={help} /></p>
      </div>
      <p className={`q-chip ${chip.cls}`}>{chip.txt}</p>
      <p className="q-detail">{detail}</p>
      {onMore && <button className="linkbtn q-more" onClick={onMore}>{more}</button>}
    </article>
  );
}

function FlipLine({ smooth, real, terrainOn }) {
  if (!terrainOn || !smooth) return <>Switch to real NASA terrain to see what hills and crater walls change.</>;
  const sm = smooth.metrics, rm = real.metrics;
  const d = (a, b) => Math.abs(a - b) >= 1;
  const changes = [];
  if (d(sm.sunlitPct, rm.sunlitPct)) changes.push(`sunlight ${fmtPct(sm.sunlitPct)} → ${fmtPct(rm.sunlitPct)}`);
  if (d(sm.longestDarkH, rm.longestDarkH)) changes.push(`longest dark ${fmtDur(sm.longestDarkH)} → ${fmtDur(rm.longestDarkH)}`);
  if (d(sm.earthPct, rm.earthPct)) changes.push(`Earth in view ${fmtPct(sm.earthPct)} → ${fmtPct(rm.earthPct)}`);
  if (smooth.verdict.status !== real.verdict.status)
    return <><strong>On a smooth Moon this was {smooth.verdict.status}.</strong> Real terrain changes the answer{changes.length ? `: ${changes.join(', ')}` : ''}.</>;
  return <>Same verdict on a smooth Moon.{changes.length ? ` Terrain changes ${changes.join(', ')}.` : ' The numbers barely move.'}</>;
}

function sciSummary(sci) {
  const n = sci.nasaIllumination, d = sci.diviner, parts = [];
  if (n) parts.push(n.psr ? 'NASA map: permanently shadowed pixel' : `NASA map: sunlit ${Math.round(n.sunPct)}%`);
  if (d) parts.push(d.iceDepthM === null ? 'no ice in top 2.9 m' : d.iceDepthM === 0 ? 'ice at the surface' : `ice ${d.iceDepthM} m down`);
  if (d) parts.push(`average ${Math.round(d.tempAvgK - 273.15)} °C (report only)`);
  return parts.join(' · ');
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
  'Sunlit this mission': 'Share of the surface stay with the Sun confidently above the horizon (beyond the ± margin). Power depends on this.',
  'Longest dark stretch': 'Longest unbroken time without sunlight during the stay. If it is longer than the battery lasts, the verdict is NO-GO.',
  'Earth elevation at landing': 'Angle of Earth above the local horizon at touchdown. Direct radio to Earth needs Earth in view.',
  'Earth in view this mission': 'Share of the stay with Earth above the horizon, so direct-to-Earth radio works.',
  'Longest comms gap': 'Longest unbroken time with Earth hidden. A relay satellite would cover these gaps.',
  'Sunlit over a year': 'Share of one year the Sun clears the real terrain here, from our model with NASA LOLA elevation.',
  'Earth in view over a year': 'Share of one year Earth clears the real terrain here.',
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
      <p className="hint small sci-note">NASA's map is an independent check made by NASA Goddard with a different method and time span, so a few % difference is expected; a big gap means the exact spot sits on a steep edge where a few hundred metres matters.</p>
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
    <section className="about">
      <h2 id="about-h">How it works</h2>
      <ol className="about-steps">
        <li><b>Pick a site and a landing time.</b> Any point on the Moon, plus the time uncertainty.</li>
        <li><b>Find the Sun and Earth.</b> JPL DE421 ephemeris gives their position in the site's sky for every hour of the stay.</li>
        <li><b>Add the real horizon.</b> Near the south pole, NASA LRO LOLA terrain (80 m) decides whether hills block them.</li>
        <li><b>Check the team limits.</b> Longest dark stretch vs battery, longest comms gap vs limit, slope vs lander limit.</li>
        <li><b>Give the verdict.</b> NO-GO if the battery runs out, CAUTION if Earth is out of view too long, otherwise GO.</li>
      </ol>
      <a className="about-pdf" href="/critical-load-guide.pdf" target="_blank" rel="noreferrer">User and Technical Guide (PDF) ↗</a>
      <p className="about-more">First-pass screening, not a certified tool. Full method, validation and sources:{' '}
        <a href="https://github.com/washmaz/critical-load/blob/main/METHOD.md" target="_blank" rel="noreferrer">METHOD.md</a>
        {' · '}<a href="https://github.com/washmaz/critical-load#readme" target="_blank" rel="noreferrer">README</a></p>
      <details className="about-src">
        <summary>Data and site sources</summary>
        <ul className="sources">
          <li><strong>Terrain, slope, ice traps:</strong> NASA LRO LOLA south-pole maps, 80 m (Barker et al. 2023) · <a href="https://pgda.gsfc.nasa.gov/products/90" target="_blank" rel="noreferrer">NASA PGDA</a></li>
          <li><strong>Sunlight and Earth-visibility check:</strong> {SCIENCE_SOURCES.nasaIllumination}</li>
          <li><strong>Temperature and ice depth:</strong> {SCIENCE_SOURCES.diviner}</li>
          <li><strong>Craters:</strong> {SCIENCE_SOURCES.craters}</li>
          <li><strong>Sun and Earth positions:</strong> JPL DE421 (Folkner et al. 2008) with astronomy-engine as backup; spot checks on <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noreferrer">JPL Horizons</a></li>
          {SITES.map((x) => <li key={x.id}><strong>{x.name}</strong>: <a href={x.url} target="_blank" rel="noreferrer">{x.source}</a></li>)}
        </ul>
      </details>
    </section>
  );
}

const TOUR = [
  { t: 'The site', d: (p) => `${p.site}: a ridge near the lunar south pole, landing 15 Nov 2026 at 21:00 UTC for a 7-day stay.` },
  { t: 'Smooth Moon', d: (p) => `Treating the Moon as a smooth ball, the answer is ${p.status}: full sunlight, but long gaps with no line of sight to Earth.` },
  { t: 'Add real terrain', d: () => 'Now switch the horizon to real NASA LRO LOLA terrain, the hills and ridges around the site.' },
  { t: 'The flip', d: (p) => `With real terrain it is ${p.status}: the surrounding terrain hides the Sun, so the lander would run out of battery. The smooth model missed it.` },
];
function DemoTour({ step, status, site, onStep, onWhy, onClose }) {
  const x = TOUR[step];
  return (
    <aside className="tour" role="dialog" aria-label="Demo tour" aria-live="polite">
      <div className="tour-top">
        <span className="tour-n">Demo · step {step + 1} of {TOUR.length}</span>
        <button className="tour-close" onClick={onClose} aria-label="Close the demo">✕ Close</button>
      </div>
      <h3>{x.t}</h3>
      <p>{x.d({ status, site })}</p>
      <div className="tour-btns">
        {step > 0 && <button onClick={() => onStep(step - 1)}>Back</button>}
        {step === 2 && <button className="primary" onClick={() => onStep(3)}>Switch to Real NASA terrain</button>}
        {step < 2 && <button className="primary" onClick={() => onStep(step + 1)}>Next</button>}
        {step === 3 && <button className="primary" onClick={onWhy}>See why: sky plot</button>}
      </div>
    </aside>
  );
}
