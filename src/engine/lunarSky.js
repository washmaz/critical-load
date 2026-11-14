// lunarSky.js — Sun and Earth positions in the local sky of a lunar surface site.
//
// Method
//   1. Ephemeris: astronomy-engine (Don Cross, MIT licence, https://github.com/cosinekitty/astronomy)
//      gives the Moon's geocentric and heliocentric vectors in the J2000 mean equator frame (EQJ).
//      Earth as seen from the Moon's centre = -GeoMoon(t); Sun as seen from the Moon's centre = -HelioVector(Moon, t).
//   2. Moon orientation: astronomy-engine RotationAxis(Body.Moon) implements the IAU WGCCRE 2015
//      lunar rotation model (pole RA/Dec + prime-meridian angle W, including the periodic libration terms).
//      We rotate EQJ vectors into the Moon body-fixed frame: R = Rz(W) · Rx(90° − δ0) · Rz(90° + α0).
//   3. Topocentric: subtract the observer's position (mean radius 1737.4 km) so Earth's ~0.26° parallax
//      is included, then project onto the local East-North-Up frame at the site.
//
// Conventions
//   site = { name, lat, lon } in selenographic degrees, east-positive longitude.
//   alt = geometric elevation above the mean-sphere horizon (degrees). No atmosphere, so no refraction.
//   az  = azimuth from local north, clockwise through east (degrees, 0–360).
//   sunlit / earthVisible use the body's CENTRE above the horizon. With no terrain that is the smooth
//   mean-sphere horizon (0°). If site.terrain is set (see terrain.js, LOLA data), the observer is placed on
//   the real surface and the body must clear the terrain horizon in its compass direction.
//   "clear" = alt − horizon elevation in that direction (degrees). Positive means visible.
//   Light-time and aberration are ignored (< 0.01° effect).

import { Body, MakeTime, GeoMoon, HelioVector, RotationAxis, Search } from 'astronomy-engine';
import { horizonAt } from './terrain.js';

export const MOON_RADIUS_KM = 1737.4;
const KM_PER_AU = 149597870.691;
const DEG = Math.PI / 180;

const toAstroTime = (date) => MakeTime(date instanceof Date ? date : new Date(date));

// --- small vector helpers -------------------------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rotZ = (v, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [c * v[0] + s * v[1], -s * v[0] + c * v[1], v[2]];
};
const rotX = (v, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
};

// EQJ (km) -> Moon body-fixed (km), IAU convention.
function eqjToMoonFixed(vEqj, axis) {
  const alpha0 = axis.ra * 15 * DEG; // RotationAxis returns RA in sidereal hours
  const delta0 = axis.dec * DEG;
  const W = axis.spin * DEG;
  let v = rotZ(vEqj, Math.PI / 2 + alpha0);
  v = rotX(v, Math.PI / 2 - delta0);
  return rotZ(v, W);
}

// Local East / North / Up unit vectors in the Moon body-fixed frame.
function enuBasis(latDeg, lonDeg) {
  const lat = latDeg * DEG, lon = lonDeg * DEG;
  const cl = Math.cos(lat), sl = Math.sin(lat), co = Math.cos(lon), so = Math.sin(lon);
  return {
    up: [cl * co, cl * so, sl],
    east: [-so, co, 0],
    north: [-sl * co, -sl * so, cl],
  };
}

// Body-fixed vectors (km, from Moon centre) to the Sun and Earth at time t.
function bodyVectors(t) {
  const axis = RotationAxis(Body.Moon, t);
  const moonGeo = GeoMoon(t);              // Earth -> Moon, AU, EQJ
  const moonHelio = HelioVector(Body.Moon, t); // Sun -> Moon, AU, EQJ
  const earthEqj = [-moonGeo.x * KM_PER_AU, -moonGeo.y * KM_PER_AU, -moonGeo.z * KM_PER_AU];
  const sunEqj = [-moonHelio.x * KM_PER_AU, -moonHelio.y * KM_PER_AU, -moonHelio.z * KM_PER_AU];
  return { sun: eqjToMoonFixed(sunEqj, axis), earth: eqjToMoonFixed(earthEqj, axis) };
}

function altAz(targetFixed, site) {
  const { up, east, north } = enuBasis(site.lat, site.lon);
  const obs = up.map((c) => c * (MOON_RADIUS_KM + (site.terrain ? site.terrain.heightKm : 0)));
  const d = [targetFixed[0] - obs[0], targetFixed[1] - obs[1], targetFixed[2] - obs[2]];
  const r = Math.hypot(d[0], d[1], d[2]);
  const alt = Math.asin(dot(d, up) / r) / DEG;
  let az = Math.atan2(dot(d, east), dot(d, north)) / DEG;
  if (az < 0) az += 360;
  const hor = horizonAt(site.terrain, az);
  return { alt, az, hor, clear: alt - hor, distanceKm: r };
}

// Clearance above the (terrain or smooth) horizon: what decides sunlit / Earth visible.
function clearanceOf(bodyName, site, t) {
  return altAz(bodyVectors(t)[bodyName], site).clear;
}

// Next time the body's altitude crosses 0 going up (direction=+1) or down (-1), within maxDays.
// Coarse scan at stepHours, then astronomy-engine Search() refines the root (~1 s tolerance).
function nextCrossing(bodyName, site, startDate, direction, maxDays = 30, stepHours = 1) {
  const f = (t) => direction * clearanceOf(bodyName, site, t);
  let t1 = toAstroTime(startDate);
  let f1 = f(t1);
  const stepDays = stepHours / 24;
  for (let elapsed = 0; elapsed < maxDays; elapsed += stepDays) {
    const t2 = t1.AddDays(stepDays);
    const f2 = f(t2);
    if (f1 <= 0 && f2 > 0) {
      const root = Search(f, t1, t2, { dt_tolerance_seconds: 1 });
      return root ? root.date : t2.date;
    }
    t1 = t2;
    f1 = f2;
  }
  return null;
}

/**
 * Sky state at one site and time.
 * @param {{name?:string, lat:number, lon:number}} site  selenographic degrees, east-positive lon
 * @param {Date|string|number} date
 */
export function getSkyState(site, date, { searchDays = 30 } = {}) {
  const t = toAstroTime(date);
  const vec = bodyVectors(t);
  const sun = altAz(vec.sun, site);
  const earth = altAz(vec.earth, site);
  return {
    site,
    date: t.date,
    sun: { alt: sun.alt, az: sun.az, horizon: sun.hor, clear: sun.clear },
    earth: { alt: earth.alt, az: earth.az, horizon: earth.hor, clear: earth.clear },
    terrain: !!site.terrain,
    sunlit: sun.clear > 0,
    earthVisible: earth.clear > 0,
    nextSunrise: nextCrossing('sun', site, t.date, +1, searchDays),
    nextSunset: nextCrossing('sun', site, t.date, -1, searchDays),
    nextEarthrise: nextCrossing('earth', site, t.date, +1, searchDays),
    nextEarthset: nextCrossing('earth', site, t.date, -1, searchDays),
  };
}

/**
 * Sun and Earth altitude/azimuth sampled over time, for the timeline chart.
 * @returns {{t: Date, sunAlt:number, sunAz:number, earthAlt:number, earthAz:number}[]}
 */
export function getTimeline(site, startDate, days = 30, stepHours = 2) {
  const out = [];
  const t0 = toAstroTime(startDate);
  const n = Math.floor((days * 24) / stepHours);
  for (let i = 0; i <= n; i++) {
    const t = t0.AddDays((i * stepHours) / 24);
    const vec = bodyVectors(t);
    const s = altAz(vec.sun, site);
    const e = altAz(vec.earth, site);
    out.push({ t: t.date, sunAlt: s.alt, sunAz: s.az, earthAlt: e.alt, earthAz: e.az });
  }
  return out;
}

// ---------------------------------------------------------------------------
// v2 additions (checkpoint 2): fast helpers used by analysis.js and the UI.

/** Sun and Earth alt/az at one instant, without the (slower) rise/set searches. */
export function skyAt(site, date) {
  const t = toAstroTime(date);
  const vec = bodyVectors(t);
  const s = altAz(vec.sun, site);
  const e = altAz(vec.earth, site);
  return { date: t.date, sun: { alt: s.alt, az: s.az, horizon: s.hor, clear: s.clear }, earth: { alt: e.alt, az: e.az, horizon: e.hor, clear: e.clear } };
}

/**
 * Dense, evenly spaced samples between two dates (typed arrays, for scanning many candidate dates fast).
 * sunClear / earthClear = elevation above the horizon in the body's direction (terrain if site.terrain, else 0°).
 * @returns {{t:Float64Array, sunAlt:Float64Array, sunAz:Float64Array, sunHor:Float64Array, sunClear:Float64Array,
 *            earthAlt:Float64Array, earthAz:Float64Array, earthHor:Float64Array, earthClear:Float64Array, stepMs:number, terrain:boolean}}
 */
export function sampleSeries(site, startDate, endDate, stepHours = 1) {
  const t0 = toAstroTime(startDate);
  const start = t0.date.getTime();
  const end = new Date(endDate).getTime();
  const stepMs = stepHours * 3600e3;
  const n = Math.max(1, Math.ceil((end - start) / stepMs)) + 1;
  const out = {
    t: new Float64Array(n), sunAlt: new Float64Array(n), sunAz: new Float64Array(n),
    sunHor: new Float64Array(n), sunClear: new Float64Array(n),
    earthAlt: new Float64Array(n), earthAz: new Float64Array(n),
    earthHor: new Float64Array(n), earthClear: new Float64Array(n), stepMs, terrain: !!site.terrain,
  };
  for (let i = 0; i < n; i++) {
    const tt = t0.AddDays((i * stepHours) / 24);
    const vec = bodyVectors(tt);
    const s = altAz(vec.sun, site);
    const e = altAz(vec.earth, site);
    out.t[i] = start + i * stepMs;
    out.sunAlt[i] = s.alt; out.sunAz[i] = s.az; out.sunHor[i] = s.hor; out.sunClear[i] = s.clear;
    out.earthAlt[i] = e.alt; out.earthAz[i] = e.az; out.earthHor[i] = e.hor; out.earthClear[i] = e.clear;
  }
  return out;
}
