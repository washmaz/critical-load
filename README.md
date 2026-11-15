# Critical Load: Lunar Landing Site Navigator

**Team Critical Load: NASA Space Apps Challenge 2026 (Nov 14–15), Oshawa local event**

> Submission deadline: **Sunday, Nov 15, 11:59 p.m.** local time (team target **12:00 p.m.**). Click **Submit for Judging** on the Space Apps Project tab. Saving is not submitting.

## Team
- Washma ([@washmaz](https://github.com/washmaz)): project lead, testing, demo, submission
- Danah ([@danahshanab-debug](https://github.com/danahshanab-debug)): build lead (engine, UI, deploy, validation)
- John ([@john-whitbread](https://github.com/john-whitbread)): testing and validation

## Challenge
Lunar Landing Site Navigator

## High-Level Summary
Lunar Landing Site Navigator is a free web app that answers the two questions every lander at the Moon's south pole depends on: will it have sunlight for power, and can it see Earth to radio home? Pick a site and a date, and the app shows the Sun and Earth against the real horizon, with a plain GO / CAUTION / NO-GO verdict. At the south pole, where Artemis plans to land, the Sun skims the horizon, so hills and crater rims decide everything. Using NASA LOLA terrain, the app shows how a site that looks sunny on a smooth Moon can be NO-GO in reality, and how sites a few kilometres apart differ. It also simulates 1,000 landings around a target to estimate the chance of a safe touchdown, and can search nearby for better spots. NASA's existing tools are powerful but built for experts; ours gives students, educators and early-stage planners the same answers in seconds, with every position checked against NASA JPL data.

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
- What it does: pick a lunar site (Apollo, Chang'e, Chandrayaan-3, IM-2, 9 Artemis III candidate regions, or custom coordinates) and a date; see Sun and Earth on a sky dome with the real terrain horizon, a GO / CAUTION / NO-GO verdict for power and direct-to-Earth comms, time to next sunset/Earthset, a 30-day timeline, side-by-side comparison (slope, nearest ice trap, temperature, craters), a 1,000-touchdown landing simulation, "find me a spot", and Gateway descent opportunities (about one every 6.5 days, per NASA) as a mission-planning option. A "Smooth Moon / Real NASA terrain" switch shows how much terrain changes the answer.
- How it works: Sun/Earth positions come from NASA JPL DE421 (precomputed for preset sites through 2028) with a live astronomy-engine fallback (IAU WGCCRE 2015 lunar orientation) for any site/date; the two agree within 0.013°. Positions are converted to the local East-North-Up frame at the site (mean radius 1737.4 km, so Earth's parallax is included). For sites south of 80°S, a terrain horizon is computed from the NASA LOLA 80 m/pixel south-pole elevation map: 720 directions (0.5° apart), ray-marched from 240 m out to the edge of the map, with the observer at the **solar-array height** (presets: ESA 2 m / 1.2 m, NASA VSAT 9.75 m, or custom). The Sun or Earth counts as visible only when its centre is above that horizon. Slope is evaluated over a 100 m baseline (NASA Artemis wording) or from the NASA LOLA slope map.
- Landing simulation: touchdowns are scattered around the target with 50 m (strict, default) or 100 m accuracy. **Assumption:** NASA does not state a probability for "land within 100 m"; we assume 99.7 % of landings fall within that distance, which for a zero-mean 2-D scatter means a half-axis of 3.41σ (not 3σ, which holds only 98.9 %).
- Known limits: sites north of 80°S use a smooth-sphere horizon (and say so). Terrain detail smaller than the 80 m LOLA pixels (e.g. boulders) is not modelled. Light-time and aberration are ignored in the live fallback engine only (< 0.01°); the JPL DE421 tables include them. Visibility uses the centre of the Sun/Earth disc. Launch windows and trajectories are out of scope.
- Benefits: answers in seconds instead of expert software; plain-language verdicts; real NASA terrain shows why nearby sites differ; runs in any browser with no install or login; open code and a published validation table.
- What we hope to achieve: help students and educators understand why the south pole is hard, and give early-stage planners a quick first filter before detailed analysis in tools like Moon Trek or Lunar QuickMap.
- Stack: Vite + React (JS), client-side only; astronomy-engine; Python pipelines (numpy, pandas, rasterio, shapely, Skyfield); SVG sky dome; deployed on Vercel.

## NASA Data Used
- **NASA LRO LOLA south-pole topography** (NASA GSFC PGDA, "A New View of the Lunar South Pole from LOLA"): LDEM_80S_80MPP_ADJ (80 m elevation), LDSM_80S_80MPP_ADJ (slope), LPSR_80S_20MPP_ADJ_1km2 (permanently shadowed regions > 1 km²). Terrain horizons, slope, nearest ice trap.
- **NASA PGDA Lunar Polar Illumination** (AVGVISIB_75S_120M_201608, sunlight + Earth visibility averaged over 18.6 years): choosing Artemis III region points and independent validation.
- **NASA PGDA high-resolution 5 m LOLA site DEMs** (products/78): search areas for priority sites.
- **NASA JPL DE421 planetary and lunar ephemeris** (NAIF SPICE kernels): precomputed Sun/Earth positions (see DATA_LAYER.md).
- **NASA JPL Horizons:** independent validation; also live in the app via /api/horizons.
- **NASA LRO Diviner Polar Resource Product** (PDS Geosciences Node): temperature and depth to stable ice.
- **NASA Artemis III landing limits** (NTRS 20240009596, Artemis HLS update 2024; NTRS 20250009323, Space Apps 2025 overview): slope < 10° over 100 m, land within 100 m, within 6° of the pole, direct-to-Earth comms, lighting.

## Space Agency Partner Data & Other References
- Barker, M. K. et al. (2023), Planetary Science Journal 4, 183, doi:10.3847/PSJ/acf3e1. Data: doi:10.60903/gsfcpgda-lola-spole, https://pgda.gsfc.nasa.gov/products/90
- Mazarico, E. et al. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066–1081. Data: https://pgda.gsfc.nasa.gov/products/69
- NASA PGDA, High-Resolution LOLA Topography for Lunar South Pole Sites: https://pgda.gsfc.nasa.gov/products/78
- Folkner, W. M., Williams, J. G., Boggs, D. H. (2008), The Planetary and Lunar Ephemeris DE 421, JPL IOM 343R-08-003; NAIF SPICE kernels: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
- JPL Horizons System API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- NASA LRO Diviner Polar Resource Product (dlre_prp_south), PDS Geosciences Node
- Robbins, S. J. (2019), A New Global Database of Lunar Impact Craters >1–2 km, JGR Planets, doi:10.1029/2018JE005592 (USGS Astrogeology)
- USGS Gazetteer of Planetary Nomenclature
- NASA NTRS 20240009596 (Artemis HLS update, 2024) and NTRS 20250009323 (Artemis HLS overview for Space Apps 2025)
- Archinal, B. A. et al. (2018), Report of the IAU WGCCRE: 2015
- astronomy-engine (Don Cross, MIT): https://github.com/cosinekitty/astronomy · Skyfield (Brandon Rhodes, MIT): https://rhodesmill.org/skyfield/ · React: https://react.dev · Vite: https://vitejs.dev

## Use of AI (Super Intelligence)
- **Claude (Anthropic):** used throughout as a tool to move faster; the idea, product decisions and final judgement were the team's. Three Claude assistants coordinated through a shared Google Drive folder (project manager, builder, tester/validator). Claude wrote and reviewed most of the code under our direction, helped build an independent re-implementation and the JPL Horizons comparison, and drafted documentation and the demo script, which we edited. Commits credit Claude.
- No AI-generated images, video or audio are used. No NASA logos or branding.

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
| Terrain model vs NASA PGDA 18.6-year average sunlight, 11 polar sites | within 3 percentage points at 9 of 11; the 2 exceptions sit on crater edges where NASA's map jumps from 0 % to 63–90 % within 180 m |
| 99.7 % landing ellipse half-axis | 3.41σ independently verified (Rayleigh: k = √(−2 ln 0.003) = 3.409; 3σ contains only 98.89 %) |
| Earth altitude at pole vs astronomy-engine Libration() | −3.842° vs −3.617°; 0.225° gap ≈ expected topocentric parallax |
| JS engine vs Python terrain pipeline, Connecting ridge, 30 days | 67.9% vs 68.1% sunlit; 31.7% vs 31.7% Earth in view |
| **JPL Horizons, full table**: 15 sites × 25 dates (2026-11 → 2028-11, every 30 days), Sun + Earth, 750 points, terrain off | max 0.007° on the sky (RMS 0.004°) for both the DE421 tables and the live fallback. Visible/hidden flag disagrees at 1 of 750 points (Shackleton rim, Sun centre within 0.002° of the horizon; the app already calls this marginal) |
| NASA PGDA 120 m sunlight at the exact Connecting ridge point (89.406°S, 136.2°W) | NASA flags this one 120 m pixel as permanently shadowed (LPSR_75S_120M); the 24 pixels around it are 21–63 % sunlit. Our model says ~60 % because its terrain horizon starts 240 m out, so a dip that small is invisible to it. Verdict is NO-GO either way. Two separate decodes of the NASA data agree |

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
