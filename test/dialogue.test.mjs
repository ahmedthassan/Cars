// Headless tests for the dialogue engine.
//
// These exist because the rules they check are the ones you cannot eyeball in a
// moving game: whether a band machine-gunned at its boundary, whether a
// cooldown actually held, whether a tie broke by array order. The engine is
// pure functions over a plain state vector, which is what makes this possible.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BANDS, createBandState, updateBands } from '../src/dialogue/bands.js';
import { createDialogue, trigger, update } from '../src/dialogue/engine.js';
import { createMemory, recordHonk } from '../src/dialogue/memory.js';
import { LINES } from '../src/dialogue/lines.js';
import { DIALOGUE } from '../src/config.js';

/** A neutral state vector: nothing is happening. */
function mkS(over = {}) {
  return {
    tilt: 0, tiltRate: 0, speed: 3, accel: 0, airTime: 0, wheelSlip: 0,
    gradient: 0, rollback: false, stalled: false, altitude: 0.3,
    voidDist: 4000, voidLengths: 14, crew: 4, panic: 0, lastEvent: null,
    clinging: 0, clingGrip: 1, clingingIds: [],
    sinceLine: 99, sinceEvent: 99, grounded: true, gas: false,
    landing: false, landingAirTime: 0, x: 1000, summitX: 8900,
    ...over,
  };
}

const DT = 1 / 60;

/** Deterministic rng so "random" choices are reproducible in tests. */
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

function mkDialogue(over = {}) {
  return createDialogue({
    lines: over.lines ?? LINES,
    memory: over.memory ?? createMemory(null),
    rng: over.rng ?? seq([0.5]),
    crew: over.crew ?? ['clank', 'beep', 'rusty', 'pip'],
  });
}

/** Run n frames, collecting every emitted event. */
function run(d, S, seconds) {
  const out = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    out.push(...update(d, typeof S === 'function' ? S(i) : S, DT));
  }
  return out;
}

const linesOf = (events) => events.filter((e) => e.kind === 'line');

// ── Bands ────────────────────────────────────────────────────────────────────

test('a band does not machine-gun at its boundary', () => {
  const st = createBandState();
  // Oscillate right across the 30 deg entry point of tilt_30.
  let toggles = 0;
  let prev = false;
  for (let i = 0; i < 120; i++) {
    const tilt = i % 2 === 0 ? 31 : 29;
    const active = updateBands(st, mkS({ tilt }), DT).includes('tilt_30');
    if (active !== prev) toggles++;
    prev = active;
  }
  // It should latch on once and stay on, not flicker every frame.
  assert.equal(toggles, 1, 'band toggled more than once across its boundary');
});

test('hysteresis is measured in each band\'s own units, not a blanket 6', () => {
  // wheelSlip lives in 0..1. A literal "drops 6 below" would latch forever.
  const st = createBandState();
  const slipOn = mkS({ wheelSlip: 0.6 });
  for (let i = 0; i < 40; i++) updateBands(st, slipOn, DT); // clear the 0.4s sustain
  assert.ok(updateBands(st, slipOn, DT).includes('slip'), 'slip band never opened');

  // Just inside the hysteresis margin (0.55 - 0.12 = 0.43): still active.
  assert.ok(updateBands(st, mkS({ wheelSlip: 0.47 }), DT).includes('slip'));
  // Past it: released. A blanket 6 would make this impossible.
  assert.ok(!updateBands(st, mkS({ wheelSlip: 0.2 }), DT).includes('slip'));
});

test('a band requiring sustain ignores a single noisy frame', () => {
  const st = createBandState();
  // One frame of slip should not open a band that needs 0.4s.
  assert.ok(!updateBands(st, mkS({ wheelSlip: 0.9 }), DT).includes('slip'));
  assert.ok(!updateBands(st, mkS({ wheelSlip: 0 }), DT).includes('slip'));
});

test('every band in the spec table is present with its stated priority', () => {
  const expected = {
    chill: 0, working: 1, slip: 3, stall: 3, rollback: 4, tilt_30: 2, tilt_45: 4,
    tilt_60: 5, air: 4, air_long: 5, near_void: 4, landing: 3, alone: 3, empty: 5, summit: 5,
    cling: 5,   // not in the spec table: added with the clinging mechanic
  };
  assert.equal(BANDS.length, Object.keys(expected).length);
  for (const b of BANDS) assert.equal(b.priority, expected[b.id], `${b.id} priority`);
});

// ── "No line may fire without a physics reason" ───────────────────────────────

test('nothing is said when no band is active', () => {
  const d = mkDialogue();
  // Mid-air-free, flat, gripping, but moving hard enough that even `chill`
  // (which needs low accel and a settled truck) stays shut.
  const events = run(d, mkS({ tilt: 20, accel: 40, gradient: 2 }), 8);
  assert.equal(linesOf(events).length, 0, 'a line fired with no band to justify it');
});

test('every fired line carries the band that justified it', () => {
  const d = mkDialogue({ rng: seq([0.3, 0.7, 0.1, 0.9]) });
  const events = linesOf(run(d, mkS({ tilt: 35, gradient: 20 }), 40));
  assert.ok(events.length > 0, 'expected some lines on a 35 degree slope');
  for (const e of events) {
    assert.ok(e.band, `line "${e.text}" fired with no band`);
  }
});

// ── Cooldowns ────────────────────────────────────────────────────────────────

test('the global cooldown holds between any two lines', () => {
  const d = mkDialogue({ rng: seq([0.2, 0.8, 0.4, 0.6]) });
  const events = linesOf(run(d, mkS({ tilt: 35, gradient: 20 }), 60));
  assert.ok(events.length >= 3, 'not enough lines to test spacing');
  // Dadbot's reply is deliberately exempt (it lands 0.9s after the crew line —
  // that overlap is the gag), so spacing is asserted on crew lines.
  const crew = events.filter((e) => e.speaker !== 'driver');
  for (let i = 1; i < crew.length; i++) {
    const gap = crew[i].at - crew[i - 1].at;
    assert.ok(gap >= DIALOGUE.globalCooldown - 1e-6, `gap ${gap.toFixed(2)}s < 1.1s`);
  }
});

test('a bot does not speak twice inside the per-speaker cooldown', () => {
  const d = mkDialogue({ rng: seq([0.15, 0.45, 0.75, 0.95]) });
  const events = linesOf(run(d, mkS({ tilt: 35, gradient: 20 }), 90));
  const bySpeaker = {};
  for (const e of events) {
    if (e.speaker === 'driver') continue; // replies are exempt, see above
    const prev = bySpeaker[e.speaker];
    if (prev !== undefined) {
      assert.ok(e.at - prev >= DIALOGUE.speakerCooldown - 1e-6,
        `${e.speaker} spoke again after ${(e.at - prev).toFixed(2)}s`);
    }
    bySpeaker[e.speaker] = e.at;
  }
});

// ── Priority ─────────────────────────────────────────────────────────────────

test('priority wins, and array order never does', () => {
  // A low-priority line placed FIRST must lose to a high-priority one after it.
  const lines = [
    { id: 'low', speaker: 'clank', band: 'tilt_30', cooldown: 99, text: ['low'] },
    { id: 'high', speaker: 'rusty', band: 'tilt_60', cooldown: 99, text: ['high'] },
  ];
  const d = mkDialogue({ lines, crew: ['clank', 'rusty'] });
  const first = linesOf(run(d, mkS({ tilt: 70 }), 3))[0];
  assert.equal(first.text, 'high', 'the earlier, lower-priority line won');
  assert.equal(first.priority, 5);
});

test('ties break by weight, not by position in the file', () => {
  const lines = [
    { id: 'a', speaker: 'clank', band: 'tilt_30', cooldown: 0.01, weight: 1, text: ['A'] },
    { id: 'b', speaker: 'beep', band: 'tilt_30', cooldown: 0.01, weight: 9, text: ['B'] },
  ];
  const counts = { A: 0, B: 0 };
  for (let s = 0; s < 60; s++) {
    let n = s;
    const rng = () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
    const d = mkDialogue({ lines, rng, crew: ['clank', 'beep'] });
    const first = linesOf(run(d, mkS({ tilt: 35 }), 2))[0];
    if (first) counts[first.text]++;
  }
  assert.ok(counts.A > 0 && counts.B > 0, `both should appear, got ${JSON.stringify(counts)}`);
  assert.ok(counts.B > counts.A, `weight 9 should win more often, got ${JSON.stringify(counts)}`);
});

// ── Shuffle-bag ──────────────────────────────────────────────────────────────

test('a pool is exhausted before any line repeats', () => {
  const lines = [{
    id: 'pool', speaker: 'clank', band: 'tilt_30', cooldown: 0.01,
    text: ['one', 'two', 'three', 'four'],
  }];
  let n = 7;
  const rng = () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };
  const d = mkDialogue({ lines, rng, crew: ['clank'] });
  const said = linesOf(run(d, mkS({ tilt: 35 }), 60)).map((e) => e.text);
  assert.ok(said.length >= 8, `expected several lines, got ${said.length}`);
  // Each window of 4 must be a permutation of the whole pool.
  for (let i = 0; i + 4 <= Math.floor(said.length / 4) * 4; i += 4) {
    assert.equal(new Set(said.slice(i, i + 4)).size, 4,
      `window ${said.slice(i, i + 4)} repeats before exhausting the pool`);
  }
});

// ── Comedy timing ────────────────────────────────────────────────────────────

test('a priority-4+ line clears the bubbles and holds silence first', () => {
  const lines = [{ id: 'big', speaker: 'clank', band: 'tilt_45', cooldown: 99, text: ['BIG'] }];
  const d = mkDialogue({ lines, crew: ['clank'] });
  const S = mkS({ tilt: 50 });

  const firstFrame = update(d, S, DT);
  assert.ok(firstFrame.some((e) => e.kind === 'clear'), 'expected a clear before the punchline');
  assert.equal(linesOf(firstFrame).length, 0, 'the line landed with no silence before it');

  // Nothing at all during the held silence.
  const during = run(d, S, DIALOGUE.airSilence - 0.1);
  assert.equal(linesOf(during).length, 0, 'something spoke during the silence');

  const after = run(d, S, 0.3);
  assert.equal(linesOf(after)[0]?.text, 'BIG', 'the punchline never landed');
});

test('the silence before a punchline happens EVERY time, not just once', () => {
  // Regression: the gate that stops a held punchline re-holding itself was
  // never re-armed after the first one fired, so every later priority-4 line
  // landed with no silence in front of it.
  const lines = [{
    id: 'big', speaker: 'clank', band: 'tilt_45', cooldown: 0.01,
    text: ['ONE', 'TWO', 'THREE'],
  }];
  const d = mkDialogue({ lines, crew: ['clank'] });
  const S = mkS({ tilt: 50 });

  const events = run(d, S, 30);
  const clears = events.filter((e) => e.kind === 'clear').length;
  const said = linesOf(events).length;
  assert.ok(said >= 3, `expected several punchlines, got ${said}`);
  assert.equal(clears, said, `${said} punchlines but only ${clears} silences before them`);
});

test('an unanswered mid-air callback does not latch out the generic pool', () => {
  // Regression: the callback was only cleared by a matching `answers` line, so
  // an air line whose answer was on cooldown stuck forever and filtered the
  // generic landing pool out of every subsequent landing.
  const lines = [
    { id: 'air', speaker: 'clank', band: 'air_long', cooldown: 99, callback: 'orphan', text: ['up'] },
    { id: 'generic', speaker: 'rusty', band: 'landing', cooldown: 0.01, text: ['down'] },
    // An answer exists for a DIFFERENT callback, so the answers-filter is live.
    { id: 'other', speaker: 'pip', band: 'landing', cooldown: 99, answers: 'somethingelse', text: ['x'] },
  ];
  const d = mkDialogue({ lines, crew: ['clank', 'rusty', 'pip'] });
  run(d, mkS({ airTime: 1.6, grounded: false }), 2);
  const landed = linesOf(run(d, mkS({ airTime: 0, grounded: true, landing: true }), 8));
  assert.ok(landed.some((e) => e.text === 'down'),
    'the generic landing pool was locked out by an unanswered callback');
});

test('going a long way up ducks the SFX, and landing restores it', () => {
  const d = mkDialogue();
  const ducks = run(d, mkS({ airTime: 1.5, grounded: false }), 1)
    .filter((e) => e.kind === 'duck');
  assert.equal(ducks[0]?.amount, 0.25, 'air_long did not duck the audio');

  const restored = run(d, mkS({ airTime: 0, grounded: true }), 1)
    .filter((e) => e.kind === 'duck');
  assert.equal(restored[0]?.amount, 1, 'audio was never restored after landing');
});

test('the landing line answers what was said mid-air', () => {
  const lines = [
    {
      id: 'air', speaker: 'clank', band: 'air_long', cooldown: 99,
      callback: 'forgave', text: ['I want you to know I forgave you.'],
    },
    {
      id: 'ans', speaker: 'rusty', band: 'landing', cooldown: 99,
      answers: 'forgave', text: ["I'm taking that back."],
    },
    {
      id: 'generic', speaker: 'beep', band: 'landing', cooldown: 99,
      text: ['unrelated landing noise'],
    },
  ];
  const d = mkDialogue({ lines, crew: ['clank', 'rusty', 'beep'] });

  const air = linesOf(run(d, mkS({ airTime: 1.6, grounded: false }), 2));
  assert.equal(air[0]?.text, 'I want you to know I forgave you.');

  const landed = linesOf(run(d, mkS({ airTime: 0, grounded: true, landing: true }), 4));
  assert.equal(landed[0]?.text, "I'm taking that back.",
    'the landing line ignored the callback it was supposed to answer');
});

test("Dadbot's reply is 0.9s after the line is HEARD, not after it was held", () => {
  // Regression: a priority-4 line is held for half a second of silence, and
  // the reply used to be scheduled from the moment of holding — so Dad landed
  // 0.4s after the punchline and stepped on it.
  const lines = [
    { id: 'big', speaker: 'clank', band: 'tilt_45', cooldown: 99, text: ['BIG'] },
    { id: 'dad_unhelpful', speaker: 'driver', reply: true, cooldown: 0, text: ["It's got it."] },
  ];
  const d = mkDialogue({ lines, rng: seq([0.05]), crew: ['clank'] });   // 0.05 < 30% → reply fires
  const events = linesOf(run(d, mkS({ tilt: 50 }), 4));
  const punch = events.find((e) => e.text === 'BIG');
  const reply = events.find((e) => e.speaker === 'driver');
  assert.ok(punch && reply, `expected both lines, got ${JSON.stringify(events.map((e) => e.text))}`);
  const beat = reply.at - punch.at;
  assert.ok(Math.abs(beat - DIALOGUE.dadReplyDelay) < 0.05,
    `Dad replied ${beat.toFixed(2)}s after the punchline, expected ${DIALOGUE.dadReplyDelay}s`);
});

// ── Protecting the joke ──────────────────────────────────────────────────────

test('Dadbot never panics while anyone is still aboard', () => {
  const d = mkDialogue({ rng: seq([0.1, 0.9, 0.5, 0.3, 0.7]) });
  // Maximum chaos, but the crew is intact.
  const events = linesOf(run(d, mkS({ tilt: 70, crew: 3, wheelSlip: 0.9, gas: true, speed: -2 }), 120));
  const dadPanic = events.filter((e) => e.speaker === 'driver' && e.tags?.includes('panic'));
  assert.equal(dadPanic.length, 0, 'Dadbot panicked with crew still aboard — that kills the joke');
  assert.ok(events.some((e) => e.speaker !== 'driver'), 'the crew said nothing at 70 degrees');
});

test('Dadbot is allowed to lose it once the crew is gone', () => {
  const d = mkDialogue({ rng: seq([0.5]), crew: [] });
  const events = linesOf(run(d, mkS({ crew: 0, tilt: 5 }), 10));
  assert.ok(events.some((e) => e.speaker === 'driver'),
    'nobody spoke to the empty trailer');
});

// ── Clinging ─────────────────────────────────────────────────────────────────

test('the cling band only opens while someone is actually hanging on', () => {
  const st = createBandState();
  assert.ok(!updateBands(st, mkS(), DT).includes('cling'));
  assert.ok(updateBands(st, mkS({ clinging: 1, clingingIds: ['pip'] }), DT).includes('cling'));
  assert.ok(!updateBands(st, mkS(), DT).includes('cling'), 'cling band latched after they let go');
});

test("the begging comes from the bot actually dangling, not one sitting down", () => {
  const lines = [{
    id: 'beg', speaker: 'clinger', band: 'cling', cooldown: 0.01, text: ['help'],
  }];
  const d = mkDialogue({ lines, rng: seq([0.5]) });
  const said = linesOf(run(d, mkS({ clinging: 1, clingingIds: ['pip'] }), 6));
  assert.ok(said.length > 0, 'the clinger never spoke');
  for (const e of said) assert.equal(e.speaker, 'pip', 'someone else did the begging');
});

test("a bot hanging by one arm is not also doing the commentary", () => {
  const lines = [{
    id: 'crowd', speaker: 'any', band: 'cling', cooldown: 0.01, text: ['observation'],
  }];
  const d = mkDialogue({ lines, rng: seq([0.1, 0.4, 0.7, 0.95]) });
  // Only pip and rusty are left, and pip is the one dangling.
  const d2 = createDialogue({ lines, memory: createMemory(null), rng: seq([0.1, 0.9]), crew: ['pip', 'rusty'] });
  const said = linesOf(run(d2, mkS({ crew: 2, clinging: 1, clingingIds: ['pip'] }), 12));
  assert.ok(said.length > 0, 'nobody commented');
  for (const e of said) {
    assert.notEqual(e.speaker, 'pip', 'the dangling bot narrated its own predicament');
  }
});

test('the desperate pool is gated on the grip actually running out', () => {
  const lines = [
    { id: 'calm', speaker: 'clinger', band: 'cling', cooldown: 0.01,
      when: (S) => S.clingGrip > 0.45, text: ['steady'] },
    { id: 'panic', speaker: 'clinger', band: 'cling', cooldown: 0.01,
      when: (S) => S.clingGrip <= 0.45, text: ['slipping'] },
  ];
  const d = mkDialogue({ lines, crew: ['pip'] });
  const strong = linesOf(run(d, mkS({ clinging: 1, clingingIds: ['pip'], clingGrip: 0.8 }), 6));
  assert.ok(strong.every((e) => e.text === 'steady'), 'panicked at full grip');

  const d2 = mkDialogue({ lines, crew: ['pip'] });
  const weak = linesOf(run(d2, mkS({ clinging: 1, clingingIds: ['pip'], clingGrip: 0.2 }), 6));
  assert.ok(weak.every((e) => e.text === 'slipping'), 'stayed calm on a failing grip');
});

test('honking someone off gets a last line and a Dadbot excuse', () => {
  const d = mkDialogue({ rng: seq([0.5]) });
  trigger(d, 'shaken', { botId: 'pip', S: mkS({ clingingIds: ['pip'] }) });
  const said = linesOf(run(d, mkS({ crew: 3 }), DIALOGUE.dadReplyDelay + 1.5));
  assert.equal(said[0]?.speaker, 'pip', 'the bot being shaken off said nothing');
  assert.ok(said.some((e) => e.speaker === 'driver'),
    'Dadbot had nothing to say about what he just did');
});

test('catching the edge and climbing back both get their own line', () => {
  const d = mkDialogue({ rng: seq([0.5]) });
  trigger(d, 'grab', { botId: 'rusty', S: mkS({ clingingIds: ['rusty'] }) });
  const grab = linesOf(run(d, mkS({ clinging: 1, clingingIds: ['rusty'] }), 1.5));
  assert.equal(grab[0]?.speaker, 'rusty');
  assert.equal(grab[0]?.band, 'grab');

  d.t += 30;
  trigger(d, 'save', { botId: 'rusty', S: mkS() });
  const save = linesOf(run(d, mkS(), 1.5));
  assert.ok(save.length >= 1, 'climbing back aboard passed without comment');
});

// ── Memory ───────────────────────────────────────────────────────────────────

test('past enough honks, one bot answers the horn with silence', () => {
  const memory = createMemory(null);
  const d = mkDialogue({ memory, rng: seq([0.01]) });
  for (let i = 0; i < DIALOGUE.honkDesensitiseAt + 2; i++) recordHonk(memory);

  // rng 0.01 always selects the first eligible speaker, so the desensitised bot
  // would be chosen if it were still in the pool.
  const speakers = new Set();
  for (let i = 0; i < 40; i++) {
    d.t += 10; // clear cooldowns between honks
    trigger(d, 'honk', { S: mkS() });
    // Only the honk reactions matter here — the bands fire their own lines too.
    for (const e of run(d, mkS(), 1.4)) {
      if (e.kind === 'line' && e.band === 'honk') speakers.add(e.speaker);
    }
  }
  const deaf = 'clank'; // deterministic: honks % pool length
  assert.ok(!speakers.has(deaf), `${deaf} should have stopped responding to the horn`);
  assert.ok(speakers.size > 0, 'nobody responded to the horn at all');
});

test('a bot leaving gets a last line, then Dadbot says something unhelpful', () => {
  const d = mkDialogue({ rng: seq([0.5]) });
  trigger(d, 'drop', { botId: 'pip' });
  const said = linesOf(run(d, mkS({ crew: 3 }), DIALOGUE.dadReplyDelay + 2));
  assert.equal(said[0]?.speaker, 'pip', 'the departing bot got no last line');
  assert.ok(said.some((e) => e.speaker === 'driver'), 'Dadbot said nothing about it');
});

test('a pile-up of forced events still respects the 1.1s spacing', () => {
  // Regression: four bots coming off inside a second used to emit four lines
  // on the same frame, which reads as noise rather than as a scene.
  const d = mkDialogue({ rng: seq([0.5]) });
  for (const id of ['clank', 'beep', 'rusty', 'pip']) {
    trigger(d, 'drop', { botId: id });
  }
  const said = linesOf(run(d, mkS({ crew: 0 }), 20));
  const deaths = said.filter((e) => e.band === 'drop' && e.speaker !== 'driver');
  assert.equal(deaths.length, 4, 'not every bot got a last line');
  for (let i = 1; i < deaths.length; i++) {
    const gap = deaths[i].at - deaths[i - 1].at;
    assert.ok(gap >= DIALOGUE.globalCooldown - 1e-6,
      `two last lines only ${gap.toFixed(2)}s apart`);
  }
});

test('memory tokens are interpolated into the text that reaches the screen', () => {
  const memory = createMemory(null);
  const lines = [{
    id: 'named', speaker: 'clank', band: 'alone', cooldown: 99,
    text: ['{lastDeath} would have loved this.'],
  }];
  const d = mkDialogue({ lines, memory, crew: ['clank'] });
  trigger(d, 'drop', { botId: 'rusty' });   // records the death itself
  const said = linesOf(run(d, mkS({ crew: 1 }), 4));
  assert.equal(said.find((e) => e.id === 'named')?.text, 'Rusty would have loved this.');
});

// ── Content sanity ───────────────────────────────────────────────────────────

test('the shipped content is well formed', () => {
  const ids = new Set();
  const bandIds = new Set(BANDS.map((b) => b.id));
  for (const l of LINES) {
    assert.ok(!ids.has(l.id), `duplicate line id ${l.id}`);
    ids.add(l.id);
    assert.ok(Array.isArray(l.text) && l.text.length > 0, `${l.id} has no text`);
    // A pool must be reachable: a band (physics reason), an event, or a
    // reply pool the engine queues itself. Anything else is dead content —
    // or worse, fires with no physics reason behind it.
    assert.ok(l.band || l.event || l.reply,
      `${l.id} has no band, event or reply flag — it can never fire`);
    if (l.band) assert.ok(bandIds.has(l.band), `${l.id} references unknown band ${l.band}`);
    for (const t of l.text) assert.equal(typeof t, 'string');
  }
  // Every callback an air line sets up must have at least one answer.
  const answers = new Set(LINES.filter((l) => l.answers).map((l) => l.answers));
  for (const l of LINES.filter((x) => x.callback)) {
    assert.ok(answers.has(l.callback), `air callback "${l.callback}" has no landing answer`);
  }
});
