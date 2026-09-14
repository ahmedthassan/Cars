// ── Robot Haul — every tunable in the game ────────────────────────────────────
// This is the file you edit. Nothing else should contain a magic number.

export const PHYSICS = {
  gravity: 1.0,

  // Truck geometry (px)
  cab:      { w: 92,  h: 54 },
  trailer:  { w: 168, h: 22 },
  lip:      { h: 17, w: 9 },   // headboard/tailboard. Without it every bot is
                               // gone inside ten seconds and nobody gets to talk.
  wheel:    { r: 25 },
  hitch:    { gap: 10 },

  // Mass. Cargo mass matters: five bots aboard must measurably hurt the climb.
  cabMass:      9.0,
  trailerMass:  5.5,
  wheelMass:    1.6,
  botMass:      1.25,

  // Centre of mass. Lower = harder to tip. Tuned so the truck goes over
  // somewhere in the 55-65 deg window, i.e. just past tilt_45 and inside
  // tilt_60 — the bands must sit on the real failure boundary.
  //
  // comDrop alone does nothing: the ballast has to actually CARRY the mass.
  // ballastShare is the fraction of cab mass slung at comDrop, and it is what
  // makes the tipping threshold a physical property instead of a wish.
  comDrop: 30,
  ballastShare: 0.72,
  // Ballast sits FORWARD of centre as well as low. The trailer hangs off a
  // hitch behind the rear axle, which levers the cab nose-up all by itself;
  // without a nose-heavy cab the truck wheelies on a 10 degree slope.
  comForward: 0.17,

  // Wheelbase as a fraction of cab width. A short wheelbase wheelies on the
  // torque reaction and puts the truck on its roof on the first ramp.
  wheelbase: 0.46,
  // Trailer wheel position, as a fraction of trailer length behind its centre.
  // Further back = more trailer weight hanging on the hitch = more nose-up
  // lever on the cab. This is the other half of the wheelie problem.
  tailWheel: 0.2,

  // Drive
  driveTorque:   0.28,    // angular impulse per driven wheel at full gas
  brakeTorque:   0.36,
  maxWheelSpeed: 0.85,    // rad/tick cap, stops infinite spin-up
  airTorqueScale: 0.12,   // you have almost no authority in the air

  // Anti-wheelie. Torque applied at the wheels reacts against the chassis and
  // pitches the nose up; with the trailer acting as a prop the truck will
  // happily power itself onto its tail and balance there. Power is cut off
  // between these angles, which is also just true of a real truck: you cannot
  // put the power down through a front wheel that is in the air.
  // Airborne pitch assist. The nose-heavy cab that cures the wheelie also
  // pitches the truck nose-down the moment it leaves a lip, so it arrives
  // nose-first instead of flying. This nudges it back toward level while the
  // driven wheels are off the ground — a game-feel assist, capped low enough
  // that you can still absolutely land on your face.
  airStabilise: 0.00028,
  airStabiliseFrom: 16,   // deg of pitch before the assist does anything

  wheelieFrom: 34,        // deg — start backing off
  wheelieTo:   62,        // deg — almost nothing left
  wheelieFloor: 0.18,

  // Traction. wheelSlip = |wheelSurfaceSpeed - groundSpeed| / slipReference.
  // Drive torque is scaled DOWN as slip rises, so flooring it on ice
  // genuinely fails to climb instead of teleporting you up the hill.
  slipReference:  9.0,
  tractionFloor:  0.28,   // torque multiplier at slip = 1
  wheelFriction:  1.3,    // lower toward 0.7 for slippery snow
  wheelStatic:    0.9,
  cargoFriction:  0.86,   // lower and the bots slide like soap
  rollingFriction: 0.022,

  honkForce: -0.0012,     // upward nudge per bot. Raise to yeet on purpose.

  // ── Clinging ───────────────────────────────────────────────────────────────
  // A bot coming off the trailer gets one chance to catch the edge and dangle
  // by an arm. This is the difference between "a bot fell off" and a scene.
  clingChance:   0.72,    // odds of catching the edge at all
  clingArm:      26,      // px — how long the arm is
  // Grip STARTS below clingBackAt on purpose. Starting at full grip meant a
  // bot that caught the edge while the truck happened to be level climbed
  // straight back on the next frame, and the whole scene never happened.
  clingGrip:     0.62,    // starts here, drains to 0 and then they are gone
  clingDrain:    0.115,   // per sec, baseline
  clingTiltDrain: 0.9,    // per sec extra, scaled by how silly the angle is
  clingSlamDrain: 0.055,  // per unit of impact
  clingHonkCost: 0.34,    // per honk. This is the sacrifice mechanic.
  clingRecover:  0.16,    // per sec of calm, steady driving (~2s to get back up)
  clingBackAt:   0.92,    // grip at which they haul themselves back aboard
  clingCalmTilt: 22,      // deg — steadier than this counts as calm
  clingCalmAccel: 9,

  // Wheel suspension stiffness (Matter constraint)
  suspension: 0.92,
};

export const TERRAIN = {
  seed: 20260913,          // fixed seed → same mountain for everyone (daily seed later)
  length: 10400,           // px of road
  step: 44,                // heightmap sample spacing
  baseY: 520,
  climb: 0.075,            // average rise per px
  startPad: 420,           // flat run-up before the mountain starts
  roughness: 1.0,          // scales how much slope the rolling waves add (0 = billiard table)
  // THE VOID. One gap, past the summit.
  //
  // It sits after the top rather than across the road because a 270px
  // articulated truck cannot jump a gap of its own length: the cab goes over
  // the edge while the trailer is still anchored, so it tips in instead of
  // becoming a projectile. Measured range off every ramp profile tried was
  // under 70px. A mid-route void would therefore be either unwinnable or a
  // physics lie, so the void is a thing you must STOP before — which is also
  // what makes `near_void` land at the climax instead of mid-climb.
  gaps: [[9340, 1000]],

  // Potholes: [x, width, depth]. Kept narrower than the cab's own wheelbase so
  // the cab always spans them — a dip that jolts the load, never a hole the
  // truck can wedge itself into.
  potholes: [[3450, 66, 44], [6600, 72, 50]],

  // Crests: {at, lipRun, lipRise, dropRun, dropDepth}.
  //
  // These are what make the `air` and `air_long` bands reachable, and without
  // air the calm-during-chaos tier — the funniest one in the game — never
  // fires. They have to be built at TRUCK scale: the thing is 270px long and
  // articulated, so a short sharp bump just scrapes its belly and drops the
  // cab in. The whole vehicle has to be on the up-ramp when the ground ends,
  // which means a lip run longer than the truck and a drop that keeps falling
  // faster than the truck does.
  crests: [
    { at: 2500, lipRun: 300, lipRise: 92,  dropRun: 300, dropDepth: 250 },
    { at: 5400, lipRun: 360, lipRise: 118, dropRun: 430, dropDepth: 390 },  // the big one
    { at: 8300, lipRun: 300, lipRise: 88,  dropRun: 280, dropDepth: 230 },
  ],
  summitX: 8900,
};

export const DIALOGUE = {
  smoothFrames: 6,         // state vector smoothing window
  globalCooldown: 1.1,     // sec between ANY two lines
  speakerCooldown: 2.5,    // sec before the same bot speaks again
  bubbleDuration: 3.0,
  // "Air before the punchline": a line at or above this priority clears
  // existing bubbles and holds silence first. Silence sells it.
  airPriority: 4,
  airSilence: 0.5,
  dadReplyChance: 0.30,
  dadReplyDelay: 0.9,
  dadReplyMinPriority: 3,
  honkDesensitiseAt: 10,   // honks above this and one bot stops responding entirely
  arroganceRuns: 4,        // runs survived before Clank unlocks the arrogant pool
};

export const GAME = {
  panicGasRate:   0.04,    // per sec while flooring it
  panicTiltRate:  0.9,     // per sec at extreme tilt
  panicDecay:     0.12,    // per sec when calm
  dropPanic:      0.22,    // instant panic bump when a bot leaves
  clingPanic:     0.5,     // panic floor while anyone is dangling
  winCrew:        2,       // summit with at least this many aboard
  flipAngle:      95,      // deg — past here you are on your roof

  // Soft-lock guards. Without these the truck can stand on its tail at 87 deg,
  // or wedge somewhere, and the run never ends — no win, no loss, just a
  // rocking truck. Both of these are honest outcomes for the fiction.
  stuckTilt:      70,      // deg held for stuckTime = the run is over
  stuckTime:      2.6,
  noProgressTime: 22,      // sec without gaining ground = the hill won
  stallSpeed:     0.35,
  stallTime:      1.2,
  cameraLerp:     0.09,
};

export const ROBOTS = [
  { id: 'clank', name: 'Clank', face: '⊙_⊙', color: '#5ec8f2', role: 'Updates the death percentage live' },
  { id: 'beep',  name: 'Beep',  face: '•ᴥ•', color: '#f2d74e', role: 'File-corrupted courage' },
  { id: 'rusty', name: 'Rusty', face: '¬_¬', color: '#d98452', role: 'Old, oily, unimpressed' },
  { id: 'pip',   name: 'Pip',   face: 'ʘ⌄ʘ', color: '#9be36d', role: 'Too small for this hill' },
];

export const DRIVER = { id: 'driver', name: 'Dadbot', face: '◉‿◉', color: '#e86a6a' };
