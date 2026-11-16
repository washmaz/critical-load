// presets.js: requirement presets for the landing-ellipse simulation. Only numbers the cited source states are set;
// everything else stays the planner's own input, and what we cannot check is listed openly.
export const PRESETS = {
  custom: { label: 'My own limits', notes: [] },
  'nasa-artemis3': {
    label: 'NASA Artemis III (crewed landing)',
    slopeMaxDeg: 10, slopeMode: 100, accuracy: 'strict50', batteryHours: 0, relay: false,
    evaSlopeDeg: 20, evaRadiusKm: 2, poleWithinDeg: 6,
    source: { title: 'NASA, Artemis III landing site requirements (NTRS 20250009323)', url: 'https://ntrs.nasa.gov/citations/20250009323' },
    notes: [
      'Landing accuracy "100 m x 100 m" / "within 100 m of a target": default is the strict reading, a 50 m radius (99.7 %); switch to 100 m or your own below.',
      'Slope under 10 deg over 100 m: measured over a 100 m baseline from NASA\'s 5 m elevation maps where they exist, else the 80 m map.',
      'Lit for the whole surface stay: any hour with the Sun centre below the terrain horizon (plus margin) fails power.',
      'Direct-to-Earth comms, no relay: relay is switched off; the comms-gap limit is your setting.',
      'Moonwalk (EVA) slopes under 20 deg within 2 km, and within 6 deg of the pole: reported as checks below.',
    ],
  },
  'esa-lunar-lander': {
    label: 'ESA Lunar Lander study',
    slopeMaxDeg: 15, slopeMode: 'nasa5m', panelHeight: 'esa2', batteryHours: 60, earthMinElevDeg: 2,
    source: { title: 'De Rosa et al. 2012, Planet. Space Sci. 74, 224 (arXiv:1208.5587)', url: 'https://arxiv.org/abs/1208.5587' },
    notes: [
      'The study defines the landing ellipse as 99.7 % but gives no size: set the ellipse yourself.',
      'Slope limit 15 deg over ~10 m: NASA\'s 5 m site maps (PGDA product 78) are used, with NASA\'s own slope uncertainty sampled for each touchdown; outside the 27 mapped boxes it falls back to the 80 m map (shown in the results).',
      'Solar arrays 2 m above the ground (the study\'s design value).',
      'Darkness up to 60 h; Earth at least 2 deg above the terrain for comms.',
      'Not applied: 50 cm roughness limit and merging dark periods shorter than 10 h.',
    ],
  },
  chandrayaan3: {
    label: 'ISRO Chandrayaan-3',
    slopeMaxDeg: 7, slopeMode: 'ldsm',
    source: { title: 'Durga Prasad et al. 2024, Chandrayaan-3 alternate landing site: pre-landing characterisation, Curr. Sci. 126(7) (arXiv:2308.10712)', url: 'https://arxiv.org/abs/2308.10712' },
    notes: ['Slope under 7 deg: the paper reports the alternate site\'s overall slope as under 7 deg, meeting the criteria used to select the primary site; it is a site-selection value, not a published lander tolerance.', 'The alternate landing area was about 4 km x 2.4 km (a rectangle): set the ellipse yourself.'],
  },
};

/** Landing-accuracy options (99.7 % containment). */
export const ACCURACY = {
  strict50: { label: '50 m radius (strict reading of NASA "100 m x 100 m")', semiMajorM: 50, semiMinorM: 50 },
  r100: { label: '100 m radius (NASA "within 100 m of a target")', semiMajorM: 100, semiMinorM: 100 },
  custom: { label: 'Custom ellipse' },
};

/** Height of solar arrays / antenna above the ground used for the Sun and Earth checks. Only published values. */
export const PANEL_HEIGHTS = {
  esa2: { label: '2 m: ESA Lunar Lander design (lower edge of side-mounted arrays)', m: 2,
    source: { title: 'De Rosa et al. 2012, sec. 2', url: 'https://arxiv.org/abs/1208.5587' } },
  esa1p2: { label: '1.2 m: ESA study low-array case', m: 1.2, source: { title: 'De Rosa et al. 2012, sec. 2.3', url: 'https://arxiv.org/abs/1208.5587' } },
  vsat: { label: '9.75 m: NASA VSAT mast arrays (deploy up to 32 ft)', m: 9.75,
    source: { title: 'NASA Vertical Solar Array Technology (via Aerospace Manufacturing and Design)', url: 'https://www.aerospacemanufacturinganddesign.com/news/three-companies-advance-solar-array-tech-moon' } },
  custom: { label: 'Custom height' },
};

/** Who owns each assumption in a real site-selection review (used by the assumptions panel). */
export const OWNERS = {
  dates: 'Mission planning', stay: 'Mission planning', slip: 'Mission planning',
  battery: 'Power (EPS) engineering', panel: 'Power (EPS) engineering',
  comms: 'Communications', relay: 'Communications',
  accuracy: 'Guidance, navigation & control (GNC)',
  slope: 'Landing hazards / site assessment', slopeBase: 'Landing hazards / site assessment',
  margin: 'Flight dynamics / ephemeris',
};
