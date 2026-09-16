// Does the ground you can SEE match the ground you can HIT?
//
// This is the test category that was missing. Every earlier suite measured game
// state — does it climb, does it summit, does a line fire — and none compared
// collision geometry against rendered geometry. A sign error in
// buildTerrainBodies displaced the collision surface sideways by up to 51px on
// a 40-degree slope, exactly zero on the flat, and nothing caught it. The truck
// floated above the visible ground in patches for an entire release.
//
// It drives the real buildTerrainBodies through a Matter stub that records the
// geometry it asks for, rather than reimplementing the placement here — a test
// that recomputes the thing it is checking would have agreed with the bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildHeightmap, buildTerrainBodies, groundY, isOverGap } from '../src/physics/terrain.js';

/** Records whatever geometry the terrain builder asks Matter to create. */
function captureMatter() {
  const made = [];
  return {
    made,
    Bodies: {
      rectangle(x, y, w, h, opts = {}) {
        const b = { kind: 'rect', x, y, w, h, angle: opts.angle || 0 };
        made.push(b);
        return b;
      },
      fromVertices(x, y, vertexSets, opts = {}) {
        const b = { kind: 'verts', x, y, vertices: vertexSets[0], angle: opts.angle || 0 };
        made.push(b);
        return b;
      },
    },
  };
}

/** The body's outline in world space, whichever primitive was used to build it. */
function polygonOf(body) {
  if (body.kind === 'verts') return body.vertices;
  const { x, y, w, h, angle } = body;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [
    [-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2],
  ].map(([lx, ly]) => ({ x: x + lx * c - ly * s, y: y + lx * s + ly * c }));
}

/**
 * The top of the collision surface at a given world x — i.e. the y a wheel
 * would actually rest on. Takes the highest (smallest y) point across every
 * body that spans x.
 */
function collisionTopAt(bodies, x) {
  let top = Infinity;
  for (const body of bodies) {
    const poly = polygonOf(body);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      if ((p.x <= x && q.x >= x) || (q.x <= x && p.x >= x)) {
        if (p.x === q.x) { top = Math.min(top, p.y, q.y); continue; }
        const t = (x - p.x) / (q.x - p.x);
        top = Math.min(top, p.y + (q.y - p.y) * t);
      }
    }
  }
  return top === Infinity ? null : top;
}

test('the collision surface sits exactly under the ground that is drawn', () => {
  const hm = buildHeightmap();
  const M = captureMatter();
  buildTerrainBodies(M, hm);
  assert.ok(M.made.length > 50, `expected a body per segment, got ${M.made.length}`);

  const worst = { x: 0, err: 0, slope: 0 };
  let checked = 0;

  // Sample densely across the whole map, not just where it is flat. The bug was
  // invisible on level ground and grew with the slope.
  for (let x = 10; x < hm.cfg.length - 10; x += 7) {
    if (isOverGap(hm, x)) continue;
    const drawn = groundY(hm, x);
    if (drawn === null) continue;
    const hit = collisionTopAt(M.made, x);
    assert.ok(hit !== null, `no collision surface at all at x=${x}`);

    const err = Math.abs(hit - drawn);
    checked++;
    if (err > worst.err) {
      worst.x = x;
      worst.err = err;
      // Report the slope too — that is the axis the failure scales along.
      const ahead = groundY(hm, Math.min(hm.cfg.length - 1, x + hm.cfg.step));
      const behind = groundY(hm, Math.max(0, x - hm.cfg.step));
      worst.slope = ahead !== null && behind !== null
        ? (Math.atan2(behind - ahead, hm.cfg.step * 2) * 180) / Math.PI : 0;
    }
  }

  assert.ok(checked > 500, `only sampled ${checked} points`);
  assert.ok(
    worst.err <= 0.5,
    `collision surface is ${worst.err.toFixed(1)}px from the drawn ground at x=${worst.x} `
    + `(slope ${worst.slope.toFixed(0)}deg). The wheels rest on the collision surface, so this `
    + `is exactly how far the truck floats above — or sinks into — the visible terrain.`,
  );
});

test('a void gap is genuinely empty of collision bodies', () => {
  const hm = buildHeightmap();
  const M = captureMatter();
  buildTerrainBodies(M, hm);

  for (const [gx, gw] of hm.cfg.gaps) {
    // Well inside the gap, where there must be nothing to drive on.
    const mid = gx + gw / 2;
    assert.equal(collisionTopAt(M.made, mid), null,
      `there is something solid in the middle of the void at x=${mid}`);
  }
});

test('the ground is continuous everywhere it is not a gap', () => {
  // A missing body reads as an invisible hole that swallows the truck.
  const hm = buildHeightmap();
  const M = captureMatter();
  buildTerrainBodies(M, hm);

  for (let x = 20; x < hm.cfg.summitX; x += 11) {
    if (isOverGap(hm, x)) continue;
    assert.ok(collisionTopAt(M.made, x) !== null, `hole in the ground at x=${x}`);
  }
});
