// ── Trigger bands ─────────────────────────────────────────────────────────────
// The core table from the spec. A band is the physics *reason* a line is allowed
// to exist: no line may fire without one.
//
// HYSTERESIS, AND A NOTE ON THE SPEC
// The spec says a band "re-arms only after the value drops 6 below its entry
// point". That 6 is degrees — it only makes sense for the tilt bands. Applied
// literally to wheelSlip (which lives in 0..1) every slip band would enter once
// and latch on forever; applied to airTime it would never release either. So
// each band declares its own `hysteresis` in its own units. The spec's actual
// intent — don't machine-gun at the boundary — is preserved exactly; the
// constant 6 is not portable and is not treated as if it were.

/**
 * Band fields:
 *   value(S)    the number hysteresis is measured on. Omit for boolean bands.
 *   enter       threshold to become active
 *   dir         'above' | 'below' — which side of `enter` is inside the band
 *   hysteresis  how far back past `enter` the value must go to release
 *   test(S)     extra gating that must hold continuously while active
 *   sustain     seconds the condition must hold before the band opens
 *   priority    0 = filler .. 5 = emergency
 */
export const BANDS = [
  {
    id: 'chill', priority: 0, feel: 'small talk, radio, sniping',
    value: (S) => Math.abs(S.tilt), enter: 12, dir: 'below', hysteresis: 6,
    test: (S) => S.grounded && Math.abs(S.accel) < 6 && S.wheelSlip < 0.3,
    sustain: 1.5,
  },
  {
    id: 'working', priority: 1, feel: 'effort grunts, dad confidence',
    value: (S) => S.gradient, enter: 10, dir: 'above', hysteresis: 6,
    test: (S) => S.wheelSlip < 0.3 && S.grounded,
  },
  {
    id: 'slip', priority: 3, feel: "we're not moving, are we",
    value: (S) => S.wheelSlip, enter: 0.55, dir: 'above', hysteresis: 0.12,
    sustain: 0.4, test: (S) => S.grounded,
  },
  {
    id: 'stall', priority: 3, feel: 'rollback dread',
    test: (S) => S.stalled,
  },
  {
    id: 'rollback', priority: 4, feel: 'pure panic',
    value: (S) => -S.speed, enter: 0.5, dir: 'above', hysteresis: 0.25,
    test: (S) => S.gas,
  },
  {
    id: 'tilt_30', priority: 2, feel: 'first real worry',
    value: (S) => S.tilt, enter: 30, dir: 'above', hysteresis: 6,
    test: (S) => S.tilt <= 45,
  },
  {
    id: 'tilt_45', priority: 4, feel: 'measured terror',
    value: (S) => S.tilt, enter: 45, dir: 'above', hysteresis: 6,
    test: (S) => S.tilt <= 58,
  },
  {
    id: 'tilt_60', priority: 5, feel: 'goodbye',
    value: (S) => S.tilt, enter: 58, dir: 'above', hysteresis: 6,
  },
  {
    id: 'air', priority: 4, feel: 'scream, then silence, then landing line',
    value: (S) => S.airTime, enter: 0.35, dir: 'above', hysteresis: 0.15,
    test: (S) => S.airTime <= 1.1,
  },
  {
    id: 'air_long', priority: 5, feel: 'existential, calm, funniest tier',
    value: (S) => S.airTime, enter: 1.1, dir: 'above', hysteresis: 0.15,
  },
  {
    id: 'near_void', priority: 4, feel: 'one bot names the drop',
    value: (S) => S.voidLengths, enter: 1.5, dir: 'below', hysteresis: 0.5,
  },
  {
    id: 'landing', priority: 3, feel: 'callback to what they said mid-air',
    test: (S) => S.landing,
  },
  {
    id: 'alone', priority: 3, feel: "survivor's guilt / promotion",
    test: (S) => S.crew === 1,
  },
  {
    id: 'empty', priority: 5, feel: 'Dadbot talks to nobody',
    test: (S) => S.crew === 0,
  },
  {
    id: 'summit', priority: 5, feel: 'premature celebration, then a drop',
    value: (S) => S.altitude, enter: 0.95, dir: 'above', hysteresis: 0.03,
  },
];

export const BAND_BY_ID = Object.fromEntries(BANDS.map((b) => [b.id, b]));

export function createBandState(bands = BANDS) {
  const s = {};
  for (const b of bands) s[b.id] = { active: false, sustained: 0, activeFor: 0 };
  return s;
}

function inside(band, S) {
  if (band.value === undefined) return true;
  const v = band.value(S);
  return band.dir === 'below' ? v <= band.enter : v >= band.enter;
}

function stillInside(band, S) {
  if (band.value === undefined) return true;
  const v = band.value(S);
  const h = band.hysteresis ?? 0;
  return band.dir === 'below' ? v <= band.enter + h : v >= band.enter - h;
}

/**
 * Advance every band. Returns the ids currently active, highest priority first.
 * A band opens only when its entry condition AND its extra test hold for
 * `sustain` seconds; it closes when the value falls back past the hysteresis
 * margin, or its test stops holding.
 */
export function updateBands(state, S, dt, bands = BANDS) {
  const active = [];
  for (const b of bands) {
    const st = state[b.id];
    const gate = b.test ? b.test(S) : true;

    if (st.active) {
      st.active = gate && stillInside(b, S);
      st.activeFor = st.active ? st.activeFor + dt : 0;
      if (!st.active) st.sustained = 0;
    } else {
      if (gate && inside(b, S)) {
        st.sustained += dt;
        if (st.sustained >= (b.sustain ?? 0)) {
          st.active = true;
          st.activeFor = 0;
        }
      } else {
        st.sustained = 0;
      }
    }
    if (st.active) active.push(b.id);
  }
  active.sort((a, b) => BAND_BY_ID[b].priority - BAND_BY_ID[a].priority);
  return active;
}
