// ── The crew roster ──────────────────────────────────────────────────────────
//
// The single runtime source of truth for who is on the truck and what they are
// called. Renaming is the distribution channel for this game — players type
// their friends' names in, screenshot the Incident Report and send it — so the
// names have to be live, not baked in at module load.
//
// That is the whole reason this module exists. Before it, `memory.js` and
// `hud.js` each built a `{id: name}` map once at import time from
// config.ROBOTS. The moment a name became editable those maps were stale, and
// the game would have shown the new name on the truck and the old one in the
// dialogue.

import { DRIVER, ROBOTS } from './config.js';

const KEY = 'robot-haul.roster.v1';
export const MAX_NAME = 12;      // longer than this stops fitting on a bot body

function safeStore() {
  try {
    if (typeof localStorage === 'undefined') return null;
    localStorage.getItem(KEY);
    return localStorage;
  } catch {
    return null;
  }
}

let store = safeStore();
let custom = load();

function load() {
  if (!store) return {};
  try {
    const raw = JSON.parse(store.getItem(KEY) || '{}');
    const out = {};
    for (const [id, v] of Object.entries(raw)) {
      const clean = sanitise(v);
      if (clean) out[id] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

function persist() {
  if (!store) return;
  try { store.setItem(KEY, JSON.stringify(custom)); } catch { /* private mode */ }
}

/**
 * Names are typed by hand on a phone, so they arrive with stray whitespace,
 * pasted newlines and the odd control character. Collapse the whitespace and
 * cap the length — a forty-character name turns the bot into an unreadable
 * smear and overflows the report.
 *
 * The cap counts CODE POINTS, not UTF-16 units: slicing a string of emoji at
 * twelve `.length` would cut a surrogate pair in half and render a replacement
 * glyph, and people absolutely will name their friends with emoji.
 */
export function sanitise(input) {
  if (typeof input !== 'string') return '';
  const stripped = input
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...stripped].slice(0, MAX_NAME).join('');
}

/** Every crew member, with the name actually in force right now. */
export function roster() {
  return ROBOTS.map((r) => ({ ...r, name: custom[r.id] || r.name, renamed: !!custom[r.id] }));
}

/** Display name for any speaker id, the driver included. */
export function nameOf(id) {
  if (id === DRIVER.id) return custom[DRIVER.id] || DRIVER.name;
  const base = ROBOTS.find((r) => r.id === id);
  return custom[id] || base?.name || id;
}

export function colorOf(id) {
  if (id === DRIVER.id) return DRIVER.color;
  return ROBOTS.find((r) => r.id === id)?.color || '#ffffff';
}

/** Returns the name that actually stuck, so callers can show the trimmed form. */
export function setName(id, value) {
  const clean = sanitise(value);
  const base = id === DRIVER.id ? DRIVER : ROBOTS.find((r) => r.id === id);
  if (!base) return null;
  // Clearing the field puts the original name back rather than leaving a
  // nameless bot on the trailer.
  if (!clean || clean === base.name) delete custom[id];
  else custom[id] = clean;
  persist();
  return nameOf(id);
}

export function resetNames() {
  custom = {};
  persist();
}

export function anyRenamed() {
  return Object.keys(custom).length > 0;
}

/** Test seam: lets the suite run without a DOM. */
export function _setStore(s) {
  store = s;
  custom = load();
}
