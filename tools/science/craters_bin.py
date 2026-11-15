
# Robbins (2019) lunar crater database -> compact file of every crater >= 3 km for the website.
import subprocess, zipfile, numpy as np, pandas as pd, os
URL = "https://astrogeology.usgs.gov/ckan/dataset/f89f5478-b69a-486c-b9b5-30d7b0c5ad2b/resource/c4f25cc2-4f8a-4207-a845-5e176da3ac5a/download/lunar_crater_database_robbins_2018"
z = "/home/user/tl/robbins.zip"
for k in range(20):
    if os.path.exists(z) and os.path.getsize(z) >= 96227201: break
    subprocess.run(["curl", "-sSL", "-C", "-", "-A", "Mozilla/5.0", "-o", z, URL])
parts = []
with zipfile.ZipFile(z).open("lunar_crater_database_robbins_2018_bundle/data/lunar_crater_database_robbins_2018.csv") as f:
    for ch in pd.read_csv(f, usecols=["LAT_CIRC_IMG", "LON_CIRC_IMG", "DIAM_CIRC_IMG"], chunksize=200000):
        ch = ch[ch.DIAM_CIRC_IMG >= 3.0]
        a = np.empty((len(ch), 3), "<u2")
        a[:, 0] = np.round((ch.LAT_CIRC_IMG.values + 90) * 300); a[:, 1] = np.round((ch.LON_CIRC_IMG.values % 360) * 150)
        a[:, 2] = np.minimum(np.round(ch.DIAM_CIRC_IMG.values * 10), 65535); parts.append(a)
arr = np.concatenate(parts); os.makedirs("/home/user/repo/public/craters", exist_ok=True)
arr.tofile("/home/user/repo/public/craters/robbins_3km.bin"); print("craters", arr.shape)
