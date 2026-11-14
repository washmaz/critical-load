
import numpy as np, rasterio, subprocess, os, time
def fetch(url, path, size):
    for k in range(40):
        if os.path.exists(path) and os.path.getsize(path) >= size: return
        subprocess.run(["curl", "-sSL", "-C", "-", "--max-time", "600", "-o", path, url]); time.sleep(2)
    raise SystemExit("download failed " + url)
from rasterio.windows import Window
p = "/home/user/tl/ldem80.tif"
if not os.path.exists(p + ".ok"):
    fetch("https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF", p, 189158392)
    open(p + ".ok", "w").close()
q = "/home/user/tl/ldsm80.tif"
if not os.path.exists(q + ".ok"):
    fetch("https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDSM_80S_80MPP_ADJ.TIF", q, 241594035)
    open(q + ".ok", "w").close()
out = np.full((1900, 1900), np.nan, np.float32)
with rasterio.open(p) as d:
    for r in range(0, 7600, 400):
        a = d.read(1, window=Window(0, r, 7600, 400)).astype(np.float32)
        out[r//4:(r+400)//4] = np.nanmean(a.reshape(100, 4, 1900, 4), axis=(1, 3))
np.save("/home/user/tl/far320.npy", out); print("far ok", float(np.nanmin(out)), float(np.nanmax(out)))
