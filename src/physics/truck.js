// ── The truck ─────────────────────────────────────────────────────────────────
// Matter.js is passed in rather than imported so this module stays loadable in
// Node (the dialogue tests import the config chain, not a browser global).

import { PHYSICS, GAME } from '../config.js';

const GROUP = -1; // negative group: parts never collide with each other

/**
 * Cab + trailer + three wheels + one loose body per bot.
 *
 * The cab is a compound body with a heavy ballast part slung below it. That is
 * how the centre of mass gets lowered: it makes the tipping threshold a real
 * physical property rather than a number we clamp the angle against.
 */
export function createTruck(Matter, x, y, robots) {
  const { Bodies, Body, Composite, Constraint } = Matter;
  const P = PHYSICS;

  const cabBody = Bodies.rectangle(0, 0, P.cab.w, P.cab.h, { label: 'cab' });
  const ballast = Bodies.rectangle(P.cab.w * P.comForward, P.comDrop, P.cab.w * 0.55, 12, { label: 'ballast' });
  // Densities are set per part so the ballast genuinely carries `ballastShare`
  // of the mass. Matter derives a compound body's centre of mass from its
  // parts' mass distribution, so without this the ballast is decorative and
  // the truck tips over on the first ramp.
  const share = Math.min(0.9, Math.max(0, P.ballastShare));
  Body.setDensity(cabBody, (P.cabMass * (1 - share)) / (P.cab.w * P.cab.h));
  Body.setDensity(ballast, (P.cabMass * share) / (P.cab.w * 0.55 * 12));
  const cab = Body.create({
    parts: [cabBody, ballast],
    collisionFilter: { group: GROUP },
    friction: 0.4,
    label: 'cab',
  });
  Body.setPosition(cab, { x, y });

  const trailerX = x - P.cab.w / 2 - P.trailer.w / 2 - P.hitch.gap;
  // A flatbed with a headboard and a tailboard. A bare plank loses the whole
  // crew in the first ten seconds, which kills the joke before it starts —
  // a bot leaving should be an event, not a certainty.
  const bed = Bodies.rectangle(0, 0, P.trailer.w, P.trailer.h, { label: 'bed' });
  const lipL = Bodies.rectangle(-P.trailer.w / 2 + P.lip.w / 2, -P.lip.h, P.lip.w, P.lip.h * 2, { label: 'lip' });
  const lipR = Bodies.rectangle(P.trailer.w / 2 - P.lip.w / 2, -P.lip.h, P.lip.w, P.lip.h * 2, { label: 'lip' });
  const trailer = Body.create({
    parts: [bed, lipL, lipR],
    collisionFilter: { group: GROUP },
    friction: P.cargoFriction,
    label: 'trailer',
  });
  Body.setPosition(trailer, { x: trailerX, y: y + 6 });
  Body.setMass(trailer, P.trailerMass);

  const mkWheel = (wx, wy, driven) => {
    const w = Bodies.circle(wx, wy, P.wheel.r, {
      collisionFilter: { group: GROUP },
      friction: P.wheelFriction,
      frictionStatic: P.wheelStatic,
      frictionAir: P.rollingFriction,
      label: 'wheel',
    });
    Body.setMass(w, P.wheelMass);
    w.driven = driven;
    w.touching = false;
    return w;
  };

  const wheelY = y + P.cab.h / 2 + P.wheel.r * 0.35;
  // Dad insists it is a 4x4, so both cab wheels are driven.
  const front = mkWheel(x + P.cab.w * P.wheelbase, wheelY, true);
  const rear = mkWheel(x - P.cab.w * P.wheelbase, wheelY, true);
  const tail = mkWheel(trailerX - P.trailer.w * P.tailWheel, wheelY, false);
  const wheels = [front, rear, tail];

  const axle = (body, wheel, ox) => Constraint.create({
    bodyA: body,
    pointA: { x: ox, y: P.cab.h / 2 + P.wheel.r * 0.35 - (body === trailer ? P.trailer.h / 2 : 0) },
    bodyB: wheel,
    stiffness: P.suspension,
    length: 0,
    render: { visible: false },
  });

  const constraints = [
    axle(cab, front, P.cab.w * P.wheelbase),
    axle(cab, rear, -P.cab.w * P.wheelbase),
    axle(trailer, tail, -P.trailer.w * P.tailWheel),
    // The hitch. Two constraints instead of one so the trailer cannot spin
    // freely around a single pivot — it has to follow, and it can jackknife.
    Constraint.create({
      bodyA: cab, pointA: { x: -P.cab.w / 2, y: 8 },
      bodyB: trailer, pointB: { x: P.trailer.w / 2, y: 0 },
      stiffness: 0.95, length: P.hitch.gap, render: { visible: false },
    }),
    Constraint.create({
      bodyA: cab, pointA: { x: -P.cab.w / 2, y: -6 },
      bodyB: trailer, pointB: { x: P.trailer.w / 2, y: -10 },
      stiffness: 0.5, length: P.hitch.gap + 4, render: { visible: false },
    }),
  ];

  // Bots ride loose on the trailer. Nothing holds them on but friction, which
  // is the entire premise of the game.
  const bots = robots.map((r, i) => {
    const bx = trailerX - P.trailer.w / 2 + 30 + i * (P.trailer.w - 54) / Math.max(1, robots.length - 1);
    const b = Bodies.rectangle(bx, y - 26, 24, 32, {
      friction: P.cargoFriction,
      frictionAir: 0.006,
      label: 'bot',
      chamfer: { radius: 4 },
    });
    Body.setMass(b, P.botMass);
    b.botId = r.id;
    b.robot = r;
    b.aboard = true;
    b.lost = false;
    return b;
  });

  const composite = Composite.create({ label: 'truck' });
  Composite.add(composite, [cab, trailer, ...wheels, ...constraints, ...bots]);

  return { cab, trailer, wheels, front, rear, tail, bots, constraints, composite };
}

/**
 * Driven wheels currently touching the ground. Real contact data, not a y guess.
 *
 * Only the CAB's wheels count, deliberately. The rig is 270px long with a
 * trailing wheel at the back, so on any crest the tail wheel is still on the
 * ramp while the cab is already out over the drop — counting it would mean the
 * truck is never airborne anywhere on the map, and `air` / `air_long` could
 * never fire. It is also the right reading on its own terms: traction comes
 * from the driven wheels, and it is the truck that jumps.
 */
export function groundedWheels(truck) {
  return truck.wheels.filter((w) => w.driven && w.touching).length;
}

/**
 * Slip across the driven wheels, 0 (grip) .. 1 (spinning uselessly).
 * This one number feeds the `slip` band, the tyre-hiss audio and the panic
 * meter, so it is computed once here and read everywhere else.
 */
export function wheelSlip(truck) {
  const driven = truck.wheels.filter((w) => w.driven);
  let worst = 0;
  for (const w of driven) {
    if (!w.touching) continue;
    const surface = w.angularVelocity * PHYSICS.wheel.r;
    const ground = w.velocity.x;
    worst = Math.max(worst, Math.abs(surface - ground));
  }
  return Math.min(1, worst / PHYSICS.slipReference);
}

/**
 * Drive. Torque is scaled down as slip rises, so flooring it on a steep or icy
 * section spins the wheels instead of climbing — the failure the `slip` and
 * `stall` bands are written about.
 */
export function applyDrive(Matter, truck, input) {
  const P = PHYSICS;
  const grounded = groundedWheels(truck) > 0;
  const slip = wheelSlip(truck);
  let traction = grounded ? 1 - (1 - P.tractionFloor) * slip : P.airTorqueScale;

  // Back the power off as the nose comes up, so the truck cannot drive itself
  // onto its tail and balance there against the trailer.
  const tilt = tiltDegrees(truck);
  if (tilt > P.wheelieFrom) {
    const t = Math.min(1, (tilt - P.wheelieFrom) / (P.wheelieTo - P.wheelieFrom));
    traction *= 1 - (1 - P.wheelieFloor) * t;
  }

  for (const w of truck.wheels) {
    if (!w.driven) continue;
    if (input.gas && w.angularVelocity < P.maxWheelSpeed) {
      w.torque += P.driveTorque * traction;
    }
    if (input.brake) {
      // Brake is also reverse: hold it at a standstill and you roll back down.
      if (w.angularVelocity > -P.maxWheelSpeed * 0.6) w.torque -= P.brakeTorque * traction;
    }
  }
}

/**
 * While the driven wheels are off the ground, nudge the pitch back toward
 * level. Without it the nose-heavy cab arrives face-first off every crest and
 * `air_long` — the calm-during-chaos tier — is unreachable.
 */
export function stabiliseInAir(Matter, truck) {
  const P = PHYSICS;
  if (groundedWheels(truck) > 0) return;
  const tilt = tiltDegrees(truck);
  if (Math.abs(tilt) < P.airStabiliseFrom) return;
  const dir = tilt > 0 ? 1 : -1;   // tilt is nose-up positive; angle is inverted
  truck.cab.torque += dir * P.airStabilise * truck.cab.mass
    * Math.min(1, (Math.abs(tilt) - P.airStabiliseFrom) / 40);
}

/** The horn. Applies a small upward nudge to every bot, which is not helpful. */
export function honk(Matter, truck) {
  const { Body } = Matter;
  for (const b of truck.bots) {
    if (b.lost) continue;
    Body.applyForce(b, b.position, { x: 0, y: PHYSICS.honkForce * b.mass });
  }
}

// ── Clinging ─────────────────────────────────────────────────────────────────
// A bot that comes off the trailer gets one chance to catch the edge and hang
// there by an arm. Everything below exists so that "a bot fell off" becomes a
// situation the player has to make a decision about.

/** Where on the trailer this bot would grab, in the trailer's local frame. */
function grabPoint(truck, bot) {
  const t = truck.trailer;
  const dx = bot.position.x - t.position.x;
  const dy = bot.position.y - t.position.y;
  const a = -t.angle;
  const localX = dx * Math.cos(a) - dy * Math.sin(a);
  const end = localX >= 0 ? 1 : -1;          // whichever end they were nearest
  return { x: end * (PHYSICS.trailer.w / 2 - 3), y: -PHYSICS.lip.h };
}

/**
 * Grab the edge. The constraint is deliberately soft and slightly longer than
 * the arm, so the bot swings and drags rather than hanging rigidly off a peg.
 */
export function startCling(Matter, world, truck, bot) {
  const { Constraint, Composite } = Matter;
  bot.clinging = true;
  bot.grip = PHYSICS.clingGrip;
  bot.grabbedAt = grabPoint(truck, bot);
  bot.clingArm = Constraint.create({
    bodyA: truck.trailer,
    pointA: bot.grabbedAt,
    bodyB: bot,
    pointB: { x: 0, y: -12 },                // their shoulder, not their middle
    length: PHYSICS.clingArm,
    stiffness: 0.55,
    damping: 0.12,
    render: { visible: false },
  });
  Composite.add(world, bot.clingArm);
}

function releaseCling(Matter, world, bot) {
  if (bot.clingArm) Matter.Composite.remove(world, bot.clingArm);
  bot.clingArm = null;
  bot.clinging = false;
}

/** Shake every clinger. This is the sacrifice mechanic, and it is not subtle. */
export function shakeClingers(truck, cost, deliberate = false) {
  const shaken = [];
  for (const b of truck.bots) {
    if (!b.clinging || b.lost) continue;
    b.grip -= cost;
    // Remember a deliberate shake so the Incident Report can name the honk as
    // the cause rather than filing it under "lost their grip". Landing hard on
    // someone's fingers is bad luck; honking at them is a decision.
    if (deliberate) b.shakenAt = truck.clock ?? 0;
    shaken.push(b.botId);
  }
  return shaken;
}

/**
 * Drain and recover grip. Returns what happened this frame so the caller can
 * fire dialogue: bots who lost their hold, and bots who climbed back aboard.
 *
 * Grip drains faster the sillier the angle gets, and recovers only while the
 * truck is genuinely steady — which is what makes stopping to save someone an
 * actual decision rather than a free action.
 */
export function updateCling(Matter, world, truck, S, dt) {
  const P = PHYSICS;
  const lost = [];
  const recovered = [];
  truck.clock = (truck.clock ?? 0) + dt;

  for (const b of truck.bots) {
    if (!b.clinging || b.lost) continue;

    const tiltLoad = Math.min(1, Math.max(0, (Math.abs(S.tilt) - 14) / 46));
    const calm = Math.abs(S.tilt) < P.clingCalmTilt
      && Math.abs(S.accel) < P.clingCalmAccel
      && S.grounded;

    b.grip += calm
      ? P.clingRecover * dt
      : -(P.clingDrain + P.clingTiltDrain * tiltLoad) * dt;
    b.grip = Math.min(1, b.grip);

    if (b.grip <= 0) {
      releaseCling(Matter, world, b);
      // A honk inside the last couple of seconds is why they are falling.
      const honked = b.shakenAt !== undefined && truck.clock - b.shakenAt < 2.0;
      lost.push({ botId: b.botId, cause: honked ? 'shaken' : 'grip' });
    } else if (b.grip >= P.clingBackAt) {
      // Hauled themselves back on. Put them on the bed rather than leaving them
      // hanging at full grip forever.
      releaseCling(Matter, world, b);
      const t = truck.trailer;
      Matter.Body.setPosition(b, {
        x: t.position.x - Math.sin(t.angle) * 30,
        y: t.position.y - Math.cos(t.angle) * 30,
      });
      Matter.Body.setVelocity(b, t.velocity);
      recovered.push(b.botId);
    }
  }
  return { lost, recovered };
}

export function clingers(truck) {
  return truck.bots.filter((b) => b.clinging && !b.lost);
}

/** Signed tilt in degrees. Positive = nose up. */
export function tiltDegrees(truck) {
  return (-truck.cab.angle * 180) / Math.PI;
}

/** Speed along the truck's own forward axis, so reversing reads negative. */
export function forwardSpeed(truck) {
  const a = truck.cab.angle;
  const fx = Math.cos(a), fy = Math.sin(a);
  const v = truck.cab.velocity;
  return v.x * fx + v.y * fy;
}

/** Has the truck ended up on its roof? */
export function isFlipped(truck) {
  return Math.abs(tiltDegrees(truck)) > GAME.flipAngle;
}

/**
 * Wire up real wheel-contact tracking. airTime depends on this being honest.
 *
 * This is deliberately stateless per frame: the flag is cleared before each
 * step and re-set by the collision events for that step. An earlier version
 * kept a running +1/-1 contact count, which drifts upward the moment a single
 * collisionEnd is missed — and the terrain is hundreds of separate segment
 * bodies, so misses happen. Once it has drifted the wheels never read as
 * airborne again, airTime stays pinned at zero, and the `air` and `air_long`
 * bands become permanently unreachable.
 */
export function trackContacts(Matter, engine, truck) {
  const { Events } = Matter;
  const wheels = new Set(truck.wheels);
  Events.on(engine, 'beforeUpdate', () => {
    for (const w of truck.wheels) w.touching = false;
  });
  const mark = (pairs) => {
    for (const p of pairs) {
      if (wheels.has(p.bodyA) && p.bodyB.label === 'ground') p.bodyA.touching = true;
      if (wheels.has(p.bodyB) && p.bodyA.label === 'ground') p.bodyB.touching = true;
    }
  };
  Events.on(engine, 'collisionStart', (e) => mark(e.pairs));
  Events.on(engine, 'collisionActive', (e) => mark(e.pairs));
}
