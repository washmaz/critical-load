# Build the terrain tiles the website fetches for ANY point south of ~76 S (south polar stereographic, 1737.4 km sphere).
#   terrain/t{r}_{c}.bin : 80 m, 256 x 256 px, gzip( elevLo[65536] elevHi[65536] slope[65536] )
#   far/f{r}_{c}.bin     : 320 m (same map block-averaged 4 x 4), 256 x 256 px, gzip( elevLo elevHi )
# Elevation: uint16 v, h = v/4 - 8000 m (0 = no data), stored as row-wise differences mod 65536, low bytes then high bytes.
# Slope: uint8 s, slope = s/4 deg (255 = no data), NASA LDSM.
# Source: NASA LRO LOLA LDEM_80S_80MPP_ADJ + LDSM_80S_80MPP_ADJ (Barker et al. 2023, PSJ 4, 183).
# Usage: python3 build_terrain.py DATADIR OUTDIR      (low memory: reads 256-row strips)
import sys, os, gzip, json, numpy as np, rasterio
from rasterio.windows import Window
D, O = sys.argv[1], sys.argv[2]; T = 256
os.makedirs(O + '/terrain', exist_ok=True); os.makedirs(O + '/far', exist_ok=True)
def enc_elev(h):
    v = np.round((h + 8000.0) * 4); v[~np.isfinite(h)] = 0; return np.clip(v, 0, 65535).astype(np.uint16)
def delta_bytes(u16):
    d = np.diff(np.concatenate([np.zeros((u16.shape[0], 1), np.int64), u16.astype(np.int64)], 1), axis=1) & 0xFFFF
    b = d.astype('<u2').view(np.uint8).reshape(-1, 2)
    return b[:, 0].tobytes() + b[:, 1].tobytes()
def undelta(buf, h, w):
    lo = np.frombuffer(buf[:h*w], np.uint8).astype(np.uint32); hi = np.frombuffer(buf[h*w:2*h*w], np.uint8).astype(np.uint32)
    return (np.cumsum((lo | (hi << 8)).reshape(h, w), axis=1) & 0xFFFF).astype(np.uint16)
def put(p, b): open(p, 'wb').write(gzip.compress(b, 9, mtime=0))
idx = {'terrain': [], 'far': []}
far = np.full((1900, 1900), np.nan, np.float32)
with rasterio.open(D + '/ldem80.tif') as E, rasterio.open(D + '/ldsm80.tif') as S:
    assert E.width == 7600 and E.transform.a == 80.0 and E.transform.c == -304000.0 and E.transform.f == 304000.0
    assert S.width == 7600 and S.transform.c == -304000.0
    for r in range(30):
        h = min(T, 7600 - r * T)
        e = E.read(1, window=Window(0, r * T, 7600, h)).astype(np.float32); s = S.read(1, window=Window(0, r * T, 7600, h)).astype(np.float32)
        rows = slice((r * T) // 4, (r * T + h) // 4)
        far[rows] = np.nanmean(e.reshape(h // 4, 4, 1900, 4), axis=(1, 3))
        for c in range(30):
            w = min(T, 7600 - c * T)
            ee = np.full((T, T), np.nan, np.float32); ss = np.full((T, T), np.nan, np.float32)
            ee[:h, :w] = e[:, c*T:c*T+w]; ss[:h, :w] = s[:, c*T:c*T+w]
            if not np.isfinite(ee).any(): continue
            u = enc_elev(ee); sl = np.round(ss * 4); sl[~np.isfinite(ss)] = 255; sl = np.clip(sl, 0, 255).astype(np.uint8)
            b = delta_bytes(u); assert (undelta(b, T, T) == u).all()
            put(f'{O}/terrain/t{r}_{c}.bin', b + sl.tobytes()); idx['terrain'].append([r, c])
for r in range(8):
    for c in range(8):
        f = np.full((T, T), np.nan, np.float32); x = far[r*T:(r+1)*T, c*T:(c+1)*T]; f[:x.shape[0], :x.shape[1]] = x
        if not np.isfinite(f).any(): continue
        put(f'{O}/far/f{r}_{c}.bin', delta_bytes(enc_elev(f))); idx['far'].append([r, c])
json.dump(idx, open(O + '/terrain_idx.json', 'w'))
print('terrain', len(idx['terrain']), 'far', len(idx['far']))
