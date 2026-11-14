# Critical Load: Lunar Landing Site Navigator

**Team Critical Load: NASA Space Apps Challenge 2026 (Nov 14–15), Oshawa local event**

> Submission deadline: **Sunday, Nov 15, 11:59 p.m.** local time (internal target **8:00 p.m.**). Click **Submit for Judging** on the Space Apps Project tab. Saving is not submitting.

## Team
- Washma ([@washmaz](https://github.com/washmaz)): UI, story, demo, write-up
- Danah: calculation engine (`src/engine/lunarSky.js`), sites list, Horizons validation

## Challenge
Lunar Landing Site Navigator

## High-Level Summary
_What we built, how it addresses the challenge, why it matters (2–3 sentences)._

## Project Demo
_Link (public, no login): 30-second video with English subtitles **or** max 7 slides._

## Final Project
_Link to deployed app + this repo (repo must be public before submitting)._

## Detailed Description
- What it does: pick a lunar site and date/time; see Sun and Earth on a sky dome, solar elevation, sunlit / Earth-visible status, time to next sunset/Earthset, a ~30-day timeline, and side-by-side site comparison. Focus: the south pole, where the Sun skims the horizon and Earth bobs with libration.
- How it works:
- Benefits:
- What we hope to achieve:
- Stack: Vite + React (JS), client-side only; astronomy-engine for Sun/Earth vectors and lunar rotation; Recharts/Plotly timeline; SVG sky dome.

## NASA Data Used
_At least one NASA data source is required for Global Awards._
- JPL Horizons (validation of Sun/Earth azimuth & elevation at lunar sites)
- _LOLA topography if we reach the terrain stretch goal_

## Space Agency Partner Data & Other References
_List every source: data, code, text, images, tools (even open source)._
- astronomy-engine (npm)

## Use of AI (Super Intelligence)
- **Claude (Anthropic):** used by both teammates for planning, reading the submission guides, coordinating work, drafting documentation, and coding help. _Add specifics as we go._
- AI-generated images/videos must carry a visible watermark; AI-generated code/data must be labelled in text or metadata. No NASA logos or branding in generated content.

## Submission Checklist
- [ ] Both teammates registered at the Oshawa event and listed on the Members tab
- [ ] Every form field filled in, in English
- [ ] Demo ≤ 30 s (subtitled) or ≤ 7 slides
- [ ] All links public and tested in a private browser (make this repo public!)
- [ ] NASA data described; all other sources cited
- [ ] AI use disclosed and watermarked
- [ ] No personal info or anyone under 18 in the project
- [ ] Terms + originality boxes checked
- [ ] **Submit for Judging** clicked before 11:59 p.m. Sunday
