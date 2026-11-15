# NASA data tiles for any-point analysis

The website can analyse **any point** inside NASA's south-polar LOLA map (about 80–90°S, out to ~76°S in the corners),
not only the curated sites. It fetches small tiles from `data/tiles/` in this repo (served by raw.githubusercontent.com)
and computes everything in the browser.

| Step | Script | What it does |
|---|---|---|
| 1 | `fetch_supervised.py OUT` | Downloads the NASA source files (resumable 8 MB range requests; restarts stalled connections) |
| 2 | `build_terrain.py OUT TILES` | LOLA LDEM/LDSM 80 m → `terrain/t{r}_{c}.bin` (elevation + NASA slope); 320 m far-field map → `far/f{r}_{c}.bin` |
| 3 | `build_science.py OUT TILES` | NASA PGDA Sun / Earth visibility + permanent shadow (120 m) and LRO Diviner temperature / ice (exact point-in-triangle) → `science/s{r}_{c}.bin` |

Formats are documented in `data/tiles/meta.json`. Source data:

* NASA LRO LOLA LDEM_80S_80MPP_ADJ and LDSM_80S_80MPP_ADJ: Barker et al. 2023, PSJ 4, 183, doi:10.3847/PSJ/acf3e1 (pgda.gsfc.nasa.gov/products/90)
* NASA PGDA AVGVISIB_75S_120M_201608 (+ _EARTH) and LPSR_75S_120M_201608: Mazarico et al. 2011, Icarus 211, 1066 (pgda.gsfc.nasa.gov/products/69)
* NASA LRO Diviner Polar Resource Product `dlre_prp_south.tab` (PDS Geosciences Node)

## Validation (tests/anypoint.test.js, tests/landingSim.test.js)

* Terrain horizon computed in JavaScript from the tiles vs the offline Python pipeline at all 11 curated polar sites:
  mean difference 0.0004–0.009°, max 0.044°; ground elevation within 0.1 m; slope statistics within the 0.25° storage step.
* One-year sunlit / Earth-visible % at Connecting ridge, Nobile Rim 1 and Malapert: identical to the pre-computed values.
* NASA PGDA sunlight and Earth visibility: equal to NASA's 120 m pixel (within the 0.5 % storage step) at all 11 sites.
  Diviner average temperature and ice depth equal the containing PRP triangle (storage steps 1 K and 2 cm).
* Landing simulation: a zero-size ellipse reproduces the single-point analysis (sunlit 27.89 % vs 27.90 %);
  99.7 % of sampled touchdowns fall inside the ellipse.
