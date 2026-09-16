// ── Levels ───────────────────────────────────────────────────────────────────
//
// Four hauls, each with its own terrain shape, its own grip, and its own
// weather. Difficulty escalates: the Mountain teaches you the truck, the
// Volcano assumes you have already lost a crew learning it.
//
// HOW A LEVEL IS APPLIED, and why it works this way:
// every module imports PHYSICS / TERRAIN / GAME from config.js and reads them
// at call time, so `applyLevel()` deep-merges a level's overrides INTO those
// exported objects in place. Threading a level object through terrain.js,
// truck.js, vector.js, draw.js and main.js would be a large refactor for no
// gameplay gain. The cost is that config is global mutable state — accepted
// knowingly, and the reason `applyLevel()` snapshots the defaults on first use
// so switching levels never compounds the previous level's overrides.

import { GAME, PHYSICS, TERRAIN } from '../config.js';
import { MOUNTAIN } from './mountain.js';
import { DESERT } from './desert.js';
import { STORM } from './storm.js';
import { VOLCANO } from './volcano.js';

export const LEVELS = [MOUNTAIN, DESERT, STORM, VOLCANO];

export function levelById(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0];
}

// The pristine values, captured before anything is merged over them.
const DEFAULTS = {
  PHYSICS: structuredClone(PHYSICS),
  TERRAIN: structuredClone(TERRAIN),
  GAME: structuredClone(GAME),
};

function restore(target, source) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, structuredClone(source));
}

function merge(target, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object'
        && target[k] !== null && !Array.isArray(target[k])) {
      merge(target[k], v);
    } else {
      target[k] = Array.isArray(v) ? structuredClone(v) : v;
    }
  }
}

/**
 * Make `level` the active one. Always resets to defaults first, so loading
 * level 3 then level 1 gives a real level 1 rather than level 1 wearing level
 * 3's ice.
 */
export function applyLevel(level) {
  restore(PHYSICS, DEFAULTS.PHYSICS);
  restore(TERRAIN, DEFAULTS.TERRAIN);
  restore(GAME, DEFAULTS.GAME);
  merge(PHYSICS, level.physics);
  merge(TERRAIN, level.terrain);
  merge(GAME, level.game);
  return level;
}
