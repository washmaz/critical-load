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
- **Sensitivity:** each limit ×0.75 / ×1.25 and each weight ×0.5 / ×1.5, one at a time; reports how often the winner stays on top (e.g. 69 % on 2026-11-14 because Haworth and Mons Mouton Plateau are within 0.001; i.e. effectively tied).

## 9. Known gaps (stated in the app)
1. Boulders smaller than 5 m (and anything < 80 m outside NASA's 27 site boxes).
2. Gateway NRHO descent opportunities (~every 6.5 days per NASA) are modelled as an option: the slip scan and date suggestions use only opportunities every 6.5 days from one the planner enters, because the orbit's actual phase isn't public.
3. Approach-path lighting beyond the touchdown instant (no approach direction in the source).
4. Ground-station availability on Earth (we check Earth above the terrain, not DSN scheduling).

## Data sources
NASA LRO LOLA (PGDA products 90, 69, 78), NASA LRO Diviner PRP (PDS Geosciences), USGS Robbins crater database, JPL DE421 / Horizons, NASA Artemis III overview (NTRS 20250009323), ESA Lunar Lander study (De Rosa et al. 2012), ISRO Chandrayaan-3 (arXiv:2308.10712).
