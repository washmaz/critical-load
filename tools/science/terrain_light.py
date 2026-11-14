
# Low-memory terrain pipeline (same method as terrain_pipeline/run.py):
#  horizon = max terrain elevation angle in 720 azimuth bins, rays from 240 m to the DEM edge, observer 2 m up.
#  Near field (<=29 km): LOLA LDEM_80S_80MPP_ADJ at 80 m, read as a window over HTTP.
#  Far field: the same map averaged to 320 m (far320.npy). Slope: LDSM_80S_80MPP_ADJ window. Ice traps: LPSR_80S_20MPP_ADJ_1km2.
import sys, json, math, numpy as np, rasterio, pandas as pd, shapely
import astronomy as A
from rasterio.windows import Window
R = 1737400.0; RK = 1737.4; AU = 149597870.7; NAZ = 720
DEM_U = "/home/user/tl/ldem80.tif"
SLP_U = "/home/user/tl/ldsm80.tif"
PSR_U = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ_1km2.CSV"
X0, Y0 = -304000.0, 304000.0
def ll_to_xy(lat, lon):
    lat, lon = np.radians(lat), np.radians(lon); rho = 2*R*np.tan(np.pi/4 + lat/2); return rho*np.sin(lon), rho*np.cos(lon)
def unit(lat, lon): return np.stack([np.cos(lat)*np.cos(lon), np.cos(lat)*np.sin(lon), np.sin(lat)], -1)
def enu(lat0, lon0):
    up = np.array([np.cos(lat0)*np.cos(lon0), np.cos(lat0)*np.sin(lon0), np.sin(lat0)]); e = np.array([-np.sin(lon0), np.cos(lon0), 0.0]); return e, np.cross(up, e), up
def bil(a, pix, x0, y0, x, y):
    r = (y0 - y)/pix - 0.5; c = (x - x0)/pix - 0.5
    r0 = np.floor(r).astype(int); c0 = np.floor(c).astype(int); fr = r - r0; fc = c - c0
    ok = (r0 >= 0) & (c0 >= 0) & (r0 < a.shape[0]-1) & (c0 < a.shape[1]-1)
    r0 = np.clip(r0, 0, a.shape[0]-2); c0 = np.clip(c0, 0, a.shape[1]-2)
    v = a[r0, c0]*(1-fr)*(1-fc) + a[r0, c0+1]*(1-fr)*fc + a[r0+1, c0]*fr*(1-fc) + a[r0+1, c0+1]*fr*fc
    return np.where(ok, v, np.nan)
far = np.load("/home/user/tl/far320.npy") if __name__ == "__main__" and sys.argv[1] != "psr" else None
def site_terrain(s):
    lat0, lon0 = math.radians(s["lat"]), math.radians(s["lon"])
    x, y = ll_to_xy(s["lat"], s["lon"])
    half = 30000.0
    with rasterio.open(DEM_U) as d:
        c0 = int((x - half - X0)//80); r0 = int((Y0 - (y + half))//80); n = int(2*half//80)
        near = d.read(1, window=Window(c0, r0, n, n)).astype(np.float64)
    nx0 = X0 + c0*80; ny0 = Y0 - r0*80
    h0 = float(bil(near, 80.0, nx0, ny0, np.array([x]), np.array([y]))[0])
    O = (R + h0 + 2.0)*unit(lat0, lon0); e, nn, up = enu(lat0, lon0)
    d = list(np.arange(240.0, 4000.0, 40.0))
    while d[-1] < 600000: d.append(d[-1]*1.01)
    d = np.array(d); dd = d/R
    az = np.radians((np.arange(NAZ) + 0.5)*360.0/NAZ)
    D, Z = np.meshgrid(dd, az)
    lat = np.arcsin(np.sin(lat0)*np.cos(D) + np.cos(lat0)*np.sin(D)*np.cos(Z))
    lon = lon0 + np.arctan2(np.sin(Z)*np.sin(D)*np.cos(lat0), np.cos(D) - np.sin(lat0)*np.sin(lat))
    rho = 2*R*np.tan(np.pi/4 + lat/2); X = rho*np.sin(lon); Y = rho*np.cos(lon)
    H = np.where(D*R <= 29000, bil(near, 80.0, nx0, ny0, X, Y), bil(far, 320.0, X0, Y0, X, Y))
    V = (R + H)[..., None]*unit(lat, lon) - O
    alt = np.degrees(np.arctan2(V@up, np.hypot(V@e, V@nn)))
    hz = np.nanmax(alt, axis=1)
    with rasterio.open(SLP_U) as sd:
        c = int((x - X0)//80); r = int((Y0 - y)//80); k = 12
        win = sd.read(1, window=Window(c - k, r - k, 2*k + 1, 2*k + 1)).astype(float)
    yy, xx = np.mgrid[-k:k+1, -k:k+1]; disk = (xx**2 + yy**2) <= k*k
    sl = dict(atSiteDeg=round(float(np.nanmean(win[k-1:k+2, k-1:k+2])), 1), p90Within1kmDeg=round(float(np.nanpercentile(win[disk], 90)), 1), maxWithin1kmDeg=round(float(np.nanmax(win[disk])), 1))
    return h0, hz, sl
def nearest_psr(sites):
    pts = {s["id"]: shapely.Point(*ll_to_xy(s["lat"], s["lon"])) for s in sites}; best = {k: (1e18, None) for k in pts}
    for ch in pd.read_csv(PSR_U, chunksize=3000):
        g = shapely.from_wkt(ch["WKT"].values)
        for k, p in pts.items():
            dist = shapely.distance(p, g); i = int(np.argmin(dist))
            if dist[i] < best[k][0]: best[k] = (float(dist[i]), dict(name=str(ch["name"].iloc[i]).strip().strip('"'), areaKm2=round(float(ch["area_km2"].iloc[i]), 1)))
    return {k: dict(**v[1], distanceKm=round(v[0]/1000, 2)) for k, v in best.items()}
def rot(t):
    ax = A.RotationAxis(A.Body.Moon, t); ra = np.radians(ax.ra*15.0); dec = np.radians(ax.dec); W = np.radians(ax.spin)
    Rz = lambda a: np.array([[np.cos(a), np.sin(a), 0], [-np.sin(a), np.cos(a), 0], [0, 0, 1]])
    Rx = lambda a: np.array([[1, 0, 0], [0, np.cos(a), np.sin(a)], [0, -np.sin(a), np.cos(a)]])
    return Rz(W) @ Rx(np.pi/2 - dec) @ Rz(np.pi/2 + ra)
def body_vectors(t0, hours, step):
    S, E = [], []
    for k in range(int(hours/step)):
        t = t0.AddDays(k*step/24.0); m = A.GeoMoon(t); s = A.GeoVector(A.Body.Sun, t, True)
        moon = np.array([m.x, m.y, m.z])*AU; sun = np.array([s.x, s.y, s.z])*AU; M = rot(t)
        S.append(M @ (sun - moon)); E.append(M @ (-moon))
    return np.array(S), np.array(E)
def altaz(V, lat, lon, hk):
    la, lo = np.radians(lat), np.radians(lon); O = (RK + hk)*unit(la, lo); e, n, up = enu(la, lo); W = V - O
    return np.degrees(np.arctan2(W@up, np.hypot(W@e, W@n))), np.degrees(np.arctan2(W@e, W@n)) % 360
def hz_at(hz, az):
    x = np.asarray(az)/(360.0/NAZ) - 0.5; i0 = np.floor(x).astype(int) % NAZ; f = x - np.floor(x); return hz[i0]*(1-f) + hz[(i0+1) % NAZ]*f
def longest_false(mask, step):
    best = cur = 0
    for v in mask:
        cur = 0 if v else cur + 1; best = max(best, cur)
    return best*step
if __name__ == "__main__":
    mode = sys.argv[1]; sites = json.load(open("/home/user/tl/sites.json"))
    if mode == "psr":
        json.dump(nearest_psr(sites), open("/home/user/tl/psr.json", "w")); print("psr ok"); sys.exit()
    s = [q for q in sites if q["id"] == mode][0]
    h0, hz, sl = site_terrain(s); hk = (h0 + 2.0)/1000.0
    T0 = A.Time.Make(2026, 11, 14, 21, 0, 0); yearly = {}
    for key, hours, step in [("30d", 720, 1.0), ("1yr", 8760, 2.0)]:
        S, E = body_vectors(T0, hours, step)
        sa, _ = altaz(S, s["lat"], s["lon"], 0.0); ea, _ = altaz(E, s["lat"], s["lon"], 0.0)
        sa2, sz2 = altaz(S, s["lat"], s["lon"], hk); ea2, ez2 = altaz(E, s["lat"], s["lon"], hk)
        st, et = sa2 > hz_at(hz, sz2), ea2 > hz_at(hz, ez2)
        yearly[key] = dict(smoothSunPct=round(100*float((sa > 0).mean()), 1), terrainSunPct=round(100*float(st.mean()), 1),
                           smoothLongestDarkH=longest_false(sa > 0, step), terrainLongestDarkH=longest_false(st, step),
                           smoothEarthPct=round(100*float((ea > 0).mean()), 1), terrainEarthPct=round(100*float(et.mean()), 1))
    out = dict(id=s["id"], elevationM=round(h0, 1), observerHeightM=2.0, azStepDeg=0.5, azStartDeg=0.25,
               horizonDeg=[round(float(v), 3) for v in hz], slope=sl, runs=yearly)
    json.dump(out, open("/home/user/tl/out_%s.json" % s["id"], "w")); print(s["id"], "ok", yearly["30d"], yearly["1yr"], sl)
