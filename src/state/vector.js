// ── The state vector ──────────────────────────────────────────────────────────
// Sampled every frame, smoothed over ~6 frames to kill jitter. This object is
// the ONLY thing the dialogue engine ever sees — it is a plain data snapshot
// with no Matter or DOM references, which is what makes the comedy logic
// testable headlessly.

import { DIALOGUE, GAME, PHYSICS, TERRAIN } from '../config.js';
import { clingers, forwardSpeed, groundedWheels, tiltDegrees, wheelSlip } from '../physics/truck.js';
import { altitudeAt, gradientAt, voidDistance } from '../physics/terrain.js';

const TRUCK_LENGTH = PHYSICS.cab.w + PHYSICS.trailer.w + PHYSICS.hitch.gap;

class Smoother {
  constructor(n) { this.n = n; this.buf = []; }
  push(v) {
    this.buf.push(v);
    if (this.buf.length > this.n) this.buf.shift();
    let s = 0;
    for (const x of this.buf) s += x;
    return s / this.buf.length;
  }
}

export function createSampler() {
  const n = DIALOGUE.smoothFrames;
  return {
    tilt: new Smoother(n),
    speed: new Smoother(n),
    slip: new Smoother(n),
    gradient: new Smoother(n),
    prevTilt: 0,
    prevSpeed: 0,
    airTime: 0,
    gasHeld: 0,
    panic: 0,
    sinceLine: 99,
    sinceEvent: 99,
    lastEvent: null,
    landingPending: false,
    peakAirTime: 0,
  };
}

/** Mark a discrete event so lines can react to it on the next frame. */
export function markEvent(sampler, name) {
  sampler.lastEvent = name;
  sampler.sinceEvent = 0;
}

export function sample(sampler, { truck, heightmap, input, crew, dt }) {
  const tilt = sampler.tilt.push(tiltDegrees(truck));
  const speed = sampler.speed.push(forwardSpeed(truck));
  const slip = sampler.slip.push(wheelSlip(truck));
  const x = truck.cab.position.x;
  const gradient = sampler.gradient.push(gradientAt(heightmap, x));

  const grounded = groundedWheels(truck) > 0;
  if (grounded) {
    // Landing: remember how long the flight was so the landing band can fire
    // and the callback can answer whatever was said mid-air.
    if (sampler.airTime > 0.35) {
      sampler.landingPending = true;
      sampler.peakAirTime = sampler.airTime;
      markEvent(sampler, 'land');
    }
    sampler.airTime = 0;
  } else {
    sampler.airTime += dt;
  }

  sampler.gasHeld = input.gas ? sampler.gasHeld + dt : 0;
  const stalled = sampler.gasHeld > GAME.stallTime && Math.abs(speed) < GAME.stallSpeed;
  const rollback = input.gas && speed < -0.5;

  // Someone dangling off the side keeps the panic meter pinned high no matter
  // how smoothly you are driving. It should.
  const hanging = clingers(truck);

  // Panic climbs when you floor it and when the angle gets silly, decays when
  // nothing is happening.
  const tiltLoad = Math.min(1, Math.max(0, (Math.abs(tilt) - 25) / 35));
  let panic = sampler.panic
    + (input.gas ? GAME.panicGasRate : 0) * dt
    + GAME.panicTiltRate * tiltLoad * dt
    + (slip > 0.55 ? 0.25 * dt : 0)
    - GAME.panicDecay * dt;
  sampler.panic = Math.min(1, Math.max(0, panic));
  if (hanging.length) sampler.panic = Math.max(sampler.panic, GAME.clingPanic);

  sampler.sinceLine += dt;
  sampler.sinceEvent += dt;

  const tiltRate = (tilt - sampler.prevTilt) / Math.max(dt, 1e-4);
  const accel = (speed - sampler.prevSpeed) / Math.max(dt, 1e-4);
  sampler.prevTilt = tilt;
  sampler.prevSpeed = speed;

  const vd = voidDistance(heightmap, x);

  return {
    tilt,
    tiltRate,
    speed,
    accel,
    airTime: sampler.airTime,
    wheelSlip: slip,
    gradient,
    rollback,
    stalled,
    altitude: altitudeAt(heightmap, x),
    voidDist: vd,
    voidLengths: vd / TRUCK_LENGTH,
    crew,
    clinging: hanging.length,
    // Worst grip on the truck, 1 = solid, 0 = gone. Drives the cling band's
    // escalation so the lines get worse as the hand slips.
    clingGrip: hanging.length ? Math.min(...hanging.map((b) => b.grip)) : 1,
    clingingIds: hanging.map((b) => b.botId),
    panic: sampler.panic,
    lastEvent: sampler.lastEvent,
    sinceLine: sampler.sinceLine,
    sinceEvent: sampler.sinceEvent,
    // Derived extras the bands need but the spec table left implicit.
    grounded,
    gas: !!input.gas,
    landing: sampler.landingPending,
    landingAirTime: sampler.peakAirTime,
    x,
    summitX: TERRAIN.summitX,
  };
}

/** Call once a landing line has had its chance, so the band does not latch. */
export function clearLanding(sampler) {
  sampler.landingPending = false;
  sampler.peakAirTime = 0;
}

export function noteLine(sampler) { sampler.sinceLine = 0; }
export const truckLength = TRUCK_LENGTH;
