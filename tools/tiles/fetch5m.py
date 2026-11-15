# Resumable, chunked, parallel download of NASA PGDA product 78: LOLA 5 m/pixel site maps (slope, slope uncertainty, elevation).
# Usage: python3 fetch.py OUTDIR   (re-run to resume; each 8 MB chunk is fetched with an HTTP Range request)
import os, sys, time, urllib.request, concurrent.futures as cf
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
import json
SITES = json.load(open(os.path.join(os.path.dirname(__file__), 'sites5m.json')))
FILES = []
for s, sizes in SITES.items():
    for kind, size in zip(('slp', 'slperr', 'surf'), sizes):
        FILES.append((f'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/{s}/{s}_final_adj_5mpp_{kind}.tif', f'{s}_{kind}.tif', size))
CH = 8 << 20
def get(u, p, size, i):
    a = i * CH; b = min(size, a + CH) - 1
    for k in range(30):
        try:
            req = urllib.request.Request(u, headers={'Range': f'bytes={a}-{b}', 'User-Agent': 'Mozilla/5.0'})
            t0 = time.time(); parts = []
            with urllib.request.urlopen(req, timeout=30) as r:
                while True:
                    x = r.read(1 << 16)
                    if not x: break
                    parts.append(x)
                    if time.time() - t0 > 90: raise IOError('too slow')   # stalled connection: drop and retry
            data = b''.join(parts)
            if len(data) != b - a + 1: raise IOError('short read')
            fd = os.open(p, os.O_WRONLY); os.pwrite(fd, data, a); os.close(fd)
            with open(p + '.done', 'a') as f: f.write(f'{i}\n')
            return
        except Exception: time.sleep(2 + k)
    raise RuntimeError(f'chunk {i} of {p} failed')
tasks = []
for u, name, size in FILES:
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        with open(p, 'wb') as f: f.truncate(size)
    done = set(int(x) for x in open(p + '.done').read().split()) if os.path.exists(p + '.done') else set()
    tasks += [(u, p, size, i) for i in range((size + CH - 1) // CH) if i not in done]
with cf.ThreadPoolExecutor(10) as ex: list(ex.map(lambda t: get(*t), tasks))
for u, name, size in FILES:
    p = os.path.join(OUT, name); n = (size + CH - 1) // CH
    ok = os.path.getsize(p) == size and len(set(open(p + '.done').read().split())) == n
    print(name, 'OK' if ok else 'INCOMPLETE')
open(os.path.join(OUT, 'fetch.ok'), 'w').write('done')
