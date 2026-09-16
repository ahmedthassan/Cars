// ── The contextual dialogue engine ────────────────────────────────────────────
// "A random line is noise. A line that fires the exact frame the physics get
//  scary is a joke." — the spec
//
// Pure logic: no DOM, no Matter, no timers. It is driven by (state vector, dt)
// and returns a list of events. That is what lets the timing rules — which are
// almost impossible to eyeball in a moving game — be asserted in a unit test.

import { DIALOGUE } from '../config.js';
import { BAND_BY_ID, createBandState, updateBands } from './bands.js';
import { interpolate, recordDeath, recordLastWords, unlocks } from './memory.js';

/** Shuffle-bag: exhaust every option before any repeats. Never bare random(). */
class Bag {
  constructor(size, rng) { this.size = size; this.rng = rng; this.bag = []; }
  next() {
    if (this.bag.length === 0) {
      this.bag = Array.from({ length: this.size }, (_, i) => i);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }
}

export function createDialogue({ lines, memory, rng = Math.random, crew = [] }) {
  return {
    lines,
    memory,
    rng,
    bandState: createBandState(),
    t: 0,
    lineCooldown: {},      // line id → time it may fire again
    speakerCooldown: {},   // speaker id → time they may speak again
    nextGlobal: 0,         // global 1.1s gate
    muteUntil: 0,          // "air before the punchline" silence
    bags: {},
    used: new Set(),       // `once` lines
    queue: [],             // delayed utterances (Dadbot replies, held punchlines)
    forced: [],            // FIFO of event lines waiting for a free slot
    livingCrew: new Set(crew),
    airCallback: null,     // what was said mid-air, for the landing to answer
    activeBands: [],
    log: [],               // last few fired lines, for the debug overlay
  };
}

function bagFor(d, line) {
  if (!d.bags[line.id]) d.bags[line.id] = new Bag(line.text.length, d.rng);
  return d.bags[line.id];
}

function priorityOf(line) {
  return line.priority ?? BAND_BY_ID[line.band]?.priority ?? 0;
}

/** Weight-weighted random. Ties NEVER break by array order. */
function pickWeighted(candidates, rng) {
  const total = candidates.reduce((s, c) => s + (c.weight ?? 1), 0);
  let r = rng() * total;
  for (const c of candidates) {
    r -= c.weight ?? 1;
    if (r <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

function resolveSpeaker(d, line, S) {
  // 'clinger' resolves to whoever is actually hanging off the trailer, so the
  // begging comes from the bot with its hand on the edge rather than from
  // somebody sitting comfortably on the bed.
  if (line.speaker === 'clinger') {
    const hanging = (S?.clingingIds ?? []).filter((id) => d.livingCrew.has(id));
    if (!hanging.length) return null;
    return hanging[Math.floor(d.rng() * hanging.length)];
  }
  if (line.speaker === 'any' || line.speaker === 'crowd') {
    const alive = [...d.livingCrew];
    // The one dangling by an arm is not making small talk.
    const pool = line.speaker === 'any'
      ? alive.filter((id) => !(S?.clingingIds ?? []).includes(id))
      : alive;
    const use = pool.length ? pool : alive;
    if (!use.length) return null;
    return use[Math.floor(d.rng() * use.length)];
  }
  return line.speaker;
}

function speakerAvailable(d, speaker) {
  if (speaker === null) return false;
  if (speaker !== 'driver' && !d.livingCrew.has(speaker)) return false;
  return (d.speakerCooldown[speaker] ?? 0) <= d.t;
}

function eligible(d, S) {
  const active = new Set(d.activeBands);
  const u = unlocks(d.memory);
  const out = [];

  for (const line of d.lines) {
    // No band means no physics reason, and no physics reason means no line.
    // Reply and event pools (`reply: true`, `event: '...'`) are deliberately
    // unreachable from here — they are only ever emitted via trigger() or as a
    // queued Dadbot response. Without this guard they fire spontaneously.
    if (!line.band) continue;
    if (!active.has(line.band)) continue;
    if (line.once && d.used.has(line.id)) continue;
    if ((d.lineCooldown[line.id] ?? 0) > d.t) continue;
    if (line.when && !line.when(S)) continue;

    // Locked pools: arrogant / repaired variants only exist once earned.
    if (line.requires === 'arrogant' && u.arrogant !== line.speaker) continue;
    if (line.requires === 'repaired' && u.repaired !== line.speaker) continue;
    if (!line.requires && line.lockedBy === 'arrogant' && u.arrogant === line.speaker) continue;
    if (!line.requires && line.lockedBy === 'repaired' && u.repaired === line.speaker) continue;

    // Protect the joke: Dadbot never panics until the crew is gone. Enforced
    // here in code rather than trusted to line-writing discipline.
    if (line.speaker === 'driver' && line.tags?.includes('panic') && S.crew > 0) continue;

    const speaker = resolveSpeaker(d, line, S);
    if (!speakerAvailable(d, speaker)) continue;

    out.push({ line, speaker, priority: priorityOf(line), weight: line.weight ?? 1 });
  }
  return out;
}

function render(d, line, speaker, band) {
  const idx = bagFor(d, line).next();
  const text = interpolate(line.text[idx], d.memory);
  return {
    kind: 'line',
    id: line.id,
    speaker,
    text,
    priority: priorityOf(line),
    // The line's OWN band, never the top active one. Logging a priority-0
    // chill line as "stall" because stall happens to be open would hide
    // exactly the bug the debug overlay is there to catch.
    band: line.band ?? band ?? null,
    callback: line.callback ?? null,
    tags: line.tags ?? [],
    at: d.t,          // provisional; commit() re-stamps it at emission time
  };
}

function commit(d, utt, line) {
  // Stamp when the line was actually SAID, not when it was chosen. A held
  // punchline is rendered half a second before it is heard, and anything
  // reasoning about comedy beats needs the moment it landed.
  utt.at = d.t;
  d.lineCooldown[utt.id] = d.t + (line?.cooldown ?? 30);
  d.speakerCooldown[utt.speaker] = d.t + DIALOGUE.speakerCooldown;
  d.nextGlobal = d.t + DIALOGUE.globalCooldown;
  if (line?.once) d.used.add(line.id);
  d.log.unshift({ text: utt.text, speaker: utt.speaker, band: utt.band, priority: utt.priority, at: d.t });
  d.log.length = Math.min(d.log.length, 6);
}

/**
 * Advance the engine one frame. Returns events:
 *   {kind:'line', speaker, text, priority, band}
 *   {kind:'clear'}          — drop existing bubbles, a big line is coming
 *   {kind:'duck', amount}   — pull the SFX down so a calm line can land
 */
export function update(d, S, dt) {
  d.t += dt;
  const events = [];

  d.activeBands = updateBands(d.bandState, S, dt);
  const top = d.activeBands[0] ?? null;

  // Queued utterances (Dadbot replies, held punchlines) fire on their own clock.
  // These are deliberately EXEMPT from the global 1.1s gate: the spec puts
  // Dad's reply 0.9s after the crew's line, and that overlap is the gag.
  for (let i = d.queue.length - 1; i >= 0; i--) {
    if (d.queue[i].at <= d.t) {
      const q = d.queue.splice(i, 1)[0];
      // Re-arm the silence gate as the held punchline lands, or every later
      // priority-4 line skips its half second of silence.
      if (q.punch) d.heldPunch = false;
      if (q.utterance.speaker !== 'driver' || S.crew === 0 || !q.utterance.tags.includes('panic')) {
        events.push(q.utterance);
        commit(d, q.utterance, q.line);
      }
    }
  }

  // The mid-air rule: duck the SFX so one bot can be calm during chaos.
  if (d.activeBands.includes('air_long') && !d.duckedForAir) {
    d.duckedForAir = true;
    events.push({ kind: 'duck', amount: 0.25 });
  } else if (!d.activeBands.includes('air_long') && d.duckedForAir) {
    d.duckedForAir = false;
    events.push({ kind: 'duck', amount: 1 });
  }

  // Event lines take the next slot ahead of any band line: a bot leaving the
  // truck matters more than whatever the terrain is doing.
  if (drainForced(d, events)) return events;

  if (d.t < d.muteUntil) return events;   // holding silence before a punchline
  if (d.t < d.nextGlobal) return events;  // global cooldown

  let candidates = eligible(d, S);
  if (!candidates.length) return events;

  // Landing lines must ANSWER what was said mid-air. If a callback is pending,
  // only landing lines keyed to it are considered.
  if (d.activeBands.includes('landing') && d.airCallback) {
    const answers = candidates.filter((c) => c.line.answers === d.airCallback);
    if (answers.length) candidates = answers;
  }

  const best = Math.max(...candidates.map((c) => c.priority));
  const chosen = pickWeighted(candidates.filter((c) => c.priority === best), d.rng);
  const utt = render(d, chosen.line, chosen.speaker, top);

  // "Air before the punchline." A priority-4+ line clears the bubbles and waits
  // half a second in silence. Silence sells it.
  if (utt.priority >= DIALOGUE.airPriority && !d.heldPunch) {
    events.push({ kind: 'clear' });
    d.muteUntil = d.t + DIALOGUE.airSilence;
    d.heldPunch = true;
    d.queue.push({ at: d.t + DIALOGUE.airSilence, utterance: utt, line: chosen.line, punch: true });
    // Reserve the line now so nothing else grabs it during the silence.
    d.lineCooldown[utt.id] = d.t + (chosen.line.cooldown ?? 30);
    // Dad answers 0.9s after the line is HEARD, not 0.9s after we decided to
    // hold it — otherwise the held half-second of silence eats into the beat
    // and he steps on the punchline he is supposed to be replying to.
    queueDadReply(d, utt, chosen.line, DIALOGUE.airSilence);
    if (utt.callback) d.airCallback = utt.callback;
    return events;
  }
  d.heldPunch = false;

  events.push(utt);
  commit(d, utt, chosen.line);
  if (utt.callback) d.airCallback = utt.callback;
  // Any landing line consumes the callback. Clearing it only on a matching
  // `answers` line left an unanswered callback latched forever, which
  // permanently filtered the generic landing pool out of every later landing.
  else if (utt.band === 'landing') d.airCallback = null;
  queueDadReply(d, utt, chosen.line);
  return events;
}

/** Every bot line at priority >= 3 gets a 30% chance of an unhelpful Dad reply. */
function queueDadReply(d, utt, line, afterDelay = 0) {
  if (utt.speaker === 'driver') return;
  if (utt.priority < DIALOGUE.dadReplyMinPriority) return;
  if (d.rng() > DIALOGUE.dadReplyChance) return;
  const pool = d.lines.find((l) => l.id === 'dad_unhelpful');
  if (!pool) return;
  const reply = render(d, pool, 'driver', utt.band);
  d.queue.push({ at: d.t + afterDelay + DIALOGUE.dadReplyDelay, utterance: reply, line: pool });
}

/**
 * Queue a forced line for the next free slot.
 *
 * Forced lines skip the BAND table — a bot leaving the truck is a physics
 * reason all by itself — but they must NOT skip the global spacing. Four bots
 * coming off a trailer inside a second emitted four bubbles on one frame,
 * which reads as noise rather than as a scene.
 *
 * This is a plain FIFO drained at most one per slot, deliberately rather than
 * a precomputed schedule: a queued item fires on the first frame at or after
 * its due time, so chaining due-times together lets each item's rounding eat
 * into the next one's gap.
 */
function scheduleForced(d, utt, line, reply = null) {
  d.forced.push({ utterance: utt, line, reply });
}

/** Emit at most one queued event line, if the global gate is open. */
function drainForced(d, events) {
  if (!d.forced.length || d.t < d.nextGlobal || d.t < d.muteUntil) return false;
  const item = d.forced.shift();
  events.push(item.utterance);
  commit(d, item.utterance, item.line);
  if (item.reply) {
    // The reply beat hangs off when the line was actually HEARD.
    const reply = render(d, item.reply, 'driver', item.utterance.band);
    d.queue.push({ at: d.t + DIALOGUE.dadReplyDelay, utterance: reply, line: item.reply });
  }
  return true;
}

/**
 * A discrete event forces a line through, bypassing the band table: a bot
 * leaving the truck is a physics reason by itself.
 *
 * Nothing is emitted synchronously — everything is queued and comes out of
 * update() on its slot, so there is exactly one emission path in the engine.
 */
export function trigger(d, kind, opts = {}) {
  const u = unlocks(d.memory);
  const events = [];

  if (kind === 'honk') {
    // Past enough honks, one bot stops responding to the horn entirely. No
    // line at all. Silence is funnier than a line.
    const pool = d.lines.filter((l) => l.event === 'honk');
    const alive = [...d.livingCrew].filter((id) => id !== u.honkDeaf);
    if (!alive.length || !pool.length) return events;
    const speaker = alive[Math.floor(d.rng() * alive.length)];
    const line = pickWeighted(pool, d.rng);
    if ((d.lineCooldown[line.id] ?? 0) > d.t) return events;
    const utt = render(d, line, speaker, 'honk');
    scheduleForced(d, utt, line);
    return events;
  }

  // Generic forced events: a bot catching the edge, hauling itself back, or
  // being shaken off on purpose. Each is a physics fact by itself, so it
  // bypasses the band table the same way a drop does.
  if (kind === 'grab' || kind === 'save' || kind === 'shaken') {
    // 'clinger' names the bot this event is ABOUT, so it resolves straight to
    // opts.botId here rather than going through the state vector — by the time
    // a shake is processed they may already be off the truck.
    const pool = d.lines.filter((l) => l.event === kind && (
      l.speaker === opts.botId || l.speaker === 'any'
      || l.speaker === 'crowd' || l.speaker === 'clinger'));
    if (!pool.length) return events;
    const line = pickWeighted(pool, d.rng);
    if ((d.lineCooldown[line.id] ?? 0) > d.t) return events;
    const speaker = line.speaker === 'any' || line.speaker === 'crowd'
      ? resolveSpeaker(d, line, opts.S)
      : opts.botId;
    if (!speaker) return events;
    if (kind !== 'save') events.push({ kind: 'clear' });
    const utt = render(d, line, speaker, kind);
    // Dad has an opinion about what he just did.
    const dad = kind === 'shaken' ? d.lines.find((l) => l.id === 'dad_shake') : null;
    scheduleForced(d, utt, line, dad);
    return events;
  }

  if (kind === 'drop') {
    // A last line from the departing bot, then Dadbot says something unhelpful.
    // The death is recorded here rather than by the caller so that {lastDeath}
    // is already correct for this bot's own final line.
    d.livingCrew.delete(opts.botId);
    recordDeath(d.memory, opts.botId, opts.cause ?? 'unknown', opts);
    const pool = d.lines.filter((l) => l.event === 'death' && l.speaker === opts.botId);
    const dad = d.lines.find((l) => l.id === 'dad_drop') ?? null;
    if (pool.length) {
      const line = pickWeighted(pool, d.rng);
      const utt = render(d, line, opts.botId, 'drop');
      // The report quotes what was actually said, and which line that is comes
      // out of the shuffle-bag right here.
      recordLastWords(d.memory, opts.botId, utt.text);
      events.push({ kind: 'clear' });
      scheduleForced(d, utt, line, dad);
    }
    return events;
  }

  return events;
}

export function activeBands(d) { return d.activeBands; }
