"""Pre-compute Sun and Earth altitude/azimuth tables for the app's preset sites.

Independent of the in-browser engine (astronomy-engine), so the two can cross-check each other.

Data (all NASA/JPL):
  de421.bsp                       JPL planetary + lunar ephemeris DE421 (Folkner et al. 2008)
  moon_pa_de421_1900-2050.bpc     DE421 lunar libration (principal-axis orientation)
  moon_080317.tf, pck00008.tpc    NAIF frame kernels defining MOON_ME_DE421 (mean Earth / polar axis)
MOON_ME_DE421 is the same body-fixed frame the LOLA terrain products use, so these tables line up
with the terrain horizons. Directions are apparent (light-time + aberration), airless.
Library: Skyfield (Rhodes, MIT licence).

Kernels go in kernels/ (not committed, 18 MB). Get them from NASA NAIF generic_kernels
(https://naif.jpl.nasa.gov/pub/naif/generic_kernels/) or the Skyfield repo's ci/ folder:
  for f in de421.bsp moon_pa_de421_1900-2050.bpc moon_080317.tf pck00008.tpc; do
    curl -L -o kernels/$f https://raw.githubusercontent.com/skyfielders/python-skyfield/master/ci/$f; done

Output: public/ephem/manifest.json + one <key>.bin per site.
  .bin = 4 little-endian arrays of length n, hourly from manifest.start:
         int16 sunAlt*100, uint16 sunAz*100, int16 earthAlt*100, uint16 earthAz*100   (0.01 deg)
Usage: pip install skyfield numpy
       python tools/precompute_ephemeris.py [--start 2026-11-01] [--end 2029-01-01]
To add a site: add it to tools/sites_for_ephem.json and rerun.
"""
import argparse, json, os, datetime as dt
import numpy as np
from skyfield.api import load, load_file
from skyfield.planetarylib import PlanetaryConstants


def site_key(lat, lon):
    return f"{lat:.4f}_{lon:.4f}".replace('-', 'm')


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument('--start', default='2026-11-01')
    ap.add_argument('--end', default='2029-01-01')
    ap.add_argument('--kernels', default=os.path.join(here, '..', 'kernels'))
    ap.add_argument('--sites', default=os.path.join(here, 'sites_for_ephem.json'))
    ap.add_argument('--out', default=os.path.join(here, '..', 'public', 'ephem'))
    a = ap.parse_args()
    K = lambda f: os.path.join(a.kernels, f)

    ts = load.timescale(builtin=True)
    eph = load_file(K('de421.bsp'))
    pc = PlanetaryConstants()
    pc.read_text(open(K('moon_080317.tf'), 'rb'))
    pc.read_text(open(K('pck00008.tpc'), 'rb'))
    pc.read_binary(open(K('moon_pa_de421_1900-2050.bpc'), 'rb'))
    frame = pc.build_frame_named('MOON_ME_DE421')
    moon, sun, earth = eph['moon'], eph['sun'], eph['earth']

    t0 = dt.datetime.fromisoformat(a.start).replace(tzinfo=dt.timezone.utc)
    t1 = dt.datetime.fromisoformat(a.end).replace(tzinfo=dt.timezone.utc)
    n = int((t1 - t0).total_seconds() // 3600)
    t = ts.utc(t0.year, t0.month, t0.day, np.arange(n))

    sites = json.load(open(a.sites))
    os.makedirs(a.out, exist_ok=True)
    manifest = {
        'format': 'hourly int16/uint16 x 0.01 deg: sunAlt, sunAz, earthAlt, earthAz',
        'start': t0.strftime('%Y-%m-%dT%H:%M:%SZ'), 'stepSeconds': 3600, 'n': n,
        'frame': 'MOON_ME_DE421', 'ephemeris': 'JPL DE421 (de421.bsp) + moon_pa_de421_1900-2050.bpc',
        'radiusKm': 1737.4, 'corrections': 'apparent (light-time + stellar aberration), no refraction',
        'generated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
        'tool': 'tools/precompute_ephemeris.py (Skyfield)', 'sites': {},
    }
    for s in sites:
        obs = (moon + pc.build_latlon_degrees(frame, s['lat'], s['lon'])).at(t)
        out = []
        for body in (sun, earth):
            alt, az, _ = obs.observe(body).apparent().altaz()
            out.append(np.round(alt.degrees * 100).astype('<i2'))
            out.append(np.round((az.degrees % 360) * 100).astype('<u2'))
        key = site_key(s['lat'], s['lon'])
        with open(os.path.join(a.out, key + '.bin'), 'wb') as f:
            for arr in out:
                f.write(arr.tobytes())
        manifest['sites'][key] = {'id': s['id'], 'name': s['name'], 'lat': s['lat'], 'lon': s['lon'], 'file': key + '.bin'}
        print(f"{s['id']:18s} {key}  sun alt {out[0][0]/100:+.2f}  earth alt {out[2][0]/100:+.2f}")
    json.dump(manifest, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)
    print('hours per site:', n)


if __name__ == '__main__':
    main()
