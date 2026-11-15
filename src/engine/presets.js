// presets.js: requirement presets for the landing-ellipse simulation. Only numbers the cited source states are set;
// everything else stays the planner's own input, and what we cannot check is listed openly.
export const PRESETS = {
  custom: { label: 'My own limits', notes: [] },
  'nasa-artemis3': {
    label: 'NASA Artemis III (crewed landing)',
    slopeMaxDeg: 10, semiMajorM: 100, semiMinorM: 100, azimuthDeg: 0, batteryHours: 0, relay: false,
    evaSlopeDeg: 20, evaRadiusKm: 2, poleWithinDeg: 6,
    source: { title: 'NASA, Artemis III landing site requirements (NTRS 20250009323)', url: 'https://ntrs.nasa.gov/citations/20250009323' },
    notes: [
      'Land within 100 m of the target: used as the 99.7 % ellipse (100 m x 100 m).',
      'Slope under 10 deg over 100 m: NASA LOLA slope is measured over 80 m pixels.',
      'Lit for the whole surface stay: any hour with the Sun centre below the terrain horizon (plus margin) fails power.',
      'Direct-to-Earth comms, no relay: relay is switched off; the comms-gap limit is your setting.',
      'Moonwalk (EVA) slopes under 20 deg within 2 km, and within 6 deg of the pole: reported as checks below.',
    ],
  },
  'esa-lunar-lander': {
    label: 'ESA Lunar Lander study',
    slopeMaxDeg: 15, batteryHours: 60, earthMinElevDeg: 2,
    source: { title: 'De Rosa et al. 2012, Planet. Space Sci. 74, 224 (arXiv:1208.5587)', url: 'https://arxiv.org/abs/1208.5587' },
    notes: [
      'The study defines the landing ellipse as 99.7 % but gives no size: set the ellipse yourself.',
      'Slope limit 15 deg (the study measures it over ~10 m; NASA LOLA slope here is over 80 m).',
      'Darkness up to 60 h; Earth at least 2 deg above the terrain for comms.',
      'Not applied: 50 cm roughness limit and merging dark periods shorter than 10 h.',
    ],
  },
  chandrayaan3: {
    label: 'ISRO Chandrayaan-3',
    slopeMaxDeg: 7,
    source: { title: 'Amitabh et al. 2023, Chandrayaan-3 landing site characterisation (arXiv:2308.10712)', url: 'https://arxiv.org/abs/2308.10712' },
    notes: ['Slope under 7 deg.', 'Chandrayaan-3 targeted a 4 km x 2.4 km landing area (a rectangle): set the ellipse yourself.'],
  },
};
