// ── The comedy ────────────────────────────────────────────────────────────────
// This is the file to edit. Everything else is plumbing.
//
// Each entry is a POOL: `text` holds interchangeable variants, drawn by
// shuffle-bag so a pool is exhausted before anything repeats. `band` is the
// physics reason the line is allowed to exist — a line with no band and no
// event can never fire, by design.
//
// A pool needs `band` (a physics reason), `event` (a discrete trigger) or
// `reply: true` (only ever emitted as a queued Dadbot response). A pool with
// none of the three can never fire — the test suite enforces that.
//
// Fields: id, speaker, band | event | reply, priority?, cooldown, weight?, once?, tags?,
//         callback? (sets up a landing answer), answers? (answers one),
//         requires? / lockedBy? (memory-gated pools), when? (extra condition)
//
// Tokens: {lastDeath} {firstDeath} {deathCount} {honks} {flips}

export const LINES = [
  // ── chill (p0) — small talk, radio, sniping ───────────────────────────────
  {
    id: 'chill_radio', speaker: 'any', band: 'chill', cooldown: 26, tags: ['radio'],
    text: [
      'Radio: "Buy oil. Become oil."',
      'Radio: "Are you a truck? You may be entitled to compensation."',
      'Radio: "Nine out of ten robots agree. The tenth fell off."',
      'Radio: "This hill brought to you by gravity. Gravity: still undefeated."',
    ],
  },
  {
    id: 'chill_smalltalk', speaker: 'any', band: 'chill', cooldown: 20,
    text: [
      'This is fine. This is a road. Roads are fine.',
      'Nobody has fallen off in eleven seconds. Personal best.',
      'I like this part. Nothing is happening in this part.',
      'Is anyone else bolted on? No? Just me? Nobody?',
    ],
  },
  {
    id: 'chill_rusty_snipe', speaker: 'rusty', band: 'chill', cooldown: 30,
    text: [
      "I've seen worse roads. I was ON worse roads. I am made of worse roads.",
      'Wake me at the part where we die.',
      "Forty years of hauling and I get put on a hill with you lot.",
    ],
  },
  {
    id: 'chill_pip', speaker: 'pip', band: 'chill', cooldown: 28,
    text: [
      'I am the smallest thing on this truck and somehow the most reasonable.',
      'If I hold on very tight nothing bad can happen. That is how physics works.',
    ],
  },

  // ── working (p1) — effort grunts, dad confidence ───────────────────────────
  {
    id: 'work_effort', speaker: 'any', band: 'working', cooldown: 14,
    text: [
      'She\'s pulling. She\'s pulling!',
      'Okay. Okay. We are going UP. That is the correct direction.',
      'Engine sounds angry. Engine is allowed to be angry.',
      'Do not look down. Look at me. Do not look down.',
    ],
  },
  {
    id: 'work_dad_confident', speaker: 'driver', band: 'working', cooldown: 18, weight: 1.4,
    text: [
      "See? Torque. That's all it is.",
      "I've done this road.",
      'This is the fast way.',
      "Your mother drives worse.",
    ],
  },
  {
    id: 'work_clank_math', speaker: 'clank', band: 'working', cooldown: 22,
    text: [
      'Current survival probability: 61%. That is up from earlier. Do not celebrate.',
      'Gradient logged. Grip logged. Hope: not logged, no field for it.',
    ],
  },

  // ── slip (p3) — "we're not moving, are we" ─────────────────────────────────
  {
    id: 'slip_notmoving', speaker: 'any', band: 'slip', cooldown: 16, tags: ['panic'],
    text: [
      "We're not moving, are we.",
      'The wheels are going. WE are not going. Those are different.',
      'That smell is us.',
      'Lots of noise. No altitude. Classic.',
    ],
  },
  {
    id: 'slip_clank', speaker: 'clank', band: 'slip', cooldown: 20, tags: ['panic'],
    text: [
      'Traction: none. Confidence: unchanged. That is the problem.',
      'Revised probability of death: 74%. I am updating live. You are welcome.',
    ],
  },
  {
    id: 'slip_rusty', speaker: 'rusty', band: 'slip', cooldown: 24,
    text: [
      'You found the ice. Well done. Took you ages.',
      'Spin it harder, that always works.',
    ],
  },

  // ── stall (p3) — rollback dread ────────────────────────────────────────────
  {
    id: 'stall_beep', speaker: 'beep', band: 'stall', cooldown: 18, tags: ['panic'],
    text: [
      'We have stopped. WE HAVE STOPPED. Is that bad? That feels bad.',
      'I am brave. I am brave. I am bra—  is it rolling? DAD IS IT ROLLING—',
    ],
  },
  {
    id: 'stall_any', speaker: 'any', band: 'stall', cooldown: 15, tags: ['panic'],
    text: [
      'Dad. The hill is winning.',
      "We're not stopped, we're just... pausing. Uphill. Permanently.",
    ],
  },

  // ── rollback (p4) — pure panic ─────────────────────────────────────────────
  {
    id: 'rollback_panic', speaker: 'any', band: 'rollback', cooldown: 12, tags: ['panic'],
    text: [
      'BACKWARDS. DAD. BACKWARDS IS BACKWARDS.',
      'That is the wrong way! That is measurably the wrong way!',
      'We are reversing up a mountain we are going DOWN a mountain—',
    ],
  },
  {
    id: 'rollback_clank', speaker: 'clank', band: 'rollback', cooldown: 20, tags: ['panic'],
    text: [
      'Velocity is negative. Morale is also negative. Both confirmed.',
      '89%. I am not enjoying being right.',
    ],
  },

  // ── tilt_30 (p2) — first real worry ────────────────────────────────────────
  {
    id: 'tilt30_worry', speaker: 'any', band: 'tilt_30', cooldown: 18,
    text: [
      'That is a slope. That is officially a slope now.',
      'Everyone lean forward. LEAN FORWARD.',
      "I don't love this. I want that on the record.",
    ],
  },
  {
    id: 'tilt30_clank', speaker: 'clank', band: 'tilt_30', cooldown: 22,
    text: [
      'Thirty-one degrees. Still survivable. Barely worth mentioning. I mentioned it.',
      'We are at the angle where I start narrating. This is the narrating angle.',
    ],
  },
  {
    id: 'tilt30_pip', speaker: 'pip', band: 'tilt_30', cooldown: 24,
    text: [
      'I am too small for this hill.',
      'My feet are not touching. My feet are supposed to touch.',
    ],
  },

  // ── tilt_45 (p4) — measured terror (the spec's example pool) ───────────────
  {
    id: 'tilt45_clank', speaker: 'clank', band: 'tilt_45', cooldown: 30, tags: ['tilt', 'escalation', 'panic'],
    text: [
      "That's 45 degrees. I measured. I hate that I measured.",
      'We are now a ramp.',
      'Dad. DAD. The floor is a wall.',
    ],
  },
  {
    id: 'tilt45_any', speaker: 'any', band: 'tilt_45', cooldown: 22, tags: ['panic'],
    text: [
      'THE SKY IS BEHIND ME. THE SKY SHOULD NOT BE BEHIND ME.',
      'I am holding on with one hand and my hand is not a hand!',
      'Whatever you do next, do less of it!',
    ],
  },
  {
    id: 'tilt45_rusty', speaker: 'rusty', band: 'tilt_45', cooldown: 34,
    text: [
      'Hm. Yeah. That\'ll do it.',
      'Forty-five. Tell my oil I loved it.',
    ],
  },

  // ── tilt_60 (p5) — goodbye ─────────────────────────────────────────────────
  {
    id: 'tilt60_goodbye', speaker: 'any', band: 'tilt_60', cooldown: 40, tags: ['panic'],
    text: [
      'Okay. Goodbye. Genuinely, goodbye.',
      'THIS IS NOT A HILL THIS IS A CLIFF WITH AMBITION',
      'Tell {firstDeath} I am coming.',
    ],
  },
  {
    id: 'tilt60_clank', speaker: 'clank', band: 'tilt_60', cooldown: 45, tags: ['panic'],
    text: [
      '100%. It is 100%. I am no longer estimating, I am reporting.',
      'For the log: this was Dadbot\'s idea.',
    ],
  },

  // ── air (p4) — scream ──────────────────────────────────────────────────────
  {
    id: 'air_scream', speaker: 'any', band: 'air', cooldown: 8, tags: ['panic'],
    text: [
      'AAAAAAA—',
      'WHY ARE WE UP HERE',
      'WHEELS! WHEELS ARE FOR GROUND!',
    ],
  },
  {
    id: 'air_beep', speaker: 'beep', band: 'air', cooldown: 14, tags: ['panic'],
    text: [
      'I am flying! I am FLYING! I am falling. I was flying.',
      'COURAGE.EXE HAS STOPPED RESPONDING',
    ],
  },

  // ── air_long (p5) — the calm tier. The funniest beat in the game. ──────────
  // These set a `callback` key; the landing line must ANSWER it.
  {
    id: 'airlong_forgave', speaker: 'any', band: 'air_long', cooldown: 60,
    callback: 'forgave',
    text: ['I want you to know I forgave you.'],
  },
  {
    id: 'airlong_calm', speaker: 'rusty', band: 'air_long', cooldown: 60,
    callback: 'quiet',
    text: [
      "It's quiet up here. I like it up here.",
      "Forty years. And this is the bit I'll remember.",
    ],
  },
  {
    id: 'airlong_pip', speaker: 'pip', band: 'air_long', cooldown: 60,
    callback: 'small',
    text: ['From up here everyone is small. Not just me.'],
  },

  // ── landing (p3) — the callback must answer the air line ───────────────────
  {
    id: 'land_forgave', speaker: 'any', band: 'landing', cooldown: 20, answers: 'forgave',
    text: ["I'm taking that back.", 'Retracted. Fully retracted.'],
  },
  {
    id: 'land_quiet', speaker: 'rusty', band: 'landing', cooldown: 20, answers: 'quiet',
    text: ["It's not quiet down here.", 'I would like to go back up.'],
  },
  {
    id: 'land_small', speaker: 'pip', band: 'landing', cooldown: 20, answers: 'small',
    text: ['I am small again. I hate it here.'],
  },
  {
    id: 'land_generic', speaker: 'any', band: 'landing', cooldown: 10,
    text: [
      'Everyone still attached? ... Anyone?',
      'We landed. I use "landed" generously.',
      'Something came off. I heard it come off.',
      'Parts of me are now behind us.',
    ],
  },

  // ── near_void (p4) — one bot names the drop ────────────────────────────────
  {
    id: 'void_name', speaker: 'any', band: 'near_void', cooldown: 20, tags: ['panic'],
    text: [
      'That is a hole. I am naming it. That is a hole.',
      "There's no road there, Dad. There's just weather.",
      'Do we have a plan for the gap? Is the plan speed? It\'s speed, isn\'t it.',
    ],
  },
  {
    id: 'void_clank', speaker: 'clank', band: 'near_void', cooldown: 26, tags: ['panic'],
    text: ['Measuring the drop. Still measuring. Stopped measuring.'],
  },

  // ── alone (p3) — survivor's guilt / promotion ──────────────────────────────
  {
    id: 'alone_survivor', speaker: 'any', band: 'alone', cooldown: 25,
    text: [
      'So it\'s just me. {lastDeath} was the lucky one.',
      'I am now the entire crew. I am also the entire passenger list.',
      "{deathCount} gone. I've been promoted. I did not want the promotion.",
    ],
  },
  {
    id: 'alone_clank_arrogant', speaker: 'clank', band: 'alone', cooldown: 30, requires: 'arrogant',
    text: [
      'Four runs. Four. None of you listened and now look.',
      'Statistically, I am the only one who matters. I have the data.',
    ],
  },

  // ── empty (p5) — Dadbot talks to nobody ───────────────────────────────────
  {
    id: 'empty_dad', speaker: 'driver', band: 'empty', cooldown: 20, tags: ['panic'],
    text: [
      'Lads? ... Lads.',
      "Okay, we're nearly there. ... Nearly there, everyone. ... Everyone?",
      'I can still hear {lastDeath}. That\'s the wind. That\'s just the wind.',
      "{deathCount} of you. In one hill. I'll be honest, that's a lot.",
    ],
  },

  // ── summit (p5) — premature celebration, then a drop ───────────────────────
  {
    id: 'summit_early', speaker: 'any', band: 'summit', cooldown: 40,
    text: [
      'WE MADE IT. We made it! Did we make it? Are we still making it?',
      'Top! TOP! Do not do anything else, Dad. Nothing. Ever again.',
    ],
  },
  {
    id: 'summit_dad', speaker: 'driver', band: 'summit', cooldown: 40,
    text: [
      'Told you. Torque.',
      "Summit.exe succeeded. Mostly.",
    ],
  },

  // ── Honk reactions (event) ────────────────────────────────────────────────
  // Past DIALOGUE.honkDesensitiseAt one bot stops responding entirely — the
  // engine returns no line at all for them. Silence is the punchline.
  {
    id: 'honk_react', speaker: 'any', event: 'honk', priority: 2, cooldown: 5,
    text: [
      'WHY. Why the horn. Why now.',
      'The horn does not make the hill smaller, Dad!',
      'That was in my chest. I don\'t have a chest!',
      "Honk number {honks}. I'm counting. I'm counting them all.",
    ],
  },

  // ── Death lines (event) — one last line per bot ────────────────────────────
  {
    id: 'death_clank', speaker: 'clank', event: 'death', priority: 5, cooldown: 0,
    text: [
      'Final probability: 100%. I was right. I was RIGHT—',
      'Logging my own death. Logged. Log full.',
      "Tell them the numbers were good. The numbers were never good.",
    ],
  },
  {
    id: 'death_beep', speaker: 'beep', event: 'death', priority: 5, cooldown: 0,
    text: [
      'I was BRAVE— I was so br—',
      'COURAGE.EXE — SEGMENTATION FAULT —',
      'This is fine! This is fi—',
    ],
  },
  {
    id: 'death_rusty', speaker: 'rusty', event: 'death', priority: 5, cooldown: 0,
    text: [
      'Finally.',
      "Forty years. Ended by a speed bump's cousin.",
      'Not even surprised. Bit disappointed. Not surprised.',
    ],
  },
  {
    id: 'death_pip', speaker: 'pip', event: 'death', priority: 5, cooldown: 0,
    text: [
      'I said I was too small!',
      'Tiny robot. Big hill. Bad maths.',
      "Tell Dad it was his idea. It was HIS ID—",
    ],
  },

  // ── Dadbot's response layer ────────────────────────────────────────────────
  // Unhelpful and confident, always. The gap between the crew's terror and
  // Dad's calm IS the joke — the engine hard-blocks him from panic pools until
  // the crew is gone.
  {
    id: 'dad_unhelpful', speaker: 'driver', reply: true, cooldown: 6, weight: 1,
    text: [
      "It's got it.",
      'This is the fast way.',
      'Your mother drives worse.',
      "We're not stopping, we just stopped.",
      "I've done this road.",
      'That noise is normal.',
      "That's the suspension working.",
      'Nobody panic. I am not panicking, so nobody panic.',
      'I know what I\'m doing. I\'ve seen it done.',
      'Watch this bit.',
      'Almost the top. Roughly. Broadly.',
      "You're all overreacting. Statistically.",
    ],
  },
  {
    id: 'dad_drop', speaker: 'driver', reply: true, cooldown: 0,
    text: [
      "They'll catch up.",
      'We can get another one.',
      'That was their choice, really.',
      "I'm not stopping on a hill, that's how you lose a truck.",
      "That's {deathCount}. Fine. Manageable.",
      'Everyone still got their bolts? ... Right. Onwards.',
    ],
  },

  // ── Memory-gated pool: Beep comes back "repaired" ─────────────────────────
  {
    id: 'beep_repaired', speaker: 'beep', band: 'working', cooldown: 20, requires: 'repaired',
    text: [
      'I have been REPAIRED. I am told I am better now. I do not feel better.',
      'They replaced my courage module with a cheaper one. I can tell.',
      'No, it\'s fine. I\'m fine. I died twice but I\'m fine. Drive on.',
    ],
  },
];

export default LINES;
