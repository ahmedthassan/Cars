# Robot Haul

Mobile physics driving game inspired by **Truck Star**, plus robots who should not have been
given a mountain.

**Dadbot** drives. Four passenger bots ride on the trailer. They talk. They panic. They fall
off. You honk.

## The joke

Not "a serious truck sim." It's a moving argument.

| Bot | Job | Personality |
|---|---|---|
| Dadbot | Driver | Watched one driving tutorial |
| Clank | Passenger | Updates the death percentage live |
| Beep | Passenger | File-corrupted courage |
| Rusty | Passenger | Old, oily, unimpressed |
| Pip | Passenger | Too small for this hill |

When a bot leaves the truck they get a last line. Dadbot then says something unhelpful.

## Play now

1. Serve the folder (below) and open `mountain-truck.html` on your phone.
2. Landscape.
3. **GAS** / **BRAKE** to climb.
4. **🔔 Honk** to scare the cargo (this is not helpful).
5. Reach **TOP** with at least 2 bots still aboard.

Desktop: `D`/`→` gas, `A`/`←` brake, `Space` honk, `R` restart, `~` debug overlay.

## Run locally

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173/mountain-truck.html`

A server is required — the game is split into ES modules, which browsers refuse to load over
`file://`. Matter.js is vendored in `vendor/`, so there is no network dependency and no npm
install.

## The dialogue engine

The point of this game is that **no line may fire without a physics reason**. A random line is
noise; a line that fires the exact frame the physics get scary is a joke.

Every frame, `src/state/vector.js` samples a state vector — tilt, tilt rate, speed, accel, air
time, wheel slip, gradient, rollback, stall, altitude, distance to the void, crew, panic —
smoothed over 6 frames to kill jitter. `src/dialogue/bands.js` turns that into **trigger
bands**, and a line can only exist inside a band:

| Band | Condition | Priority | Feel |
|---|---|---|---|
| `chill` | tilt < 12°, settled | 0 | small talk, radio, sniping |
| `working` | gradient > 10°, slip < 0.3 | 1 | effort grunts, dad confidence |
| `tilt_30` | tilt 30–45° | 2 | first real worry |
| `slip` | slip > 0.55 for 0.4s | 3 | "we're not moving, are we" |
| `stall` | gas held, going nowhere | 3 | rollback dread |
| `landing` | air > 0.35s, then contact | 3 | callback to the mid-air line |
| `alone` | crew = 1 | 3 | survivor's guilt / promotion |
| `rollback` | speed < −0.5 while gas held | 4 | pure panic |
| `tilt_45` | tilt 45–58° | 4 | measured terror |
| `air` | airTime > 0.35s | 4 | scream |
| `near_void` | within 1.5 truck lengths of the drop | 4 | one bot names it |
| `tilt_60` | tilt > 58° | 5 | goodbye |
| `air_long` | airTime > 1.1s | 5 | existential, calm, funniest tier |
| `empty` | crew = 0 | 5 | Dadbot talks to nobody |
| `summit` | altitude > 0.95 | 5 | premature celebration |

Highest priority eligible line wins. Ties break by **weight then random — never array order**,
so where a line sits in the file has no effect on behaviour.

### The timing rules are the comedy

- **Air before the punchline.** A priority-4+ line clears the bubbles and holds 0.5s of
  silence first. Silence sells it.
- **Global cooldown 1.1s**, **per-speaker cooldown 2.5s.** One bot monologuing is annoying;
  four bots interrupting is a scene.
- **Shuffle-bag, never `random()`.** A pool is exhausted before anything repeats.
- **The mid-air rule.** During `air_long` the SFX duck and one bot says something calm and
  philosophical. Calm during chaos is the single funniest beat in the game, so it gets its own
  pool the panic lines cannot reach.
- **Landing callback.** Whatever was said mid-air, the landing line answers it:
  `AIR: "I want you to know I forgave you."` → `LANDING: "I'm taking that back."`
- **Dadbot never panics until the crew is gone.** The gap between their terror and his calm is
  the joke, so the engine hard-blocks him from every panic pool while anyone is still aboard —
  it is not left to line-writing discipline.

### Memory

`src/dialogue/memory.js` keeps a session log — who died in what order, blame, honks, flips —
and lines template against it (`{lastDeath}`, `{deathCount}`). Runs survived persist to
`localStorage`, which unlocks the cross-run jokes:

- Clank gets arrogant after surviving 4 runs.
- Beep comes back "repaired" and passive-aggressive after dying twice.
- Past 10 honks, one bot stops responding to the horn **entirely**. No line at all. Silence is
  funnier than a line, so it is a real branch rather than an empty string.

## How to tweak the comedy

**All the lines** live in `src/dialogue/lines.js`. **All the numbers** live in `src/config.js`.
Nothing else should contain a magic number.

**Add a robot** — push an entry into `ROBOTS` in `src/config.js` (`id`, `name`, `face`,
`color`), then write it some pools in `lines.js`.

**Add a line** — copy any pool in `lines.js`. It needs a `band` (the physics reason), an
`event`, or `reply: true`. A pool with none of the three can never fire, and the test suite
fails if you add one.

**Change Dadbot** — edit the `dad_unhelpful` and `dad_drop` pools.

**Meaner honk** — raise `PHYSICS.honkForce` from `-0.0012` so honking yeets someone on purpose.

**More panic** — raise `GAME.panicGasRate`. Higher = the meter melts faster.

**Slippery snow** — lower `PHYSICS.wheelFriction` from `1.3` toward `0.7`. Lower
`PHYSICS.cargoFriction` so the bots slide like soap.

**Harder to tip** — `PHYSICS.ballastShare` is the fraction of cab mass slung low at
`comDrop`. It, not `comDrop` alone, is what sets the tipping threshold.

## Tests

```bash
node --test test/dialogue.test.mjs
```

The dialogue engine is pure functions over a plain state vector — no DOM, no Matter — so the
rules you cannot eyeball in a moving game are asserted directly: that bands don't machine-gun
at their boundaries, that cooldowns hold, that priority beats array order, that a pool
exhausts before repeating, that Dadbot can't panic with crew aboard, that the landing line
answers the mid-air line.

## Notes on the physics

`GAS` drives both cab wheels with torque that is **scaled down as wheel slip rises**, so
flooring it on a steep section spins the wheels instead of teleporting you up the hill. Slip
is one number, computed once, and it drives the `slip` band, the tyre hiss and the panic meter
together.

Two things worth knowing if you re-tune the map:

- **The void sits past the summit, not across the road.** A 270px articulated truck cannot jump
  a gap of its own length — the cab goes over the edge while the trailer is still anchored, so
  it tips in rather than launching. Every ramp profile tried gave under 70px of range. A
  mid-route void would be unwinnable or a physics lie, so the void is a thing you stop before.
- **Potholes are narrower than the cab's wheelbase** on purpose, so the cab always spans them.
  A hole wider than the wheelbase doesn't drop you in, it wedges you nose-down forever.

## Next funny upgrades

From the spec's build order, in order:

1. Clinging animation — a bot dangling by one arm beats any written joke.
2. Sacrifice mechanic — dropping a bot makes the truck lighter and faster.
3. Rename the bots + Incident Report end card. Players type their friends' names, screenshot,
   send. That is the distribution channel.
4. Map 2: The School Run — proves the location template (one new hazard, one new premise, one
   dialogue pack).
5. Auto-clip export — rolling 6-second buffer, 9:16.

Expand the line pools as you go: the spec's target is ~170 lines, and adding them is a pure
data edit in `lines.js`.
