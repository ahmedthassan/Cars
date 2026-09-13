// ── Terrain ───────────────────────────────────────────────────────────────────
// A seeded heightmap. Seeded so the same mountain is reproducible for everyone,
// which makes a daily-seed mode free later on.
//
// The heightmap math is deliberately free of any Matter.js reference so the
// gradient / void queries the state vector depends on can be tested headlessly.

import { TERRAIN } from '../config.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildHeightmap(cfg = TERRAIN) {
  const rnd = mulberry32(cfg.seed);
  const count = Math.floor(cfg.length / cfg.step) + 1;

  // Wave amplitudes are DERIVED from the slope each wave is allowed to add,
  // not hand-picked. Picking amplitudes directly is how you accidentally get a
  // 30-degree descent at the start line: amp*2*PI/len is the slope, and at
  // short wavelengths a small amplitude is already a cliff.
  const wave = (lenPx, maxSlopeDeg) => ({
    len: lenPx,
    amp: (Math.tan((maxSlopeDeg * Math.PI) / 180) * lenPx) / (Math.PI * 2),
    phase: rnd() * Math.PI * 2,
  });
  const r = cfg.roughness ?? 1;
  const waves = [wave(1100, 10 * r), wave(480, 6 * r), wave(190, 3 * r)];

  // The ramps are where the tilt bands live. A smoothstep ramp's peak slope is
  // 1.5x its average, so peakDeg below is what the truck actually reads.
  const ramp = (at, w, peakDeg) => ({
    at, w, rise: (Math.tan((peakDeg * Math.PI) / 180) * w) / 1.5,
  });
  const ramps = [
    ramp(1750, 440, 26),   // first real climb → tilt_30, "first real worry"
    ramp(4300, 380, 40),   // the mean one     → tilt_45, "measured terror"
    ramp(7400, 340, 38),   // the wall         → tilt_45, and it is passable
  ];
  // Note: no ramp is built past 58 degrees. tilt_60 is the "goodbye" band, a
  // failure state — a mandatory 60-degree climb would make the map unwinnable.
  // You reach tilt_60 by cresting the wall badly or landing wrong, not by design.

  const points = [];
  for (let i = 0; i < count; i++) {
    const x = i * cfg.step;
    let y = cfg.baseY - cfg.climb * x;
    for (const w of waves) y -= w.amp * Math.sin((x / w.len) * Math.PI * 2 + w.phase);
    for (const r of ramps) {
      // smoothstep the ramp in so there is no vertical cliff
      const t = Math.min(1, Math.max(0, (x - r.at) / r.w));
      y -= r.rise * (t * t * (3 - 2 * t));
    }
    points.push({ x, y });
  }
  // Flat start pad: the player should not be fighting a slope on frame one.
  const startY = points[Math.round(cfg.startPad / cfg.step)].y;
  for (const p of points) {
    if (p.x <= cfg.startPad) p.y = startY;
  }

  // Crests: a sharp lip, then the ground drops away. This is what generates
  // genuine air — you leave the lip going up and the landing is not where the
  // truck expects it.
  for (const c of cfg.crests ?? []) {
    const { at, lipRun, lipRise, dropRun, dropDepth } = c;
    for (const p of points) {
      if (p.x > at - lipRun && p.x <= at) {
        // The up-ramp. Longer than the truck, so the whole thing is climbing
        // when the ground runs out.
        const t = (p.x - (at - lipRun)) / lipRun;
        p.y -= lipRise * (t * t * (3 - 2 * t));
      } else if (p.x > at && p.x <= at + dropRun) {
        // Then the ground leaves. Convex at the lip so there is nothing to
        // scrape along on the way over.
        const t = (p.x - at) / dropRun;
        p.y -= lipRise - (lipRise + dropDepth) * Math.sqrt(t);
      } else if (p.x > at + dropRun) {
        p.y += dropDepth;
      }
    }
  }

  // Potholes: a smooth dip, narrow enough that the cab spans it. The load does
  // not span it, which is the point.
  for (const [px, pw, pd] of cfg.potholes ?? []) {
    for (const p of points) {
      const d = Math.abs(p.x - px);
      if (d > pw) continue;
      p.y += pd * Math.cos(((d / pw) * Math.PI) / 2) ** 2;
    }
  }

  // A flat shelf before the void, so the drop past the summit is something you
  // can see coming and stop on.
  for (const [gx] of cfg.gaps) {
    const shelfStart = gx - 300;
    const flatY = sampleRaw(points, shelfStart, cfg);
    for (const p of points) {
      if (p.x >= shelfStart && p.x <= gx) p.y = flatY;
    }
  }
  return { points, cfg };
}

function sampleRaw(points, x, cfg) {
  const i = Math.max(0, Math.min(points.length - 1, Math.round(x / cfg.step)));
  return points[i].y;
}

/** Ground y at x, linearly interpolated. Returns null over a void gap. */
export function groundY(hm, x) {
  if (isOverGap(hm, x)) return null;
  const { points, cfg } = hm;
  if (x <= 0) return points[0].y;
  if (x >= cfg.length) return points[points.length - 1].y;
  const i = Math.floor(x / cfg.step);
  const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
  const t = (x - a.x) / cfg.step;
  return a.y + (b.y - a.y) * t;
}

/** Slope under x, in degrees. Positive = uphill in the direction of travel. */
export function gradientAt(hm, x) {
  const { cfg } = hm;
  const d = cfg.step;
  const a = groundY(hm, Math.max(0, x - d));
  const b = groundY(hm, Math.min(cfg.length, x + d));
  if (a === null || b === null) return 0;
  // Screen y grows downward, so a falling y means rising ground.
  return (Math.atan2(a - b, d * 2) * 180) / Math.PI;
}

export function isOverGap(hm, x) {
  for (const [gx, gw] of hm.cfg.gaps) if (x > gx && x < gx + gw) return true;
  return false;
}

/** Distance in px from x to the nearest void edge. 0 when over the void. */
export function voidDistance(hm, x) {
  let best = Infinity;
  for (const [gx, gw] of hm.cfg.gaps) {
    if (x >= gx && x <= gx + gw) return 0;
    best = Math.min(best, Math.abs(x - gx), Math.abs(x - (gx + gw)));
  }
  return best;
}

/** 0..1 progress up the mountain. */
export function altitudeAt(hm, x) {
  return Math.max(0, Math.min(1, x / hm.cfg.summitX));
}

/** Rotated-rectangle static bodies following the heightmap, skipping the gaps. */
export function buildTerrainBodies(Matter, hm) {
  const { Bodies } = Matter;
  const { points, cfg } = hm;
  const bodies = [];
  const thickness = 80;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const midX = (a.x + b.x) / 2;
    if (isOverGap(hm, midX) || isOverGap(hm, a.x) || isOverGap(hm, b.x)) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    bodies.push(Bodies.rectangle(
      midX + (Math.sin(angle) * thickness) / 2,
      (a.y + b.y) / 2 + (Math.cos(angle) * thickness) / 2,
      len + 2, thickness,
      { isStatic: true, angle, friction: 1.0, label: 'ground', render: { visible: false } },
    ));
  }
  return bodies;
}
