# Stream NASA LRO Diviner Polar Resource Product (south, 605 MB fixed-width) and keep elements within 15 km of each site.
# Columns (1-based bytes): lon 127-141, lat 144-158, temp_avg 178-185, temp_max 188-195, ice_depth 198-208 (-999 = deeper than 2.87 m).
import json, math, sys, urllib.request, pandas as pd
U = 'https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab'
R = 1737.4
def xy(lat, lon):
    rho = 2*R*math.tan(math.pi/4 + math.radians(lat)/2); return rho*math.sin(math.radians(lon)), rho*math.cos(math.radians(lon))
sites = json.load(open(sys.argv[1])); S = [(sid, *xy(la, lo)) for sid, la, lo in sites]
rows = []
with urllib.request.urlopen(urllib.request.Request(U, headers={'User-Agent': 'Mozilla/5.0'})) as r:
    r.readline()
    for line in r:
        lon = float(line[126:141]); lat = float(line[143:158])
        if lat > -80.5: continue
        x, y = xy(lat, lon)
        for sid, sx, sy in S:
            d = math.hypot(x - sx, y - sy)
            if d <= 15: rows.append((sid, d, float(line[177:185]), float(line[187:195]), float(line[197:208])))
P = pd.DataFrame(rows, columns=['site', 'dist_km', 'temp_avg_K', 'temp_max_K', 'ice_depth_m']); out = {}
for sid, g in P.groupby('site'):
    at = g.loc[g.dist_km.idxmin()]; ice = g[(g.ice_depth_m >= 0) & (g.ice_depth_m <= 1)]; surf = g[g.ice_depth_m == 0]; w5 = g.dist_km <= 5
    out[sid] = dict(tempAvgK=round(at.temp_avg_K, 1), tempMaxK=round(at.temp_max_K, 1), iceDepthM=None if at.ice_depth_m < 0 else round(at.ice_depth_m, 2),
                    nearestIceWithin1mKm=round(ice.dist_km.min(), 2) if len(ice) else None, nearestSurfaceIceKm=round(surf.dist_km.min(), 2) if len(surf) else None,
                    icePctWithin5km=round(100*((w5) & (g.ice_depth_m >= 0) & (g.ice_depth_m <= 1)).sum()/max(1, w5.sum()), 1))
json.dump(out, open('diviner_sites.json', 'w'), indent=1)
