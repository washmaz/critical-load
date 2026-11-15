# NASA PGDA product 78 (LOLA 5 m/pixel site maps; Barker et al.) -> compact tiles for the website.
#   hires/{SITE}/h{r}_{c}.bin : 256 x 256 px at 5 m,  gzip( slope5[65536] ) uint8 deg x 4 (255 = no data)       NASA 5 m slope map
#   hires/{SITE}/c{r}_{c}.bin : 256 x 256 px at 20 m, gzip( slopeErr[65536] slope100[65536] ) uint8
#       slopeErr = NASA RMS slope uncertainty of the 5 m slope, deg x 20 (0.05 deg steps, max 12.7), 4 x 4 mean
#       slope100 = slope over a 100 m baseline from NASA's 5 m elevation (deg x 4), sampled every 20 m
# Usage: python3 build_hires.py SRCDIR OUTDIR SITE [SITE ...]
import sys, os, gzip, json, numpy as np, rasterio
from rasterio.windows import Window
SRC, OUT = sys.argv[1], sys.argv[2]; T = 256; R = 1737400.0; P = 10   # +-10 px = +-50 m
index = json.load(open(OUT + '/hires_index.json')) if os.path.exists(OUT + '/hires_index.json') else {}
def u8(a, scale, cap=254):
    v = np.round(a * scale); v[~np.isfinite(a)] = 255; return np.clip(v, 0, cap).astype(np.uint8)
def put(p, arrs): open(p, 'wb').write(gzip.compress(b''.join(a.tobytes() for a in arrs), 9, mtime=0))
for site in sys.argv[3:]:
    d0 = f'{OUT}/hires/{site}'; os.makedirs(d0, exist_ok=True)
    with rasterio.open(f'{SRC}/{site}_slp.tif') as S, rasterio.open(f'{SRC}/{site}_slperr.tif') as E, rasterio.open(f'{SRC}/{site}_surf.tif') as Z:
        assert S.transform.a == 5.0 and S.transform == E.transform == Z.transform and S.width == Z.width and S.height == Z.height
        W, H, x0, y0 = S.width, S.height, S.transform.c, S.transform.f
        fine, coarse = [], []
        # fine 5 m slope tiles
        for r in range((H + T - 1) // T):
            h = min(T, H - r * T); s = S.read(1, window=Window(0, r * T, W, h))
            for c in range((W + T - 1) // T):
                w = min(T, W - c * T); b = np.full((T, T), 255, np.uint8); b[:h, :w] = u8(s[:, c * T:c * T + w], 4)
                if b.min() == 255: continue
                put(f'{d0}/h{r}_{c}.bin', [b]); fine.append([r, c])
        # coarse 20 m planes (every 4th pixel centre block): error = 4x4 mean, slope100 at the block centre
        Wc, Hc = W // 4, H // 4
        err = np.full((Hc, Wc), np.nan, np.float32); s100 = np.full((Hc, Wc), np.nan, np.float32)
        for r0 in range(0, Hc, 128):
            hh = min(128, Hc - r0)
            e = E.read(1, window=Window(0, r0 * 4, Wc * 4, hh * 4)).astype(np.float64)
            err[r0:r0 + hh] = np.nanmean(e.reshape(hh, 4, Wc, 4), axis=(1, 3))
            top = max(0, r0 * 4 - P); bot = min(H, (r0 + hh) * 4 + P)
            z = Z.read(1, window=Window(0, top, W, bot - top)).astype(np.float64)
            zp = np.full((bot - top, W + 2 * P), np.nan); zp[:, P:P + W] = z
            rows = np.arange(r0, r0 + hh) * 4 + 2 - top            # block-centre pixel rows (in z)
            cols = np.arange(Wc) * 4 + 2 + P                         # block-centre pixel cols (in zp)
            ok = (rows - P >= 0) & (rows + P < bot - top)
            ys = y0 - (np.arange(r0, r0 + hh) * 4 + 2.5) * 5.0; xs = x0 + (np.arange(Wc) * 4 + 2.5) * 5.0
            rho = np.hypot(xs[None, :], ys[:, None]); lat = 2 * np.arctan(rho / (2 * R)) - np.pi / 2; k = 1 / np.cos(np.pi / 4 + lat / 2) ** 2
            for i, rr in enumerate(rows):
                if not ok[i]: continue
                gx = (zp[rr, cols + P] - zp[rr, cols - P]) / (100.0 / k[i])
                gy = (zp[rr - P, cols] - zp[rr + P, cols]) / (100.0 / k[i])
                s100[r0 + i] = np.degrees(np.arctan(np.hypot(gx, gy)))
        for r in range((Hc + T - 1) // T):
            for c in range((Wc + T - 1) // T):
                sl = (slice(r * T, min(Hc, (r + 1) * T)), slice(c * T, min(Wc, (c + 1) * T))); blk = []
                for a_, sc_ in ((err, 20), (s100, 4)):
                    b = np.full((T, T), 255, np.uint8); x = u8(a_[sl], sc_); b[:x.shape[0], :x.shape[1]] = x; blk.append(b)
                if blk[0].min() == 255 and blk[1].min() == 255: continue
                put(f'{d0}/c{r}_{c}.bin', blk); coarse.append([r, c])
    index[site] = dict(x0=x0, y0=y0, w=W, h=H, pix=5.0, tile=T, fine=fine, coarsePix=20.0, coarseW=Wc, coarseH=Hc, coarse=coarse)
    json.dump(index, open(OUT + '/hires_index.json', 'w'))
    mb = sum(os.path.getsize(os.path.join(d0, f)) for f in os.listdir(d0)) / 1e6
    print(site, W, H, len(fine), 'fine', len(coarse), 'coarse', round(mb, 1), 'MB', flush=True)
