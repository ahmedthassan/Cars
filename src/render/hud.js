// ── HUD: bubbles, panic, roster, debug ───────────────────────────────────────
import { DIALOGUE, DRIVER, ROBOTS } from '../config.js';
import { worldToScreen } from './draw.js';

export function createHud() {
  return { bubbles: [], debug: false };
}

export function say(hud, utterance) {
  // One bubble per speaker: a bot interrupting themselves reads as a glitch.
  hud.bubbles = hud.bubbles.filter((b) => b.speaker !== utterance.speaker);
  hud.bubbles.push({
    speaker: utterance.speaker,
    text: utterance.text,
    priority: utterance.priority,
    life: DIALOGUE.bubbleDuration + Math.min(2, utterance.text.length / 40),
    age: 0,
  });
}

export function clearBubbles(hud) { hud.bubbles.length = 0; }

export function updateHud(hud, dt) {
  for (const b of hud.bubbles) b.age += dt;
  hud.bubbles = hud.bubbles.filter((b) => b.age < b.life);
}

const COLOR = Object.fromEntries([...ROBOTS, DRIVER].map((r) => [r.id, r.color]));
const NAME = Object.fromEntries([...ROBOTS, DRIVER].map((r) => [r.id, r.name]));

function anchorFor(truck, speaker) {
  if (speaker === 'driver') return truck.cab.position;
  const bot = truck.bots.find((b) => b.botId === speaker);
  return bot ? bot.position : truck.trailer.position;
}

export function drawBubbles(ctx, cam, canvas, hud, truck) {
  ctx.textAlign = 'left';
  const placed = [];
  for (const b of hud.bubbles) {
    const world = anchorFor(truck, b.speaker);
    const p = worldToScreen(cam, canvas, world);
    // A priority-5 line is a scream: bigger text, per "bots scream in bigger
    // text when the angle gets silly".
    const big = b.priority >= 5;
    const font = big ? 'bold 19px' : 'bold 14px';
    ctx.font = `${font} system-ui, -apple-system, sans-serif`;
    const padX = 10, padY = 7;
    const maxW = Math.min(320, canvas.width * 0.44);
    const lines = wrap(ctx, b.text, maxW);
    const lh = big ? 23 : 18;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
    const h = lines.length * lh + padY * 2;

    let x = Math.max(8, Math.min(canvas.width - w - 8, p.x - w / 2));
    let y = p.y - 56 - h;
    // Nudge off anything already on screen so four bots interrupting stays legible.
    for (let guard = 0; guard < 14; guard++) {
      const hit = placed.find((q) => Math.abs(q.x - x) < Math.max(q.w, w) * 0.8 && Math.abs(q.y - y) < q.h + 8);
      if (!hit) break;
      y = hit.y - h - 9;
    }
    if (y < 6) y = 6;
    placed.push({ x, y, w, h });

    const fade = Math.min(1, (b.life - b.age) / 0.45);
    ctx.globalAlpha = Math.max(0, fade);
    ctx.fillStyle = 'rgba(10,13,19,0.9)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 9);
    ctx.fill();
    ctx.strokeStyle = COLOR[b.speaker] || '#fff';
    ctx.lineWidth = big ? 3 : 2;
    ctx.stroke();
    // Tail toward the speaker
    ctx.beginPath();
    ctx.moveTo(Math.min(x + w - 14, Math.max(x + 14, p.x)) - 6, y + h);
    ctx.lineTo(Math.min(x + w - 14, Math.max(x + 14, p.x)) + 6, y + h);
    ctx.lineTo(Math.min(x + w - 14, Math.max(x + 14, p.x)), y + h + 10);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10,13,19,0.9)';
    ctx.fill();

    ctx.fillStyle = COLOR[b.speaker] || '#fff';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.fillText((NAME[b.speaker] || b.speaker).toUpperCase(), x + padX, y - 3);
    ctx.fillStyle = big ? '#ffe9e9' : '#eef4fa';
    ctx.font = `${font} system-ui, -apple-system, sans-serif`;
    lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + lh * (i + 0.78)));
    ctx.globalAlpha = 1;
  }
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const out = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

export function drawStatus(ctx, canvas, S, truck, memory, insets = null) {
  // On a notched phone in landscape the notch sits over one edge and the home
  // indicator over the bottom, so the HUD is inset by whatever the OS reports
  // rather than by a fixed margin.
  const i = insets || { top: 0, right: 0, bottom: 0, left: 0 };
  const pad = 12;
  const padL = pad + i.left;
  const padR = pad + i.right;
  const padT = pad + i.top;
  // Panic meter
  const w = Math.min(230, canvas.width * 0.3);
  ctx.fillStyle = 'rgba(10,13,19,0.6)';
  ctx.beginPath();
  ctx.roundRect(padL, padT, w, 44, 8);
  ctx.fill();
  ctx.fillStyle = '#9aa4b2';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`PANIC ${Math.round(S.panic * 100)}%`, padL + 10, padT + 16);
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath();
  ctx.roundRect(padL + 10, padT + 24, w - 20, 9, 5);
  ctx.fill();
  const hue = 140 - S.panic * 140;
  ctx.fillStyle = `hsl(${hue}, 78%, 55%)`;
  ctx.beginPath();
  ctx.roundRect(padL + 10, padT + 24, Math.max(2, (w - 20) * S.panic), 9, 5);
  ctx.fill();

  // Roster. Anyone dangling is marked, because "three aboard" and "two aboard
  // plus one hanging off the back" are very different situations.
  const alive = truck.bots.filter((b) => !b.lost);
  ctx.textAlign = 'right';
  ctx.font = 'bold 11px system-ui, sans-serif';
  const label = alive.length
    ? alive.map((b) => (b.clinging ? `${b.robot.name}!` : b.robot.name)).join('  ')
    : 'nobody left lol';
  ctx.fillStyle = alive.length ? '#dfe8f2' : '#e8736b';
  ctx.fillText(label, canvas.width - padR, padT + 16);
  ctx.fillStyle = '#8d97a5';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText(`ALTITUDE ${Math.round(S.altitude * 100)}%   TILT ${S.tilt.toFixed(0)}°   HONKS ${memory.honks}`,
    canvas.width - padR, padT + 32);

  // A dangling bot needs a loud, unmissable prompt. The player has a couple of
  // seconds to decide whether to steady up and haul them back or honk them off
  // for the speed, and they cannot make that call if nobody tells them it is a
  // call they are making.
  if (S.clinging > 0) {
    const msg = 'HANGING ON — drive steady to pull them up, honk to let go';
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px system-ui, sans-serif';
    const w2 = ctx.measureText(msg).width;
    ctx.fillStyle = 'rgba(10,13,19,0.82)';
    ctx.beginPath();
    ctx.roundRect(canvas.width / 2 - w2 / 2 - 12, padT + 42, w2 + 24, 24, 7);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillText(msg, canvas.width / 2, padT + 58);
  }
}

/**
 * Debug overlay (toggle `~`). Its job is to prove the central rule: every line
 * must show the band that caused it. A line with no band here is a bug.
 */
export function drawDebug(ctx, canvas, S, bands, log) {
  const x = 14, y0 = 74;
  ctx.textAlign = 'left';
  ctx.font = '11px ui-monospace, Menlo, monospace';
  const rows = [
    `tilt      ${S.tilt.toFixed(1)}°   rate ${S.tiltRate.toFixed(1)}°/s`,
    `speed     ${S.speed.toFixed(2)}   accel ${S.accel.toFixed(1)}`,
    `airTime   ${S.airTime.toFixed(2)}s  grounded ${S.grounded}`,
    `slip      ${S.wheelSlip.toFixed(2)}   gradient ${S.gradient.toFixed(1)}°`,
    `rollback  ${S.rollback}   stalled ${S.stalled}`,
    `altitude  ${S.altitude.toFixed(2)}   void ${S.voidLengths.toFixed(2)} truck-len`,
    `crew      ${S.crew}   panic ${S.panic.toFixed(2)}`,
    `clinging  ${S.clinging} [${S.clingingIds?.join(' ') || '-'}]  grip ${(S.clingGrip ?? 1).toFixed(2)}`,
    `sinceLine ${S.sinceLine.toFixed(1)}s  lastEvent ${S.lastEvent ?? '—'}`,
    '',
    `BANDS  ${bands.length ? bands.join(' ') : '(none — silence is correct)'}`,
    '',
    'LAST LINES (band → why it was allowed)',
    ...log.map((l) => `  [${l.band ?? 'NO BAND!'} p${l.priority}] ${l.speaker}: ${l.text.slice(0, 42)}`),
  ];
  ctx.fillStyle = 'rgba(6,9,14,0.76)';
  ctx.beginPath();
  ctx.roundRect(x - 6, y0 - 14, 430, rows.length * 14 + 18, 8);
  ctx.fill();
  rows.forEach((r, i) => {
    ctx.fillStyle = r.includes('NO BAND!') ? '#ff6b6b'
      : r.startsWith('BANDS') ? '#8ce99a'
      : r.startsWith('  [') ? '#c9d6e4' : '#9aa4b2';
    ctx.fillText(r, x, y0 + i * 14);
  });
}
