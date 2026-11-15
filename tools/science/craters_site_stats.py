# Robbins (2019) craters >= 1 km near each site: count within 5 km, crater the site is inside (if any), nearest rim.
import json, sys, numpy as np, pandas as pd, zipfile
RK = 1737.4
C = pd.read_csv(zipfile.ZipFile('robbins.zip').open('lunar_crater_database_robbins_2018_bundle/data/lunar_crater_database_robbins_2018.csv'), usecols=['LAT_CIRC_IMG', 'LON_CIRC_IMG', 'DIAM_CIRC_IMG'])
C = C[C.DIAM_CIRC_IMG >= 1]; clat, clon, cd = C.LAT_CIRC_IMG.values, C.LON_CIRC_IMG.values, C.DIAM_CIRC_IMG.values
def gc(a1, o1, a2, o2):
    p1, p2 = np.radians(a1), np.radians(a2); return RK*np.arccos(np.clip(np.sin(p1)*np.sin(p2) + np.cos(p1)*np.cos(p2)*np.cos(np.radians(o2 - o1)), -1, 1))
out = {}
for sid, la, lo in json.load(open(sys.argv[1])):
    m = np.abs(clat - la) < 3; d = gc(la, lo, clat[m], clon[m]); D = cd[m]; inside = d < D/2
    j = np.argmin(np.where(inside, D, np.inf)) if inside.any() else None; big = (d <= 10) & (D >= 5)
    out[sid] = dict(countAtLeast1kmWithin5km=int((d <= 5).sum()), insideCrater=dict(diamKm=round(float(D[j]), 2), distFromCentreKm=round(float(d[j]), 2)) if j is not None else None,
                    nearestRimKm=round(float(np.abs(d - D/2).min()), 2), largestAtLeast5kmWithin10km=round(float(D[big].max()), 1) if big.any() else None)
json.dump(out, open('craters_sites.json', 'w'), indent=1)
