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
Lunar Landing Site Navigator is a free web app that answers two questions for any spot on the Moon at any date: will a lander have sunlight for power, and can it see Earth to radio home? Pick a site, pick a time, and see the Sun and Earth on a simple sky dome, plus plain answers like "sunlit for 9 more days" and "Earth rises in 2 days". We focus on the lunar south pole, where Artemis plans to land: there the Sun skims the horizon and Earth bobs up and down, so conditions can differ sharply between nearby sites. NASA's existing tools are powerful but built for experts; ours puts the same answers in front of students, educators and early-stage mission planners in seconds, with numbers checked against NASA's JPL Horizons.

## Project Demo
_Link (public, no login): 30-second video with English subtitles._

### Demo script (30 s, DRAFT)
| Time | On screen | Voice-over / subtitle |
| --- | --- | --- |
| 0:00 | Team name card | "We're Critical Load, from Oshawa." |
| 0:02 | Moon south pole image (no NASA logos) | "NASA wants to land astronauts at the Moon's south pole." |
| 0:05 | App title + tagline | "Lunar Landing Site Navigator: a weather app for the Moon." |
| 0:08 | Pick Shackleton rim + today's date | "Pick a spot and a date." |
| 0:11 | Sky dome: Sun low on the edge, Earth below | "The Sun barely rises here, and Earth is hidden: power yes, signal no." |
| 0:16 | Compare mode: two nearby sites | "Compare sites side by side: small moves change everything." |
| 0:21 | 30-day chart with sun and signal windows | "See the whole month of sunlight and signal at a glance." |
| 0:25 | Validation table vs JPL Horizons | "Checked against NASA's JPL Horizons." |
| 0:28 | App link | "Simple answers for the next giant leap." |

## Final Project
_Link to deployed app + this repo (repo must be public before submitting)._

## Detailed Description
- What it does: pick a lunar site and date/time; see Sun and Earth on a sky dome, solar elevation, sunlit / Earth-visible status, time to next sunset/Earthset, a ~30-day timeline, and side-by-side site comparison. Focus: the south pole, where the Sun skims the horizon and Earth bobs with libration.
- How it works: the Moon's geocentric and heliocentric J2000 vectors come from astronomy-engine. They are rotated into the Moon's body-fixed frame with the IAU WGCCRE 2015 lunar rotation model (including libration terms), then converted to a local East-North-Up frame at the site (mean radius 1737.4 km, so Earth's parallax is included). That gives altitude and azimuth of the Sun and Earth; rise/set times are searched up to 30 days ahead and refined to ~1 s.
- Known limits: no terrain yet, so "sunlit" and "Earth visible" mean the body's centre is above a smooth-sphere horizon. Light-time and aberration are ignored (< 0.01°).
- Benefits (DRAFT): answers in seconds instead of expert software; plain-language results anyone can read; side-by-side comparison makes trade-offs between sites obvious; runs in any browser with no install or login; transparent method with a published validation table.
- What we hope to achieve (DRAFT): help students and educators understand why the south pole is hard, and give early-stage planners a quick first filter before detailed terrain analysis in tools like Moon Trek or Lunar QuickMap. Next steps: terrain-aware horizons from LOLA, animation over a lunar day, and orbiter relay visibility.
- Stack: Vite + React (JS), client-side only; astronomy-engine; SVG sky dome; Recharts/Plotly timeline; deployed on Vercel.

## NASA Data Used
_At least one NASA data source is required for Global Awards._
- JPL Horizons (validation of Sun/Earth azimuth & elevation at lunar sites)
- _LOLA topography if we reach the terrain stretch goal_

## Space Agency Partner Data & Other References
- astronomy-engine, Don Cross, MIT licence: https://github.com/cosinekitty/astronomy
- Archinal et al. (2018), Report of the IAU Working Group on Cartographic Coordinates and Rotational Elements: 2015 (IAU WGCCRE 2015)
- Vite: https://vitejs.dev
- React: https://react.dev

## Use of AI (Super Intelligence)
- **Claude (Anthropic):** used by the team for planning, reading the submission guides, coordinating work between teammates, drafting documentation and the demo script, and writing/reviewing code (including the calculation engine). _Add specifics as we go._
- AI-generated images/videos must carry a visible watermark; AI-generated code/data must be labelled in text or metadata. No NASA logos or branding in generated content.

## Validation log
| Check | Result |
| --- | --- |
| Shackleton rim (89.9°S, 0°E), 2026-11-14 18:00 UTC | Sun alt +1.509°, az 117.484° (sunlit). Earth alt −3.742°, az 357.728° (not visible; next Earthrise 2026-11-17 14:54 UTC) |
| Earth altitude at pole vs astronomy-engine Libration() | −3.842° vs −3.617°; 0.225° gap ≈ expected topocentric parallax |
| JPL Horizons, 3 site/time pairs | _pending (checkpoint 4)_ |

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
