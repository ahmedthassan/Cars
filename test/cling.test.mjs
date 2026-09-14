// Tests for the clinging grip model and, in particular, how a death gets its
// cause attributed.
//
// `updateCling` touches Matter through only a handful of calls, so it takes a
// stub and becomes testable in Node. That matters here: producing a clinger in
// a real browser means landing a 72% roll inside a narrow catch window, which
// made the browser check flaky and left the honk attribution unverified.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shakeClingers, updateCling } from '../src/physics/truck.js';
import { PHYSICS } from '../src/config.js';

const Matter = {
  Composite: { remove() {}, add() {} },
  Constraint: { create: () => ({}) },
  Body: { setPosition() {}, setVelocity() {} },
};

function mkTruck(grip = PHYSICS.clingGrip) {
  const bot = {
    botId: 'pip', clinging: true, lost: false, grip,
    clingArm: {}, position: { x: 0, y: 0 }, angle: 0,
  };
  return {
    clock: 0,
    bots: [bot],
    trailer: { position: { x: 0, y: 0 }, angle: 0, velocity: { x: 0, y: 0 } },
    bot,
  };
}

const calm = { tilt: 2, accel: 0, grounded: true };
const wild = { tilt: 55, accel: 30, grounded: true };
const DT = 1 / 60;

/** Run frames until the bot lets go or climbs back, or we give up. */
function run(truck, S, seconds) {
  const out = { lost: [], recovered: [] };
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const r = updateCling(Matter, null, truck, S, DT);
    out.lost.push(...r.lost);
    out.recovered.push(...r.recovered);
    if (r.lost.length || r.recovered.length) break;
  }
  return out;
}

test('steady driving pulls a clinger back aboard', () => {
  const truck = mkTruck();
  const { recovered, lost } = run(truck, calm, 20);
  assert.equal(lost.length, 0, 'they fell off while the truck was steady');
  assert.deepEqual(recovered, ['pip']);
});

test('a wild ride shakes a clinger loose, and that reads as lost grip', () => {
  const truck = mkTruck();
  const { lost, recovered } = run(truck, wild, 30);
  assert.equal(recovered.length, 0, 'they climbed back during a 55-degree scramble');
  assert.equal(lost.length, 1);
  assert.equal(lost[0].botId, 'pip');
  assert.equal(lost[0].cause, 'grip', 'an accident should not be blamed on the horn');
});

test('honking someone off is attributed to the honk, not to bad luck', () => {
  // This is the whole point of the sacrifice mechanic: the report has to say
  // the player did it on purpose.
  const truck = mkTruck();
  updateCling(Matter, null, truck, calm, DT);       // advance the clock a frame
  shakeClingers(truck, 1.0, true);                  // deliberate: enough to finish them
  const { lost } = run(truck, calm, 2);
  assert.equal(lost.length, 1);
  assert.equal(lost[0].cause, 'shaken', 'a deliberate honk was filed as an accident');
});

test('a hard landing is not blamed on the horn', () => {
  // Impacts call shakeClingers too, but without the deliberate flag — slamming
  // down on someone's fingers is bad luck, honking at them is a decision.
  const truck = mkTruck();
  updateCling(Matter, null, truck, calm, DT);
  shakeClingers(truck, 1.0, false);
  const { lost } = run(truck, calm, 2);
  assert.equal(lost.length, 1);
  assert.equal(lost[0].cause, 'grip', 'an impact was miscredited to the horn');
});

test('the honk attribution expires rather than haunting the whole run', () => {
  const truck = mkTruck(0.5);
  updateCling(Matter, null, truck, calm, DT);
  shakeClingers(truck, 0.05, true);                 // a nudge, survivable

  // Advance the clock directly rather than by simulating five seconds of
  // driving: under calm conditions they would climb back aboard long before
  // then, and what is under test is the expiry window, not the grip model.
  truck.clock += 5;
  shakeClingers(truck, 2.0, false);                 // something else finishes them
  const { lost } = run(truck, calm, 2);
  assert.equal(lost.length, 1);
  assert.equal(lost[0].cause, 'grip', 'a honk from five seconds ago took the blame');
});

test('grip starts below the climb-back threshold', () => {
  // Regression: starting at full grip meant a bot that caught the edge on level
  // ground climbed straight back on the next frame and the scene never
  // happened. The config must keep these ordered.
  assert.ok(PHYSICS.clingGrip < PHYSICS.clingBackAt,
    `clingGrip (${PHYSICS.clingGrip}) must be below clingBackAt (${PHYSICS.clingBackAt})`);
});
