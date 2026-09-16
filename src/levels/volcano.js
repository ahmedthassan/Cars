// ── 4. The Volcano ───────────────────────────────────────────────────────────
// The last one. Broken rock, the steepest climbs in the game, and ground that
// gives almost nothing back. This level assumes you have already lost a crew
// learning the other three.

export const VOLCANO = {
  id: 'volcano',
  name: 'The Volcano',
  blurb: 'Everything here is either on fire or about to be.',
  hazard: 'Loose scree, brutal gradient, and no grip at all',
  difficulty: 4,

  terrain: {
    seed: 66610188,
    length: 10200,
    baseY: 520,
    climb: 0.105,
    roughness: 1.7,
    // Short, vicious chop — broken rock rather than rolling hills.
    waves: [[760, 13], [300, 9], [120, 6]],
    ramps: [[1400, 360, 33], [3500, 330, 45], [5800, 310, 47], [8000, 300, 46]],
    crests: [
      { at: 2500, lipRun: 280, lipRise: 118, dropRun: 300, dropDepth: 360 },
      { at: 4700, lipRun: 320, lipRise: 140, dropRun: 400, dropDepth: 480 },
      { at: 7100, lipRun: 280, lipRise: 120, dropRun: 300, dropDepth: 350 },
      { at: 8900, lipRun: 260, lipRise: 100, dropRun: 260, dropDepth: 280 },
    ],
    potholes: [[1900, 74, 60], [4100, 76, 64], [6400, 74, 62], [7700, 70, 56]],
    gaps: [[9500, 1000]],
    summitX: 9100,
  },

  physics: {
    wheelFriction: 0.74,
    tractionFloor: 0.14,
    slipReference: 6.4,
    cargoFriction: 0.48,   // the crew starts sliding at about 26 degrees
    // Less bed to stop them, and more bounce to start them moving.
    lip: { h: 5,  w: 6 },
    cargoRestitution: 0.12,
    clingDrain: 0.165,
    clingChance: 0.62,        // fewer second chances
  },

  // The only level that asks for more than a bare majority home.
  game: { winCrew: 2, stallTime: 1.0 },

  theme: {
    sky: ['#1a0604', '#4a1208', '#8c2a10'],
    ground: '#2a1c1a',
    cap: '#5d2a1c',
    capHeight: 10,
    ridge: 'rgba(255,110,50,0.14)',
    fog: 'rgba(90,30,20,0.40)',
    light: 'rgba(255,120,50,0.10)',
    vignette: 0.44,
    embers: true,
    weather: { kind: 'ash', count: 170, speed: 34, drift: 60, size: 2.2, color: '#c9bcb4' },
  },
};
