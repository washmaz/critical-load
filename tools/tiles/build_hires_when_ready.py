# Builds each 5 m site as soon as its three NASA files are fully downloaded (used alongside fetch_supervised.py).
import json, os, subprocess, sys, time
SRC, OUT = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__)); sites = json.load(open(os.path.join(here, 'sites5m.json')))
CH = 8 << 20; built = set()
def ready(s):
    for kind, size in zip(('slp', 'slperr', 'surf'), sites[s]):
        p = f'{SRC}/{s}_{kind}.tif'
        if not os.path.exists(p + '.done') or len(set(open(p + '.done').read().split())) < (size + CH - 1) // CH: return False
    return True
while len(built) < len(sites):
    for s in sites:
        if s not in built and ready(s):
            subprocess.run([sys.executable, os.path.join(here, 'build_hires.py'), SRC, OUT, s], check=False)
            built.add(s); print('built', s, flush=True)
    time.sleep(20)
print('ALL BUILT', flush=True)
