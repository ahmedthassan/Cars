// ── 3. Night Storm ───────────────────────────────────────────────────────────
// The hazard is that you cannot see. The road is wet, the night is dark, and
// the only reliable light is the truck's own headlight cone — so the terrain
// ahead arrives as a surprise unless a lightning flash gives it to you.

export const STORM = {
  id: 'storm',
  name: 'Night Storm',
  blurb: 'You cannot see the road. Dad is undeterred by this.',
  hazard: 'Darkness and standing water',
  difficulty: 3,

  terrain: {
    seed: 51099277,
    length: 10600,
    baseY: 520,
    climb: 0.082,
    roughness: 1.45,
    waves: [[900, 12], [380, 8], [150, 5]],
    ramps: [[1600, 400, 30], [4100, 360, 43], [6800, 330, 44], [8700, 300, 40]],
    crests: [
      { at: 2900, lipRun: 300, lipRise: 110, dropRun: 330, dropDepth: 330 },
      { at: 5600, lipRun: 340, lipRise: 130, dropRun: 420, dropDepth: 450 },
      { at: 7900, lipRun: 300, lipRise: 104, dropRun: 300, dropDepth: 300 },
    ],
    potholes: [[2300, 70, 56], [4700, 72, 60], [6200, 70, 54], [8200, 68, 50]],
    gaps: [[9700, 1000]],
    summitX: 9300,
  },

  physics: {
    wheelFriction: 0.92,
    tractionFloor: 0.20,
    cargoFriction: 0.54,   // wet bed, slides at ~28deg
    clingDrain: 0.145,        // wet hands
  },

  game: { winCrew: 2 },

  theme: {
    sky: ['#05070f', '#0d1526', '#1b2740'],
    ground: '#20242c',
    cap: '#3d4756',
    capHeight: 9,
    ridge: 'rgba(120,150,190,0.10)',
    fog: 'rgba(40,60,90,0.42)',
    light: 'rgba(120,170,230,0.04)',
    vignette: 0.52,
    lightning: true,
    headlight: true,
    weather: { kind: 'rain', count: 240, speed: 620, drift: 150, size: 1.2, color: '#9fc4e8' },
  },
};
