# Critical Load: Lunar Landing Site Navigator

**Team Critical Load: NASA Space Apps Challenge 2026 (Nov 14–15), Oshawa local event**

> Submission deadline: **Sunday, Nov 15, 11:59 p.m.** local time (internal target **8:00 p.m.**). Click **Submit for Judging** on the Space Apps Project tab. Saving is not submitting.

## Team
- Washma ([@washmaz](https://github.com/washmaz)): project lead, testing, demo, submission
- Danah ([@danahshanab-debug](https://github.com/danahshanab-debug)): build lead (engine, UI, deploy, validation)
- John ([@john-whitbread](https://github.com/john-whitbread))

## Challenge
Lunar Landing Site Navigator

## High-Level Summary (DRAFT)
Lunar Landing Site Navigator is a free web app that answers two questions for any spot on the Moon at any date: will a lander have sunlight for power, and can it see Earth to radio home? Pick a site, pick a time, and see the Sun and Earth on a simple sky dome against the real horizon, plus plain answers like "sunlit for 9 more days" and "Earth rises in 2 days". We focus on the lunar south pole, where Artemis plans to land: there the Sun skims the horizon and Earth bobs up and down, so hills and crater rims decide everything. Using NASA LOLA terrain, the app shows how sites a few kilometres apart can flip from GO to NO-GO. NASA's existing tools are powerful but built for experts; ours puts the same answers in front of students, educators and early-stage mission planners in seconds.

## Project Demo
_Link (public, no login): 30-second video with English subtitles._

### Demo script (30 s, DRAFT v2)
| Time | On screen | Voice-over / subtitle |
| --- | --- | --- |
| 0:00 | Team name card | "We're Critical Load, from Oshawa." |
| 0:02 | Moon south pole view (no NASA logos) | "NASA wants to land astronauts at the Moon's south pole." |
| 0:05 | App title + tagline | "Lunar Landing Site Navigator: a weather app for the Moon." |
| 0:08 | Pick Connecting ridge + date | "Pick a spot and a date." |
| 0:11 | Smooth Moon: CAUTION, 100% sun | "On a smooth Moon, this site looks sunny." |
| 0:15 | Toggle real terrain: NO-GO, horizon silhouette | "With NASA's real terrain, the hills block the Sun: NO-GO." |
| 0:20 | Compare: Shackleton rim vs Connecting ridge | "A few kilometres away, Shackleton rim stays lit." |
| 0:25 | Validation table | "Built on NASA LOLA data, checked against JPL Horizons." |
| 0:28 | App link | "Simple answers for the next giant leap." |

## Final Project
_Link to deployed app + this repo (repo must be public before submitting)._

## Detailed Description
- What it does: pick a lunar site and date/time; see Sun and Earth on a sky dome with the real terrain horizon, solar elevation, sunlit / Earth-visible status, time to next sunset/Earthset, a ~30-day timeline, and side-by-side site comparison. A "Use real terrain (NASA LOLA)" toggle shows how much terrain changes the answer.
- How it works: the Moon's geocentric and heliocentric J2000 vectors come from astronomy-engine. They are rotated into the Moon's body-fixed frame with the IAU WGCCRE 2015 lunar rotation model (including libration terms), then converted to a local East-North-Up frame at the site (mean radius 1737.4 km, so Earth's parallax is included). For sites south of 80°S, a terrain horizon is precomputed from the NASA LOLA 80 m/pixel south-pole elevation map: 720 directions (0.5° apart), ray-marched from 240 m out to the edge of the map, observer 2 m above the ground. The Sun or Earth counts as visible only when its centre is above that horizon. The app also shows local slope (LOLA slope map) and distance to the nearest permanently shadowed region larger than 1 km² (potential ice trap).
- Known limits: sites north of 80°S use a smooth-sphere horizon (and say so). Terrain detail closer than 240 m is not modelled. Light-time and aberration are ignored (< 0.01°). Visibility uses the centre of the Sun/Earth disc.
- Benefits (DRAFT): answers in seconds instead of expert software; plain-language GO / CAUTION / NO-GO verdicts; real NASA terrain shows why nearby sites differ; side-by-side comparison; runs in any browser with no install or login; transparent method with a published validation table.
- What we hope to achieve (DRAFT): help students and educators understand why the south pole is hard, and give early-stage planners a quick first filter before detailed analysis in tools like Moon Trek or Lunar QuickMap. Next steps: finer-resolution terrain near each site, animation over a lunar day, orbiter relay visibility.
- Stack: Vite + React (JS), client-side only; astronomy-engine; Python terrain pipeline (offline); SVG sky dome; deployed on Vercel.

## NASA Data Used
_At least one NASA data source is required for Global Awards._
- **NASA LOLA (Lunar Orbiter Laser Altimeter), via NASA GSFC PGDA "A New View of the Lunar South Pole from LOLA":** LDEM_80S_80MPP_ADJ (80 m/px elevation), LDSM_80S_80MPP_ADJ (slope), LPSR_80S_20MPP_ADJ_1km2 (permanently shadowed regions > 1 km²). Used for terrain horizons, slope and nearest ice trap.
- **JPL Horizons:** validation of Sun/Earth azimuth & elevation at lunar sites (pending, Sunday).

## Space Agency Partner Data & Other References
- Barker, M. K. et al. (2023), "A New View of the Lunar South Pole from the Lunar Orbiter Laser Altimeter (LOLA)", Planetary Science Journal 4, 183, doi:10.3847/PSJ/acf3e1. Data: doi:10.60903/gsfcpgda-lola-spole, https://pgda.gsfc.nasa.gov/products/90
- astronomy-engine, Don Cross, MIT licence: https://github.com/cosinekitty/astronomy
- Archinal et al. (2018), Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015 (IAU WGCCRE 2015)
- Vite: https://vitejs.dev
- React: https://react.dev

## Use of AI (Super Intelligence)
- **Claude (Anthropic):** used by the team for planning, reading the submission guides, coordinating work between teammates, drafting documentation and the demo script, writing/reviewing code (calculation engine, terrain pipeline, UI), and an independent cross-check of the engine. _Add specifics as we go._
- AI-generated images/videos must carry a visible watermark; AI-generated code/data must be labelled in text or metadata. No NASA logos or branding in generated content.

## Results with real terrain (smooth Moon → LOLA terrain)
| Site | Sunlit, next 30 days | Sunlit over a year | Earth in view over a year | Slope | Nearest ice trap |
| --- | --- | --- | --- | --- | --- |
| Shackleton rim | 100% → 100% | 54% → 84% | 47% → 48% | 8.9° | 2.6 km |
| Connecting ridge | 100% → 68% | 52% → 60% | 47% → 39% | 9.2° | 5.7 km |
| Malapert Massif | 62% → 52% | 52% → 43% | 69% → 100% | 6.7° | 12.2 km |
| IM-2 / Mons Mouton | 59% → 52% | 52% → 47% | 73% → 82% | 2.4° | 9.7 km |

30-day window from 2026-11-14 21:00 UTC. Malapert point = feature centre, not a chosen landing spot.

## Validation log
| Check | Result |
| --- | --- |
| Shackleton rim (89.9°S, 0°E), 2026-11-14 18:00 UTC | Sun alt +1.509°, az 117.484° (sunlit). Earth alt −3.742°, az 357.728° (not visible; next Earthrise 2026-11-17 14:54 UTC) |
| Independent re-implementation (separate code, same method) | Sun +1.509° / 117.478°, Earth −3.742° / 357.728°: agrees to 0.006° |
| Earth altitude at pole vs astronomy-engine Libration() | −3.842° vs −3.617°; 0.225° gap ≈ expected topocentric parallax |
| JS engine vs Python terrain pipeline, Connecting ridge, 30 days | 67.9% vs 68.1% sunlit; 31.7% vs 31.7% Earth in view |
| Malapert Massif Earth visibility with terrain | 100% over a year, consistent with its study as a communications site |
| JPL Horizons, 3 site/time pairs | _pending (Sunday)_ |

## Submission Checklist
- [ ] All teammates registered at the Oshawa event and listed on the Members tab
- [ ] Every form field filled in, in English
- [ ] Demo ≤ 30 s (subtitled) or ≤ 7 slides
- [ ] All links public and tested in a private browser (make this repo public!)
- [ ] NASA data described; all other sources cited
- [ ] AI use disclosed and watermarked
- [ ] No personal info or anyone under 18 in the project
- [ ] Terms + originality boxes checked
- [ ] **Submit for Judging** clicked before 11:59 p.m. Sunday
