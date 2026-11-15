import React, { useState } from 'react';
import { fmtLat, fmtLon } from '../format.js';

// South-polar map (80-90 S), polar stereographic like NASA's LOLA products: 0 deg E at the top, pole at the centre.
// Background: shaded relief made from NASA LRO LOLA LDEM_80S_80MPP_ADJ (Barker et al. 2023), 640 m pixels.
// Pins = curated sites, coloured by verdict for the current date and settings. Click empty ground = custom point.
const S = 600, R = 1737400;
const VIEWS = {
  full: { ext: 304000, img: '/map/lola_south_pole_80S.jpg', rings: [85, 88], label: '80–90°S' },
  pole: { ext: 74880, img: '/map/lola_south_pole_zoom75km.jpg', rings: [88, 89], label: 'pole close-up (±75 km)' },
};
let EXT = 304000;
const toXY = (lat, lon) => {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  const rho = 2 * R * Math.tan(Math.PI / 4 + la / 2);
  const x = rho * Math.sin(lo), y = rho * Math.cos(lo);
  return [((x + EXT) / (2 * EXT)) * S, ((EXT - y) / (2 * EXT)) * S];
};
const fromXY = (px, py) => {
  const x = (px / S) * 2 * EXT - EXT, y = EXT - (py / S) * 2 * EXT;
  const rho = Math.hypot(x, y);
  return [-(90 - (2 * Math.atan(rho / (2 * R)) * 180) / Math.PI), (Math.atan2(x, y) * 180) / Math.PI];
};
const COLOR = { GO: '#5bd38a', CAUTION: '#ffb020', 'NO-GO': '#ff6b6b' };
const short = (n) => n.replace(/ \(Artemis III region\)/, '').replace(/ \(.*\)$/, '');

export default function PolarMap({ rows, currentId, custom, onPick, onPickPoint }) {
  const [hover, setHover] = useState(null);
  const [view, setView] = useState('full');
  const V = VIEWS[view]; EXT = V.ext;
  const inView = (lat, lon) => { const [x, y] = toXY(lat, lon); return lat <= -80 && x >= 0 && x <= S && y >= 0 && y <= S; };
  const svgPt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * S, ((e.clientY - r.top) / r.height) * S];
  };
  const onMove = (e) => { const [px, py] = svgPt(e); const [lat, lon] = fromXY(px, py); setHover(inView(lat, lon) ? { lat, lon } : null); };
  const onClick = (e) => {
    if (e.target.closest && e.target.closest('.pin')) return;
    const [px, py] = svgPt(e); const [lat, lon] = fromXY(px, py);
    if (inView(lat, lon)) onPickPoint(Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4);
  };
  const onMap = rows.filter((r) => r.site.id !== 'custom' && inView(r.site.lat, r.site.lon));
  // Label placement: selected site first, then skip any label whose pin is within 22 px of an already-labelled pin.
  const placed = [];
  const labelled = new Set();
  [...onMap].sort((a, b) => (b.site.id === currentId) - (a.site.id === currentId)).forEach((r) => {
    const [x, y] = toXY(r.site.lat, r.site.lon);
    if (placed.every(([px, py]) => Math.hypot(px - x, py - y) > 22)) { placed.push([x, y]); labelled.add(r.site.id); }
  });
  const off = rows.filter((r) => r.site.id !== 'custom' && !inView(r.site.lat, r.site.lon));
  const cur = rows.find((r) => r.site.id === currentId);
  const ring = (lat) => { const [x] = toXY(lat, 90); return x - S / 2; };
  const scaleKm = view === 'full' ? 50 : 10; const scale50 = ((scaleKm * 1000) / (2 * EXT)) * S;
  return (
    <div className="pmap-wrap">
      <div className="seg pmap-views" role="group" aria-label="Map view">
        {Object.entries(VIEWS).map(([k, v]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{k === 'full' ? 'Whole south pole' : 'Zoom to pole'}</button>)}
      </div>
      <svg viewBox={`0 0 ${S} ${S}`} className="pmap" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick}
        role="img" aria-label="Map of the lunar south pole with candidate landing sites">
        <image href={V.img} x="0" y="0" width={S} height={S} preserveAspectRatio="none" />
        {V.rings.map((l) => (
          <g key={l}>
            <circle cx={S / 2} cy={S / 2} r={ring(-l)} fill="none" stroke="#e8ecf5" strokeOpacity="0.35" strokeDasharray="3 5" />
            <text x={S / 2 + 4} y={S / 2 - ring(-l) - 4} className="pmap-grid">{l}°S</text>
          </g>
        ))}
        {[0, 90, 180, 270].map((lo) => {
          const [x, y] = view === 'full' ? toXY(-80.4, lo) : [S / 2 + 280 * Math.sin((lo * Math.PI) / 180), S / 2 - 280 * Math.cos((lo * Math.PI) / 180)];
          return <text key={lo} x={x} y={y} className="pmap-grid" textAnchor="middle" dominantBaseline="middle">{lo === 0 ? '0°' : lo === 90 ? '90°E' : lo === 180 ? '180°' : '90°W'}</text>;
        })}
        {onMap.map((r) => {
          const [x, y] = toXY(r.site.lat, r.site.lon); const sel = r.site.id === currentId;
          return (
            <g key={r.site.id} className="pin" onClick={(e) => { e.stopPropagation(); onPick(r.site.id); }} style={{ cursor: 'pointer' }}>
              <title>{`${r.site.name}: ${r.verdict.status}`}</title>
              {sel && <circle cx={x} cy={y} r="13" fill="none" stroke="#fff" strokeWidth="2" />}
              <circle cx={x} cy={y} r={sel ? 8 : 6.5} fill={COLOR[r.verdict.status]} stroke="#0a0f1f" strokeWidth="2" />
              {labelled.has(r.site.id) && <text x={x + 10} y={y + 4} className={`pmap-label ${sel ? 'sel' : ''}`}>{short(r.site.name)}</text>}
            </g>
          );
        })}
        {custom && inView(custom.lat, custom.lon) && (() => {
          const [x, y] = toXY(custom.lat, custom.lon);
          return <g><path d={`M${x - 8},${y} L${x + 8},${y} M${x},${y - 8} L${x},${y + 8}`} stroke="#fff" strokeWidth="2.5" /><text x={x + 10} y={y + 4} className="pmap-label sel">Your point</text></g>;
        })()}
        <g transform={`translate(${S - scale50 - 16},${S - 18})`}>
          <rect x="-6" y="-14" width={scale50 + 12} height="22" rx="4" fill="#0a0f1f" fillOpacity="0.7" />
          <line x1="0" y1="0" x2={scale50} y2="0" stroke="#e8ecf5" strokeWidth="2" />
          <text x={scale50 / 2} y="-4" className="pmap-grid" textAnchor="middle">{scaleKm} km</text>
        </g>
      </svg>
      <div className="statusbar">
        <span><b>LAT</b> {hover ? fmtLat(hover.lat) : '--'}</span>
        <span><b>LON</b> {hover ? fmtLon(hover.lon) : '--'}</span>
        <span className="legend"><i style={{ background: COLOR.GO }} />GO <i style={{ background: COLOR.CAUTION }} />CAUTION <i style={{ background: COLOR['NO-GO'] }} />NO-GO</span>
      </div>
      <p className="hint small">Click a pin to load a site, or click anywhere on the ground to test your own point. Colours use the current date and settings.
        {cur && !inView(cur.site.lat, cur.site.lon) && <strong> {cur.site.name} is outside this view ({V.label}).</strong>}</p>
      {off.length > 0 && (
        <p className="hint small offmap">Outside this view: {off.map((r) => (
          <button key={r.site.id} className={`chip ${r.site.id === currentId ? 'sel' : ''}`} onClick={() => onPick(r.site.id)}>
            <i style={{ background: COLOR[r.verdict.status] }} />{short(r.site.name)}</button>))}</p>
      )}
      <p className="hint tiny">Relief: NASA LRO LOLA 80–90°S elevation map (Barker et al. 2023), shaded by us.</p>
    </div>
  );
}
