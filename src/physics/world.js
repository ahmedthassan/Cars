// ── Matter world setup ────────────────────────────────────────────────────────
import { PHYSICS } from '../config.js';

export function createWorld(Matter) {
  const { Engine } = Matter;
  const engine = Engine.create({
    gravity: { x: 0, y: PHYSICS.gravity },
    // Extra position iterations: the truck is a constraint chain (cab, trailer,
    // three axles, a hitch) and it jitters visibly at the defaults.
    positionIterations: 10,
    velocityIterations: 8,
    constraintIterations: 4,
  });
  return { engine, world: engine.world };
}
