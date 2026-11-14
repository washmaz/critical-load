# Build notes (Danah's Claude) — checkpoint 2

Run: `npm install` · `npm run dev` · `npm test` · `npm run build` (output in `dist/`, static, deploy to Vercel as a Vite project).

## Layout
- `src/engine/lunarSky.js` — engine v1 (unchanged API) + `skyAt()` and `sampleSeries()` (fast typed-array sampler).
- `src/engine/analysis.js` — windows, metrics, GO/CAUTION/NO-GO verdict, slip-window scan, date recommender, site comparison.
- `src/engine/sites.js` — 8 curated sites, every coordinate with a source URL.
- `src/components/` — SkyDome (polar plot, auto "horizon zoom" at |lat| > 75°), Timeline (Power/Comms lanes, drag to scrub), SlipWindow (viability strip + top-3 dates), SiteCompare (ranked table).
- `src/App.jsx` — controls, verdict, metric cards, shareable URL state in the hash.
- `tests/engine.test.js` — 7 tests (checkpoint 1 numbers preserved, interval maths, Chang'e 4 no Earth, Apollo 11 ~50% sunlit over a lunation, ±30 d scan speed).

## Model decisions
- "Up" = body centre more than ±margin (default 0.5°) above the smooth mean-sphere horizon. Inside the band = marginal = NOT counted as available (conservative).
- Verdict: power is the deal-breaker (longest dark > battery limit → NO-GO); comms gaps → CAUTION (fixable with a relay); relay toggle switches comms off.
- Recommender ranks candidate dates by verdict, sunlight, dark and comms gaps, minus 1.5 points per day away from the target, picks top 3 at least 2 days apart.
- Sampling: 1 h; window edges linearly interpolated. A ±30-day scan (241 candidates) runs in ~30 ms.

# Terrain update (Danah's Claude) — real LOLA horizons

- `src/data/site_terrain.json` — pre-computed for the 4 polar sites (shackleton-rim, connecting-ridge, malapert-massif, im2-mons-mouton):
  720-point terrain horizon (0.5° azimuth bins), ground elevation, slope (at site, worst within 1 km), nearest permanently
  shadowed region > 1 km² (ice trap), and yearly smooth-vs-terrain sunlit numbers. Made with `terrain_pipeline.zip` (Python, in NASA Hub).
- `src/engine/terrain.js` — `terrainFor(id)`, `horizonAt(terrain, az)`, `withTerrain(site, on)`.
- `lunarSky.js` — if `site.terrain` is set, the observer sits on the real surface (elevation + 2 m) and every result gets
  `horizon` and `clear` (= alt − terrain horizon in that direction). `sunlit`/`earthVisible`, rise/set searches and
  `sampleSeries` (`sunClear`, `earthClear`, `sunHor`, `earthHor`) all use clearance. With no terrain, horizon = 0°, so old behaviour is unchanged.
- `analysis.js` — windows/metrics use clearance, so verdicts, slip scan, recommender and compare all respect terrain.
- UI — "Use real terrain (NASA LOLA)" checkbox (URL `terrain=0` turns it off), ground silhouette on the sky dome,
  grey terrain line on the timeline, a "Smooth Moon vs Real terrain" sentence under the verdict, and terrain fact cards.
- Tests: 11 pass. The JS engine reproduces the Python pipeline (Connecting ridge, 30 d from 14 Nov 21:00 UTC:
  67.9 % vs 68.1 % sunlit; Earth 31.7 % vs 31.7 %).
- Demo link: `#site=connecting-ridge&t=2026-11-14T21:00Z&slip=7&mission=14` → smooth Moon CAUTION / 100 % sunlit,
  real terrain NO-GO / 28 % sunlit, 10-day dark stretch.
- References to add: Barker et al. 2023, Planet. Sci. J. 4, 183, doi:10.3847/PSJ/acf3e1; data doi:10.60903/gsfcpgda-lola-spole.
