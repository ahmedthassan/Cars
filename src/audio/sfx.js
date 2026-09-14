// ── Sound ─────────────────────────────────────────────────────────────────────
// Entirely synthesised — no audio files in the repo. The point of having audio
// at all in this slice is `duck()`: the mid-air comedy rule needs something to
// pull down so one bot can be calm during chaos.

let ctx = null;
let master = null;
let nodes = {};
let started = false;
let duckTarget = 1;

function noiseBuffer(c, seconds = 2) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Must be called from a user gesture — mobile blocks audio otherwise. */
export function initAudio() {
  if (started) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  // Engine: two detuned saws through a lowpass, so it growls rather than beeps.
  const eng = ctx.createGain();
  eng.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 620;
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 46;
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 69;
  o1.connect(lp); o2.connect(lp); lp.connect(eng); eng.connect(master);
  o1.start(); o2.start();

  // Tyre slip: looping noise through a bandpass, gated on wheelSlip.
  const slipGain = ctx.createGain();
  slipGain.gain.value = 0;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1750;
  bp.Q.value = 0.8;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.connect(bp); bp.connect(slipGain); slipGain.connect(master);
  src.start();

  nodes = { eng, o1, o2, lp, slipGain };
  started = true;
  return true;
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

/** Engine note follows wheel speed; gain follows throttle. */
export function updateEngine(wheelSpeed, gas, slip) {
  if (!started) return;
  const rpm = Math.min(1, Math.abs(wheelSpeed) / 0.85);
  const base = 44 + rpm * 96 + (gas ? 14 : 0);
  const t = ctx.currentTime;
  nodes.o1.frequency.setTargetAtTime(base, t, 0.08);
  nodes.o2.frequency.setTargetAtTime(base * 1.5, t, 0.08);
  nodes.lp.frequency.setTargetAtTime(480 + rpm * 900, t, 0.1);
  nodes.eng.gain.setTargetAtTime((gas ? 0.24 : 0.1) * duckTarget, t, 0.1);
  nodes.slipGain.gain.setTargetAtTime(Math.max(0, slip - 0.3) * 0.5 * duckTarget, t, 0.05);
}

export function honkSound() {
  if (!started) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.32 * duckTarget, t + 0.02);
  g.gain.setValueAtTime(0.32 * duckTarget, t + 0.28);
  g.gain.linearRampToValueAtTime(0, t + 0.38);
  g.connect(master);
  for (const f of [305, 408]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(g);
    o.start(t);
    o.stop(t + 0.4);
  }
}

export function impactSound(strength = 1) {
  if (!started) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  const amp = Math.min(0.5, 0.12 + strength * 0.3) * duckTarget;
  g.gain.setValueAtTime(amp, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260 + strength * 180;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, 0.3);
  s.connect(lp); lp.connect(g); g.connect(master);
  s.start(t); s.stop(t + 0.3);
}

/**
 * Pull everything down so a quiet line lands. This is the mid-air rule: calm
 * during chaos is the single funniest beat in the game, and it does not work
 * over a screaming engine.
 */
export function duck(amount, seconds = 0.25) {
  duckTarget = amount;
  if (!started) return;
  master.gain.setTargetAtTime(0.55 * amount, ctx.currentTime, seconds / 3);
}

export function audioReady() { return started; }
