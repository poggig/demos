// ═══════════════════════════════════════════════════════════════════════════
// CHRONICLES OF AZURERUNE — game data (Phaser engine phaser-1.12.0)
// Faithful 5-level port of the original canvas game (poggig/dragon-game, game_v3),
// re-built on the studio Phaser engine with RD art. Five heroes, personalized
// skills (Q) + ultimates (X), 26 acts across castle / underwater / library /
// masquerade / burning-ruins. Original stats + ability descriptors are authoritative.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// ═══ HERO STATS + PERSONALIZED ABILITIES ═══ (per-1/60s-frame units)
// skill = Q descriptor, ult = X descriptor — dispatched by the engine's primitives
// (phaser-1.12.0). Stats are the ORIGINAL game's HERO_STATS values.
const HERO_STATS = {
  // TANK — Titan Form (double size/damage) + Cleave AoE
  minerva: { hp: 170, spd: 1.8, jf: -8.5, atkDmg: 26, atkRange: 32, skillRange: 48, dashDur: 0.20,
    skill: { kind: 'buff', mhpMul: 2, dmgMul: 2, dur: 20, cd: 30 },
    ult: { kind: 'cleave', radius: 200, dmgMul: 3, label: 'cleave' } },
  // RANGED DPS — amber bolts; Freeze Shot (slows)
  elber: { hp: 115, spd: 2.1, jf: -9.0, atkDmg: 32, atkRange: 34, skillMult: 2.5, skillRange: 55, dashDur: 0.14, ranged: true,
    skill: { kind: 'proj', dmgMul: 2.5, color: 0xffcc44 },
    ult: { kind: 'mega', dmgMul: 2, slow: 0.4, slowDur: 3, color: 0x66ddff, label: 'freeze_shot' } },
  // GLASS CANNON — burst melee; 5-way Barrage
  kote: { hp: 70, spd: 2.7, jf: -10.0, atkDmg: 42, atkRange: 28, skillMult: 3.2, skillRange: 44, dashDur: 0.09,
    skill: { kind: 'melee' },
    ult: { kind: 'barrage', shots: 5, dmgMul: 2, spread: 0.16, color: 0xff6600, label: 'barrage' } },
  // HEALER — party heal; Bone Shot (heavy orb)
  nick: { hp: 105, spd: 1.9, jf: -8.5, atkDmg: 18, atkRange: 30, isHealer: true, healAmt: 30, dashDur: 0.18,
    skill: { kind: 'heal', amt: 30 },
    ult: { kind: 'mega', dmgMul: 5, color: 0xe8e8d0, label: 'bone_shot' } },
  // RANGED GLASS CANNON — violet lightning; Party Invisible (defeats stealth)
  nesta: { hp: 65, spd: 2.9, jf: -10.0, atkDmg: 30, atkRange: 28, skillMult: 2.8, skillRange: 130, dashDur: 0.07, ranged: true,
    skill: { kind: 'mega', dmgMul: 2.8, color: 0x9955ff, radius: 22 },
    ult: { kind: 'invis', dur: 5, label: 'party_invisible' } },
};

// ═══ ENEMY HP TIERS ═══ (original: grunt/soldier/elite/miniboss/boss). Kansaldi is a
// literal 1500 and is UNKILLABLE — the finale ends on a 20s survive timer, not a kill.
const EHP = { grunt: 60, soldier: 85, elite: 120, miniboss: 200, boss: 300 };

// ═══ FALLBACK PALETTES ═══ (only if an atlas PNG fails; the shipped look is the RD atlas)
const FallbackPalettes = {
  heroes: {
    kote:    { skin: '#c98a5a', hair: '#241c18', top: '#3a7a55', bottom: '#5a5238', accent: '#c8c8d0', boots: '#2a2018' },
    minerva: { skin: '#e8c4a0', hair: '#c0392b', top: '#d4a830', bottom: '#8a8f98', accent: '#e8e0c8', boots: '#3a342a' },
    elber:   { skin: '#d8b088', hair: '#5a4030', top: '#4a7a3a', bottom: '#5a4a38', accent: '#c8a830', boots: '#3a3028' },
    nesta:   { skin: '#c8b8c0', hair: '#d0d0e0', top: '#3a2a5a', bottom: '#1a0a3a', accent: '#6a88ff', boots: '#241a34' },
    nick:    { skin: '#d0a066', hair: '#e0e0e8', top: '#1a1a3a', bottom: '#12122a', accent: '#44ff88', boots: '#2a2a3a' },
  },
  enemies: {
    goblin:         { shape: 'biped', body: '#4a8a4a', accent: '#c8b030', eye: '#ffee44' },
    castle_soldier: { shape: 'biped', body: '#8a8f98', accent: '#c0392b', eye: '#161616' },
    castle_archer:  { shape: 'biped', body: '#8a7a5a', accent: '#4a6a3a', eye: '#2a2018' },
    knight:         { shape: 'biped', body: '#9aa0aa', accent: '#c0392b', eye: '#161616' },
    hideout_fighter:{ shape: 'biped', body: '#3a3a44', accent: '#886644', eye: '#e8d060' },
    mimic:          { shape: 'brute', body: '#8a5a2a', accent: '#c0392b', eye: '#ffee44' },
    darkmantle:     { shape: 'brute', body: '#2a2244', accent: '#5a4a7a', eye: '#ffdd44' },
    draconian:      { shape: 'biped', body: '#6a8844', accent: '#3a5a2a', eye: '#e8d060' },
    draconian_kapak:{ shape: 'biped', body: '#b87333', accent: '#5a3a1a', eye: '#e8d060' },
    draconian_sivak:{ shape: 'brute', body: '#556633', accent: '#3a4a22', eye: '#e8d060' },
    spectator:      { shape: 'brute', body: '#6644aa', accent: '#aa66ff', eye: '#ff4444' },
    lib_censor:     { shape: 'biped', body: '#3a3a5a', accent: '#c8a848', eye: '#66ff88' },
    boilerdrak:     { shape: 'brute', body: '#888899', accent: '#ff8844', eye: '#ff8844' },
    ogre:           { shape: 'brute', body: '#a88855', accent: '#5a4028', eye: '#ffdd44' },
    bakaris:        { shape: 'biped', body: '#c8a848', accent: '#c0392b', eye: '#3a2a20' },
    kansaldi:       { shape: 'brute', body: '#1a0a0a', accent: '#ff8844', eye: '#ffcc44' },
    animated_sword: { shape: 'biped', body: '#9944ff', accent: '#ddaaff', eye: '#ffffff' },
    gauntlet:       { shape: 'biped', body: '#443322', accent: '#aa8844', eye: '#ffcc44' },
  },
};

// ═══ GAME CONFIG ═══
// - actorScale keys BOTH hero AND enemy (the GTM-8 bug: enemies fell through to 1.0,
//   so Bakaris rendered shorter than the party). Bosses get a per-type bump for size
//   hierarchy (the original reads bosses bigger via a taller hitbox; here via scale+cell).
// - heroBody [22,64]: the hero collision body inside the 56×64 RD atlas cell (feet flush).
const GAME_CONFIG = {
  langButtons: 'off', scrollsPerRun: 2, physics: 'arcade', hazardDamage: true,
  // PROCEDURAL animation v2 (phaser-1.14.0): each actor ships crisp RD POSES; the engine
  // does the MOTION. v2: strikes POSE-SWAP to a real drawn attack pose (idle+attack 2-frame
  // atlases), and each actor moves with a weight PERSONALITY — the rogue is quick and leaning,
  // the armored knight slow and planted, the dragon ponderous. + hurt recoil, landing squash.
  // COMBAT JUICE (phaser-1.15.0): impact feel — hit-stop, white flash, knockback, sparks,
  // camera shake on kills/boss hits, blob shadows, and a dodgeable enemy WINDUP telegraph.
  juice: true,
  // THE ANIMATION HYBRID (GTM-13, art-lab/ANIMATION-PLAYBOOK.md): REAL frame clips own the
  // display — per-frame-QA'd RD walk cycles at 10 fps, the drawn attack pose as a HELD strike
  // (repeat:0), a slow idle breath — while procAnim layers motion transforms on top (bob/lean/
  // hurt/land + weight personality). No poseSwap: the anims clip system owns frames now.
  anims: { fps: 10, clips: { attack: { repeat: 0 }, idle: { fps: 3 } } },
  procAnim: {
    hero: true, enemy: true,
    profiles: {
      // cast
      kote: { weight: 'light' }, nesta: { weight: 'light', bobHz: 10 },
      elber: { weight: 'medium' }, nick: { weight: 'medium', amp: 0.9 },
      minerva: { weight: 'heavy' },
      // foes — nimble skirmishers vs planted armor vs ponderous bulk
      goblin: { weight: 'light' }, bakaris: { weight: 'light' }, darkmantle: { weight: 'light', amp: 0.7 },
      animated_sword: { weight: 'light', amp: 0.8 }, spectator: { weight: 'light', amp: 0.7 },
      castle_archer: { weight: 'medium' }, draconian: { weight: 'medium' }, draconian_kapak: { weight: 'medium' },
      hideout_fighter: { weight: 'medium' }, gauntlet: { weight: 'medium' },
      knight: { weight: 'heavy' }, castle_soldier: { weight: 'heavy' }, mimic: { weight: 'heavy' },
      lib_censor: { weight: 'heavy' }, boilerdrak: { weight: 'heavy' }, ogre: { weight: 'heavy' },
      draconian_sivak: { weight: 'heavy' }, kansaldi: { weight: 'heavy', amp: 0.9 },
    },
  },
  actorScale: { hero: 1.2, enemy: 1.2, kansaldi: 1.6, ogre: 1.5, boilerdrak: 1.3, spectator: 1.35, draconian_sivak: 1.4, draconian_kapak: 1.25, bakaris: 1.2 },
  heroBody: [22, 64],
  bgParallax: 0.5,
  hudPortraits: {
    kote: 'assets/face_kote.png', minerva: 'assets/face_minerva.png', elber: 'assets/face_elber.png',
    nesta: 'assets/face_nesta.png', nick: 'assets/face_nick.png',
  },
};

// ═══ ASSET MANIFEST ═══ (RD atlases animate via GAME_CONFIG.anims; images = tiles/backdrops/pets)
const SpriteConfig = {};
const _heroAtlas = n => ({ type: 'atlas', key: 'atlas_hero_' + n, texture: `assets/hero_${n}.png`, frames: `assets/hero_${n}.json` });
const _enemyAtlas = n => ({ type: 'atlas', key: 'atlas_enemy_' + n, texture: `assets/enemy_${n}.png`, frames: `assets/enemy_${n}.json` });
const _img = (k, f) => ({ type: 'image', key: k, path: `assets/${f}` });
const ASSET_MANIFEST = [
  _heroAtlas('kote'), _heroAtlas('minerva'), _heroAtlas('elber'), _heroAtlas('nesta'), _heroAtlas('nick'),
  _enemyAtlas('goblin'), _enemyAtlas('castle_soldier'), _enemyAtlas('castle_archer'), _enemyAtlas('knight'),
  _enemyAtlas('hideout_fighter'), _enemyAtlas('mimic'), _enemyAtlas('darkmantle'), _enemyAtlas('draconian'),
  _enemyAtlas('spectator'), _enemyAtlas('lib_censor'), _enemyAtlas('boilerdrak'), _enemyAtlas('ogre'),
  _enemyAtlas('bakaris'), _enemyAtlas('kansaldi'), _enemyAtlas('animated_sword'), _enemyAtlas('gauntlet'),
  _enemyAtlas('draconian_sivak'), _enemyAtlas('draconian_kapak'),
  _img('npc_villager', 'npc_villager.png'), _img('npc_noble', 'npc_noble.png'),
  _img('bg_arena', 'bg_arena.png'), _img('bg_river', 'bg_river.png'), _img('bg_festival', 'bg_festival.png'),
  _img('bg_library', 'bg_library.png'), _img('bg_masquerade', 'bg_masquerade.png'), _img('bg_ruins', 'bg_ruins.png'),
  _img('tile_castle', 'tile_castle.png'), _img('tile_garden', 'tile_garden.png'),
  _img('tile_library', 'tile_library.png'), _img('tile_ruins', 'tile_ruins.png'),
  _img('pet_fox', 'pet_fox.png'), _img('pet_skeleton', 'pet_skeleton.png'),
];

// ═══ MAP BUILDERS ═══ (H = MAP_H = 34 tiles; tile codes 0 empty·1 solid·2 decor-solid·
// 3 one-way·4 hazard·5 rubble). Faithful adaptations of the original layouts.
const MAP_H = 34;
// Left/right boundary walls so no one runs off the world.
function bounds(tm, W, H) { MapKit.block(tm, 0, H - 14, 1, 11); MapKit.block(tm, W - 2, H - 14, 2, 11); }

// LEVEL 1 — CASTLE (arena / hallway / stealth)
function buildCastleArena(tm, W, H) {
  MapKit.groundBand(tm, W, H, 3);
  // Platforms sit clear of the backdrop's focal throne zone (visual QA: a platform used
  // to terminate inside the throne art at spawn camera) — shifted/shortened.
  MapKit.platform(tm, 19, H - 8, 5); MapKit.platform(tm, 48, H - 10, 5); MapKit.platform(tm, 70, H - 8, 6);
  bounds(tm, W, H);
}
// Lv1 Act4 stealth: three one-way platform rows the guard hops (rows H-5, H-8, H-11).
function buildCastleStealth(tm, W, H) {
  MapKit.groundBand(tm, W, H, 3);
  for (const row of [H - 5, H - 8, H - 11]) MapKit.platform(tm, 5, row, W - 10);
  bounds(tm, W, H);
}
// LEVEL 2 — GARDEN / FESTIVAL (village walk + Kapak fight)
function buildGardenPath(tm, W, H) {
  MapKit.groundBand(tm, W, H, 3);
  MapKit.platform(tm, 28, H - 8, 7); MapKit.platform(tm, 58, H - 9, 7); MapKit.platform(tm, 84, H - 8, 6);
  bounds(tm, W, H);
}
// Lv2 Act1: sealed UNDERWATER box + interior ledges (swim volume).
function buildUnderwaterArena(tm, W, H) {
  for (let x = 0; x < W; x++) { tm.set(x, 1, 1); tm.set(x, H - 2, 1); tm.set(x, H - 1, 1); }   // top + 2-row floor
  for (let y = 1; y < H; y++) { tm.set(0, y, 1); tm.set(W - 1, y, 1); }                          // side walls
  const ledges = [[18, H - 8], [34, H - 12], [52, H - 7], [70, H - 11], [26, H - 16], [60, H - 16], [44, H - 20], [12, H - 12]];
  for (const [x, y] of ledges) MapKit.platform(tm, x, y, 5);
}
// LEVEL 3 — LIBRARY (stealth / climb / combat) — vertical bookshelf walls + a top balcony.
function buildLibraryHalls(tm, W, H) {
  MapKit.groundBand(tm, W, H, 3);
  for (const frac of [0.22, 0.48, 0.74]) { const x = Math.floor(W * frac); MapKit.block(tm, x, H - 15, 2, 12); }   // triple double-walls
  for (const frac of [0.34, 0.60]) MapKit.platform(tm, Math.floor(W * frac) - 3, H - 11, 6);                        // mid ledges
  MapKit.platform(tm, 4, H - 15, W - 8);                                                                            // full-width top balcony (climb goal)
  MapKit.stairs(tm, 2, H - 3, 11, 1);                                                                               // diagonal stair up from the left
  bounds(tm, W, H);
}
// LEVEL 4 — MASQUERADE HALL — pillars + side balconies + a central one-way platform.
function buildMasqueradeHall(tm, W, H) {
  MapKit.groundBand(tm, W, H, 3);
  const step = Math.floor(W / 5);
  for (let p = 1; p <= 4; p++) MapKit.block(tm, p * step, H - 9, 2, 6);            // 4 pillars
  const balW = Math.floor(W * 0.12);
  MapKit.block(tm, 3, H - 6, balW, 1); MapKit.block(tm, W - 3 - balW, H - 6, balW, 1);   // side balconies
  MapKit.platform(tm, Math.floor(W / 2) - 3, H - 11, 6);                          // central one-way
  bounds(tm, W, H);
}
// LEVEL 5 — BURNING RUINS — rubble pyramids + solid pillars + one-way platforms.
function buildRuinsField(tm, W, H) {
  MapKit.groundBand(tm, W, H, 3);
  const cols = [12, 28, 48, 70, 88], hts = [3, 4, 3, 4, 3];
  for (let i = 0; i < cols.length; i++) if (cols[i] < W - 2) MapKit.rubble(tm, cols[i], H - 3 - hts[i], 3, hts[i]);
  for (const frac of [0.25, 0.55, 0.8]) { const x = Math.floor(W * frac); MapKit.block(tm, x, H - 9, 1, 6); }
  const plats = [[Math.floor(W * 0.08), H - 8, 5], [Math.floor(W * 0.38), H - 10, 5], [Math.floor(W * 0.62), H - 8, 5], [Math.floor(W * 0.85), H - 10, 4]];
  for (const [x, y, w] of plats) MapKit.platform(tm, x, y, w);
  bounds(tm, W, H);
}
