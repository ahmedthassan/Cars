// ── Weather ──────────────────────────────────────────────────────────────────
//
// The ambience layer: falling snow, blown sand, driving rain, drifting ash,
// plus the two set pieces — lightning on the storm and embers on the volcano.
//
// Particles live in SCREEN space and wrap at the edges, rather than living in
// the world. A world-space field would need to cover 10,000px of level to keep
// the screen populated; this keeps a couple of hundred particles busy no matter
// how far along the map you are. They are given a parallax nudge from camera
// motion so they still feel attached to the world rather than painted on glass.

/** Deterministic per-level, so a level always storms the same way. */
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

export function createWeather(theme, seed = 1) {
  const spec = theme?.weather;
  const rnd = mulberry32(seed);
  const particles = [];
  if (spec) {
    for (let i = 0; i < spec.count; i++) {
      particles.push({
        x: rnd(), y: rnd(),                 // normalised; scaled to canvas each frame
        // Depth drives size, speed and opacity together so the field reads as
        // three-dimensional instead of as confetti.
        depth: 0.35 + rnd() * 0.65,
        phase: rnd() * Math.PI * 2,
        len: 0.5 + rnd() * 0.5,
      });
    }
  }
  return {
    spec,
    particles,
    t: 0,
    flash: 0,          // lightning
    nextFlash: 3 + rnd() * 6,
    embers: [],
    rnd,
    prevCam: null,
  };
}

export function updateWeather(w, dt, cam, canvas) {
  if (!w) return;
  w.t += dt;

  // Camera delta gives the field its parallax push.
  let camDX = 0, camDY = 0;
  if (w.prevCam) {
    camDX = cam.x - w.prevCam.x;
    camDY = cam.y - w.prevCam.y;
  }
  w.prevCam = { x: cam.x, y: cam.y };

  const s = w.spec;
  if (s) {
    const W = canvas.width, H = canvas.height;
    for (const p of w.particles) {
      const d = p.depth;
      // Sand and rain blow sideways; snow and ash mostly fall.
      const sway = s.kind === 'snow' || s.kind === 'ash'
        ? Math.sin(w.t * 1.3 + p.phase) * s.drift * 0.5
        : s.drift;
      p.x += ((sway * d * dt) - camDX * d * 0.35) / W;
      p.y += ((s.speed * d * dt) - camDY * d * 0.35) / H;

      // Wrap on every edge so the field never thins out.
      if (p.y > 1.05) { p.y -= 1.1; p.x = w.rnd(); }
      if (p.y < -0.05) p.y += 1.1;
      if (p.x > 1.05) p.x -= 1.1;
      if (p.x < -0.05) p.x += 1.1;
    }
  }

  if (w.spec && w.flash > 0) w.flash = Math.max(0, w.flash - dt * 3.2);
  if (w.nextFlash !== undefined) {
    w.nextFlash -= dt;
    if (w.nextFlash <= 0) {
      w.flash = 1;
      w.nextFlash = 4 + w.rnd() * 9;
    }
  }

  // Embers rise and die; spawned continuously on the volcano.
  if (w.emberSpec) {
    for (let i = w.embers.length - 1; i >= 0; i--) {
      const e = w.embers[i];
      e.life -= dt;
      e.x += e.vx * dt - camDX * 0.2;
      e.y += e.vy * dt - camDY * 0.2;
      e.vy += 12 * dt;                      // they slow as they rise
      if (e.life <= 0) w.embers.splice(i, 1);
    }
    if (w.embers.length < 70 && w.rnd() < 0.7) {
      w.embers.push({
        x: w.rnd() * canvas.width,
        y: canvas.height * (0.75 + w.rnd() * 0.3),
        vx: (w.rnd() - 0.5) * 40,
        vy: -30 - w.rnd() * 70,
        life: 1.4 + w.rnd() * 2.2,
        max: 3.6,
        r: 1 + w.rnd() * 2,
      });
    }
  }
}

/** Behind the terrain: haze and distance. */
export function drawWeatherBack(ctx, w, canvas, theme) {
  if (!theme) return;
  if (theme.fog) {
    // A band of haze sitting where the ground meets the sky, which is what
    // actually sells depth — a full-screen wash just greys everything out.
    const g = ctx.createLinearGradient(0, canvas.height * 0.35, 0, canvas.height);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, theme.fog);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

/** In front of everything: precipitation, flashes, vignette. */
export function drawWeatherFront(ctx, w, canvas, theme) {
  if (!w || !theme) return;
  const s = w.spec;
  const W = canvas.width, H = canvas.height;

  if (s) {
    ctx.save();
    if (s.kind === 'rain') {
      ctx.strokeStyle = s.color;
      ctx.lineCap = 'round';
      for (const p of w.particles) {
        const x = p.x * W, y = p.y * H;
        const d = p.depth;
        ctx.globalAlpha = 0.16 + d * 0.34;
        ctx.lineWidth = s.size * d;
        // Streaks lean along their own travel direction.
        const dy = 16 * d * p.len * 2.2;
        const dx = (s.drift / s.speed) * dy;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = s.color;
      for (const p of w.particles) {
        const d = p.depth;
        ctx.globalAlpha = (s.kind === 'ash' ? 0.12 : 0.20) + d * 0.5;
        const r = s.size * d;
        if (s.kind === 'sand') {
          // Sand reads as short horizontal smears, not dots.
          ctx.fillRect(p.x * W, p.y * H, r * 5, r * 0.8);
        } else {
          ctx.beginPath();
          ctx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // Embers, drawn hot and additive so they glow against the dark.
  if (w.embers.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of w.embers) {
      const k = Math.max(0, e.life / e.max);
      ctx.globalAlpha = k * 0.9;
      ctx.fillStyle = k > 0.6 ? '#ffd9a0' : k > 0.3 ? '#ff9040' : '#d43a12';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (theme.lightning && w.flash > 0) {
    // Two quick stabs rather than one fade — a single linear fade looks like a
    // light being dimmed, not like lightning.
    const k = w.flash > 0.72 ? 1 : w.flash * 0.5;
    ctx.fillStyle = `rgba(190, 214, 255, ${0.5 * k})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (theme.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25,
      W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${theme.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

/** The truck's headlight, for the level where you genuinely cannot see. */
export function drawHeadlight(ctx, canvas, theme, screenPos, angle) {
  if (!theme?.headlight) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(screenPos.x, screenPos.y);
  ctx.rotate(angle);
  const len = canvas.width * 0.52;
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, 'rgba(255,240,200,0.30)');
  g.addColorStop(0.55, 'rgba(255,235,180,0.10)');
  g.addColorStop(1, 'rgba(255,230,170,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len, -len * 0.26);
  ctx.lineTo(len, len * 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function enableEmbers(w, on) {
  w.emberSpec = on || undefined;
  if (!on) w.embers.length = 0;
}
