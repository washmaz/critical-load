// Engine v1 (checkpoint 1) core math, used only by the cross-check and fallback tests.
import { Body, MakeTime, GeoMoon, HelioVector, RotationAxis } from 'astronomy-engine';
const R = 1737.4, KM_PER_AU = 149597870.691, DEG = Math.PI / 180;
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const rotZ = (v, g) => { const c = Math.cos(g), s = Math.sin(g); return [c*v[0]+s*v[1], -s*v[0]+c*v[1], v[2]]; };
const rotX = (v, g) => { const c = Math.cos(g), s = Math.sin(g); return [v[0], c*v[1]+s*v[2], -s*v[1]+c*v[2]]; };
function toFixed(v, ax) { let w = rotZ(v, Math.PI/2 + ax.ra*15*DEG); w = rotX(w, Math.PI/2 - ax.dec*DEG); return rotZ(w, ax.spin*DEG); }
export function liveAltAz(site, date) {
  const t = MakeTime(date), ax = RotationAxis(Body.Moon, t), g = GeoMoon(t), h = HelioVector(Body.Moon, t);
  const vecs = { sun: toFixed([-h.x*KM_PER_AU, -h.y*KM_PER_AU, -h.z*KM_PER_AU], ax), earth: toFixed([-g.x*KM_PER_AU, -g.y*KM_PER_AU, -g.z*KM_PER_AU], ax) };
  const la = site.lat*DEG, lo = site.lon*DEG;
  const up = [Math.cos(la)*Math.cos(lo), Math.cos(la)*Math.sin(lo), Math.sin(la)], east = [-Math.sin(lo), Math.cos(lo), 0], north = [-Math.sin(la)*Math.cos(lo), -Math.sin(la)*Math.sin(lo), Math.cos(la)];
  const out = {};
  for (const k of ['sun', 'earth']) {
    const d = [vecs[k][0]-up[0]*R, vecs[k][1]-up[1]*R, vecs[k][2]-up[2]*R], r = Math.hypot(...d);
    let az = Math.atan2(dot(d, east), dot(d, north)) / DEG; if (az < 0) az += 360;
    out[k] = { alt: Math.asin(dot(d, up)/r)/DEG, az };
  }
  return out;
}
