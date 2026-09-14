// ── Boot & game loop ──────────────────────────────────────────────────────────
import { DIALOGUE, DRIVER, GAME, PHYSICS, ROBOTS, TERRAIN } from './config.js';
import { createWorld } from './physics/world.js';
import { buildHeightmap, buildTerrainBodies, groundY } from './physics/terrain.js';
import {
  applyDrive, createTruck, honk, isFlipped, shakeClingers, stabiliseInAir,
  startCling, tiltDegrees, trackContacts, updateCling,
} from './physics/truck.js';
import { clearLanding, createSampler, markEvent, noteLine, sample } from './state/vector.js';
import { createDialogue, trigger, update as stepDialogue } from './dialogue/engine.js';
import { LINES } from './dialogue/lines.js';
import { closeRun, createMemory, recordFlip, recordHonk } from './dialogue/memory.js';
import {
  createCamera, drawBots, drawParallax, drawSky, drawTerrain, drawTruck, updateCamera,
} from './render/draw.js';
import {
  clearBubbles, createHud, drawBubbles, drawDebug, drawStatus, say, updateHud,
} from './render/hud.js';
import {
  duck, honkSound, impactSound, initAudio, resumeAudio, updateEngine,
} from './audio/sfx.js';
import {
  exitApp, haptic, impactHaptic, initPlatform, isNative, onAppActive,
  onBackButton, reacquireWakeLock, safeAreaInsets,
} from './platform/native.js';
import { renderCrew, resetCrew } from './ui/crew.js';
import { renderReport, reportText, shareReport } from './ui/report.js';
import { roster } from './roster.js';

const Matter = window.Matter;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// roundRect landed in Chrome 99 / Safari 16.4. Cheap guard so an older phone
// renders the game instead of a blank canvas.
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rr = Math.min(typeof r === 'number' ? r : 4, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}

const input = { gas: false, brake: false };
const hud = createHud();
const memory = createMemory();
let game = null;

let dpr = 1;
let insets = { top: 0, right: 0, bottom: 0, left: 0 };

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  // A notch or home indicator sits on top of the HUD in landscape, and the HUD
  // is drawn into the canvas, so CSS env() has to be measured in device pixels.
  insets = safeAreaInsets(dpr);
}
window.addEventListener('resize', resize);
resize();

function newRun() {
  const { engine, world } = createWorld(Matter);
  const heightmap = buildHeightmap();
  Matter.Composite.add(world, buildTerrainBodies(Matter, heightmap));

  const startX = 200;
  const truck = createTruck(Matter, startX, groundY(heightmap, startX) - 80, roster());
  Matter.Composite.add(world, truck.composite);
  trackContacts(Matter, engine, truck);

  // Landing thump, scaled by how hard it was.
  Matter.Events.on(engine, 'collisionStart', (e) => {
    for (const p of e.pairs) {
      const other = p.bodyA.label === 'ground' ? p.bodyB : p.bodyA.label === 'ground' ? p.bodyA : null;
      if (!other) continue;
      const v = Math.hypot(other.velocity.x, other.velocity.y);
      if (v > 4) {
        impactSound(Math.min(1, v / 16));
        impactHaptic(Math.min(1, v / 16));
        game.camera.shake = Math.min(1, v / 22);
        // A hard landing costs anyone hanging on. Slamming down on someone's
        // fingers should not be free.
        shakeClingers(game.truck, PHYSICS.clingSlamDrain * v);
      }
    }
  });

  return {
    engine,
    world,
    heightmap,
    truck,
    sampler: createSampler(),
    dialogue: createDialogue({ lines: LINES, memory, crew: ROBOTS.map((r) => r.id) }),
    camera: createCamera(),
    over: null,
    paused: false,
    flippedFor: 0,
    stuckFor: 0,
    bestX: 0,
    noProgressFor: 0,
    S: null,
    started: false,
  };
}

function handleEvents(events, S) {
  for (const e of events) {
    if (e.kind === 'clear') { clearBubbles(hud); continue; }
    if (e.kind === 'duck') { duck(e.amount); continue; }
    if (e.kind === 'line') { say(hud, e); noteLine(game.sampler); }
  }
}

function loseBot(b, cause, S) {
  b.lost = true;
  b.aboard = false;
  b.clinging = false;
  game.sampler.panic = Math.min(1, game.sampler.panic + GAME.dropPanic);
  haptic('drop');
  markEvent(game.sampler, 'drop');
  handleEvents(trigger(game.dialogue, 'drop', {
    botId: b.botId, cause, altitude: S?.altitude ?? null, t: game.dialogue.t,
  }), S);
  // Remove once well off screen so the physics stays cheap.
  setTimeout(() => Matter.Composite.remove(game.world, b), 3000);
}

function checkBots(S) {
  const { truck, dialogue } = game;

  // Grip first: anyone already hanging either climbs back or lets go.
  const { lost, recovered } = updateCling(Matter, game.world, truck, S, 1 / 60);
  for (const { botId, cause } of lost) {
    const b = truck.bots.find((x) => x.botId === botId);
    if (b) loseBot(b, cause, S);
  }
  for (const id of recovered) {
    markEvent(game.sampler, 'save');
    handleEvents(trigger(dialogue, 'save', { botId: id }), S);
  }

  for (const b of truck.bots) {
    if (b.lost || b.clinging) continue;
    const dx = b.position.x - truck.trailer.position.x;
    const dy = b.position.y - truck.trailer.position.y;
    const dist = Math.hypot(dx, dy);
    const far = dist > 240;
    const below = b.position.y > truck.cab.position.y + 260;
    if (!far && !below) continue;

    // One chance to catch the edge. Falling straight down past the trailer is
    // already too far gone to grab anything.
    const catchable = dist < 330 && b.position.y < truck.cab.position.y + 300;
    if (catchable && Math.random() < PHYSICS.clingChance) {
      startCling(Matter, game.world, truck, b);
      haptic('medium');
      markEvent(game.sampler, 'grab');
      handleEvents(trigger(dialogue, 'grab', { botId: b.botId }), S);
      continue;
    }
    loseBot(b, below ? 'void' : 'road', S);
  }
}

function checkEnd(S) {
  if (game.over) return;
  const { truck } = game;
  const crew = truck.bots.filter((b) => !b.lost).length;

  if (isFlipped(truck)) {
    game.flippedFor += 1 / 60;
    if (game.flippedFor > 1.6) {
      recordFlip(memory);
      return end('Core dumped', 'The truck is on its roof. That is not a driving position.');
    }
  } else game.flippedFor = 0;

  // Stood on its tail (or its nose) and going nowhere. Without this the run
  // never ends — it just rocks gently at 87 degrees forever.
  if (Math.abs(tiltDegrees(truck)) > GAME.stuckTilt && Math.abs(S.speed) < 0.5) {
    game.stuckFor += 1 / 60;
    if (game.stuckFor > GAME.stuckTime) {
      recordFlip(memory);
      return end('Core dumped', `Vertical. Stationary. ${Math.round(Math.abs(S.tilt))}° and going nowhere.`);
    }
  } else game.stuckFor = 0;

  // Last-resort guard against any other wedge: no ground gained at all.
  if (truck.cab.position.x > game.bestX + 12) {
    game.bestX = truck.cab.position.x;
    game.noProgressFor = 0;
  } else {
    game.noProgressFor += 1 / 60;
    if (game.noProgressFor > GAME.noProgressTime) {
      return end('Core dumped', 'The hill won. You have not moved for a while now.');
    }
  }

  // Into the void: below the deepest ground with no road under you.
  if (truck.cab.position.y > 1400) {
    return end('Core dumped', 'You drove into the void. The void was clearly marked.');
  }
  if (crew === 0 && truck.cab.position.x < TERRAIN.summitX) {
    if (!game.emptySince) game.emptySince = performance.now();
    else if (performance.now() - game.emptySince > 4200) {
      return end('Core dumped', 'Everyone yeeted. Dadbot is still driving. Dadbot has not noticed.');
    }
  }
  if (truck.cab.position.x >= TERRAIN.summitX) {
    if (crew >= GAME.winCrew) {
      return end('Summit.exe succeeded', `Reached the top with ${crew} aboard. ${memory.deaths.length} did not make it.`);
    }
    return end('Core dumped', `Summited with ${crew} aboard. You needed ${GAME.winCrew}. Technically a delivery failure.`);
  }
}

function end(title, detail) {
  const won = title.startsWith('Summit');
  haptic(won ? 'win' : 'heavy');
  // The splash can still be up if the run ended without a tap; it must not
  // show through the end card.
  document.getElementById('tapstart')?.setAttribute('hidden', '');
  document.getElementById('pausecard').hidden = true;

  const survivors = game.truck.bots.filter((b) => !b.lost).map((b) => b.botId);
  closeRun(memory, survivors);
  game.over = { title, detail, survivors };

  const titleEl = document.getElementById('endtitle');
  titleEl.textContent = title;
  titleEl.classList.toggle('win', won);
  document.getElementById('enddetail').textContent = detail;
  renderReport(document.getElementById('reportbody'), { memory, survivors });
  document.getElementById('sharenote').textContent = '';
  document.getElementById('endcard').hidden = false;
}

// ── Crew screen ──────────────────────────────────────────────────────────────
function openCrew() {
  // Pause the world, but hide the pause card while doing it — otherwise it
  // shows through behind the crew sheet, which is two overlays deep and reads
  // as a rendering bug.
  if (game && !game.over) setPaused(true);
  document.getElementById('pausecard').hidden = true;
  renderCrew(document.getElementById('crewlist'), refreshNames);
  document.getElementById('tapstart')?.setAttribute('hidden', '');
  document.getElementById('crewcard').hidden = false;
}

function closeCrew() {
  document.getElementById('crewcard').hidden = true;
  // Renaming from the end card should drop you into a fresh run with the new
  // names rather than back onto a finished one.
  if (game?.over) restart();
  else { document.getElementById('pausecard').hidden = true; setPaused(false); }
  firstGesture();
}

/**
 * Names are resolved live everywhere they are drawn, so a rename needs nothing
 * more than a redraw — except the end card, which is static HTML already on
 * screen and has to be rebuilt.
 */
function refreshNames() {
  if (game?.over && !document.getElementById('endcard').hidden) {
    renderReport(document.getElementById('reportbody'), {
      memory, survivors: game.over.survivors || [],
    });
  }
}

// ── Input ─────────────────────────────────────────────────────────────────────
let platformReady = false;

function firstGesture() {
  if (initAudio()) resumeAudio();
  if (game) game.started = true;
  document.getElementById('tapstart')?.setAttribute('hidden', '');
  // Orientation lock, status bar and wake lock all require a user gesture on
  // at least one platform, so they all happen here rather than at boot.
  if (!platformReady) { platformReady = true; initPlatform(); }
}

function doHonk() {
  firstGesture();
  if (!game || game.over) return;
  recordHonk(memory);
  honk(Matter, game.truck);
  honkSound();
  haptic('light');
  markEvent(game.sampler, 'honk');

  // Honking at someone hanging off your own trailer costs them grip. That is
  // the sacrifice mechanic: shake them off and the truck gets lighter.
  const shaken = shakeClingers(game.truck, PHYSICS.clingHonkCost, true);
  if (shaken.length) {
    for (const id of shaken) memory.blame.driver = (memory.blame.driver || 0) + 1;
    handleEvents(trigger(game.dialogue, 'shaken', { botId: shaken[0] }), game.S || {});
  } else {
    handleEvents(trigger(game.dialogue, 'honk'), game.S || {});
  }
}

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  firstGesture();
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.gas = true;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.brake = true;
  if (e.code === 'Space') { e.preventDefault(); doHonk(); }
  if (e.key === '~' || e.key === '`') hud.debug = !hud.debug;
  if (e.code === 'KeyR') restart();
  if (e.code === 'Escape' || e.code === 'KeyP') setPaused(!game?.paused);
});
addEventListener('keyup', (e) => {
  if (e.code === 'ArrowRight' || e.code === 'KeyD') input.gas = false;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') input.brake = false;
});

function bindHold(id, key) {
  const el = document.getElementById(id);
  const on = (e) => { e.preventDefault(); firstGesture(); input[key] = true; };
  const off = (e) => { e.preventDefault(); input[key] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindHold('gas', 'gas');
bindHold('brake', 'brake');
document.getElementById('horn').addEventListener('pointerdown', (e) => { e.preventDefault(); doHonk(); });
document.getElementById('again').addEventListener('click', restart);
document.getElementById('crew').addEventListener('click', openCrew);
document.getElementById('opencrew').addEventListener('click', (e) => {
  e.stopPropagation();      // the splash's own tap handler would race this
  openCrew();
});
document.getElementById('crewdone').addEventListener('click', closeCrew);
document.getElementById('crewreset').addEventListener('click', () => {
  resetCrew(document.getElementById('crewlist'), refreshNames);
});
document.getElementById('share').addEventListener('click', async () => {
  const note = document.getElementById('sharenote');
  const text = reportText({
    memory,
    survivors: game.over?.survivors || [],
    title: game.over?.title || '',
    detail: game.over?.detail || '',
  });
  const how = await shareReport(text);
  note.textContent = how === 'copied' ? 'Report copied to clipboard.'
    : how === 'shared' ? 'Shared.'
    : how === 'cancelled' ? ''
    : 'Could not share here — screenshot it instead.';
});
document.getElementById('resume').addEventListener('click', () => setPaused(false));
document.getElementById('pauserestart').addEventListener('click', restart);
document.getElementById('dbg').addEventListener('click', () => { hud.debug = !hud.debug; });

function setPaused(on) {
  if (!game || game.over) return;
  game.paused = on;
  const el = document.getElementById('pausecard');
  if (el) el.hidden = !on;
  if (on) duck(0.0001); else { duck(1); resumeAudio(); }
}

function restart() {
  document.getElementById('endcard').hidden = true;
  document.getElementById('pausecard').hidden = true;
  memory.deaths = [];
  memory.incidents = [];
  memory.lastDeath = null;
  memory.blame = { driver: 0 };
  memory.flips = 0;
  game = newRun();
  game.started = true;
}

// ── Loop ──────────────────────────────────────────────────────────────────────
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();

function frame(now) {
  const raw = Math.min(120, now - last);
  last = now;
  acc += raw;

  if (game.paused) acc = 0;   // do not bank time while paused and then catch up

  while (acc >= STEP) {
    acc -= STEP;
    const dt = STEP / 1000;
    if (!game.over && !game.paused) {
      applyDrive(Matter, game.truck, input);
      stabiliseInAir(Matter, game.truck);
      Matter.Engine.update(game.engine, STEP);
      const crew = game.truck.bots.filter((b) => !b.lost).length;
      const S = sample(game.sampler, {
        truck: game.truck, heightmap: game.heightmap, input, crew, dt,
      });
      game.S = S;
      handleEvents(stepDialogue(game.dialogue, S, dt), S);
      if (S.landing) clearLanding(game.sampler);
      checkBots(S);
      checkEnd(S);
    }
    if (!game.paused) {
      updateHud(hud, dt);
      updateCamera(game.camera, game.truck, canvas, dt);
    }
  }

  const S = game.S;
  const wheelSpeed = game.truck.rear.angularVelocity;
  updateEngine(wheelSpeed, input.gas && !game.over && !game.paused, S ? S.wheelSlip : 0);

  drawSky(ctx, canvas, S ? S.altitude : 0);
  drawParallax(ctx, game.camera, canvas);
  drawTerrain(ctx, game.camera, canvas, game.heightmap);
  drawBots(ctx, game.camera, canvas, game.truck);
  drawTruck(ctx, game.camera, canvas, game.truck);
  if (S) {
    drawBubbles(ctx, game.camera, canvas, hud, game.truck);
    drawStatus(ctx, canvas, S, game.truck, memory, insets);
    if (hud.debug) drawDebug(ctx, canvas, S, game.dialogue.activeBands, game.dialogue.log);
  }
  requestAnimationFrame(frame);
}

// Coming back from a locked screen or another app: the audio context is
// suspended and the wake lock is gone, and without this the game returns silent
// and the screen dims mid-climb.
onAppActive((active) => {
  if (active) { resumeAudio(); reacquireWakeLock(); }
  else if (game && !game.over) setPaused(true);
});

// Android's hardware back button closes the app by default, which mid-run is
// an unpleasant surprise. Back pauses; back again from the pause card leaves.
onBackButton(() => {
  if (game?.over) { exitApp(); return; }
  if (game?.paused) exitApp();
  else setPaused(true);
});

game = newRun();
requestAnimationFrame(frame);

// Expose for debugging and for the Playwright verification pass.
window.__haul = {
  config: { PHYSICS, GAME, DIALOGUE, TERRAIN },
  get state() { return game.S; },
  get bands() { return game.dialogue.activeBands; },
  get log() { return game.dialogue.log; },
  get memory() { return memory; },
  get truck() { return game.truck; },
  get over() { return game.over; },
  get paused() { return game.paused; },
  input,
  honk: doHonk,
  restart,
  setPaused,
  openCrew,
  closeCrew,
  get native() { return isNative(); },
  get report() {
    return reportText({
      memory,
      survivors: game.over?.survivors || [],
      title: game.over?.title || '',
      detail: game.over?.detail || '',
    });
  },
};
