// ── Progression ──────────────────────────────────────────────────────────────
// Which levels are unlocked, the best result on each, and which one you were
// last playing. Same defensive storage pattern as roster.js and memory.js: a
// browser can refuse localStorage outright, and losing your progress should
// never take the game down with it.

import { LEVELS } from './levels/index.js';

const KEY = 'robot-haul.progress.v1';

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
let data = load();

function load() {
  const blank = { beaten: {}, best: {}, current: LEVELS[0].id };
  if (!store) return blank;
  try {
    return { ...blank, ...JSON.parse(store.getItem(KEY) || '{}') };
  } catch {
    return blank;
  }
}

function persist() {
  if (!store) return;
  try { store.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

/**
 * Levels unlock in order: beating one opens the next. The first is always
 * available, so a cleared or unavailable store still gives a playable game
 * rather than a locked-out one.
 */
export function isUnlocked(levelId) {
  const i = LEVELS.findIndex((l) => l.id === levelId);
  if (i <= 0) return true;
  return !!data.beaten[LEVELS[i - 1].id];
}

export function isBeaten(levelId) {
  return !!data.beaten[levelId];
}

/** Best run on a level: most crew brought home, and how far when that happened. */
export function bestFor(levelId) {
  return data.best[levelId] || null;
}

export function currentLevelId() {
  const id = data.current;
  return LEVELS.some((l) => l.id === id) && isUnlocked(id) ? id : LEVELS[0].id;
}

export function setCurrentLevel(levelId) {
  data.current = levelId;
  persist();
}

/**
 * Record how a run ended. `won` unlocks the next level; the best entry keeps
 * the most crew you ever finished with, breaking ties on distance.
 */
export function recordResult(levelId, { won, crew, altitude }) {
  if (won) data.beaten[levelId] = true;
  const prev = data.best[levelId];
  const better = !prev
    || crew > prev.crew
    || (crew === prev.crew && altitude > prev.altitude);
  if (better) data.best[levelId] = { crew, altitude, won: won || !!prev?.won };
  persist();
}

/** The next level to offer after a win, or null if that was the last one. */
export function nextLevelId(levelId) {
  const i = LEVELS.findIndex((l) => l.id === levelId);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1].id : null;
}

export function resetProgress() {
  data = { beaten: {}, best: {}, current: LEVELS[0].id };
  persist();
}

/** Test seam, matching roster.js. */
export function _setStore(s) {
  store = s;
  data = load();
}
