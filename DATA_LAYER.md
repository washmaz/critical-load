# Data layer: precomputed JPL tables + live engine, with automatic fallback

## What it does
Every Sun/Earth position the app shows can come from two independent sources:

| Mode | Source | Covers | Speed (1 year, hourly) |
|---|---|---|---|
| Precomputed | JPL DE421 ephemeris + DE421 lunar libration, MOON_ME_DE421 frame (same frame as the LOLA terrain) | 8 preset sites, 2026-11-01 to 2028-12-31 | ~15-25 ms |
| Live | astronomy-engine in the browser, IAU 2015 Moon orientation | Any coordinates, any date | ~170-390 ms |
| Auto (default) | Table when it covers the site/date and passed its self-check, otherwise live | Everything | |
| JPL Horizons | `horizonsUrl()` link (always works) and `/api/horizons` on Vercel (fetches the numbers) | Spot checks | network |

## Redundancy (`node tools/test_fallback.mjs`, 7/7 pass)
- Date outside the table, or custom coordinates -> live.
- Table server down or manifest missing -> live everywhere, no crash.
- Truncated download -> rejected by size check -> live.
- Wrong numbers in a table -> self-check against live at 24 times fails (> 0.1°) -> table disabled -> live.
- Each case records a plain-English reason in `getStatus(site)` for the UI.

## Accuracy (`node tools/crosscheck.mjs`, `python tools/check_interp.py`)
- JPL DE421 tables vs live engine, every 6 h for 26 months, 8 sites: max 0.013° on the sky, RMS ~0.003° in altitude. Sunlit / Earth-in-view verdicts agree in 99.9% of samples (the few flips are when a body is within 0.01° of the horizon).
- Hourly storage + unit-vector interpolation vs direct DE421 at the half hour: max 0.005°.
- For scale: the Sun's disk is 0.53° across, and LOLA terrain moves the horizon by whole degrees.

## Files
- `src/engine/ephemerisStore.js` loader, interpolation, modes, self-check, Horizons link builder
- `public/ephem/manifest.json`, `public/ephem/*.bin` tables (8 sites, 152 KB each, ~1.2 MB total; Vercel gzips them). Matched to sites by coordinates, so site ids can change freely.
- `tools/precompute_ephemeris.py` rebuilds the tables (add a site to `tools/sites_for_ephem.json` and rerun). Kernels are not committed; the script header says where to get them.
- `api/horizons.js` optional Vercel function for live JPL Horizons numbers (testable only once deployed)
- `tools/lib/lunarSky_v1.mjs` engine v1 math, used by the tests

## References
- Folkner, W. M., Williams, J. G., Boggs, D. H. (2008). The Planetary and Lunar Ephemeris DE 421. JPL IOM 343R-08-003.
- NASA JPL NAIF SPICE kernels: de421.bsp, moon_pa_de421_1900-2050.bpc, moon_080317.tf (MOON_ME_DE421 / MOON_PA_DE421), pck00008.tpc. https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- Rhodes, B. Skyfield (MIT licence), https://rhodesmill.org/skyfield/
- Cross, D. astronomy-engine (MIT licence), https://github.com/cosinekitty/astronomy
- JPL Horizons System API, https://ssd-api.jpl.nasa.gov/doc/horizons.html
- AI use: code and tests written by Claude (Anthropic), reviewed by the team.
