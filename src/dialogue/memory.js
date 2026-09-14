// ── Memory & callbacks ────────────────────────────────────────────────────────
// The session log. This is what makes the dialogue feel written rather than
// sampled: lines can name who died, count the bodies, and change pools based on
// what happened in *previous* runs.

import { DIALOGUE, ROBOTS } from '../config.js';
import { nameOf } from '../roster.js';

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

/**
 * Named causes of death. The spec asks for the cause to be NAMED on the
 * Incident Report, not described — "Into The Void" is a thing you screenshot,
 * "fell off at x=6400" is not.
 */
export const CAUSES = {
  void:    'Into The Void',
  road:    'Off The Trailer',
  grip:    'Lost Their Grip',
  shaken:  'Honked Off On Purpose',
  flip:    'Under The Truck',
  unknown: 'Unexplained',
};

export function createMemory(store = safeStore()) {
  const persisted = loadPersisted(store);
  return {
    deaths: [],          // in order
    incidents: [],       // the full record behind each one
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

export function recordDeath(m, botId, cause = 'unknown', extra = {}) {
  m.deaths.push(botId);
  m.lastDeath = botId;
  m.blame[botId] = (m.blame[botId] || 0) + 1;
  // Driving is, on balance, Dadbot's fault.
  m.blame.driver = (m.blame.driver || 0) + 1;
  // Shaking someone off the side with the horn is not an accident, and the
  // blame split should say so.
  if (cause === 'shaken') m.blame.driver += 2;
  m.lastCause = cause;

  m.incidents.push({
    order: m.incidents.length + 1,
    botId,
    cause,
    label: CAUSES[cause] || CAUSES.unknown,
    quote: null,                       // filled in when their last line renders
    altitude: extra.altitude ?? null,
    t: extra.t ?? null,
  });
}

/**
 * Attach the line the bot actually said on the way out.
 *
 * The quote cannot be decided up front: which line fires comes out of the
 * shuffle-bag at render time, so the report has to be told what was really
 * said rather than reconstructing something plausible.
 */
export function recordLastWords(m, botId, text) {
  for (let i = m.incidents.length - 1; i >= 0; i--) {
    if (m.incidents[i].botId === botId && m.incidents[i].quote === null) {
      m.incidents[i].quote = text;
      return;
    }
  }
}

/**
 * Blame as percentages, highest first. Everyone who contributed appears — the
 * bots get a share for falling off, and Dadbot gets one for every departure,
 * because he was driving.
 */
export function blameTable(m) {
  const total = Object.values(m.blame).reduce((a, b) => a + b, 0);
  if (!total) return [];
  return Object.entries(m.blame)
    .filter(([, n]) => n > 0)
    .map(([who, n]) => ({ who, pct: Math.round((n / total) * 100) }))
    .sort((a, b) => b.pct - a.pct || a.who.localeCompare(b.who));
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

/**
 * Fill {lastDeath}, {deathCount}, {firstDeath}, {honks} in a line.
 *
 * Names are resolved through the roster on every call rather than from a map
 * built at import time: players rename the crew to their friends, and a cached
 * map would leave the dialogue calling someone by their old name.
 */
export function interpolate(text, m) {
  return text.replace(/\{(\w+)\}/g, (whole, token) => {
    switch (token) {
      case 'lastDeath':  return m.lastDeath ? nameOf(m.lastDeath) : 'somebody';
      case 'firstDeath': return m.deaths[0] ? nameOf(m.deaths[0]) : 'somebody';
      case 'deathCount': return String(m.deaths.length);
      case 'honks':      return String(m.honks);
      case 'flips':      return String(m.flips);
      default:           return whole;
    }
  });
}
