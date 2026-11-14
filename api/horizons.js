// Vercel serverless function: /api/horizons?site_lon=..&site_lat=..&body=10|399&start=ISO&stop=ISO&step=1h
// Fetches Sun (10) or Earth (399) apparent az/el seen from a lunar surface point (coord@301) from the
// JPL Horizons API and returns JSON rows. Only these parameters are accepted, so it is not an open proxy.
// Browsers can't call Horizons directly from our page, so this is the app's "live NASA" path.
// Not testable until deployed; the horizonsUrl() link in ephemerisStore.js always works as a fallback.
export default async function handler(req, res) {
  const q = req.query || {};
  const lat = Number(q.site_lat), lon = Number(q.site_lon);
  const body = ['10', '399'].includes(String(q.body)) ? String(q.body) : null;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  const step = /^\d{1,3}\s?[mh]$/.test(String(q.step || '1h')) ? String(q.step || '1h') : null;
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 360) || !body || !iso.test(q.start) || !iso.test(q.stop) || !step) {
    return res.status(400).json({ error: 'bad parameters' });
  }
  const t = (s) => `'${s.slice(0, 16).replace('T', ' ')}'`;
  const params = {
    format: 'json', COMMAND: `'${body}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'",
    CENTER: "'coord@301'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${lon},${lat},0'`,
    START_TIME: t(q.start), STOP_TIME: t(q.stop), STEP_SIZE: `'${step.replace(/\s/g, '')}'`,
    QUANTITIES: "'4'", ANG_FORMAT: "'DEG'", APPARENT: "'AIRLESS'", CSV_FORMAT: "'YES'",
  };
  const url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + new URLSearchParams(params).toString();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    const text = j.result || '';
    const s = text.indexOf('$$SOE'), e = text.indexOf('$$EOE');
    if (s < 0 || e < 0) return res.status(502).json({ error: 'Horizons returned no ephemeris', detail: text.slice(0, 800) });
    const rows = text.slice(s + 5, e).trim().split('\n').map((line) => {
      const c = line.split(',').map((x) => x.trim());
      // CSV: date, solar-presence flag, lunar-presence flag, azimuth, elevation, ...
      const nums = c.slice(1).filter((x) => x !== '' && !Number.isNaN(Number(x))).map(Number);
      return { t: new Date(c[0].replace(/^A\.D\.\s*/, '') + 'Z').toISOString(), az: nums[0], alt: nums[1] };
    });
    res.setHeader('Cache-Control', 's-maxage=86400');
    return res.status(200).json({ source: 'JPL Horizons API', body, rows, url });
  } catch (err) {
    return res.status(502).json({ error: 'Horizons unreachable', detail: String(err) });
  }
}
