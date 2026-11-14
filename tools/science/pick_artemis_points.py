# Representative landing point per NASA Artemis III candidate region, chosen only from NASA data:
# highest NASA PGDA average solar illumination (120 m) among pixels with LOLA 80 m slope <= 8 deg, inside the search area.
# Ties -> NASA Earth visibility. Search areas: NASA PGDA 5 m site box where NASA mapped the region, else a circle around the
# named feature's centre from the USGS Gazetteer of Planetary Nomenclature.
import json, numpy as np, rasterio, rasterio.windows as W
R = 1737400.0
def ll_to_xy(lat, lon):
    lat, lon = np.radians(lat), np.radians(lon); rho = 2*R*np.tan(np.pi/4 + lat/2); return rho*np.sin(lon), rho*np.cos(lon)
def xy_to_ll(x, y):
    rho = np.hypot(x, y); return np.degrees(-(np.pi/2 - 2*np.arctan(rho/(2*R)))), np.degrees(np.arctan2(x, y))
REG = [
 dict(id='nobile-rim-1', box=(74000, 100000, 94000, 120000)),        # PGDA Site06 "Nobile rim 1"
 dict(id='nobile-rim-2', box=(147000, 85000, 167000, 105000)),       # PGDA DM2 "Nobile rim 2"
 dict(id='haworth', box=(-52900, 75600, -23100, 105400)),            # PGDA "Haworth"
 dict(id='de-gerlache-rim-2', box=(-58500, 13000, -38500, 33000)),   # PGDA SL2 "de Gerlache rim"
 dict(id='peak-near-cabeus-b', centre=(-82.26, -54.58), radius_km=45),   # USGS 8058 Cabeus B
 dict(id='slater-plain', centre=(-88.08, 111.29), radius_km=25),         # USGS 15325 Slater
 dict(id='mons-mouton-plateau', centre=(-84.60, 31.00), radius_km=30),   # USGS 16070 Mons Mouton (boxes above excluded)
]
IL = 'AVGVISIB_75S_120M_201608.TIF'; EA = 'AVGVISIB_75S_120M_201608_EARTH.TIF'; SL = 'LDSM_80S_80MPP_ADJ.TIF'
il, ea, sl = rasterio.open(IL), rasterio.open(EA), rasterio.open(SL); out = []
for g in REG:
    if 'box' in g: x0, y0, x1, y1 = g['box']
    else: cx, cy = ll_to_xy(*g['centre']); r = g['radius_km']*1000; x0, y0, x1, y1 = cx-r, cy-r, cx+r, cy+r
    win = W.from_bounds(x0, y0, x1, y1, il.transform).round_offsets().round_lengths()
    I = il.read(1, window=win).astype(float); E = ea.read(1, window=win).astype(float); I[I < 0] = np.nan; E[E < 0] = np.nan; I *= 4e-5; E *= 4e-5
    t = il.window_transform(win); cols, rows = np.meshgrid(np.arange(I.shape[1]), np.arange(I.shape[0]))
    X = t.c + (cols + 0.5)*t.a; Y = t.f + (rows + 0.5)*t.e
    sr, sc = map(np.array, rasterio.transform.rowcol(sl.transform, X.ravel(), Y.ravel()))
    S = sl.read(1, window=W.Window(sc.min(), sr.min(), sc.max()-sc.min()+1, sr.max()-sr.min()+1))[sr-sr.min(), sc-sc.min()].reshape(I.shape)
    ok = np.isfinite(I) & np.isfinite(S) & (S <= 8.0)
    if 'centre' in g:
        ok &= np.hypot(X - cx, Y - cy) <= g['radius_km']*1000
        for o in REG:
            if 'box' in o: bx0, by0, bx1, by1 = o['box']; ok &= ~((X >= bx0) & (X <= bx1) & (Y >= by0) & (Y <= by1))
    k = np.unravel_index(np.argmax(np.where(ok, I + 1e-3*np.nan_to_num(E), -1)), I.shape); lat, lon = xy_to_ll(X[k], Y[k])
    out.append(dict(id=g['id'], lat=round(float(lat), 4), lon=round(float(lon), 4), pgda_sun_pct=round(100*I[k], 1), pgda_earth_pct=round(100*E[k], 1), slope80_deg=round(float(S[k]), 1)))
    print(out[-1])
json.dump(out, open('artemis_points.json', 'w'), indent=1)
