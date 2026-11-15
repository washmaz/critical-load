# Method sheet: how the Lunar Landing Site Navigator decides, and why each step is defensible

Team Critical Load. Every step lists: the question, the NASA data used, the calculation, the decision rule, the source, and how we validated it.
All code lives in `src/engine/` (the same code runs in the website and in the offline batch runs in `tools/runs/`).

## 0. Requirements we check (NASA Artemis III, NTRS 20250009323, slide "Key Artemis III Landing Requirements")
1. Land within 6° latitude of the south pole.
2. Surface slope for landing (100 m) < 10°.
3. Surface slope for EVA (2 km) < 20°.
4. Direct-with-Earth communication; no relay.
5. Lighting: surface lit for the duration of the surface stay; approach lighting beneficial.
6. Land within 100 m of a target ("100 m x 100 m").
Where the source is silent (surface-stay length, battery, thermal limits) the value is the planner's input, labelled with the owning team in the Assumptions panel.

## 1. Where the Sun and Earth are (ephemeris)
- **Data:** JPL DE421 (hourly tables, pre-computed with Skyfield) and astronomy-engine (live, IAU 2015 Moon orientation); JPL Horizons API as an external check.
- **Calculation:** Sun and Earth vectors in the Moon-fixed (ME) frame → local east/north/up at the observer → elevation and azimuth.
- **Validation:** JPL Horizons vs our engine at 89.9°S 0°E: 117.48° / +1.51° vs 117.484° / +1.509° (≈0.01°); DE421 tables vs live engine: max 0.014°.

## 2. Real terrain horizon (what blocks the Sun and Earth)
- **Data:** NASA LRO LOLA LDEM_80S_80MPP_ADJ (80 m) + 320 m far-field average (Barker et al. 2023, PSJ 4:183).
- **Calculation:** for each of 720 azimuths (0.5°), march a ray over the sphere from 240 m to the map edge (40 m steps to 4 km, then ×1.01); horizon = max elevation angle atan2(up, horizontal) of the terrain, with the observer at the array height (default 2 m, the ESA lander study's design value; De Rosa et al. 2012).
- **Decision rule:** a body is "up" when its centre clears the terrain horizon by more than the margin (default 0.5°). ESA's "50 % of the disc" rule is the 0° case.
- **Validation:** the browser engine reproduces our offline Python pipeline at all 11 curated polar sites to within 0.044° (mean 0.0004–0.009°), elevation within 0.1 m, one-year sunlit/Earth % identical. Our one-year sunlit % agrees with NASA's own 18.6-year PGDA map within 3 points at 9 of 11 sites (the two exceptions sit on edges where NASA's map changes 0 → 90 % within 180 m).

## 3. Power and communications over the stay
- **Calculation:** sample every hour; interpolate the exact crossing time of each sunrise/sunset/Earthrise/Earthset; longest dark stretch and longest comms gap.
- **Decision rule:** power OK if sunlit > 0 and longest dark ≤ battery hours (Artemis III preset: 0 h = lit the whole stay); comms OK if longest gap ≤ allowed gap (no relay for Artemis III).
- **Validation (time step):** 1 h vs 10 min sampling at 11 polar sites × 113 dates in a ±7-day slip window and 2 × 200 Monte Carlo touchdowns: **0 verdict changes**, max difference in longest dark 0.27 h (`data/results/timestep-test-2026-11-14.json`). 1 h is kept (6× faster).

## 4. Landing hazards
- **Slope:** over a 100 m baseline from LOLA elevation (matches the requirement's wording), or NASA's LDSM 80 m map. Consistency: the two agree within ~2.4° at all 11 sites.
- **Permanent shadow:** NASA PGDA LPSR_75S_120M_201608 (120 m). A touchdown in permanent shadow fails.
- **NASA 5 m site maps (PGDA product 78, 27 boxes):** where they exist, the "100 m" slope is computed from NASA's 5 m elevation, and a lander-footprint mode uses NASA's 5 m slope with NASA's own per-pixel RMS slope uncertainty sampled for every touchdown (slope_true ~ N(slope, σ)). Outside the boxes the check falls back to the 80 m data, and the results report the share of touchdowns on each data source.
- **Still not resolvable:** boulders smaller than the 5 m pixels.

## 5. Landing dispersion (Monte Carlo)
- **Calculation:** 1,000 touchdowns from a bivariate normal; the planner's ellipse is the **99.7 % containment** ellipse, so each half-axis = 3.41 σ (√(−2 ln 0.003)); 3 σ would contain only 98.9 % in 2-D. Fixed seed (repeatable).
- **Accuracy options:** 50 m radius (strict reading of NASA "100 m x 100 m", default), 100 m radius ("within 100 m of a target"), custom.
- **Per touchdown:** its own exact terrain horizon (no interpolation between points), its own local vertical, slope, permanent shadow, power, comms, optional thermal limits.
- **Output:** P(safe) with a Wilson 95 % interval; failure breakdown; Sun/Earth up at touchdown (approach lighting).
- **Validation:** a zero-size ellipse reproduces the single-point analysis (27.89 % vs 27.90 % sunlit); 99.7 % of 20,000 samples fall inside the ellipse.

## 6. Thermal
- **Data:** LRO Diviner Polar Resource Product: annual average temperature (2 cm), annual maximum surface temperature, ice-stability depth; each 120 m cell takes the Diviner triangle containing its centre.
- **Decision rule:** NASA publishes no landing-site thermal limit, so temperatures are **reported only** unless the thermal team enters its hardware limits.

## 7. Finding better spots nearby
- **Stage 1 (screen):** every 120 m NASA pixel within the radius; hard filters from NASA Artemis III guidance (NASA 18.6-yr average Earth visibility ≥ 25 %, Sun ≥ 5 %, not permanently shadowed); weighted score; well-separated candidates.
- **Stage 2 (verify):** full 1,000-touchdown simulation for the mission dates on the best 1–5; final ranking. Stage 1 uses long-term averages, stage 2 the actual dates, so the order can change, and stage 2 is the one to use.

## 8. Team review (multi-criteria decision)
- Each team owns its hard limits and a weight (0–5): mission planning (dates, stay, pole distance; score = share of GO dates in the slip window), power (battery, array height; sunlit share), comms (gap, relay; Earth-in-view share), landing GNC + hazards (slope limit, baseline, landing radius; share of the landing area under the limit), thermal (limits only), science (Diviner shallow ice proximity).
- **Ranking:** sites failing any team's limit are listed below those that pass; within each group, score = Σ wᵢ sᵢ / Σ wᵢ (weighted sum, the standard simple-additive-weighting MCDM method).
- **Clashes:** each team's favourite site and which teams reject which sites.
- **Default weights are our judgment, not NASA's.** NASA publishes hard requirements, not trade weights. Our starting point: landing 4, power 3, comms 3, mission planning 2, science 1, thermal 0 (limits only). Every weight is editable (0–5), and the sensitivity sweep shows how much the winner depends on them.
- **Custom criteria:** a team can add any criterion the app has no NASA dataset for (e.g. traverse to a science target). It is either a 0–100 score per site with a weight (enters the weighted sum) or pass/fail per site (a hard limit). Unrated sites are left out of that criterion and flagged. Custom criteria change the ranking and the clashes only; sunlight, Earth view, slope, shadow and the Monte Carlo still come only from NASA data. Adding a new *physical* check needs its dataset added to the engine first.
- **Sensitivity:** each limit ×0.75 / ×1.25 and each weight ×0.5 / ×1.5, one at a time; reports how often the winner stays on top. With the defaults (7-day stay, 48 h battery, target point only) on 2026-11-14: IM-2 (0.905) and Mons Mouton Plateau (0.900) are effectively tied, and the top site holds in 75 % of the 16 changes; a shorter battery, longer allowed comms gap, more weight on power or less on comms puts Mons Mouton Plateau on top. Nobile Rim 2 scores highest (0.947) but is listed below the passing sites because it is just over the 6° pole-distance limit.

## 9. Known gaps (stated in the app)
1. Boulders smaller than 5 m (and anything < 80 m outside NASA's 27 site boxes).
2. Gateway NRHO descent opportunities (~every 6.5 days per NASA) are modelled as an option: the slip scan and date suggestions use only opportunities every 6.5 days from one the planner enters, because the orbit's actual phase isn't public.
3. Approach-path lighting beyond the touchdown instant (no approach direction in the source).
4. Ground-station availability on Earth (we check Earth above the terrain, not DSN scheduling).

## 10. Results: full runs for a 2026-11-14 21:00 UTC landing

Settings: NASA Artemis III preset (slope < 10° over 100 m, lit for the whole stay with no battery, direct-to-Earth comms with gaps ≤ 48 h, no relay), 50 m landing radius (strict reading of "100 m x 100 m"), solar arrays/antenna at 2 m, 1,000 touchdowns per site, seed 1, hourly steps. Script: `tools/runs/run_all.mjs` (same engine as the website; `MISSION_DAYS=14` for the stricter run). Raw output: `data/results/full-runs-v3-7d-2026-11-14.json` and `data/results/full-runs-v3-14d-2026-11-14.json`.

**Surface stay is the mission team's input.** NASA's Artemis III source requires "the surface to be lit for the duration of the surface stay" but gives no duration. Our default is 7 days, with 14 days as the stricter option and a custom value for anything else; both standard options were run.

| Site | From pole (limit 6°) | Slope data | P(safe), 7-day stay (default) | Fails (of 1,000), 7 d | P(safe), 14-day stay | Fails, 14 d | Median 100 m slope |
|---|---|---|---|---|---|---|---|
| Shackleton rim (ridge junction) | 0.32° | NASA 5 m (Site01, Site04) | 0.0 % [0.0–0.4] | slope 73, comms 1000 | 0.0 % [0.0–0.4] | slope 73, power 92, comms 1000 | 6.7° |
| Connecting ridge (site C1) | 0.59° | NASA 5 m (Site01) | 0.0 % [0.0–0.4] | slope 34, shadow 820, power 1000, comms 1000 | 0.0 % [0.0–0.4] | slope 34, shadow 820, power 1000, comms 1000 | 9.0° |
| Malapert Massif (Artemis III region) | 4.02° | NASA 5 m (Site23) | 0.0 % [0.0–0.4] | slope 10, power 1000 | 0.0 % [0.0–0.4] | slope 10, power 1000 | 8.0° |
| IM-2 Athena (Mons Mouton) | 5.21° | LOLA 80 m (no 5 m map) | 0.0 % [0.0–0.4] | power 1000 | 0.0 % [0.0–0.4] | power 1000 | 2.4° |
| Nobile Rim 1 (Artemis III region) | 4.70° | NASA 5 m (Site06, Site20v2) | 0.0 % [0.0–0.4] | comms 1000 | 0.0 % [0.0–0.4] | comms 1000 | 3.0° |
| Nobile Rim 2 (Artemis III region) | 6.28° ✗ | NASA 5 m (DM2) | 100.0 % [99.6–100.0] | none | 0.0 % [0.0–0.4] | power 1000 | 1.1° |
| Haworth (Artemis III region) | 3.63° | NASA 5 m (Haworth) | 0.0 % [0.0–0.4] | power 1000 | 0.0 % [0.0–0.4] | power 1000 | 3.5° |
| de Gerlache Rim 2 (Artemis III region) | 1.41° | NASA 5 m (Site11, SL2) | 0.0 % [0.0–0.4] | power 1000, comms 16 | 0.0 % [0.0–0.4] | power 1000, comms 16 | 3.9° |
| Peak near Cabeus B (Artemis III region) | 8.62° ✗ | LOLA 80 m (no 5 m map) | 0.0 % [0.0–0.4] | power 1000 | 0.0 % [0.0–0.4] | power 1000 | 4.6° |
| Slater Plain (Artemis III region) | 1.19° | NASA 5 m (Site07) | 0.0 % [0.0–0.4] | comms 1000 | 0.0 % [0.0–0.4] | comms 1000 | 0.7° |
| Mons Mouton Plateau (Artemis III region) | 4.59° | NASA 5 m (Site20, Site20v2) | 100.0 % [99.6–100.0] | none | 100.0 % [99.6–100.0] | none | 5.9° |

Brackets are Wilson 95 % intervals. A "fail" count is the number of the 1,000 touchdowns that break that rule (one touchdown can break several).

**What this says**
- **Mons Mouton Plateau passes everything for either stay length** (1,000 of 1,000 touchdowns safe, 4.59° from the pole). It is the only listed site that passes both the landing simulation and the 6° pole limit on these dates (the EVA-slope check is reported in the app's checklist, not part of this batch).
- **Nobile Rim 2: every touchdown is safe for the 7-day stay but fails power for 14 days** (the Sun goes behind terrain in the second week), so stay length changes the answer. Our target point there is also 6.28° from the pole, just outside Artemis III's "within 6°" requirement, which the Monte Carlo does not test (it is a site-level check, shown separately in the app's checklist). So it is not an Artemis III option as placed; a target nearer the pole within that region would need its own run.
- Every other site fails one rule for every touchdown on these dates: power (Sun hidden by terrain at some hour), comms (Earth below the terrain horizon for more than 48 h), or permanent shadow (connecting ridge).
- 9 of 11 sites use NASA's 5 m elevation for the 100 m slope; IM-2 and the Cabeus B peak are outside NASA's 27 site maps and use the 80 m map.

**Find-a-spot (5 km radius; stage 1 screened ~2,600–3,200 NASA 120 m pixels each; stage 2 ran 1,000 touchdowns on the top 3)**

| Start | Best spot found | Distance | P(safe), 7 d | P(safe), 14 d | What fails |
|---|---|---|---|---|---|
| Nobile Rim 1 | 85.2938° S, 36.904° E | 0.49 km | 100 % | 100 % | nothing |
| Connecting ridge | 89.4762° S, 137.450° W | 2.16 km | 92.8 % | 92.8 % | comms (72 touchdowns) |
| Shackleton rim | none safe | | 0 % | 0 % | Earth below horizon > 48 h on these dates |

**Compared with the first run (100 m radius, 80 m slope map, 14 days):** Mons Mouton Plateau 99.8 % → 100 %; the best connecting-ridge spot 76.4 % → 92.8 % (NASA's 5 m elevation gives a 100 m slope of 9.0° there vs 9.5° from the 80 m map, plus the tighter ellipse); the Nobile Rim 1 result is unchanged; Shackleton rim's slope failures went from 10 to 73 (the 5 m data resolves rougher ground than the 80 m map).

**Time step check:** hourly vs 10-minute steps gave the same verdict for all 11 sites on 113 dates (largest difference in longest darkness 0.27 h), so hourly steps are kept (`data/results/timestep-test-2026-11-14.json`).

## Data sources
NASA LRO LOLA (PGDA products 90, 69, 78), NASA LRO Diviner PRP (PDS Geosciences), USGS Robbins crater database, JPL DE421 / Horizons, NASA Artemis III overview (NTRS 20250009323), ESA Lunar Lander study (De Rosa et al. 2012), ISRO Chandrayaan-3 (arXiv:2308.10712).
