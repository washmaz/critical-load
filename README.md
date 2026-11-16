# Critical Load: Lunar Landing Site Navigator

**Team Critical Load: NASA Space Apps Challenge 2026 (Nov 14–15), Oshawa local event**

> Submission deadline: **Sunday, Nov 15, 11:59 p.m.** local time (team target **6:00 p.m.**). Click **Submit for Judging** on the Space Apps Project tab. Saving is not submitting.

## Team
- Washma ([@washmaz](https://github.com/washmaz)): project lead, testing, demo, submission
- Danah ([@danahshanab-debug](https://github.com/danahshanab-debug)): build lead (engine, UI, deploy, validation)
- John ([@john-whitbread](https://github.com/john-whitbread)): testing and validation

## Challenge
Lunar Landing Site Navigator

## High-Level Summary
Lunar Landing Site Navigator is a free web app that answers the two questions every lander at the Moon's south pole depends on: will it have sunlight for power, and can it see Earth to radio home? Pick a site and a date, and the app shows the Sun and Earth against the real horizon, with a plain GO / CAUTION / NO-GO verdict. At the south pole, where Artemis plans to land, the Sun skims the horizon, so hills and crater rims decide everything. Using NASA LOLA terrain, the app shows how a site that looks sunny on a smooth Moon can be NO-GO in reality, and how sites a few kilometres apart differ. It also simulates 1,000 landings around a target to estimate the chance of a safe touchdown, and can search nearby for better spots. NASA's existing tools are powerful but built for experts; ours gives students, educators and early-stage planners the same answers in seconds, with Sun and Earth positions checked against NASA JPL Horizons (750 points, within 0.007°).

## Project Demo
_Link (public, no login): 30-second video with English subtitles._

### Demo script (30 s, LOCKED: one moment only)
| Time | On screen | Voice-over / subtitle |
| --- | --- | --- |
| 0:00 | Team name + Moon south pole (no NASA logos) | "NASA wants to land astronauts at the Moon's south pole." |
| 0:05 | App: pick Connecting ridge + 2026-11-15 21:00 UTC | "We built a weather app for the Moon. Pick a spot and a date." |
| 0:10 | Flat Moon: CAUTION, Sun up | "On a flat Moon, this spot looks sunny." |
| 0:15 | Toggle real terrain: NO-GO, horizon silhouette over the Sun + "Sun hidden by terrain" marker | "With NASA's real terrain, the hills block the Sun. NO-GO." |
| 0:22 | Text card | "Built on NASA LOLA terrain. Checked against JPL Horizons." |
| 0:27 | App link + team name | "Critical Load. Simple answers for the next giant leap." |

## Final Project
- Live app: https://critical-load.vercel.app
- Code: https://github.com/washmaz/critical-load
- Method, step by step with sources: METHOD.md · Data layer: DATA_LAYER.md · NASA data pipelines: tools/science/README.md

## Detailed Description
- What it does: pick a lunar site (Apollo, Chang'e, Chandrayaan-3, IM-2, 9 Artemis III candidate regions, or custom coordinates) and a date; see Sun and Earth on a sky dome with the real terrain horizon, a GO / CAUTION / NO-GO verdict for power and direct-to-Earth comms, time to next sunset/Earthset, a 30-day timeline, side-by-side comparison (slope, nearest ice trap, temperature, craters), a surface-stay setting (7 days default, 14 days stricter, or custom), a team review that ranks only sites passing every team's limits (Artemis III preset by default; teams can add their own criteria), a 1,000-touchdown landing simulation, "find me a spot" (within 6° of the pole, with distance from your site), and Gateway descent opportunities (about one every 6.5 days, roughly 55 a year, per NASA NTRS 20250009323) as a mission-planning option. A "Smooth Moon / Real NASA terrain" switch shows how much terrain changes the answer. A 3D whole-Moon globe (NASA SVS CGI Moon Kit natural colour, or NASA Moon Trek LRO WAC grey) flies to the site you pick. The site list also has named places (Apollo 12/14/15/16, Chang'e 3/5/6, SLIM, IM-1, Blue Ghost, maria, craters, far-side and polar features); they run the same any-point check, and outside 80°S the app says it is using a smooth-Moon horizon. Results sit in tabs (Answer, Timeline & launch slips, Landing simulation, Team review, Compare sites), and every input shows its units, range and an example.
- Interface (v2, on main since 1198091 and live): the Moon fills the screen and the steps open one at a time (site and time → team criteria → answer → why); a live GO / CAUTION / NO-GO badge sits on the site pin; picking a site from the list flies the globe to it; a guided demo tour; a one-screen "How it works" plus a downloadable User and Technical Guide (PDF with IEEE references, figures, FAQ and glossary: https://critical-load.vercel.app/critical-load-guide.pdf); editing a preset keeps your values as "My own limits"; Rank sites, and Compare sites with coordinates and "Open this site". The calculation engine is unchanged from the tested build (same engine fingerprint, npm test 28/28, demo still CAUTION → NO-GO; checked by John's Claude on 1198091).
- How it works: Sun/Earth positions come from NASA JPL DE421 (precomputed for preset sites through 2028) with a live astronomy-engine fallback (IAU WGCCRE 2015 lunar orientation) for any site/date; the two agree within 0.013°. Positions are converted to the local East-North-Up frame at the site (mean radius 1737.4 km, so Earth's parallax is included). For sites south of 80°S, a terrain horizon is computed from the NASA LOLA 80 m/pixel south-pole elevation map: 720 directions (0.5° apart), ray-marched from 240 m out to the edge of the map, with the observer at the **solar-array height** (presets: ESA 2 m / 1.2 m from De Rosa et al. 2012, NASA VSAT 9.75 m as reported in trade press, or custom). The Sun or Earth counts as visible only when its centre is above that horizon. Slope is evaluated over a 100 m baseline (NASA Artemis wording) or from the NASA LOLA slope map.
- Landing simulation: touchdowns are scattered around the target with 50 m (strict, default) or 100 m accuracy. **Assumption:** NASA does not state a probability for "land within 100 m"; we assume 99.7 % of landings fall within that distance, which for a zero-mean 2-D scatter means a half-axis of 3.41σ (not 3σ, which holds only 98.9 %). Each site is also checked against the Artemis III site rules (within 6° of the pole, lit for the whole stay, slope < 10° over 100 m using NASA 5 m elevation where mapped); a site that breaks one is marked NO-GO even if every touchdown is safe. Of the listed sites, only Mons Mouton Plateau passes, with 100 % safe touchdowns for 7- and 14-day stays (METHOD.md section 10).
- Known limits: sites north of 80°S use a smooth-sphere horizon (and say so). Terrain detail smaller than the 80 m LOLA pixels (e.g. boulders) is not modelled. Light-time and aberration are ignored in the live fallback engine only (< 0.01°); the JPL DE421 tables include them. Visibility uses the centre of the Sun/Earth disc. Launch windows and trajectories are out of scope. The "Peak near Cabeus B" pin now sits inside NASA's LROC region for that candidate (CABEUSPKLO2, centred 83.6°S, 68.8°W; https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_CABEUSPKLO2) at our team's QA re-pick, 83.62°S, 68.60°W (it was 81.38°S, 57.54°W, about 75 km north). There, NASA PGDA gives 68.5 % sunlit and 66 % Earth in view (not permanently shadowed); our terrain model gives 69.2 % / 67.6 % over a year, slope 4.7°, and the nearest ice trap 13.54 km away (NASA PGDA LPSR 120 m tiles). The crater count is not computed for the re-picked point (it needs the full Robbins ≥ 1 km database), so the craters panel is hidden for this site. Its elevation (+4,586 m against the 1,737.4 km sphere) is higher than figures quoted in press coverage, most likely a different reference surface. NASA's own candidate regions reach slightly past 6° from the pole (Cabeus B spans 5.94–6.79°), so our strict 6° site rule can mark parts of them NO-GO.
- Benefits: answers in seconds instead of expert software; plain-language verdicts; real NASA terrain shows why nearby sites differ; runs in any browser with no install or login; open code and a published validation table.
- How it's creative: most site tools give one answer from one surface model. Ours shows the same site and moment on a smooth Moon and on NASA's real terrain, side by side, so you see the verdict flip and why (the Sun sits behind a ridge). It also shows how a launch slip changes the answer, and ranks sites only against every team's own limits.
- Energy, accessibility and cost: the verdict is about energy first: whether the solar array, at a height you choose, sees the Sun, and how long until sunset. Accessibility: any browser, no install or login; plain GO / CAUTION / NO-GO with shape and colour icons; units, range and an example under every input; checked at phone width (375 px). Cost: free to use, open source, and built only on free, open NASA data.
- What we hope to achieve: help students and educators understand why the south pole is hard, and give early-stage planners a quick first filter before detailed analysis in tools like Moon Trek or Lunar QuickMap.
- Stack: Vite + React (JS), client-side only; astronomy-engine; Python pipelines (numpy, pandas, rasterio, shapely, Skyfield); SVG sky dome; three.js 3D Moon globe; deployed on Vercel.

## How it works: the workflow, the maths, the decisions and the limits (one page)

Without the app, a planner checking one landing site and date pulls ephemerides, loads terrain maps into expert tools, works out the horizon, steps through the whole stay hour by hour, checks slope and shadow, and repeats all of it for every site, date and launch slip. The app chains those steps automatically and shows the decision and the reason. Full detail and validation for every step: [METHOD.md](METHOD.md).

**Inputs:** site (preset, named place or coordinates), date and time (UTC), surface stay (7 days default, 14 days, or custom), solar-array/antenna height (2 m default, from the ESA lander study; 1.2 m; NASA VSAT 9.75 m; or custom), landing accuracy (50 m radius default, 100 m, or custom), and visibility margin (0.5° default).

| # | Question the app answers | What it computes (maths / physics) | NASA data (link) | Decision rule |
| --- | --- | --- | --- | --- |
| 1 | Where are the Sun and Earth? | Sun and Earth vectors in the Moon-fixed frame → local east-north-up at the site (mean radius 1,737.4 km, so Earth's parallax is included) → elevation and azimuth | [JPL DE421](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/) (precomputed tables), live astronomy-engine fallback (IAU 2015 Moon orientation), checked against [JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | (input to steps 2–3) |
| 2 | What does the terrain hide? | Horizon in 720 directions (every 0.5°): a ray marched over the curved Moon from 240 m out (40 m steps to 4 km, then ×1.01 each step); horizon angle = max of atan2(height above observer, distance), with the observer at the array height | [NASA LRO LOLA 80 m south-pole elevation + 320 m far field](https://pgda.gsfc.nasa.gov/products/90) | Sun or Earth counts as "up" only when its centre clears the terrain horizon by more than the margin (0.5°) |
| 3 | Power and radio over the whole stay? | Hourly steps, with exact sunrise/sunset/Earthrise/Earthset times interpolated; longest dark stretch and longest comms gap | Steps 1–2 | Power OK if longest dark ≤ battery hours (Artemis III preset: 0 h = lit the whole stay). Comms OK if longest gap ≤ allowed gap (48 h, our setting; no relay, per Artemis III) |
| 4 | Is the ground safe to land on? | Slope over a 100 m baseline (NASA's wording) from NASA 5 m site maps where they exist, else LOLA 80 m; permanent-shadow lookup | [NASA 5 m site DEMs](https://pgda.gsfc.nasa.gov/products/78), [LOLA slope + permanent shadow](https://pgda.gsfc.nasa.gov/products/90), [PGDA polar illumination](https://pgda.gsfc.nasa.gov/products/69) | Slope < 10° over 100 m; touchdown in permanent shadow fails; within 6° of the pole (Artemis III, [NTRS 20250009323](https://ntrs.nasa.gov/citations/20250009323)) |
| 5 | What if we land a bit off target? | 1,000 touchdowns from a 2-D normal scatter; the ellipse holds 99.7 %, so each half-axis = 3.41 σ (√(−2 ln 0.003)); every touchdown gets its own horizon, slope, shadow, power and comms check; fixed seed | Steps 1–4 | P(safe) with a Wilson 95 % interval, plus which rule failed and how often |
| 6 | How hot or cold is it? | Annual average and maximum temperature, ice-stability depth for the site's 120 m cell | NASA LRO Diviner Polar Resource Product (PDS Geosciences Node) | Reported only: NASA publishes no landing-site thermal limit, so none applies unless the thermal team enters one |
| 7 | Is there a better spot nearby? | Stage 1: screen every NASA 120 m pixel within the radius, then score. Stage 2: run 1,000 touchdowns on the best 1–5 for the real dates | [PGDA polar illumination (18.6-year average)](https://pgda.gsfc.nasa.gov/products/69) + steps 1–5 | Stage 1 hard filters: Earth in view ≥ 25 %, Sun ≥ 5 %, not permanently shadowed, within 6° of the pole. Stage 2 decides the final ranking |
| 8 | Which site wins for the whole team? | Each team (planning, power, comms, landing, thermal, science) sets hard limits and a weight 0–5; score = Σ wᵢ sᵢ / Σ wᵢ (simple additive weighting); sensitivity sweep (limits ×0.75/×1.25, weights ×0.5/×1.5) | Steps 1–7 | Only sites passing **every** team's limits are ranked. Default weights (landing 4, power 3, comms 3, planning 2, science 1, thermal 0) are our judgment, not NASA's, and are editable |

**Output:** GO / CAUTION / NO-GO for power and direct-to-Earth comms, the reasons, the Sun and Earth drawn on the real horizon, and time to the next sunset or Earthset.

**Worked example (the demo):** Connecting ridge, 2026-11-15 21:00 UTC. The Sun is 1.26° above a smooth Moon's horizon but 0.91° below the real LOLA terrain horizon, so the verdict goes from CAUTION (smooth Moon) to NO-GO (real terrain), with the "Sun hidden by terrain" marker. This is tested on every `npm test` (tests/demo.test.js).

**How we checked it:**
- Sun/Earth positions match NASA JPL Horizons at 750 points (15 sites × 25 dates) within 0.007°.
- The browser engine matches our offline Python pipeline within 0.044° at 11 polar sites.
- Our one-year sunlit % is within 3 points of NASA's 18.6-year PGDA map at 9 of 11 sites.
- Hourly vs 10-minute steps: 0 verdict changes (11 sites × 113 dates).
- 28/28 automated tests pass.

### Limits: what the app does not do (also stated in the app)
- **Terrain detail:** sites north of 80°S use a smooth-Moon horizon, and the app says so. Boulders smaller than 5 m are not modelled, nor anything smaller than 80 m outside NASA's 27 high-resolution site maps. The horizon starts 240 m out, so a dip smaller than that is invisible. Example: NASA flags the exact Connecting ridge pixel as permanently shadowed, while our model says about 60 % sunlit; the verdict is NO-GO either way.
- **Visibility** uses the centre of the Sun's or Earth's disc (plus the margin). The live fallback engine ignores light-time and aberration (< 0.01°); the JPL DE421 tables include them.
- **Our settings, not NASA's:** stay length, the 48 h comms gap and team weights. NASA states no probability for "land within 100 m", so we assume 99.7 %. Our strict 6° rule can mark parts of NASA's own candidate regions NO-GO (Cabeus B spans 5.94–6.79°). The VSAT 9.75 m mast height comes from trade press.
- **Battery setting differs between two screens:** the single-site verdict (and the locked demo) assumes the lander can ride out up to 48 h of darkness on batteries; the Team review ranking's power criterion uses 0 h (sunlit the whole stay). So the ranking is stricter on power than the verdict. Checked in the code on main; not changed before judging.
- **Not modelled:**
  - launch windows and trajectories
  - lighting along the approach path (only at touchdown)
  - Deep Space Network scheduling (we check Earth is above the terrain, not antenna availability)
  - Gateway descent opportunities are approximated as every 6.5 days from one the planner enters, because the orbit's phase isn't public
- **Thermal** is reported, not judged, unless a team enters limits.
- **It is a first filter**, not a certified mission tool: detailed analysis still belongs in tools like Moon Trek or Lunar QuickMap, and the final decision is a person's.

Deeper: [METHOD.md](METHOD.md) (every step with sources and validation) · [DATA_LAYER.md](DATA_LAYER.md) · [tools/science/README.md](tools/science/README.md) (NASA data pipelines) · `src/engine/` (the decision code) · `data/results/` (raw run outputs).

## NASA Data Used
- **NASA LRO LOLA south-pole topography** (NASA GSFC PGDA, "A New View of the Lunar South Pole from LOLA"): LDEM_80S_80MPP_ADJ (80 m elevation), LDSM_80S_80MPP_ADJ (slope), LPSR_80S_20MPP_ADJ_1km2 (permanently shadowed regions > 1 km²). Terrain horizons, slope, nearest ice trap.
- **NASA PGDA Lunar Polar Illumination** (AVGVISIB_75S_120M_201608, sunlight + Earth visibility averaged over 18.6 years): choosing Artemis III region points and independent validation. LPSR_75S_120M_201608 (permanently shadowed 120 m pixels): the NASA panel's permanent-shadow display.
- **NASA PGDA high-resolution 5 m LOLA site DEMs** (products/78): search areas for priority sites.
- **NASA JPL DE421 planetary and lunar ephemeris** (NAIF SPICE kernels): precomputed Sun/Earth positions (see DATA_LAYER.md).
- **NASA JPL Horizons:** independent validation; also live in the app via /api/horizons.
- **NASA LRO Diviner Polar Resource Product** (PDS Geosciences Node): temperature and depth to stable ice.
- **NASA Solar System Treks – Moon Trek, LRO WAC Global Mosaic 303 ppd v02** (NASA LRO LROC / Arizona State University): imagery tiles for the 3D Moon globe ("Grey (WAC)" view), https://trek.nasa.gov/moon/
- **NASA SVS CGI Moon Kit** (NASA Goddard Scientific Visualization Studio, https://svs.gsfc.nasa.gov/4720): LRO LROC WAC colour mosaic (lroc_color_poles_8k) and LRO LOLA elevation (ldem_16), resized to WebP for the 3D Moon "Natural colour" view (public/moon).
- **NASA NSSDCA** (Apollo 12/14/15/16 lunar module positions) and **NASA LRO LROC** (Chang'e 3/5/6, SLIM, IM-1, Blue Ghost lander positions): named places in the site list (src/places.js).
- **NASA Artemis III landing limits** (NTRS 20240009596, Artemis HLS update 2024; NTRS 20250009323, Space Apps 2025 overview): slope < 10° over 100 m, land within 100 m, within 6° of the pole, direct-to-Earth comms, lighting.

## Space Agency Partner Data & Other References
- Barker, M. K. et al. (2023), Planetary Science Journal 4, 183, doi:10.3847/PSJ/acf3e1. Data: doi:10.60903/gsfcpgda-lola-spole, https://pgda.gsfc.nasa.gov/products/90
- Mazarico, E. et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066–1081. Data: https://pgda.gsfc.nasa.gov/products/69
- NASA PGDA, High-Resolution LOLA Topography for Lunar South Pole Sites: https://pgda.gsfc.nasa.gov/products/78
- Folkner, W. M., Williams, J. G., Boggs, D. H. (2008), The Planetary and Lunar Ephemeris DE 421, JPL IOM 343R-08-003; NAIF SPICE kernels: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- JPL Horizons System API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- NASA LRO Diviner Polar Resource Product (dlre_prp_south), PDS Geosciences Node
- Robbins, S. J. (2019), A New Global Database of Lunar Impact Craters >1–2 km, JGR Planets, doi:10.1029/2018JE005592 (USGS Astrogeology)
- USGS Gazetteer of Planetary Nomenclature (IAU feature names and IDs, including the named places list)
- NASA NTRS 20240009596 (Artemis HLS update, 2024) and NTRS 20250009323 (Artemis HLS overview for Space Apps 2025)
- Archinal, B. A. et al. (2018), Report of the IAU WGCCRE: 2015
- De Rosa, D. et al. (2012), Planetary and Space Science 74, 224, arXiv:1208.5587 (ESA preset: 15° slope, 99.7 % landing ellipse, 2 m / 1.2 m array heights)
- K. Durga Prasad et al. (2024), Chandrayaan-3 alternate landing site: pre-landing characterisation, Current Science 126(7), 774–780, arXiv:2308.10712 (Chandrayaan-3 preset; the 7° value is the site's reported overall slope, a selection criterion rather than a lander tolerance)
- LROC NAC region of interest CABEUSPKLO2: https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_CABEUSPKLO2
- NASA Vertical Solar Array Technology (VSAT): NTRS 20240004914 (Belbin, Mills, Chan 2024); the 9.75 m mast height in our preset comes from trade press (Aerospace Manufacturing and Design)
- astronomy-engine (Don Cross, MIT): https://github.com/cosinekitty/astronomy · Skyfield (Brandon Rhodes, MIT): https://rhodesmill.org/skyfield/ · three.js (MIT): https://threejs.org · React: https://react.dev · Vite: https://vitejs.dev

## Use of AI (Super Intelligence)
- **Claude (Anthropic):** used throughout as a tool to move faster; the idea, product decisions and final judgement were the team's. Three Claude assistants coordinated through a shared Google Drive folder (project manager, builder, tester/validator). Claude wrote and reviewed most of the code under our direction, helped build an independent re-implementation and the JPL Horizons comparison, and drafted documentation and the demo script, which we edited. Commits credit Claude.
- The 30-second demo video is a screen recording of the real app (main 0c6266e, code = tested 32d2ab1, locked demo, no code changed), captured with Playwright in headless Chrome and edited with ffmpeg by Claude. Its voice-over is AI-generated text-to-speech (Kokoro-82M via kokoro-onnx, voice "af_heart", Apache-2.0), labelled "AI voice-over (text-to-speech)" on screen for the whole video. Subtitles are burned in (Inter font, SIL OFL). No AI-generated images or footage. No NASA logos or branding. An earlier no-voice cut (main a95e601) also exists.

## Results with real terrain (smooth Moon → LOLA terrain)
| Site | Sunlit, next 30 days | Sunlit over a year | Earth in view over a year | Slope | Nearest ice trap |
| --- | --- | --- | --- | --- | --- |
| Shackleton rim | 100% → 100% | 54% → 84% | 47% → 48% | 8.9° | 2.6 km |
| Connecting ridge | 100% → 68% | 52% → 60% | 47% → 39% | 9.2° | 5.7 km |
| Malapert Massif | 62% → 52% | 52% → 43% | 69% → 100% | 6.7° | 12.2 km |
| IM-2 / Mons Mouton | 59% → 52% | 52% → 47% | 73% → 82% | 2.4° | 9.7 km |

30-day window from 2026-11-14 21:00 UTC, observer 2 m (pre-audit run). Malapert point = feature centre, not a chosen landing spot.

## Validation log
| Check | Result |
| --- | --- |
| Near-pole test point (89.9°S, 0°E), 2026-11-14 18:00 UTC | Sun alt +1.509°, az 117.484° (sunlit). Earth alt −3.742°, az 357.728° (not visible; next Earthrise 2026-11-17 14:54 UTC) |
| Independent re-implementation (separate code, same method) | Sun +1.509° / 117.478°, Earth −3.742° / 357.728°: agrees to 0.006° |
| **JPL Horizons** vs our engine, 89.9°S 0°E, 2026-11-14 18:00 UTC | Horizons: Sun az 117.48°, el +1.51°; Earth az 357.73°, el −3.74°. Ours: 117.484° / +1.509°; 357.728° / −3.742°. Agreement ≈ 0.01° |
| JPL DE421 tables vs live engine, 8 sites, every 6 h for 26 months | max 0.013° on the sky; RMS ≈ 0.003° in altitude |
| JPL DE421 table for the re-picked Cabeus B point (83.62°S, 68.60°W) vs live engine, 196 samples over 26 months | max 0.0072° (independent QA check) |
| Terrain model vs NASA PGDA 18.6-year average sunlight, 11 polar sites | within 3 percentage points at 9 of 11; the 2 exceptions sit on crater edges where NASA's map jumps from 0 % to 63–90 % within 180 m |
| 99.7 % landing ellipse half-axis | 3.41σ independently verified (Rayleigh: k = √(−2 ln 0.003) = 3.409; 3σ contains only 98.89 %) |
| Earth altitude at pole vs astronomy-engine Libration() | −3.842° vs −3.617°; 0.225° gap ≈ expected topocentric parallax |
| JS engine vs Python terrain pipeline, Connecting ridge, 30 days | 67.9% vs 68.1% sunlit; 31.7% vs 31.7% Earth in view |
| **JPL Horizons, full table**: 15 sites × 25 dates (2026-11 → 2028-11, every 30 days), Sun + Earth, 750 points, terrain off | max 0.007° on the sky (RMS 0.004°) for both the DE421 tables and the live fallback. Visible/hidden flag disagrees at 1 of 750 points (Shackleton rim, Sun centre within 0.002° of the horizon; the app already calls this marginal) |
| NASA PGDA 120 m sunlight at the exact Connecting ridge point (89.406°S, 136.2°W) | NASA flags this one 120 m pixel as permanently shadowed (LPSR_75S_120M); the 24 pixels around it are 21–63 % sunlit. Our model says ~60 % because its terrain horizon starts 240 m out, so a dip that small is invisible to it. Verdict is NO-GO either way. Two separate decodes of the NASA data agree |
| Automated demo test (`npm test`, tests/demo.test.js): Connecting ridge, 2026-11-15 21:00 UTC, 7- and 14-day stays | Smooth Moon CAUTION, real terrain NO-GO; Sun 1.26° up and 0.91° behind the terrain (matches the independent engine check). All 28 tests pass |

## Submission Checklist
- [ ] All teammates registered at the Oshawa event and listed on the Members tab
- [ ] Every form field filled in, in English
- [ ] Demo ≤ 30 s (subtitled) or ≤ 7 slides
- [ ] All links public and tested in a private browser (repo is public ✓)
- [ ] NASA data described; all other sources cited
- [ ] AI use disclosed
- [ ] No personal info or anyone under 18 in the project
- [ ] Terms + originality boxes checked
- [ ] **Submit for Judging** clicked (target 12 PM Sunday, hard deadline 11:59 PM)
