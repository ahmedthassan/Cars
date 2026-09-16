// ── 2. The Desert ────────────────────────────────────────────────────────────
// Long lazy dunes instead of hard ramps, and sand that gives way under a
// spinning wheel. The gradients are gentler than the Mountain's but the grip is
// worse, so flooring it — the instinct the Mountain trains — is exactly wrong
// here. Dad said the 4x4 could handle it.

export const DESERT = {
  id: 'desert',
  name: 'The Long Dunes',
  blurb: 'Dad said the 4x4 could handle it. Dad has not driven on sand.',
  hazard: 'Sand: the more you floor it, the less you move',
  difficulty: 2,

  terrain: {
    seed: 77120043,
    length: 10800,
    baseY: 520,
    climb: 0.058,
    roughness: 1.25,
    // Big rolling swells — dunes, not mountains. The short chop is almost gone.
    waves: [[1500, 15], [620, 8], [230, 2]],
    ramps: [[2100, 520, 30], [4900, 460, 36], [7900, 420, 40]],
    crests: [
      { at: 3000, lipRun: 340, lipRise: 105, dropRun: 380, dropDepth: 300 },
      { at: 6100, lipRun: 380, lipRise: 128, dropRun: 460, dropDepth: 420 },
      { at: 8800, lipRun: 320, lipRise: 96, dropRun: 300, dropDepth: 260 },
    ],
    potholes: [[2600, 70, 52], [5400, 74, 58], [7300, 68, 48]],
    gaps: [[9800, 1000]],
    summitX: 9400,
  },

  physics: {
    // Sand. Low grip and a low traction floor, so wheelspin genuinely buries
    // you rather than merely slowing you down.
    wheelFriction: 0.78,
    tractionFloor: 0.16,
    slipReference: 7.0,
    cargoFriction: 0.68,   // the crew starts sliding at about 34 degrees
    // Less bed to stop them, and more bounce to start them moving.
    lip: { h: 11, w: 8 },
    cargoRestitution: 0.06,
    rollingFriction: 0.032,
  },

  game: { winCrew: 2 },

  theme: {
    sky: ['#7a4a1e', '#c98a3f', '#f0c987'],
    ground: '#8a6033',
    cap: '#e8c07a',
    capHeight: 13,
    ridge: 'rgba(255, 226, 170, 0.18)',
    fog: 'rgba(240, 200, 140, 0.26)',
    light: 'rgba(255, 220, 150, 0.09)',
    vignette: 0.20,
    heatHaze: true,
    weather: { kind: 'sand', count: 150, speed: 150, drift: 190, size: 1.9, color: '#f3d9a6' },
  },
};
