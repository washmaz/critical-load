# Interpolation + quantization error: table (hourly, 0.01 deg) vs direct DE421 at the half-hour.
# Run from the repo root after precompute_ephemeris.py: python tools/check_interp.py
import json, os
import numpy as np
from skyfield.api import load, load_file
from skyfield.planetarylib import PlanetaryConstants
K = lambda f: os.path.join('kernels', f)
ts = load.timescale(builtin=True); eph = load_file(K('de421.bsp')); pc = PlanetaryConstants()
for f in ('moon_080317.tf', 'pck00008.tpc'): pc.read_text(open(K(f), 'rb'))
pc.read_binary(open(K('moon_pa_de421_1900-2050.bpc'), 'rb')); fr = pc.build_frame_named('MOON_ME_DE421')
m = json.load(open('public/ephem/manifest.json')); n = m['n']
idx = np.arange(0, n - 1, 7)
for key, e in m['sites'].items():
    raw = np.fromfile('public/ephem/' + e['file'], dtype='<u2').reshape(4, n).astype(float)
    for r in (0, 2): raw[r] = raw[r].astype(np.uint16).view(np.int16)
    raw /= 100
    t = ts.utc(2026, 11, 1, idx + 0.5)
    obs = (eph['moon'] + pc.build_latlon_degrees(fr, e['lat'], e['lon'])).at(t)
    worst = []
    for j, body in enumerate((eph['sun'], eph['earth'])):
        alt = obs.observe(body).apparent().altaz()[0].degrees
        A = np.radians(raw[2*j]); Z = np.radians(raw[2*j+1])
        v = np.stack([np.cos(A)*np.sin(Z), np.cos(A)*np.cos(Z), np.sin(A)])
        w = (v[:, idx] + v[:, idx+1]) / 2
        interp = np.degrees(np.arctan2(w[2], np.hypot(w[0], w[1])))
        worst.append(np.abs(interp - alt).max())
    print(f"{e['id']:18s} max interp error  sun alt {worst[0]:.4f} deg   earth alt {worst[1]:.4f} deg")
