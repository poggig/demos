// CONFIG — every balance / tuning number of Gate Shooter lives here.
// Units: px are LOGICAL pixels on the fixed 540×960 portrait canvas; times in seconds.
// Personalizable CONTENT (texts, names, colours, dedication) lives in theme.js, not here.

export const CONFIG = {
  version: '1.0.0',

  // ── View & loop ────────────────────────────────────────────────────────────
  view: { w: 540, h: 960, dprCap: 2 },
  step: 1 / 60,               // fixed simulation timestep (60 Hz)
  maxFrameSteps: 5,           // catch-up cap per animation frame (no spiral of death)

  // ── Road / track ──────────────────────────────────────────────────────────
  road: { left: 46, right: 494 },          // playable road (448 px wide)
  track: {
    scrollSpeed: 150,         // px/s the world scrolls toward the crowd
    spawnY: -70,              // entities appear here (just above the screen)
    despawnY: 1060,           // and are recycled below this
    bossBrake: 1.4,           // s for the road to stop when the boss appears
  },
  threeLanesFromLevel: 4,     // campaign: 2 lanes on levels 1..3, 3 lanes from 4
  // (endless switches at the equivalent level, see endless.distancePerLevel)

  // ── The crowd (player) ─────────────────────────────────────────────────────
  crowd: {
    y: 800,                   // centre of the formation
    startSoldiers: 5,         // base starting crowd (shop upgrade adds to this)
    maxSoldiers: 99999,       // hard cap
    spacing: 15,              // formation spacing (px) — formation grows ~sqrt(n)
    squash: 0.72,             // vertical squash of the formation (perspective)
    soldierR: 9,              // radius of one drawn soldier
    edgePad: 34,              // crowd centre is clamped this far inside the road
  },
  maxDrawnSoldiers: 60,       // draw at most this many; above it the number rules

  // ── Shooting ───────────────────────────────────────────────────────────────
  maxBullets: 140,            // on-screen bullet cap: beyond it shots MERGE (DPS kept)
  fireTick: 1 / 20,           // bullets are emitted in 20 small sub-volleys per second
  baseDamage: 1,              // damage of one rifle bullet before multipliers
  weapons: [                  // weapon ladder — a weapon gate moves one step right
    { id: 'rifle',   interval: 0.42, damage: 1.0,  pellets: 1, speed: 950,  spread: 0.035, radius: 4,   gateHits: 1 },
    { id: 'smg',     interval: 0.17, damage: 0.55, pellets: 1, speed: 1050, spread: 0.08,  radius: 3.5, gateHits: 1 },
    { id: 'shotgun', interval: 0.70, damage: 0.8,  pellets: 3, speed: 880,  spread: 0.21,  radius: 4,   gateHits: 1 },
    { id: 'rocket',  interval: 1.00, damage: 4.6,  pellets: 1, speed: 640,  spread: 0.02,  radius: 7,   gateHits: 4,
      splash: 72, splashFactor: 0.55 },
  ],
  stats: { maxRateMult: 4, maxDamageMult: 25 },

  // ── Gates ──────────────────────────────────────────────────────────────────
  gateHitsPerStep: 40,        // +/− gates: +1 every N hits ("colpi" = bullets reaching the gate)
  multHitsPerStep: 240,       // ×/÷ gates: one ladder step every N hits
  multLadder: [-4, -3, -2, 2, 3, 4, 5], // negative = ÷|n|, positive = ×n (÷3 → ÷2 → ×2 → ×3 …)
  gates: {
    h: 104,                   // gate panel height
    pad: 7,                   // gap between neighbouring panels
    addCapPerScale: 15,       // a +/− gate can be shot up to +addCap×scale(level)
    rare: {
      rateValue: 0.25,        // "+fire rate" gate: +25 % fire rate
      damageValue: 1.5,       // "×damage" gate: damage ×1.5
      weaponMaxedDamage: 1.3, // weapon gate when already on the last weapon → ×1.3 damage
    },
  },

  // ── Zombies ────────────────────────────────────────────────────────────────
  // hp = hpMult × zombieHp(level); speed = own walking speed on top of the scroll.
  // weight = minimum soldiers killed on contact; home = sideways homing px/s.
  hpPerSoldier: 2,            // contact kills max(weight, ceil(hpLeft / hpPerSoldier))
  zombieTypes: {
    walker:   { hpMult: 1.0, speed: 28, r: 17, weight: 1, coins: 1, score: 10, home: 34 },
    runner:   { hpMult: 0.5, speed: 92, r: 14, weight: 1, coins: 1, score: 15, home: 62 },
    brute:    { hpMult: 4.2, speed: 12, r: 27, weight: 5, coins: 4, score: 50, home: 18 },
    splitter: { hpMult: 1.6, speed: 24, r: 21, weight: 2, coins: 2, score: 20, home: 26,
      splitInto: 'mini', splitCount: 2 },
    mini:     { hpMult: 0.45, speed: 48, r: 12, weight: 1, coins: 0, score: 5, home: 54 },
  },
  homingFromY: 230,           // zombies start steering toward the crowd below this y
  maxZombies: 140,

  // ── Boss ───────────────────────────────────────────────────────────────────
  boss: {
    // Boss hp is CALIBRATED by the generator: the reasonable path's firepower when the boss
    // appears × targetSeconds, floored at minHpMult × zombieHp(level). Then re-validated.
    targetSeconds: 9,
    introTargetSeconds: [6, 7, 8], // gentler bosses on levels 1, 2, 3
    minHpMult: 12,
    enterSpeed: 150,          // px/s: quick entrance down to enterY (clear of the HUD) …
    enterY: 270,
    speed: 26,                // … then a slow walk toward the crowd
    r: 66,
    home: 70,
    coins: 25,
    score: 500,
    stompEvery: 1.15,         // s between stomps (light screen shake)
  },

  // ── Difficulty curves (campaign: level; endless: equivalent level) ─────────
  difficulty: {
    hpBase: 4,                // walker hp on level 1
    hpGrowth: 1.13,           // zombieHp(level) = hpBase × hpGrowth^(level−1)
    gateGrowth: 1.155,        // gate values scale by gateGrowth^(level−1) (faster than hp: waves grow too)
    waveBase: 6,              // zombies per wave on level 1
    wavePerLevel: 0.3,        //   … + this per level
    waveMax: 16,
    waveRamp: [0.6, 1.4],     // inside a level, waves grow from 60 % to 140 % of that size
    badChanceBase: 0.32,      // chance a non-rare lane holds a red gate
    badChancePerLevel: 0.025,
    badChanceMax: 0.6,
    multGoodChance: 0.34,     // a green gate is ×n (else +n)
    multBadChance: 0.3,       // a red gate is ÷n (else −n)
    addGood: [5, 11],         // +n range at scale 1
    addBad: [3, 7],           // −n range at scale 1
    rareChance: 0.2,          // chance a gate row carries one rare gate
    rareWeights: { rate: 3, damage: 3, weapon: 2 },
    mix: [                    // zombie-type weights by level (first row whose level ≤ L wins)
      { from: 1,  w: { walker: 10 } },
      { from: 2,  w: { walker: 8, runner: 2 } },
      { from: 3,  w: { walker: 7, runner: 3, brute: 1 } },
      { from: 5,  w: { walker: 6, runner: 3, brute: 1.5, splitter: 1.5 } },
      { from: 9,  w: { walker: 5, runner: 4, brute: 2, splitter: 2 } },
      { from: 15, w: { walker: 4, runner: 4, brute: 2.5, splitter: 2.5 } },
    ],
  },

  // ── Level generator ────────────────────────────────────────────────────────
  gen: {
    levelLength: 6600,        // px of road before the boss (~44 s) → ~50–60 s with the boss
    firstBlockAt: 420,
    firstRowBoost: 1.5,       // the opening row is all-green +n gates worth ×1.5
    blockGap: [560, 720],     // distance between blocks
    gapShrinkPerLevel: 6,     // blocks get closer as levels rise …
    minGap: 470,              // … down to this
    weights: { gates: 3, wave: 4, mixed: 3 },
    zombieRowGap: 64,         // vertical spacing between zombie rows inside a wave
    zombiesPerRow: [3, 5],
    mixedFrontGap: [110, 190],// zombies of a mixed block walk this far in front of the gates
    maxAttempts: 12,          // regenerate with a new sub-seed up to this many times …
    easeStep: 0.88,           // … then ease the level (hp & counts ×0.88 per try)
    maxEaseTries: 20,
  },

  // ── Winnability simulator ("reasonable path": best gate per row, no gate aiming) ─
  sim: {
    maxSeconds: 150,          // safety stop
    bossMaxProgress: 0.7,     // boss must die before covering 70 % of its walk
  },

  // ── Campaign / endless ─────────────────────────────────────────────────────
  carryOver: 0.25,            // next level starts with 25 % of survivors (min = shop start)
  levelClearBonus: 100,       // × level
  endless: {
    distancePerLevel: 1300,   // equivalent level +1 every N px (~6–8 s)
    hpGrowth: 1.21,           // endless zombies grow exponentially …
    gateLinear: 0.12,         // … while gate values only grow linearly: ×(1 + 0.12 × (eqLevel−1))
    multChance: 0.2,          // and green ×n gates are 5× rarer → the crowd can't snowball, the run always ends
    speedUpPerLevel: 0.02,    // scroll +2 % per equivalent level …
    maxSpeedMult: 1.7,        // … capped
    chunkLen: 2200,
    pxPerPoint: 10,           // score = distance / pxPerPoint + kill points
  },

  // ── Economy / shop ─────────────────────────────────────────────────────────
  coinScalePerLevel: 0.15,    // coins per kill × (1 + 0.15 × (level−1))
  shop: {
    start:  { baseCost: 40, growth: 1.5,  perLevel: 2,    max: 40 }, // +2 starting soldiers
    damage: { baseCost: 50, growth: 1.55, perLevel: 0.12, max: 40 }, // +12 % damage
    rate:   { baseCost: 50, growth: 1.55, perLevel: 0.10, max: 30 }, // +10 % fire rate
  },

  // ── Input ──────────────────────────────────────────────────────────────────
  input: {
    smoothing: 16,            // exponential smoothing rate toward the target x
    keySpeed: 520,            // px/s with ←/→ or A/D
    touchSensitivity: 1.15,   // relative drag gain
  },

  // ── Feel ───────────────────────────────────────────────────────────────────
  fx: {
    maxParticles: 420,
    maxFloaters: 24,
    shakeBoss: 7,             // px, light
    shakeStomp: 3,
    popScale: 0.38,           // soldier-number "pop" when it changes
  },

  // ── Audio ──────────────────────────────────────────────────────────────────
  audio: {
    master: 0.8,
    music: 0.32,
    sfx: 0.55,
    shotMinInterval: 0.075,   // shot SFX rate limiter
    hitMinInterval: 0.06,
    coinMinInterval: 0.07,
  },
};
