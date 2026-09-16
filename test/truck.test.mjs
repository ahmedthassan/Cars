// The truck's REST POSE.
//
// Twice now a sign error in this file's geometry has shipped: once placing the
// terrain collision bodies, once placing the hitch. The second left the truck
// permanently jackknifed — cab +21 degrees, trailer -22, the cargo bed at a
// 22-degree slope while parked on level ground — so the crew slid off the back
// before the player touched a control. High cargo friction and a trailer lip
// had been hiding it for weeks.
//
// Arithmetic review clearly is not enough, so the invariant gets a test. It
// drives the real createTruck through a Matter stub and checks the geometry it
// asks for, rather than re-deriving the same numbers and agreeing with itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTruck } from '../src/physics/truck.js';
import { PHYSICS, ROBOTS } from '../src/config.js';
import { LEVELS } from '../src/levels/index.js';

/** Enough of Matter to capture what createTruck builds. */
function stubMatter() {
  const bodies = [];
  const constraints = [];
  const mk = (label, x, y, extra = {}) => {
    const b = { label, position: { x, y }, angle: 0, ...extra };
    bodies.push(b);
    return b;
  };
  return {
    bodies,
    constraints,
    Bodies: {
      rectangle: (x, y, w, h, o = {}) => mk(o.label || 'rect', x, y, { w, h, opts: o }),
      circle: (x, y, r, o = {}) => mk(o.label || 'circle', x, y, { r, opts: o }),
    },
    Body: {
      create: (o) => {
        // A compound body's position is set separately; parts carry the shape.
        const b = { label: o.label || 'compound', parts: o.parts, position: { x: 0, y: 0 }, angle: 0 };
        bodies.push(b);
        return b;
      },
      setPosition: (b, p) => { b.position = { ...p }; },
      setMass: () => {},
      setDensity: () => {},
    },
    Composite: { create: () => ({ label: 'c' }), add: () => {} },
    Constraint: {
      create: (o) => { constraints.push(o); return o; },
    },
  };
}

const GROUND = 500;
/** Where the cab centre must sit for its wheels to rest on the ground. */
const cabRestY = GROUND - (PHYSICS.cab.h / 2 + PHYSICS.wheel.r * 1.35);

test('the cab and trailer rest at heights that put every wheel on the ground', () => {
  const M = stubMatter();
  const truck = createTruck(M, 200, cabRestY, ROBOTS);

  for (const w of truck.wheels) {
    const bottom = w.position.y + PHYSICS.wheel.r;
    assert.ok(Math.abs(bottom - GROUND) < 0.51,
      `a wheel spawns ${(bottom - GROUND).toFixed(1)}px off the ground`);
  }
  // The trailer's bed must start above its own wheel, not below it.
  assert.ok(truck.trailer.position.y < GROUND - PHYSICS.wheel.r,
    'the trailer spawns at or below axle height');
});

test('the two hitch legs are not a matching pair, which would weld the trailer on', () => {
  // The cheap build-time half of the articulation check in test/articulation.test.mjs.
  //
  // Two constraints between the same pair of bodies hold that pair's relative
  // ANGLE, not just its position, whenever they are parallel: matching vertical
  // spreads on both bodies and matching lengths. That welds the cab and trailer
  // into one rigid 270px plank — and a plank that long, driven from wheels under
  // one end, levers itself off a 23-degree climb. Measured, when this was
  // briefly the design: airborne mid-ramp at x=2013, pitched to 68 degrees
  // nose-up, whole crew thrown, landed on its back.
  //
  // The shipped legs are mismatched on purpose: 14px apart on the cab, 10px on
  // the trailer, and different lengths. That holds the trailer's position
  // firmly while only loosely preferring an angle.
  const M = stubMatter();
  const truck = createTruck(M, 200, cabRestY, ROBOTS);

  const legs = M.constraints.filter(
    (c) => c.bodyA === truck.cab && c.bodyB === truck.trailer,
  );
  assert.equal(legs.length, 2, 'expected exactly two hitch legs');

  const cabSpread = Math.abs(legs[0].pointA.y - legs[1].pointA.y);
  const trailerSpread = Math.abs(legs[0].pointB.y - legs[1].pointB.y);
  const sameLength = Math.abs(legs[0].length - legs[1].length) < 0.01;
  assert.ok(
    !(Math.abs(cabSpread - trailerSpread) < 0.01 && sameLength),
    `both hitch legs span ${cabSpread}px on each body at the same length, so together `
    + `they fix the trailer's angle as well as its position. That is a weld, not a `
    + `hitch, and a rigid truck this long flips itself on the first real climb.`,
  );
  for (const h of legs) {
    assert.ok(truck.cab.position.x + h.pointA.x > truck.trailer.position.x + h.pointB.x,
      'the trailer should hitch BEHIND the cab');
  }
});

test('the cargo starts on the bed rather than above it', () => {
  // Bots dropped onto the bed bounce, and with restitution that is enough to
  // eject one before the run begins.
  const M = stubMatter();
  const truck = createTruck(M, 200, cabRestY, ROBOTS);
  const bedTop = truck.trailer.position.y - PHYSICS.trailer.h / 2;

  for (const b of truck.bots) {
    const feet = b.position.y + 16;              // half the bot's height
    assert.ok(Math.abs(feet - bedTop) < 1.5,
      `${b.botId} spawns ${(bedTop - feet).toFixed(1)}px off the bed`);
    // And within the bed, not hanging off an end.
    const dx = Math.abs(b.position.x - truck.trailer.position.x);
    assert.ok(dx < PHYSICS.trailer.w / 2,
      `${b.botId} spawns past the end of the trailer`);
  }
});

test('cargo grip descends across the levels and never becomes safe', () => {
  // The design brief: bots coming off IS the game, and the near-miss is what
  // makes people replay it. Grip is part of the difficulty curve, so the check
  // belongs on the curve rather than on one global number.
  const grips = LEVELS.map((l) => ({
    name: l.name,
    f: l.physics?.cargoFriction ?? PHYSICS.cargoFriction,
  }));

  for (let i = 1; i < grips.length; i++) {
    assert.ok(grips[i].f < grips[i - 1].f,
      `${grips[i].name} grips harder than ${grips[i - 1].name} `
      + `(${grips[i].f} vs ${grips[i - 1].f}) — the curve goes the wrong way`);
  }

  for (const g of grips) {
    const slidesAt = (Math.atan(g.f) * 180) / Math.PI;
    // Above ~45 degrees the bed holds through anything the terrain does and
    // the crew stops being a liability, which is the whole game.
    assert.ok(slidesAt < 45,
      `${g.name} holds cargo to ${slidesAt.toFixed(0)}deg — the truck is a safe place to sit`);
    // Below ~20 degrees, merely ACCELERATING walks them off the back before the
    // player meets a hill. Measured: at 0.30 the rearmost bot was gone in 2.2s.
    assert.ok(slidesAt > 20,
      `${g.name} loses cargo at ${slidesAt.toFixed(0)}deg — that is a free loss, not difficulty`);
  }
});
