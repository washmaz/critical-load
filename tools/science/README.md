# NASA / USGS data pipeline for the extra site data

Everything here runs offline and writes small files the website loads (`src/data/*.json`, `public/craters/robbins_3km.bin`).
Low memory on purpose (works in 1 GB). Python: numpy, pandas, rasterio, shapely, astronomy-engine.

| Script | Data (all public) | Output |
|---|---|---|
| `pick_artemis_points.py` | NASA PGDA average illumination 120 m (Mazarico et al. 2011, pgda.gsfc.nasa.gov/products/69); LOLA slope 80 m (Barker et al. 2023, products/90); NASA PGDA 5 m site boxes (products/78); USGS Gazetteer feature centres | One point per Artemis III region: sunniest pixel with slope <= 8 deg in the search area |
| `make_far.py` + `terrain_light.py` | LOLA LDEM/LDSM 80 m, LPSR 1 km2 ice traps (products/90) | Terrain horizon (720 bins), slope, nearest ice trap, 30-day and 1-year sunlit/Earth % per site. Reproduces the original pipeline exactly for Connecting ridge and Shackleton rim |
| `pgda_sample.py` | NASA PGDA AVGVISIB_75S_120M_201608 (+ _EARTH) | NASA's own average sunlit/Earth-visible % at each polar site, used as an independent check |
| `diviner_extract.py` | NASA LRO Diviner Polar Resource Product, dlre_prp_south.tab (PDS Geosciences Node) | Average/max temperature and depth to stable water ice near each polar site |
| `craters_site_stats.py`, `craters_bin.py` | Robbins (2019) Lunar Crater Database (USGS Astrogeology), doi:10.1029/2018JE005592 | Crater counts/rims near each site; all craters >= 3 km for the custom-coordinates warning |

Validation (our 1-year terrain model vs NASA PGDA 18.6-year average sunlight): within 3 percentage points at 9 of 11 polar sites.
The two exceptions (Shackleton rim, Connecting ridge) sit on steep edges where NASA's own map changes from 0 % to 63-90 % within 180 m.
