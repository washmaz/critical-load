// sites.js — curated landing sites. Every coordinate has a source link.
// Coordinates are selenographic degrees: lat positive north, lon positive EAST (-180..180).
// Where a source gives 0–360 °E, it is converted (e.g. 196.739°E -> -163.261°).

export const SITES = [
  // ---- South polar region ------------------------------------------------
  {
    id: 'shackleton-rim',
    name: 'Shackleton rim (ridge junction)',
    group: 'South pole',
    lat: -89.684,
    lon: -163.261,
    note: 'Where the Shackleton–de Gerlache ridge meets the Shackleton crater rim. A high-interest area for Artemis.',
    source: 'LROC, "Traversing the Shackleton de Gerlache Ridge" (89.684°S, 196.739°E)',
    url: 'https://lroc.im-ldi.com/images/1247',
  },
  {
    id: 'connecting-ridge',
    name: 'Connecting ridge (site C1)',
    group: 'South pole',
    lat: -89.406,
    lon: -136.2,
    note: 'Ridge between Shackleton and de Gerlache craters; rated one of the most promising sites in the study.',
    source: 'Icarus (2024), "Potential landing sites characterization on lunar south pole: De-Gerlache to Shackleton ridge region", site C1',
    url: 'https://www.aminer.cn/pub/65e6db1413fb2c6cf6397042/potential-landing-sites-characterization-on-lunar-south-pole-de-gerlache-to-shackleton',
  },
  {
    id: 'malapert-massif',
    name: 'Malapert Massif (Artemis III region)',
    group: 'South pole',
    lat: -85.98,
    lon: -1.67,
    note: 'One of NASA\'s nine Artemis III candidate regions (Oct 2024). Point is the IAU feature centre, not a chosen landing spot; NASA terrain data shows Earth in view nearly all the time here.',
    source: 'USGS Gazetteer of Planetary Nomenclature, Mons Malapert (feature 16338)',
    url: 'https://planetarynames.wr.usgs.gov/Feature/16338',
  },
  {
    id: 'im2-mons-mouton',
    name: 'IM-2 Athena (Mons Mouton)',
    group: 'South pole',
    lat: -84.7906,
    lon: 29.1957,
    note: 'Intuitive Machines IM-2 landed here on 6 Mar 2025 and tipped onto its side. Mons Mouton is also an Artemis III candidate region.',
    source: 'LROC, "IM-2 Athena Seen Obliquely" (84.7906°S, 29.1957°E)',
    url: 'https://lroc.im-ldi.com/images/1408',
  },
  {
    id: 'chandrayaan-3',
    name: 'Chandrayaan-3 (Shiv Shakti point)',
    group: 'South pole',
    lat: -69.3741,
    lon: 32.32,
    note: 'ISRO Vikram lander, landed 23 Aug 2023.',
    source: 'LROC, "Chandrayaan-3 Landing Site" (69.3741°S, 32.32°E)',
    url: 'https://www.lroc.asu.edu/images/1314',
  },
  // ---- NASA Artemis III candidate regions (Oct 2024) ----------------------
  // NASA has not published exact landing points. For each region we chose one point with NASA data only:
  // the pixel with the highest NASA PGDA average sunlight (Mazarico et al. 2011) where LOLA slope <= 8 deg,
  // inside the search area given in `pick`. Code: tools/science/pick_artemis_points.py.
  {
    id: 'nobile-rim-1',
    name: 'Nobile Rim 1 (Artemis III region)',
    group: 'Artemis III regions',
    lat: -85.304,
    lon: 37.0581,
    note: 'One of NASA\'s nine Artemis III candidate regions. Point chosen by us: sunniest spot with slope under 8° (NASA data), NASA PGDA site box Site06 "Nobile rim 1".',
    pick: 'NASA PGDA site box Site06 "Nobile rim 1"',
    source: 'NASA, "NASA Provides Update on Artemis III Moon Landing Regions" (28 Oct 2024); point chosen from NASA PGDA illumination + LOLA slope',
    url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/',
  },
  {
    id: 'nobile-rim-2',
    name: 'Nobile Rim 2 (Artemis III region)',
    group: 'Artemis III regions',
    lat: -83.725,
    lon: 59.4201,
    note: 'One of NASA\'s nine Artemis III candidate regions. Point chosen by us: sunniest spot with slope under 8° (NASA data), NASA PGDA site box DM2 "Nobile rim 2".',
    pick: 'NASA PGDA site box DM2 "Nobile rim 2"',
    source: 'NASA, "NASA Provides Update on Artemis III Moon Landing Regions" (28 Oct 2024); point chosen from NASA PGDA illumination + LOLA slope',
    url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/',
  },
  {
    id: 'haworth',
    name: 'Haworth (Artemis III region)',
    group: 'Artemis III regions',
    lat: -86.368,
    lon: -23.256,
    note: 'One of NASA\'s nine Artemis III candidate regions. Point chosen by us: sunniest spot with slope under 8° (NASA data), NASA PGDA site box "Haworth".',
    pick: 'NASA PGDA site box "Haworth"',
    source: 'NASA, "NASA Provides Update on Artemis III Moon Landing Regions" (28 Oct 2024); point chosen from NASA PGDA illumination + LOLA slope',
    url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/',
  },
  {
    id: 'de-gerlache-rim-2',
    name: 'de Gerlache Rim 2 (Artemis III region)',
    group: 'Artemis III regions',
    lat: -88.5932,
    lon: -67.9442,
    note: 'One of NASA\'s nine Artemis III candidate regions. Point chosen by us: sunniest spot with slope under 8° (NASA data), NASA PGDA site box SL2 "de Gerlache rim" (the closest box NASA has mapped; the official region outline is not published).',
    pick: 'NASA PGDA site box SL2 "de Gerlache rim" (the closest box NASA has mapped; the official region outline is not published)',
    source: 'NASA, "NASA Provides Update on Artemis III Moon Landing Regions" (28 Oct 2024); point chosen from NASA PGDA illumination + LOLA slope',
    url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/',
  },
  {
    id: 'peak-near-cabeus-b',
    name: 'Peak near Cabeus B (Artemis III region)',
    group: 'Artemis III regions',
    lat: -83.6167,
    lon: -68.5993,
    note: 'One of NASA\'s nine Artemis III candidate regions. Point chosen by us: sunniest spot with slope under 8° (NASA data) inside NASA\'s LROC region box for this region (CABEUSPKLO2). NASA\'s region boundaries extend slightly past 6° from the pole, so this point is 6.38° from the pole.',
    pick: 'sunniest slope ≤ 8° pixel inside NASA\'s LROC region box CABEUSPKLO2 (83.21–84.06°S, 64.80–72.47°W)',
    source: 'NASA, "NASA Provides Update on Artemis III Moon Landing Regions" (28 Oct 2024); region box from LROC ROI CABEUSPKLO2; point chosen from NASA PGDA illumination + LOLA slope',
    url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/',
  },
  {
    id: 'slater-plain',
    name: 'Slater Plain (Artemis III region)',
    group: 'Artemis III regions',
    lat: -88.8075,
    lon: 123.7692,
    note: 'One of NASA\'s nine Artemis III candidate regions. Point chosen by us: sunniest spot with slope under 8° (NASA data), within 25 km of the centre of Slater crater (USGS Gazetteer feature 15325).',
    pick: 'within 25 km of the centre of Slater crater (USGS Gazetteer feature 15325)',
    source: 'NASA, "NASA Provides Update on Artemis III Moon Landing Regions" (28 Oct 2024); point chosen from NASA PGDA illumination + LOLA slope',
    url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/',
  },
  {
    id: 'mons-mouton-plateau',
    name: 'Mons Mouton Plateau (Artemis III region)',
    group: 'Artemis III regions',
    lat: -85.4135,
    lon: 31.7095,
    note: 'One of NASA\'s nine Artemis III candidate regions. Point chosen by us: sunniest spot with slope under 8° (NASA data), on top of Mons Mouton, within 30 km of its centre (USGS Gazetteer feature 16070), outside the other regions\' boxes.',
    pick: 'on top of Mons Mouton, within 30 km of its centre (USGS Gazetteer feature 16070), outside the other regions\' boxes',
    source: 'NASA, "NASA Provides Update on Artemis III Moon Landing Regions" (28 Oct 2024); point chosen from NASA PGDA illumination + LOLA slope',
    url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/',
  },
  // ---- Elsewhere --------------------------------------------------------
  {
    id: 'change-4',
    name: "Chang'e 4 (far side)",
    group: 'Other sites',
    lat: -45.4562,
    lon: 177.5885,
    note: 'CNSA lander in Von Kármán crater, landed 3 Jan 2019. Earth never rises here; it relies on the Queqiao relay.',
    source: 'LROC, "Keeps on Roving!" (refined lander coordinates 45.4562°S, 177.5885°E, ±13 m)',
    url: 'https://www.lroc.asu.edu/images/1168',
  },
  {
    id: 'apollo-11',
    name: 'Apollo 11',
    group: 'Other sites',
    lat: 0.67416,
    lon: 23.47314,
    note: 'Tranquility Base, 20 Jul 1969. Equatorial reference case.',
    source: 'LROC, "Spacecraft Related Coordinates – 2016 Update" (Apollo 11 LM)',
    url: 'https://www.lroc.im-ldi.com/images/938',
  },
  {
    id: 'apollo-17',
    name: 'Apollo 17',
    group: 'Other sites',
    lat: 20.1911,
    lon: 30.7723,
    note: 'Taurus–Littrow valley, Dec 1972.',
    source: 'LROC, "Spacecraft Related Coordinates – 2016 Update" (Apollo 17 LM)',
    url: 'https://www.lroc.im-ldi.com/images/938',
  },
];

export const DEFAULT_SITE_ID = 'shackleton-rim';

export const siteById = (id) => SITES.find((s) => s.id === id);

// Validate a custom site. Returns an error string, or null if OK.
export function validateLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Latitude and longitude must be numbers.';
  if (lat < -90 || lat > 90) return 'Latitude must be between −90 and 90.';
  if (lon < -180 || lon > 360) return 'Longitude must be between −180 and 360 (east-positive).';
  return null;
}

export const normLon = (lon) => (lon > 180 ? lon - 360 : lon);
