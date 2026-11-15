# Supervisor: restarts fetch.py if no chunk completes for 75 s (some HTTP connections stall without timing out).
import subprocess, sys, os, time, glob
out = sys.argv[1]
def progress(): return sum(os.path.getsize(p) for p in glob.glob(out + '/*.done'))
while not os.path.exists(out + '/fetch.ok'):
    p = subprocess.Popen([sys.executable, os.path.dirname(__file__) + '/' + (sys.argv[2] if len(sys.argv) > 2 else 'fetch.py'), out], start_new_session=True)
    last, t = progress(), time.time()
    while p.poll() is None:
        time.sleep(5); now = progress()
        if now != last: last, t = now, time.time()
        elif time.time() - t > 75: os.killpg(p.pid, 9); break
    time.sleep(2)
print('all downloads complete')
