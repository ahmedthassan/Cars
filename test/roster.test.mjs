// Tests for the viral layer: renamed crew, incident records, and the report
// text people actually paste to each other.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_NAME, _setStore, anyRenamed, nameOf, resetNames, roster, sanitise, setName,
} from '../src/roster.js';
import {
  blameTable, createMemory, interpolate, recordDeath, recordLastWords,
} from '../src/dialogue/memory.js';
import { createDialogue, trigger } from '../src/dialogue/engine.js';
import { LINES } from '../src/dialogue/lines.js';
import { reportText } from '../src/ui/report.js';

/** A localStorage stand-in, so persistence is testable without a browser. */
function fakeStore() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    _data: data,
  };
}

test.beforeEach(() => { _setStore(null); resetNames(); });

// ── Names ────────────────────────────────────────────────────────────────────

test('names are trimmed, collapsed and capped', () => {
  assert.equal(sanitise('  Big   Mike  '), 'Big Mike');
  assert.equal(sanitise('Bartholomew Fitzgerald III').length, MAX_NAME);
  assert.equal(sanitise(null), '');
  assert.equal(sanitise(12345), '');
});

test('the cap counts code points, so emoji names are not cut in half', () => {
  // Slicing at MAX_NAME on .length would split a surrogate pair and render a
  // replacement glyph. People will absolutely use emoji here.
  const out = sanitise('🤖'.repeat(30));
  assert.equal([...out].length, MAX_NAME);
  assert.ok(!out.includes('�'), 'a surrogate pair was cut in half');
});

test('control characters in a pasted name do not survive', () => {
  const nasty = `Da${String.fromCharCode(7)}ve${String.fromCharCode(10)}`;
  assert.equal(sanitise(nasty), 'Da ve');
});

test('clearing a name restores the original rather than leaving it blank', () => {
  setName('pip', 'Ahmed');
  assert.equal(nameOf('pip'), 'Ahmed');
  assert.equal(setName('pip', '   '), 'Pip');
  assert.equal(nameOf('pip'), 'Pip');
});

test('the driver can be renamed too', () => {
  setName('driver', 'DAD');
  assert.equal(nameOf('driver'), 'DAD');
});

test('names persist and come back', () => {
  const store = fakeStore();
  _setStore(store);
  setName('clank', 'Sarah');
  setName('beep', 'Big Mike');
  assert.ok(anyRenamed());

  // A fresh load of the same storage is what a page reload looks like.
  _setStore(store);
  assert.equal(nameOf('clank'), 'Sarah');
  assert.equal(nameOf('beep'), 'Big Mike');
  assert.equal(nameOf('rusty'), 'Rusty', 'an untouched bot should keep its default');
});

test('a corrupt stored roster degrades to defaults instead of throwing', () => {
  const store = fakeStore();
  store.setItem('robot-haul.roster.v1', '{not json');
  _setStore(store);
  assert.deepEqual(roster().map((r) => r.name), ['Clank', 'Beep', 'Rusty', 'Pip']);
});

test('renaming reaches the dialogue tokens, not just the bodies', () => {
  // The reason the roster exists: name lookups used to be cached at import
  // time, which left the dialogue using an old name after a rename.
  setName('rusty', 'Priya');
  const memory = createMemory(null);
  const d = createDialogue({ lines: LINES, memory, rng: () => 0.5, crew: ['rusty', 'pip'] });
  trigger(d, 'drop', { botId: 'rusty', cause: 'void' });
  // The REAL interpolate, not a stand-in — the whole point is that the shipped
  // token substitution picks up the rename.
  assert.equal(interpolate('{lastDeath} would have loved this.', memory),
    'Priya would have loved this.');
  assert.equal(interpolate('{firstDeath} started it.', memory), 'Priya started it.');
});

// ── Incidents ────────────────────────────────────────────────────────────────

test('an incident records order, a named cause and the real last words', () => {
  const memory = createMemory(null);
  const d = createDialogue({ lines: LINES, memory, rng: () => 0.5, crew: ['clank', 'pip'] });

  trigger(d, 'drop', { botId: 'pip', cause: 'void', altitude: 0.42 });
  trigger(d, 'drop', { botId: 'clank', cause: 'shaken', altitude: 0.77 });

  assert.equal(memory.incidents.length, 2);
  assert.deepEqual(memory.incidents.map((i) => i.order), [1, 2]);
  assert.equal(memory.incidents[0].label, 'Into The Void');
  assert.equal(memory.incidents[1].label, 'Honked Off On Purpose');
  for (const i of memory.incidents) {
    assert.ok(i.quote && i.quote.length > 0, `${i.botId} has no recorded last words`);
  }
});

test('the quote is what was actually said, not a guess', () => {
  const memory = createMemory(null);
  const pool = LINES.find((l) => l.id === 'death_pip');
  const d = createDialogue({ lines: LINES, memory, rng: () => 0.5, crew: ['pip'] });
  trigger(d, 'drop', { botId: 'pip', cause: 'road' });
  assert.ok(pool.text.includes(memory.incidents[0].quote),
    'the recorded quote is not one of the lines that bot can say');
});

test('a deliberate honk costs the driver more blame than an accident', () => {
  const accident = createMemory(null);
  recordDeath(accident, 'pip', 'road');
  const onPurpose = createMemory(null);
  recordDeath(onPurpose, 'pip', 'shaken');

  const a = blameTable(accident).find((b) => b.who === 'driver').pct;
  const b = blameTable(onPurpose).find((b) => b.who === 'driver').pct;
  assert.ok(b > a, `shaking someone off should cost more blame (${b}% vs ${a}%)`);
});

test('blame percentages are ordered and sum to roughly 100', () => {
  const m = createMemory(null);
  recordDeath(m, 'pip', 'road');
  recordDeath(m, 'clank', 'void');
  const table = blameTable(m);
  assert.ok(table.length >= 2);
  for (let i = 1; i < table.length; i++) {
    assert.ok(table[i - 1].pct >= table[i].pct, 'blame is not sorted highest first');
  }
  const total = table.reduce((s, b) => s + b.pct, 0);
  assert.ok(Math.abs(total - 100) <= 2, `blame totals ${total}%`);
});

// ── The shareable text ───────────────────────────────────────────────────────

test('the shared report uses the names the player typed', () => {
  setName('pip', 'Ahmed');
  setName('driver', 'DAD');
  const memory = createMemory(null);
  recordDeath(memory, 'pip', 'void', { altitude: 0.42 });
  recordLastWords(memory, 'pip', 'I said I was too small!');

  const text = reportText({
    memory, survivors: ['clank'], title: 'Core dumped', detail: 'Into the void.',
  });

  assert.ok(text.includes('Ahmed'), 'the renamed bot is missing from the report');
  assert.ok(!text.includes('Pip'), 'the report still shows the default name');
  assert.ok(text.includes('Into The Void'), 'the cause is not named');
  assert.ok(text.includes('at 42%'), 'the altitude is missing');
  assert.ok(text.includes('I said I was too small!'), 'the final quote is missing');
  assert.ok(text.includes('DAD'), 'the renamed driver is missing from the blame line');
  assert.ok(text.includes('Clank'), 'survivors are missing');
});

test('a clean run still produces a report worth sending', () => {
  const memory = createMemory(null);
  const text = reportText({
    memory, survivors: ['clank', 'beep', 'rusty', 'pip'],
    title: 'Summit.exe succeeded', detail: 'Everyone made it.',
  });
  assert.ok(text.includes('No incidents'));
  assert.ok(text.includes('Still aboard'));
});
