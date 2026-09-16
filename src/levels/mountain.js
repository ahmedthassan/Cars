// ── 1. The Mountain ──────────────────────────────────────────────────────────
// The teaching level. Gravity is the villain, the grip is merely bad rather
// than absent, and the climbs are steep enough to be frightening without being
// unfair. You are meant to finish this one, eventually.

export const MOUNTAIN = {
  id: 'mountain',
  name: 'The Mountain',
  blurb: 'Gravity is the villain. Dad has watched one tutorial.',
  hazard: 'Ice, gradient, and a drop past the summit',
  difficulty: 1,

  terrain: {
    seed: 20260913,
    length: 10400,
    baseY: 520,
    climb: 0.075,
    roughness: 1.0,
    waves: [[1100, 10], [480, 6], [190, 3]],
    ramps: [[1750, 440, 26], [4300, 380, 40], [7400, 340, 38]],
    // Gentler than the later levels on purpose. Measured at the original
    // profile, going over the first crest at full throttle threw ALL FOUR bots
    // within two seconds of each other — one terrain feature ending the run
    // outright. A crest should cost you someone, not everyone.
    crests: [
      { at: 2500, lipRun: 360, lipRise: 62, dropRun: 420, dropDepth: 150 },
      { at: 5400, lipRun: 400, lipRise: 78, dropRun: 520, dropDepth: 230 },
      { at: 8300, lipRun: 360, lipRise: 58, dropRun: 400, dropDepth: 140 },
    ],
    potholes: [[3450, 66, 44], [6600, 72, 50]],
    gaps: [[9340, 1000]],
    summitX: 8900,
  },

  physics: {
    wheelFriction: 1.3,
    tractionFloor: 0.28,
    // The teaching level. The crew holds on up to about 39 degrees, so ordinary
    // climbs are survivable and only the ramps and the crests cost you anyone.
    cargoFriction: 0.80,
  },

  game: { winCrew: 2 },

  theme: {
    sky: ['#14203a', '#2d4d72', '#6d94b8'],
    ground: '#3b3f47',
    cap: '#f2f6fa',
    capHeight: 11,
    ridge: 'rgba(255,255,255,0.13)',
    fog: 'rgba(190,214,235,0.20)',
    light: 'rgba(210,235,255,0.05)',
    vignette: 0.24,
    weather: { kind: 'snow', count: 110, speed: 26, drift: 18, size: 2.4, color: '#ffffff' },
  },
};
