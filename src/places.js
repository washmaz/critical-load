// places.js — named places you can test from the "Landing site" dropdown (presentation data, not part of the engine).
// Picking one runs the same any-point check as clicking the map (site = "custom" at these coordinates).
// Coordinates: degrees, latitude +north, longitude +EAST (-180..180).
//   Features: IAU / USGS Gazetteer of Planetary Nomenclature, feature centre (planetarynames.wr.usgs.gov/Feature/<id>).
//   Apollo: NASA NSSDCA, lunar module positions from LRO images (Wagner et al. 2017, Icarus 283).
//   Robotic landers: NASA / LROC (Arizona State University) positions measured in LRO images.
// A feature centre is a reference point, not a chosen landing spot (crater centres are often in permanent shadow).

const GAZ = (id) => ({ source: `IAU / USGS Gazetteer of Planetary Nomenclature, feature ${id}`, url: `https://planetarynames.wr.usgs.gov/Feature/${id}` });
const NSSDCA = { source: 'NASA NSSDCA, Apollo landing site coordinates (LRO, Wagner et al. 2017)', url: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html' };

const P = (id, name, group, lat, lon, src, note) => ({ id, name, group, lat, lon, ...src, ...(note ? { note } : {}) });

export const PLACES = [
  // ---- Landing sites of past missions ----
  P('apollo-12', 'Apollo 12', 'Past landings', -3.0128, -23.4219, NSSDCA, 'Lunar module, Oceanus Procellarum, Nov 1969.'),
  P('apollo-14', 'Apollo 14', 'Past landings', -3.64589, -17.47194, NSSDCA, 'Lunar module, Fra Mauro highlands, Feb 1971.'),
  P('apollo-15', 'Apollo 15', 'Past landings', 26.13239, 3.6333, NSSDCA, 'Lunar module, Hadley–Apennine, Jul 1971.'),
  P('apollo-16', 'Apollo 16', 'Past landings', -8.9734, 15.5011, NSSDCA, 'Lunar module, Descartes highlands, Apr 1972.'),
  P('change-3', "Chang'e 3", 'Past landings', 44.1214, -19.5117,
    { source: 'NASA NSSDCA, table of spacecraft on the Moon (LRO position)', url: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html' }, 'Mare Imbrium, Dec 2013.'),
  P('change-5', "Chang'e 5", 'Past landings', 43.05772, -51.91613,
    { source: 'NASA SSERVI, Chang\'e 5 landing site (N. Petro, LRO project scientist; preliminary)', url: 'https://sservi.nasa.gov/articles/change-5-landing-site/' }, 'Near Mons Rümker, Dec 2020.'),
  P('change-6', "Chang'e 6", 'Past landings', -41.6385, -153.9852,
    { source: 'NASA / LROC, "First Look: Chang\'e 6" (41.6385°S, 206.0148°E)', url: 'https://lroc.im-ldi.com/images/1374' }, 'Apollo basin, far side, Jun 2024.'),
  P('slim', 'SLIM (JAXA)', 'Past landings', -13.316, 25.251,
    { source: 'NASA, "NASA\'s LRO Spots Japan\'s Moon Lander" (13.3160°S, 25.2510°E)', url: 'https://www.nasa.gov/missions/lro/nasas-lro-spots-japans-moon-lander' }, 'Near Shioli crater, Jan 2024.'),
  P('im-1', 'IM-1 Odysseus', 'Past landings', -80.13, 1.44,
    { source: 'NASA, "NASA\'s LRO Images Intuitive Machines\' Odysseus Lander" (80.13°S, 1.44°E)', url: 'https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/' }, 'Near Malapert A, Feb 2024. Landed on its side.'),
  P('blue-ghost-1', 'Blue Ghost Mission 1', 'Past landings', 18.56, 61.81,
    { source: 'LROC, "Firefly Blue Ghost Landing Region" (18.56°N, 61.81°E, target region centre)', url: 'https://lroc.im-ldi.com/images/1400' }, 'Mare Crisium, Mar 2025. Point is the target region centre (landed within about 120 m).'),

  // ---- South-polar features (inside the NASA LOLA terrain map: real terrain is used) ----
  P('shackleton', 'Shackleton (crater centre)', 'South-polar features', -89.67, 129.78, GAZ(5450)),
  P('de-gerlache', 'de Gerlache (crater centre)', 'South-polar features', -88.48, -88.34, GAZ(1439)),
  P('sverdrup', 'Sverdrup (crater centre)', 'South-polar features', -88.32, -153.39, GAZ(5782)),
  P('shoemaker', 'Shoemaker (crater centre)', 'South-polar features', -88.14, 45.91, GAZ(5494)),
  P('haworth-c', 'Haworth (crater centre)', 'South-polar features', -87.45, -5.17, GAZ(14502)),
  P('faustini', 'Faustini (crater centre)', 'South-polar features', -87.18, 84.31, GAZ(1919)),
  P('nobile', 'Nobile (crater centre)', 'South-polar features', -85.28, 53.27, GAZ(4321)),
  P('cabeus', 'Cabeus (crater centre)', 'South-polar features', -85.33, -42.13, GAZ(953)),
  P('amundsen', 'Amundsen (crater centre)', 'South-polar features', -84.44, 83.07, GAZ(247)),
  P('mons-malapert', 'Mons Malapert', 'South-polar features', -85.98, -1.67, GAZ(16338)),
  P('mons-mouton', 'Mons Mouton', 'South-polar features', -84.6, 31.0, GAZ(16070)),

  // ---- Maria ----
  P('mare-tranquillitatis', 'Mare Tranquillitatis', 'Maria', 8.35, 30.83, GAZ(3691)),
  P('mare-serenitatis', 'Mare Serenitatis', 'Maria', 27.29, 18.36, GAZ(3686)),
  P('mare-imbrium', 'Mare Imbrium', 'Maria', 34.72, -14.91, GAZ(3678)),
  P('mare-crisium', 'Mare Crisium', 'Maria', 16.18, 59.1, GAZ(3671)),
  P('mare-fecunditatis', 'Mare Fecunditatis', 'Maria', -7.83, 53.67, GAZ(3673)),
  P('mare-nectaris', 'Mare Nectaris', 'Maria', -15.19, 34.6, GAZ(3683)),
  P('mare-nubium', 'Mare Nubium', 'Maria', -20.59, -17.29, GAZ(3684)),
  P('mare-frigoris', 'Mare Frigoris', 'Maria', 57.59, -0.01, GAZ(3674)),
  P('oceanus-procellarum', 'Oceanus Procellarum', 'Maria', 20.67, -56.68, GAZ(4395)),
  P('mare-orientale', 'Mare Orientale', 'Maria', -19.87, -94.67, GAZ(3685)),
  P('mare-smythii', 'Mare Smythii', 'Maria', -1.71, 87.05, GAZ(3689)),
  P('mare-australe', 'Mare Australe', 'Maria', -47.77, 91.99, GAZ(3665)),
  P('mare-moscoviense', 'Mare Moscoviense (far side)', 'Maria', 27.28, 148.12, GAZ(3682)),
  P('mare-ingenii', 'Mare Ingenii (far side)', 'Maria', -33.25, 164.83, GAZ(3679)),

  // ---- Craters (near side) ----
  P('tycho', 'Tycho', 'Craters', -43.3, -11.22, GAZ(6163)),
  P('copernicus', 'Copernicus', 'Craters', 9.62, -20.08, GAZ(1296)),
  P('aristarchus', 'Aristarchus', 'Craters', 23.73, -47.49, GAZ(380)),
  P('kepler', 'Kepler', 'Craters', 8.12, -38.01, GAZ(2990)),
  P('plato', 'Plato', 'Craters', 51.62, -9.38, GAZ(4757)),
  P('eratosthenes', 'Eratosthenes', 'Craters', 14.47, -11.32, GAZ(1820)),
  P('clavius', 'Clavius', 'Craters', -58.62, -14.73, GAZ(1236)),
  P('moretus', 'Moretus', 'Craters', -70.63, -5.95, GAZ(4034)),
  P('gassendi', 'Gassendi', 'Craters', -17.55, -39.96, GAZ(2111)),
  P('grimaldi', 'Grimaldi', 'Craters', -5.38, -68.36, GAZ(2252)),
  P('schickard', 'Schickard', 'Craters', -44.38, -55.11, GAZ(5368)),
  P('langrenus', 'Langrenus', 'Craters', -8.86, 61.04, GAZ(3273)),
  P('petavius', 'Petavius', 'Craters', -25.39, 60.78, GAZ(4668)),
  P('humboldt', 'Humboldt', 'Craters', -27.02, 80.96, GAZ(2582)),
  P('fra-mauro', 'Fra Mauro', 'Craters', -6.06, -16.97, GAZ(2007)),
  P('descartes', 'Descartes', 'Craters', -11.74, 15.67, GAZ(1498)),
  P('marius', 'Marius', 'Craters', 11.9, -50.84, GAZ(3715)),

  // ---- Far side ----
  P('tsiolkovskiy', 'Tsiolkovskiy', 'Far side', -20.38, 128.97, GAZ(6108)),
  P('von-karman', 'Von Kármán', 'Far side', -44.45, 176.25, GAZ(6440)),
  P('apollo-basin', 'Apollo (basin)', 'Far side', -35.69, -151.48, GAZ(326)),
  P('aitken', 'Aitken', 'Far side', -16.44, 172.96, GAZ(119)),
  P('korolev', 'Korolev', 'Far side', -4.19, -157.41, GAZ(3090)),
  P('hertzsprung', 'Hertzsprung', 'Far side', 1.37, -128.66, GAZ(2482)),
  P('schrodinger', 'Schrödinger', 'Far side', -74.73, 132.93, GAZ(5381)),

  // ---- Other features ----
  P('rima-hadley', 'Rima Hadley (rille)', 'Other features', 25.72, 3.15, GAZ(5064)),
  P('rupes-recta', 'Rupes Recta (Straight Wall)', 'Other features', -21.67, -7.7, GAZ(5230)),
  P('mons-huygens', 'Mons Huygens', 'Other features', 19.92, -2.86, GAZ(3987)),
  P('mons-rumker', 'Mons Rümker', 'Other features', 40.76, -58.38, GAZ(3994)),
  P('reiner-gamma', 'Reiner Gamma (swirl)', 'Other features', 7.39, -58.96, GAZ(4987)),

  // ---- North-polar features ----
  P('peary', 'Peary', 'North-polar features', 88.63, 24.4, GAZ(4627)),
  P('hermite', 'Hermite', 'North-polar features', 86.17, -93.32, GAZ(2471)),
  P('byrd', 'Byrd', 'North-polar features', 85.43, 10.07, GAZ(941)),
  P('rozhdestvenskiy', 'Rozhdestvenskiy', 'North-polar features', 84.99, -157.89, GAZ(5207)),
  P('plaskett', 'Plaskett', 'North-polar features', 81.63, 176.71, GAZ(4756)),
];

export const PLACE_GROUPS = ['Past landings', 'South-polar features', 'Maria', 'Craters', 'Far side', 'Other features', 'North-polar features'];
export const placeById = (id) => PLACES.find((p) => p.id === id);
