// ── Memory & callbacks ────────────────────────────────────────────────────────
// The session log. This is what makes the dialogue feel written rather than
// sampled: lines can name who died, count the bodies, and change pools based on
// what happened in *previous* runs.

import { DIALOGUE, ROBOTS } from '../config.js';

const KEY = 'robot-haul.memory.v1';

/** localStorage is optional — absent in Node, and can throw in private mode. */
function safeStore() {
  try {
    if (typeof localStorage === 'undefined') return null;
    localStorage.getItem(KEY);
    return localStorage;
  } catch {
    return null;
  }
}

export function createMemory(store = safeStore()) {
  const persisted = loadPersisted(store);
  return {
    deaths: [],          // in order
    lastDeath: null,
    blame: { driver: 0 },
    honks: 0,
    flips: 0,
    runsSurvived: persisted.runsSurvived || {},
    diedLastRun: persisted.diedLastRun || {},
    store,
  };
}

function loadPersisted(store) {
  if (!store) return {};
  try {
    return JSON.parse(store.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function persist(m) {
  if (!m.store) return;
  try {
    m.store.setItem(KEY, JSON.stringify({
      runsSurvived: m.runsSurvived,
      diedLastRun: m.diedLastRun,
    }));
  } catch { /* private mode: the jokes just don't carry over */ }
}

export function recordDeath(m, botId, cause = 'unknown') {
  m.deaths.push(botId);
  m.lastDeath = botId;
  m.blame[botId] = (m.blame[botId] || 0) + 1;
  // Driving is, on balance, Dadbot's fault.
  m.blame.driver = (m.blame.driver || 0) + 1;
  m.lastCause = cause;
}

export function recordHonk(m) { m.honks += 1; }
export function recordFlip(m) { m.flips += 1; }

/** Called at the end of a run so the next one can reference it. */
export function closeRun(m, survivors) {
  const died = {};
  for (const id of m.deaths) died[id] = (died[id] || 0) + 1;
  m.diedLastRun = died;
  for (const id of survivors) {
    m.runsSurvived[id] = (m.runsSurvived[id] || 0) + 1;
  }
  persist(m);
}

/**
 * Which special pools are unlocked right now.
 *  - Clank gets arrogant once he has survived enough runs.
 *  - Beep comes back "repaired" and passive-aggressive after dying twice.
 *  - Past a honk count, one bot stops responding to the horn ENTIRELY. The
 *    engine returns no line at all for them — silence is the punchline, so it
 *    is a real branch, not an empty string.
 */
export function unlocks(m) {
  return {
    arrogant: (m.runsSurvived.clank || 0) >= DIALOGUE.arroganceRuns ? 'clank' : null,
    repaired: (m.diedLastRun.beep || 0) >= 2 ? 'beep' : null,
    honkDeaf: m.honks > DIALOGUE.honkDesensitiseAt ? honkDeafBot(m) : null,
  };
}

/** Deterministic so the same run always desensitises the same bot. */
function honkDeafBot(m) {
  const alive = ROBOTS.map((r) => r.id).filter((id) => !m.deaths.includes(id));
  const pool = alive.length ? alive : ROBOTS.map((r) => r.id);
  return pool[m.honks % pool.length];
}

const NAMES = Object.fromEntries(ROBOTS.map((r) => [r.id, r.name]));

/** Fill {lastDeath}, {deathCount}, {firstDeath}, {honks} in a line. */
export function interpolate(text, m) {
  return text.replace(/\{(\w+)\}/g, (whole, token) => {
    switch (token) {
      case 'lastDeath':  return NAMES[m.lastDeath] || 'somebody';
      case 'firstDeath': return NAMES[m.deaths[0]] || 'somebody';
      case 'deathCount': return String(m.deaths.length);
      case 'honks':      return String(m.honks);
      case 'flips':      return String(m.flips);
      default:           return whole;
    }
  });
}
