// CONFIG — every balance / tuning number of Gate Shooter lives here.
// Units: px are LOGICAL pixels on the fixed 540×960 portrait canvas; times in seconds.
// "× zombieHp" means: multiplied by zombieHp(level) = difficulty.hpBase × hpGrowth^(level−1),
// so damage/HP of everything scales together with the level.
// Personalizable CONTENT (texts, names, colours, dedication) lives in theme.js, not here.

export const CONFIG = {
  version: '1.2.0',

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

  // ── The crowd (player) ─────────────────────────────────────────────────────
  crowd: {
    y: 800,                   // centre of the formation
    startSoldiers: 1,         // every run starts with ONE soldier (shop "Recruits" adds to it)
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
  // Weapon ladder — a WEAPON gate moves one step right. The weapon is KEPT for the whole run.
  // Per-soldier DPS: 2.4 → 3.3 → 4.3 → 5.5 → 7.0 (+splash) → 9.0 (+pierce): every step ≈ +30 %.
  weapons: [
    { id: 'rifle',   interval: 0.42, damage: 1.0,  pellets: 1, speed: 950,  spread: 0.035, radius: 4,   gateHits: 1 },
    { id: 'smg',     interval: 0.15, damage: 0.5,  pellets: 1, speed: 1050, spread: 0.08,  radius: 3.5, gateHits: 1 },
    { id: 'shotgun', interval: 0.60, damage: 0.85, pellets: 3, speed: 880,  spread: 0.21,  radius: 4,   gateHits: 1 },
    { id: 'minigun', interval: 0.06, damage: 0.33, pellets: 1, speed: 1150, spread: 0.06,  radius: 3.5, gateHits: 1 },
    { id: 'rocket',  interval: 0.80, damage: 5.6,  pellets: 1, speed: 660,  spread: 0.02,  radius: 7,   gateHits: 4,
      splash: 72, splashFactor: 0.55 },
    { id: 'laser',   interval: 0.40, damage: 3.6,  pellets: 1, speed: 1500, spread: 0.01,  radius: 5,   gateHits: 3,
      pierce: true },            // passes through every zombie in its line
  ],
  stats: { maxRateMult: 4, maxDamageMult: 25 },

  // ── Gates ──────────────────────────────────────────────────────────────────
  // Soldier-gate values are RELATIVE to the crowd when the row appears (small crowd → +1, +2…;
  // big crowd → capped by the level). Red gates are relative too, so they always hurt.
  gateHitsPerStep: 100,       // +/− gates: +1 every N hits ("colpi" = bullets reaching the gate)
  multHitsPerStep: 1200,      // ×/÷ gates: one ladder step every N hits (÷2 → ×2 is a big swing)
  multLadder: [-3, -2, 2, 3], // negative = ÷|n|, positive = ×n (÷3 → ÷2 → ×2 → ×3)
  gates: {
    h: 104,                   // gate panel height
    pad: 7,                   // gap between neighbouring panels
    goodRel: [0.25, 0.6],     // green +n = crowd × rel …
    goodMin: [1, 3],          // … at least this (so 1 soldier still gets +1..+3) …
    addCap: 8,                // … at most addCap × gateScale(level)
    badRel: [0.35, 0.65],     // red −n = crowd × rel (at least 1) …
    badCap: 60,               // … at most badCap × gateScale(level)
    multGainCap: 8,           // a green ×n only shows while it adds ≤ multGainCap × gateScale soldiers;
                              // above that it becomes the best +n (no runaway ×2 → ×3 → ×2 snowball)
    repairGood: 1.2,          // shooting a green +n can raise it up to ×1.2 (at least +1)
    repairBad: 0.25,          // shooting a red −n can raise it up to +|n|×0.25 (a −8 becomes at best +2)
    rare: {
      rateValue: 0.25,        // "+fire rate" gate: +25 % fire rate (until the end of the level)
      damageValue: 1.5,       // "×damage" gate: damage ×1.5 (until the end of the level)
      weaponMaxedDamage: 1.3, // weapon gate when already on the last weapon → ×1.3 damage
    },
  },

  // ── Bonus gates: clear the map ─────────────────────────────────────────────
  bonuses: {
    airstrike: { bombs: 14, duration: 1.4, radius: 120, dmgMult: 40, bossFrac: 0.12 },
    heli: { duration: 12, fireEvery: 0.08, dmgMult: 0.75, offsetX: 95, hoverY: 600 },
  },

  // ── Zombies ────────────────────────────────────────────────────────────────
  // hp = hpMult × zombieHp(level); speed = own walking speed on top of the scroll.
  // weight = minimum soldiers killed on contact; home = sideways homing px/s.
  hpPerSoldier: 2.0,          // contact kills max(weight, ceil(hpLeft / hpPerSoldier))
  zombieTypes: {
    walker:   { hpMult: 1.0, speed: 30, r: 17, weight: 1, coins: 1, score: 10, home: 38 },
    runner:   { hpMult: 0.55, speed: 95, r: 14, weight: 1, coins: 1, score: 15, home: 70,
      zigzag: { amp: 42, freq: 0.9 } },                 // sprints in a zigzag (px, Hz)
    brute:    { hpMult: 4.5, speed: 14, r: 27, weight: 4, coins: 4, score: 50, home: 20,
      armor: 0.5, armorUntil: 0.5 },                    // takes ×0.5 damage until it drops to 50 % hp
    exploder: { hpMult: 1.1, speed: 58, r: 19, weight: 5, coins: 2, score: 25, home: 60,
      explode: { r: 85, dmgMult: 4 } },                 // blows up when killed (hurts zombies) or on contact
    spitter:  { hpMult: 1.3, speed: 30, r: 18, weight: 2, coins: 2, score: 30, home: 24,
      spit: { holdY: [300, 430], every: 2.6, hold: 6, speed: 280, dmgMult: 1.0 } }, // stops and spits acid
    splitter: { hpMult: 1.8, speed: 25, r: 21, weight: 2, coins: 2, score: 20, home: 28,
      splitInto: 'mini', splitCount: 2 },
    shaman:   { hpMult: 1.6, speed: 22, r: 19, weight: 2, coins: 3, score: 40, home: 18,
      heal: { r: 140, perSec: 0.12, holdY: 250, hold: 9 } },  // heals the horde around it
    mini:     { hpMult: 0.45, speed: 50, r: 12, weight: 1, coins: 0, score: 5, home: 56 },
  },
  homingFromY: 230,           // zombies start steering toward the crowd below this y
  maxZombies: 160,
  maxEnemyShots: 48,          // acid globs / boulders pool

  // ── Vehicles ───────────────────────────────────────────────────────────────
  vehicles: {                 // enemy: drive down a lane after a warning; shoot them or dodge
    contactDiv: 3,            // a crash kills max(weight, ceil(hpLeft / (hpPerSoldier × contactDiv)))
    bus: { hpMult: 14, speed: 55, w: 66, h: 132, weight: 12, coins: 8, score: 150, warn: 1.4 },
    car: { hpMult: 5, speed: 200, w: 46, h: 78, weight: 6, coins: 4, score: 70, warn: 1.1,
      swerveY: 250, swerveSpeed: 240 },               // locks onto the crowd's lane once
  },
  allies: {                   // friendly pickups on the road: drive into them
    tank: { duration: 14, fireEvery: 0.8, dmgMult: 7, splash: 90, w: 58, h: 78 },
    truck: { rel: 0.6, min: 3, capMult: 2, w: 52, h: 84 },   // +crowd×0.6 soldiers (≥3, ≤2×addCap×scale)
  },

  // ── Boss ───────────────────────────────────────────────────────────────────
  boss: {
    // Boss hp is CALIBRATED by the generator: the damage the reference player really deals until
    // the boss has covered targetProgress of its walk (so fast or charging bosses are fair too),
    // floored at minHpMult × zombieHp(level). Then re-validated (sim.bossMaxProgress).
    targetProgress: 0.8,
    introTargetProgress: [0.3, 0.45, 0.6], // gentler bosses on levels 1, 2, 3
    minHpMult: 12,
    enterSpeed: 150,          // px/s: quick entrance down to enterY (clear of the HUD) …
    enterY: 270,
    specialFromY: 80,         // specials start once the boss is this far down (in view, below the HUD pills)
    speed: 26,                // … then a slow walk toward the crowd
    r: 66,
    home: 70,
    coins: 25,
    score: 500,
    stompEvery: 1.15,         // s between stomps (light screen shake)
    firstSpecial: 0.5,        // first special ≤ this many s after specialFromY (min(firstSpecial, every × 0.25)), then every 'every'
    // one archetype per level, in this order (then the cycle repeats as a faster "elite")
    order: ['king', 'butcher', 'acid', 'tank', 'blob', 'necro', 'giant', 'hound'],
    eliteCooldown: 0.85,      // special-move cooldowns ×0.85 per completed cycle
    king:    { every: 3.4, summon: 3, type: 'walker' },                 // summons the horde
    butcher: { every: 4.2, telegraph: 0.8, dist: 130, time: 0.35 },     // telegraphed charge
    acid:    { every: 2.5, globs: 3, gap: 0.28, speed: 300, killFrac: 0.06, killMin: 2 }, // aimed acid stream: globs 'gap' s apart,
                                                                        // each kills 6 % of the crowd (≥ 2)
    tank:    { every: 5, shield: 2, reduce: 0.1 },                      // armour-up phases
    blob:    { splitAt: 0.5, splitOffset: 55 },                                          // splits in two at 50 %
    necro:   { every: 3.8, summon: 4, type: 'mini' },                   // raises the dead
    giant:   { every: 3.2, telegraph: 1.1, radius: 78, killFrac: 0.22, killMin: 3 }, // boulders
    hound:   { zigAmp: 150, zigFreq: 0.8, speedMult: 1.45 },            // zigzag rush
  },

  // ── Difficulty curves (campaign: level; endless: equivalent level) ─────────
  difficulty: {
    hpBase: 3,                // walker hp on level 1
    hpGrowth: 1.2,            // zombieHp(level) = hpBase × hpGrowth^(level−1) …
    introHpMult: [0.31, 0.75],// … × this on levels 1 and 2 (a tutorial for a crowd of 1–5)
    hpRamp: [0.9, 2.0],       // … × this from the start to the end of a level's road (campaign):
                              //     the horde toughens as the crowd grows through the level
    gateGrowth: 1.13,         // gate caps scale by gateGrowth^(level−1)
    waveBase: 10,             // zombies per wave on level 1
    wavePerLevel: 1.5,        //   … + this per level
    waveMax: 46,
    waveRamp: [0.35, 1.35],   // inside a level, waves grow from 35 % to 135 % of that size
    badChanceBase: 0.32,      // chance a non-rare lane holds a red gate
    badChancePerLevel: 0.04,
    badChanceMax: 0.65,
    multGoodChance: 0.12,     // a green gate is ×n (else +n) …
    mult3Chance: 0.2,         // … and that ×n is a ×3 (else ×2)
    multBadChance: 0.15,      // a red gate is ÷n (else −n) …
    multBadPerLevel: 0.03,    //   … more often on later levels …
    multBadMax: 0.4,
    div3Chance: 0.3,          // … and that ÷n is a ÷3 (else ÷2)
    rareChance: 0.3,          // chance a gate row carries one special gate
    rareWeights: { weapon: 1, rate: 2, damage: 2, airstrike: 1.5, heli: 1.5 },
    mix: [                    // zombie-type weights by level (first row whose level ≤ L wins)
      { from: 1,  w: { walker: 10 } },
      { from: 2,  w: { walker: 8, runner: 3 } },
      { from: 3,  w: { walker: 7, runner: 3, brute: 1, exploder: 1 } },
      { from: 4,  w: { walker: 6, runner: 3, brute: 1.2, exploder: 1.2, spitter: 0.8 } },
      { from: 5,  w: { walker: 6, runner: 3, brute: 1.5, exploder: 1.2, spitter: 1, splitter: 1.5 } },
      { from: 6,  w: { walker: 5, runner: 3, brute: 1.5, exploder: 1.5, spitter: 1.2, splitter: 1.5, shaman: 0.6 } },
      { from: 10, w: { walker: 4, runner: 4, brute: 2, exploder: 1.8, spitter: 1.5, splitter: 2, shaman: 0.9 } },
    ],
  },

  // ── Level generator ────────────────────────────────────────────────────────
  gen: {
    levelLength: 6250,        // px of road before the boss (~42 s) → ~50–60 s with the boss
    firstBlockAt: 380,        // the opening gate row is on screen from the start …
    hostileEnterMargin: 60,   // … but every zombie / vehicle enters from the top (≥ this beyond the spawn line)
    blockGap: [520, 680],     // distance between blocks
    gapShrinkPerLevel: 5,     // blocks get closer as levels rise …
    minGap: 440,              // … down to this
    weights: { gates: 3, wave: 4, mixed: 3 },
    zombieRowGap: 58,         // vertical spacing between zombie rows inside a wave
    zombiesPerRow: [4, 7],
    mixedFrontGap: [110, 190],// zombies of a mixed block walk this far in front of the gates
    weaponGateBy: 0.7,        // every campaign level offers a weapon gate before 70 % of the road
    gentleUntil: 0.3,         // the first 30 % of a level (the crowd was just cut to 25 %) …
    gentleMix: { walker: 8, runner: 2 }, // … only sends basic zombies, and its red gates are
    gentleBad: [0, 0.5],      // … ×0 on level 1 and ×0.5 later (never ÷): a crowd of 1–3 must not be wiped
    tutorialWaveHp: 1.0,      // level 1's FIRST wave: zombie hp capped here (1 = one rifle bullet)
    vehicleFrom: 2,           // enemy vehicles from level 2 …
    vehicleChance: 0.3,       // … in this share of wave / mixed blocks
    carFrom: 4,               // cars (fast, swerving) from level 4; buses before
    allyChance: 0.3,          // an allied pickup (tank / truck) follows this share of gate rows
    maxAttempts: 12,          // regenerate with a new sub-seed up to this many times …
    easeStep: 0.88,           // … then ease the level (hp & counts ×0.88 per try)
    maxEaseTries: 20,
  },

  // ── Winnability simulator ──────────────────────────────────────────────────
  // The "reasonable path": best gate per row (its bullets improve the gate in front, as in the
  // game), no gate aiming; it hunts threats, side-steps vehicles and (imperfectly — pessimistic)
  // acid and boulders. It enters level L with the REFERENCE state ≈ 80 % of what a careful player
  // brings from levels 1..L−1 (25 % carry-over + kept weapon + shop) — tests prove the median
  // careful run really brings it — and the boss is sized so that this player only just wins:
  // a careful player usually wins, a sloppy one meets the boss with too little and is crushed.
  sim: {
    maxSeconds: 150,          // safety stop
    bossMaxProgress: 0.9,     // the reference player must kill the boss before it covers 90 % of its walk
    bonusValue: 0.45,         // air strike / helicopter gate valued as +45 % firepower
    weaponValue: 0.6,         // a weapon gate is worth +60 % on top of its DPS gain (it is KEPT for the run)
    repairGates: true,        // the reference crowd's bullets improve the gate in front of it (as in the game)
  },
  ref: {
    start: [1, 4, 8, 12, 16, 20, 24, 26, 32, 35], // reference starting crowd on levels 1..10 …
    startGrowth: 1.12,        // … then ×1.12 per level (≈ 60–80 % of the median careful chained run)
    weaponPerLevel: 0.9,      // reference weapon = floor((L−1) × 0.9), capped at the last weapon
    shopPerLevel: 0.5,        // reference shop: floor((L−1) × 0.5) levels of damage AND of fire rate
  },

  // ── Campaign / endless ─────────────────────────────────────────────────────
  carryOver: 0.25,            // next level starts with 25 % of survivors (min = shop start)
  levelClearBonus: 100,       // × level
  endless: {
    distancePerLevel: 2200,   // equivalent level +1 every N px (~12–15 s)
    hpGrowth: 1.13,           // endless zombies grow exponentially …
    rampDistance: 9000,       // waves grow from waveRamp[0] to full size over this distance
    gateLinear: 0.12,         // … while gate caps only grow linearly: ×(1 + 0.12 × (eqLevel−1))
    multChance: 0.5,          // and green ×n gates are rarer → the run always ends
    speedUpPerLevel: 0.02,    // scroll +2 % per equivalent level …
    maxSpeedMult: 1.6,        // … capped
    chunkLen: 2200,
    pxPerPoint: 10,           // score = distance / pxPerPoint + kill points
  },

  // ── Economy / shop ─────────────────────────────────────────────────────────
  coinScalePerLevel: 0.15,    // coins per kill × (1 + 0.15 × (level−1))
  shop: {
    start:  { baseCost: 40, growth: 1.45, perLevel: 1,    max: 30 }, // +1 starting soldier
    damage: { baseCost: 50, growth: 1.5,  perLevel: 0.12, max: 40 }, // +12 % damage
    rate:   { baseCost: 50, growth: 1.5,  perLevel: 0.10, max: 30 }, // +10 % fire rate
  },

  // ── Input ──────────────────────────────────────────────────────────────────
  input: {
    smoothing: 16,            // exponential smoothing rate toward the target x
    keySpeed: 520,            // px/s with ←/→ or A/D
    touchSensitivity: 1.15,   // relative drag gain
    mouseHudBand: 130,        // logical px from the top: the mouse doesn't steer up in the HUD (pause button)
  },

  // ── Feel ───────────────────────────────────────────────────────────────────
  fx: {
    maxParticles: 480,
    maxFloaters: 24,
    shakeBoss: 7,             // px, light
    shakeStomp: 3,
    shakeBomb: 9,
    popScale: 0.38,           // soldier-number "pop" when it changes
    laneHintFromY: 430,       // the lane that WILL be applied lights up once the row is this low
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
