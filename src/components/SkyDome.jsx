import React from 'react';

// Polar plot of the local sky. North up, east right (map view), azimuth clockwise from north.
// Normal mode: centre = zenith, rim = horizon.
// Horizon zoom: rim = −10°, horizon ring at +0°, centre = +20°. Used at polar sites where everything hugs the horizon.

const SIZE = 360, C = SIZE / 2, R = 150;

function radius(alt, zoom) {
  if (zoom) return R * Math.min(1, Math.max(0, (20 - alt) / 30));
  return R * Math.min(1.08, Math.max(0, (90 - alt) / 90));
}

function xy(alt, az, zoom) {
  const r = radius(alt, zoom);
  const a = (az * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

function pathD(points, zoom) {
  let d = '';
  let prevAz = null;
  let pen = false;
  for (const p of points) {
    const outside = zoom ? p.alt < -10 : p.alt < 0; // don't draw the path through the ground
    if (outside) { pen = false; prevAz = null; continue; }
    const [x, y] = xy(p.alt, p.az, zoom);
    const jump = prevAz != null && Math.abs(p.az - prevAz) > 180 && radius(p.alt, zoom) < R * 0.2;
    d += `${pen && !jump ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    pen = true;
    prevAz = p.az;
  }
  return d;
}

// Ground silhouette: the area between the terrain horizon and the plot rim (even-odd fill).
function groundD(horizon, azStart, azStep, zoom) {
  let d = `M${C - R},${C} a${R},${R} 0 1,0 ${2 * R},0 a${R},${R} 0 1,0 ${-2 * R},0 Z `;
  horizon.forEach((alt, i) => {
    const [x, y] = xy(alt, azStart + i * azStep, zoom);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
  });
  return d + 'Z';
}

export default function SkyDome({ sun, earth, sunPath, earthPath, margin, zoom, onToggleZoom, terrain }) {
  const horizonR = radius(0, zoom);
  const rings = zoom ? [10, -5] : [30, 60];
  const sunXY = xy(sun.alt, sun.az, zoom);
  const earthXY = xy(earth.alt, earth.az, zoom);
  const below = (b) => (b.clear ?? b.alt) < -margin;

  return (
    <div className="dome-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="dome" role="img"
        aria-label={`Sky dome. Sun at ${sun.alt.toFixed(1)} degrees, Earth at ${earth.alt.toFixed(1)} degrees elevation.`}>
        <defs>
          <radialGradient id="sky" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1d2a4d" />
            <stop offset="100%" stopColor="#111a33" />
          </radialGradient>
          <radialGradient id="sunGlow">
            <stop offset="0%" stopColor="#ffc845" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ffc845" stopOpacity="0" />
          </radialGradient>
        </defs>
        {zoom && <circle cx={C} cy={C} r={R} fill="#3a3f4b" />}
        <circle cx={C} cy={C} r={horizonR} fill="url(#sky)" />
        {/* uncertainty band around the horizon */}
        <circle cx={C} cy={C} r={(radius(-margin, zoom) + radius(margin, zoom)) / 2}
          fill="none" stroke="#ffb020" strokeOpacity="0.28"
          strokeWidth={Math.max(1.5, radius(-margin, zoom) - radius(margin, zoom))} />
        {rings.map((a) => (
          <g key={a}>
            <circle cx={C} cy={C} r={radius(a, zoom)} fill="none" stroke="#8e97ad" strokeOpacity="0.35" strokeDasharray="4 5" />
            <text x={C + 4} y={C - radius(a, zoom) - 3} className="dome-ring">{a > 0 ? `+${a}°` : `${a}°`}</text>
          </g>
        ))}
        <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="#8e97ad" strokeOpacity="0.25" strokeDasharray="4 5" />
        <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="#8e97ad" strokeOpacity="0.25" strokeDasharray="4 5" />
        <circle cx={C} cy={C} r={horizonR} fill="none" stroke="#e8ecf5" strokeOpacity={terrain ? 0.35 : 0.8} strokeWidth="2" strokeDasharray={terrain ? '6 5' : 'none'} />
        {terrain && (
          <path d={groundD(terrain.horizon, terrain.azStartDeg, terrain.azStepDeg, zoom)} fillRule="evenodd"
            fill="#6b6f7a" fillOpacity="0.82" stroke="#c9ced8" strokeWidth="1.2" />
        )}
        {zoom && <text x={C + horizonR * 0.7} y={C + horizonR * 0.7 + 18} className="dome-ring">below horizon</text>}
        {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([l, az]) => {
          const a = (az * Math.PI) / 180;
          return <text key={l} x={C + (R + 16) * Math.sin(a)} y={C - (R + 16) * Math.cos(a) + 5} className="dome-cardinal">{l}</text>;
        })}
        {/* paths drawn over the ground so you can see where terrain hides them */}
        {sunPath && <path d={pathD(sunPath, zoom)} fill="none" stroke="#ffc845" strokeOpacity="0.45" strokeWidth="2" />}
        {earthPath && <path d={pathD(earthPath, zoom)} fill="none" stroke="#4da3ff" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="3 4" />}
        <g opacity={below(earth) ? 0.45 : 1}>
          <circle cx={earthXY[0]} cy={earthXY[1]} r="9" fill="#4da3ff" stroke="#cfe6ff" strokeWidth="1.5" strokeDasharray={below(earth) ? '3 3' : 'none'} />
        </g>
        <g opacity={below(sun) ? 0.45 : 1}>
          <circle cx={sunXY[0]} cy={sunXY[1]} r="22" fill="url(#sunGlow)" />
          <circle cx={sunXY[0]} cy={sunXY[1]} r="9" fill="#ffc845" />
        </g>
      </svg>
      <div className="dome-legend">
        <span><i className="dot sun" /> Sun {sun.alt.toFixed(2)}° · az {sun.az.toFixed(0)}°</span>
        <span><i className="dot earth" /> Earth {earth.alt.toFixed(2)}° · az {earth.az.toFixed(0)}°</span>
        <span><i className="dot band" /> ±{margin}° uncertainty band</span>
        {terrain && <span><i className="dot ground" /> Real terrain (LOLA) · dashed ring = smooth-Moon horizon</span>}
        <button className="link" onClick={onToggleZoom}>{zoom ? 'Show full sky' : 'Zoom to horizon'}</button>
      </div>
    </div>
  );
}
