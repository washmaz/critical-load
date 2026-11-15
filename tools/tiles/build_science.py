# Build the NASA science tiles (120 m) for ANY point south of ~76 S, on the NASA PGDA polar grid.
#   science/s{r}_{c}.bin : 256 x 256 px, gzip( sun[65536] earth[65536] tavgK[65536] tmaxHalfK[65536] ice2cm[65536] ) uint8
#   sun   = 2 x % of time Sun visible (0-200), 254 = permanently shadowed (NASA LPSR), 255 = no data
#   earth = 2 x % of time Earth visible (0-200), 255 = no data      (NASA PGDA, Mazarico et al. 2011; 18.6-year hourly average)
#   tavgK (K), tmaxHalfK (Tmax / 2, 2 K steps; polar maxima span ~25-330 K), ice2cm (depth of stable ice in 2 cm steps; 250 = deeper than 2.87 m): LRO Diviner Polar Resource Product.
#   Each 120 m cell takes the Diviner PRP triangle that CONTAINS the cell centre (exact point-in-triangle; values jump between
#   neighbouring ~500 m triangles, so nearest-centre or averaging would be wrong).
# Usage: python3 build_science.py DATADIR OUTDIR
import sys, os, gzip, json, numpy as np, pandas as pd, rasterio
from rasterio.windows import Window
D, O = sys.argv[1], sys.argv[2]; T = 256; os.makedirs(O + '/science', exist_ok=True)
R = 1737400.0; PIX = 120.0; EXT = 304080.0; N = int(2 * EXT / PIX)           # 5068
tav = np.full((N, N), 255, np.uint8); tmx = np.full((N, N), 255, np.uint8); ice = np.full((N, N), 255, np.uint8)
cols = ['tri1_x','tri1_y','tri1_z','tri2_x','tri2_y','tri2_z','tri3_x','tri3_y','tri3_z','tri_clat','temp_avg','temp_max','ice_depth']
W = 8; oy, ox = np.mgrid[0:W, 0:W]; oy = oy.ravel(); ox = ox.ravel()
def proj(x, y, z):
    r = np.sqrt(x*x + y*y + z*z); lat = np.arcsin(z / r); lon = np.arctan2(y, x)
    rho = 2 * R * np.tan(np.pi/4 + lat/2); return (rho * np.sin(lon) + EXT) / PIX, (EXT - rho * np.cos(lon)) / PIX
ntri = 0; clipped = [0]
for ch in pd.read_csv(D + '/prp_south.tab', skipinitialspace=True, chunksize=10000, usecols=lambda c: c.strip() in cols):
    ch.columns = [c.strip() for c in ch.columns]; ch = ch[ch['tri_clat'] <= -75.4]
    if not len(ch): continue
    ntri += len(ch); C = []; Rw = []
    for k in (1, 2, 3):
        c, r = proj(ch[f'tri{k}_x'].values, ch[f'tri{k}_y'].values, ch[f'tri{k}_z'].values); C.append(c); Rw.append(r)
    C = np.stack(C, 1); Rw = np.stack(Rw, 1)
    c0 = np.floor(C.min(1) - 0.5).astype(np.int64); r0 = np.floor(Rw.min(1) - 0.5).astype(np.int64)
    assert (np.ceil(C.max(1) - 0.5) - c0).max() < W and (np.ceil(Rw.max(1) - 0.5) - r0).max() < W
    cc = c0[:, None] + ox[None, :]; rr = r0[:, None] + oy[None, :]; px = cc + 0.5; py = rr + 0.5
    def edge(a, b): return (C[:, b, None] - C[:, a, None]) * (py - Rw[:, a, None]) - (Rw[:, b, None] - Rw[:, a, None]) * (px - C[:, a, None])
    e0 = edge(0, 1); e1 = edge(1, 2); e2 = edge(2, 0)
    ins = (((e0 >= 0) & (e1 >= 0) & (e2 >= 0)) | ((e0 <= 0) & (e1 <= 0) & (e2 <= 0))) & (cc >= 0) & (cc < N) & (rr >= 0) & (rr < N)
    ti, oi = np.nonzero(ins); RR = rr[ti, oi]; CC = cc[ti, oi]
    tav[RR, CC] = np.clip(np.round(ch['temp_avg'].values[ti]), 0, 249).astype(np.uint8)
    tm_ = ch['temp_max'].values[ti]; clipped[0] += int((tm_ > 498).sum()); tmx[RR, CC] = np.clip(np.round(tm_ / 2), 0, 249).astype(np.uint8)
    iv = ch['ice_depth'].values[ti]; ice[RR, CC] = np.where(iv < 0, 250, np.clip(np.round(iv * 50), 0, 249)).astype(np.uint8)
print('diviner triangles', ntri, 'Tmax above 498 K (clipped):', clipped[0], 'cells with data', int((tav != 255).sum()), 'of', N * N, flush=True)
off = int(round((457440 - EXT) / PIX)); nt = (N + T - 1) // T; idx = []
with rasterio.open(D + '/illum75S.tif') as I, rasterio.open(D + '/earth75S.tif') as E, rasterio.open(D + '/lpsr75S.tif') as P:
    for d in (I, E, P): assert d.width == 7624 and d.transform.a == 120.0 and d.transform.c == -457440.0
    for r in range(nt):
        h = min(T, N - r * T)
        si = I.read(1, window=Window(off, off + r*T, N, h)); se = E.read(1, window=Window(off, off + r*T, N, h)); sp = P.read(1, window=Window(off, off + r*T, N, h))
        for c in range(nt):
            w = min(T, N - c * T); sl = (slice(0, h), slice(c*T, c*T + w))
            a, e, p = si[sl], se[sl], sp[sl]
            planes = []
            sun = np.where(a >= 0, np.clip(np.round(a * 0.008), 0, 200), 255).astype(np.uint8); sun[(p > 0) & (a >= 0)] = 254   # 4e-5 x 100 x 2
            ear = np.where(e >= 0, np.clip(np.round(e * 0.008), 0, 200), 255).astype(np.uint8)
            for arr in (sun, ear, tav[r*T:r*T+h, c*T:c*T+w], tmx[r*T:r*T+h, c*T:c*T+w], ice[r*T:r*T+h, c*T:c*T+w]):
                b = np.full((T, T), 255, np.uint8); b[:h, :w] = arr; planes.append(b.tobytes())
            if all(x == 255 for x in planes[0][:1]) and np.frombuffer(planes[0], np.uint8).min() == 255: continue
            open(f'{O}/science/s{r}_{c}.bin', 'wb').write(gzip.compress(b''.join(planes), 9, mtime=0)); idx.append([r, c])
json.dump(idx, open(O + '/science_idx.json', 'w')); print('science tiles', len(idx))
