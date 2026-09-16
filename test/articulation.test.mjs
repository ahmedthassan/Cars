// Does the truck still BEND?
//
// Every other truck test drives the builder through a stub and inspects the
// geometry it asks for. That catches a wrong number; it cannot catch a wrong
// model. The weld was a wrong model: every stubbed assertion passed while the
// cab and trailer were, in simulation, one rigid body — through a whole run
// their angles tracked each other to within a degree, and the resulting 270px
// plank levered itself off a 23-degree climb and landed on its back.
//
// So this suite runs real Matter. It is slower than the rest of the suite and
// it is worth it: it is the only place the physics is actually simulated.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createTruck } from '../src/physics/truck.js';
import { buildHeightmap, buildTerrainBodies, groundY } from '../src/physics/terrain.js';
import { PHYSICS, ROBOTS } from '../src/config.js';

// matter.min.js is a UMD bundle and the package is an ES module, so `this` is
// undefined under a plain import and the bundle's global fallback throws.
// Handing it a CommonJS module object is enough.
const src = readFileSync(new URL('../vendor/matter.min.js', import.meta.url), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', src)(mod, mod.exports);
const Matter = mod.exports;
const { Engine, Bodies, Composite, Body } = Matter;

const GROUND = 500;

/** A truck standing on flat ground, settled. */
function settled(steps = 200) {
  const engine = Engine.create();
  engine.gravity.y = PHYSICS.gravity;
  Composite.add(engine.world, Bodies.rectangle(2000, GROUND + 100, 8000, 200, {
    isStatic: true, friction: 1,
  }));
  const truck = createTruck(
    Matter, 600, GROUND - (PHYSICS.cab.h / 2 + PHYSICS.wheel.r * 1.35), ROBOTS,
  );
  Composite.add(engine.world, truck.composite);
  for (let i = 0; i < steps; i++) Engine.update(engine, 1000 / 60);
  return { engine, truck };
}

const deg = (rad) => (rad * 180) / Math.PI;

test('parked on the flat, the cargo bed is level', () => {
  const { truck } = settled();
  const bed = deg(truck.trailer.angle);
  // Not zero, and deliberately not chased to zero. The hitch's two legs are
  // mismatched on purpose, and the price of that is a few degrees of standing
  // nose-down. Every attempt to derive the tilt away cost the coupling that
  // keeps the cab's nose down and the truck started flipping instead.
  //
  // What matters is that the bed holds the crew while parked: cargo slides at
  // atan(friction), which is 32 degrees at the loosest grip any level uses.
  // The bound here is the tilt going somewhere it has never been.
  assert.ok(Math.abs(bed) < 5.0,
    `the trailer parks at ${bed.toFixed(1)}deg on level ground`);
  assert.ok(Math.abs(deg(truck.cab.angle)) < 2.0,
    `the cab parks at ${deg(truck.cab.angle).toFixed(1)}deg on level ground`);
});

test('nothing in the hitch is under load with the truck standing still', () => {
  // Model-independent, so it survives the hitch being rebuilt: whatever the
  // legs are, each one should be resting at its own length once the truck has
  // settled. A leg sitting stretched or compressed is a spring quietly pulling
  // the trailer out of true for the whole run, which is how a standing truck
  // ends up parked at an angle.
  const { truck } = settled();
  const legs = Composite.allConstraints(truck.composite).filter(
    (c) => (c.bodyA === truck.cab && c.bodyB === truck.trailer)
        || (c.bodyA === truck.trailer && c.bodyB === truck.cab),
  );
  assert.ok(legs.length >= 2, 'expected the trailer to be hitched by more than one leg');
  for (const c of legs) {
    const a = { x: c.bodyA.position.x + c.pointA.x, y: c.bodyA.position.y + c.pointA.y };
    const b2 = { x: c.bodyB.position.x + c.pointB.x, y: c.bodyB.position.y + c.pointB.y };
    const span = Math.hypot(a.x - b2.x, a.y - b2.y);
    assert.ok(Math.abs(span - c.length) < 4.5,
      `a hitch leg is sitting ${(span - c.length).toFixed(1)}px from its rest length `
      + `with the truck parked on the flat`);
  }
});

test('the truck bends where the ground bends', () => {
  // No made-up forces: just park the truck across a change in gradient and let
  // gravity do it. The cab climbs the ramp while the trailer is still on the
  // flat, so a hinged truck MUST show the two at different angles. A welded one
  // cannot — which is the whole point, and why this is measured in a real
  // engine rather than asserted against the numbers the builder was handed.
  const engine = Engine.create();
  engine.gravity.y = PHYSICS.gravity;

  // Flat, then a 25-degree climb.
  const hm = buildHeightmap({
    seed: 1, length: 2600, step: 44, baseY: GROUND, climb: 0, startPad: 300,
    roughness: 0, waves: [], ramps: [[900, 320, 25]], crests: [], potholes: [],
    gaps: [], summitX: 2600,
  });
  Composite.add(engine.world, buildTerrainBodies(Matter, hm));

  const x = 1150;                                    // cab up the ramp, trailer below
  const truck = createTruck(
    Matter, x, groundY(hm, x) - (PHYSICS.cab.h / 2 + PHYSICS.wheel.r * 1.35), ROBOTS,
  );
  Composite.add(engine.world, truck.composite);
  for (let i = 0; i < 260; i++) Engine.update(engine, 1000 / 60);

  const bend = Math.abs(deg(truck.cab.angle) - deg(truck.trailer.angle));
  assert.ok(bend > 5,
    `cab and trailer settled within ${bend.toFixed(1)}deg of each other with the cab `
    + `on a 25-degree ramp and the trailer on the flat. They are welded: two hitch `
    + `legs that each hold a different point of the trailer fix its angle as well as `
    + `its position, and a rigid 270px truck levers itself off the first real climb.`);
  assert.ok(bend < 45,
    `the trailer sat ${bend.toFixed(1)}deg out of line from a mere change in gradient`);
});

test('a hard landing does not spin the trailer', () => {
  // The pin leaves the trailer free to rotate about its nose, and cab and
  // trailer do not collide with each other, so without something restoring the
  // angle there is nothing to stop it going all the way round. It did: 331
  // degrees off one bump, a propeller where the cargo should be.
  const engine = Engine.create();
  engine.gravity.y = PHYSICS.gravity;
  Composite.add(engine.world, Bodies.rectangle(2000, GROUND + 100, 8000, 200, {
    isStatic: true, friction: 1,
  }));
  const truck = createTruck(Matter, 600, GROUND - 260, ROBOTS);   // dropped, not placed
  Composite.add(engine.world, truck.composite);

  let worst = 0;
  for (let i = 0; i < 260; i++) {
    Engine.update(engine, 1000 / 60);
    worst = Math.max(worst, Math.abs(deg(truck.trailer.angle)));
  }
  assert.ok(worst < 75,
    `the trailer reached ${worst.toFixed(0)}deg from level during a drop — it is `
    + `windmilling around the hitch`);
  assert.ok(Math.abs(deg(truck.trailer.angle)) < 6,
    `the trailer came to rest ${deg(truck.trailer.angle).toFixed(1)}deg out of level `
    + `after landing, rather than settling back flat`);
});
