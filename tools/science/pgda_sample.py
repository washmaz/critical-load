# NASA PGDA average sunlight / Earth visibility (Mazarico et al. 2011) at each polar site: centre pixel and 3x3 range.
import json, sys, numpy as np, rasterio
R = 1737400.0
def xy(lat, lon):
    lat, lon = np.radians(lat), np.radians(lon); rho = 2*R*np.tan(np.pi/4 + lat/2); return rho*np.sin(lon), rho*np.cos(lon)
sites = json.load(open(sys.argv[1]))   # [[id, lat, lon], ...]
out = {}
with rasterio.open('AVGVISIB_75S_120M_201608.TIF') as I, rasterio.open('AVGVISIB_75S_120M_201608_EARTH.TIF') as E:
    for sid, lat, lon in sites:
        r, c = I.index(*xy(lat, lon)); w = ((r-1, r+2), (c-1, c+2))
        a = I.read(1, window=w)*4e-3; b = E.read(1, window=w)*4e-3   # percent
        out[sid] = dict(sunPct=round(float(a[1, 1]), 1), earthPct=round(float(b[1, 1]), 1), sunRangePct=[round(float(a.min()), 1), round(float(a.max()), 1)], earthRangePct=[round(float(b.min()), 1), round(float(b.max()), 1)])
json.dump(out, open('pgda_sites.json', 'w'), indent=1)
