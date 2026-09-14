// ── Rendering ─────────────────────────────────────────────────────────────────
import { GAME, PHYSICS, TERRAIN } from '../config.js';
import { isOverGap } from '../physics/terrain.js';

export function createCamera() {
  return { x: 0, y: 0, scale: 1, shake: 0 };
}

export function updateCamera(cam, truck, canvas, dt) {
  const target = truck.cab.position;
  // Look ahead in the direction of travel so you can see the hill coming.
  const lead = Math.max(-160, Math.min(260, truck.cab.velocity.x * 26));
  cam.x += (target.x + lead - cam.x) * GAME.cameraLerp;
  cam.y += (target.y - 40 - cam.y) * GAME.cameraLerp;
  // Phones are short and very wide. Scaling off height alone leaves the truck
  // looking distant on a 20:9 screen, so the ceiling is raised a little — but
  // not far, because seeing the hill coming is what makes the climb a decision.
  cam.scale = Math.min(1.28, Math.max(0.62, (canvas.height / 620) * 0.95));
  cam.shake = Math.max(0, cam.shake - dt * 2.6);
}

export function worldToScreen(cam, canvas, p) {
  const s = cam.scale;
  const jitter = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 14 : 0;
  return {
    x: (p.x - cam.x) * s + canvas.width / 2 + jitter,
    y: (p.y - cam.y) * s + canvas.height * 0.62 + jitter,
  };
}

function begin(ctx, cam, canvas) {
  ctx.save();
  const jitter = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake * 14 : 0;
  ctx.translate(canvas.width / 2 + jitter, canvas.height * 0.62 + jitter);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
}

export function drawSky(ctx, canvas, altitude) {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  // The sky gets colder and thinner the higher you get.
  const top = `hsl(${208 - altitude * 14}, ${52 + altitude * 18}%, ${20 + altitude * 12}%)`;
  const bot = `hsl(${205 - altitude * 10}, 36%, ${52 + altitude * 16}%)`;
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function drawParallax(ctx, cam, canvas) {
  // Two lazy ridgelines. Cheap depth, no assets.
  const layers = [
    { k: 0.22, y: 0.58, h: 150, c: 'rgba(255,255,255,0.10)' },
    { k: 0.42, y: 0.68, h: 110, c: 'rgba(255,255,255,0.16)' },
  ];
  for (const L of layers) {
    ctx.fillStyle = L.c;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    for (let sx = 0; sx <= canvas.width; sx += 26) {
      const wx = (cam.x * L.k + sx) * 0.5;
      const y = canvas.height * L.y - Math.sin(wx / 260) * L.h * 0.5 - Math.sin(wx / 91) * L.h * 0.22
        - (cam.y * -L.k * 0.25);
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawTerrain(ctx, cam, canvas, hm) {
  begin(ctx, cam, canvas);
  const { points } = hm;
  // Contiguous runs only: a void gap must read as genuinely absent road.
  let run = [];
  const flush = () => {
    if (run.length < 2) { run = []; return; }
    ctx.beginPath();
    ctx.moveTo(run[0].x, run[0].y);
    for (const p of run) ctx.lineTo(p.x, p.y);
    const last = run[run.length - 1];
    ctx.lineTo(last.x, last.y + 1400);
    ctx.lineTo(run[0].x, run[0].y + 1400);
    ctx.closePath();
    ctx.fillStyle = '#3b3f47';
    ctx.fill();
    // Snow cap on the surface.
    ctx.beginPath();
    ctx.moveTo(run[0].x, run[0].y);
    for (const p of run) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#f2f6fa';
    ctx.lineWidth = 11;
    ctx.lineJoin = 'round';
    ctx.stroke();
    run = [];
  };
  for (const p of points) {
    if (isOverGap(hm, p.x)) flush();
    else run.push(p);
  }
  flush();

  // Summit flag
  const sIdx = Math.round(TERRAIN.summitX / TERRAIN.step);
  const sp = points[Math.min(sIdx, points.length - 1)];
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sp.x, sp.y);
  ctx.lineTo(sp.x, sp.y - 90);
  ctx.stroke();
  ctx.fillStyle = '#e8433f';
  ctx.beginPath();
  ctx.moveTo(sp.x, sp.y - 90);
  ctx.lineTo(sp.x + 62, sp.y - 74);
  ctx.lineTo(sp.x, sp.y - 56);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('TOP', sp.x + 10, sp.y - 104);
  ctx.restore();
}

function rotRect(ctx, body, w, h, fill, radius = 5) {
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, radius);
  ctx.fill();
  ctx.restore();
}

export function drawTruck(ctx, cam, canvas, truck) {
  begin(ctx, cam, canvas);
  const P = PHYSICS;

  // Trailer
  rotRect(ctx, truck.trailer, P.trailer.w, P.trailer.h, '#6b7280', 3);

  // Wheels
  for (const w of truck.wheels) {
    ctx.save();
    ctx.translate(w.position.x, w.position.y);
    ctx.rotate(w.angle);
    ctx.fillStyle = '#16181d';
    ctx.beginPath();
    ctx.arc(0, 0, P.wheel.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = w.touching ? '#9aa4b2' : '#e0574f'; // red spokes = airborne
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-P.wheel.r * 0.7, 0);
    ctx.lineTo(P.wheel.r * 0.7, 0);
    ctx.moveTo(0, -P.wheel.r * 0.7);
    ctx.lineTo(0, P.wheel.r * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  // Cab
  rotRect(ctx, truck.cab, P.cab.w, P.cab.h, '#d94f45', 7);
  // Windscreen + Dadbot's face, so you can see who is responsible.
  ctx.save();
  ctx.translate(truck.cab.position.x, truck.cab.position.y);
  ctx.rotate(truck.cab.angle);
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.roundRect(P.cab.w * 0.06, -P.cab.h * 0.34, P.cab.w * 0.36, P.cab.h * 0.44, 4);
  ctx.fill();
  ctx.fillStyle = '#e8f0f7';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('◉‿◉', P.cab.w * 0.24, -P.cab.h * 0.06);
  ctx.restore();
  ctx.restore();
}

export function drawBots(ctx, cam, canvas, truck) {
  begin(ctx, cam, canvas);

  // Arms first, so a dangling bot is drawn on top of its own arm.
  for (const b of truck.bots) {
    if (b.lost || !b.clinging || !b.grabbedAt) continue;
    const t = truck.trailer;
    const ca = Math.cos(t.angle), sa = Math.sin(t.angle);
    const gx = t.position.x + b.grabbedAt.x * ca - b.grabbedAt.y * sa;
    const gy = t.position.y + b.grabbedAt.x * sa + b.grabbedAt.y * ca;
    const sx = b.position.x + Math.sin(b.angle) * 12;
    const sy = b.position.y - Math.cos(b.angle) * 12;

    // The arm. It goes red as the grip runs out, which is the only warning the
    // player gets that someone is about to stop being a passenger.
    const grip = Math.max(0, Math.min(1, b.grip ?? 1));
    ctx.strokeStyle = `hsl(${grip * 95}, 85%, ${52 + (1 - grip) * 10}%)`;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    // The hand
    ctx.fillStyle = b.robot.color;
    ctx.beginPath();
    ctx.arc(gx, gy, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Grip meter, floating above the hand.
    const bw = 30;
    ctx.fillStyle = 'rgba(8,11,16,0.7)';
    ctx.beginPath();
    ctx.roundRect(gx - bw / 2, gy - 20, bw, 5, 2.5);
    ctx.fill();
    ctx.fillStyle = `hsl(${grip * 95}, 85%, 55%)`;
    ctx.beginPath();
    ctx.roundRect(gx - bw / 2, gy - 20, Math.max(1.5, bw * grip), 5, 2.5);
    ctx.fill();
  }

  for (const b of truck.bots) {
    if (b.lost) continue;
    const r = b.robot;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.roundRect(-13, -17, 26, 34, 6);
    ctx.fill();
    // Visor
    ctx.fillStyle = 'rgba(12,16,22,0.85)';
    ctx.beginPath();
    ctx.roundRect(-10, -13, 20, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#dff1ff';
    ctx.font = '8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(r.face, 0, -4);
    // Name on the body. Reversed out of a dark plate rather than drawn
    // straight onto the colour — at this size coloured-on-coloured is a smudge.
    ctx.fillStyle = 'rgba(10,14,20,0.86)';
    ctx.beginPath();
    ctx.roundRect(-13, 3, 26, 11, 3);
    ctx.fill();
    ctx.fillStyle = '#f2f7fc';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.fillText(r.name.toUpperCase(), 0, 11.5);
    ctx.restore();
  }
  ctx.restore();
}
