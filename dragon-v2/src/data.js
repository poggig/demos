// ═══════════════════════════════════════════════════════════════════════════
// CHRONICLES OF AZURERUNE — v2 (the Opus 5.5 remake) · game data · engine phaser-1.16.0
// Source of truth: the owner's original canvas game (game_v3/index.html). Every number
// below is the ORIGINAL's unless a comment says "deliberate fix". World art is drawn in
// code by Claude (tools/bake-world.mjs); the cast uses the studio's RD atlases.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// ═══ HEROES ═══ (original HERO_STATS index.html:712-724; per-1/60s-frame units)
// skill = Q, ult = X (engine primitives, phaser-1.12/1.16). Hitbox 20×36 for all (original).
const HERO_STATS = {
  // TANK — Titan Form (mhp×2, +old-mhp heal, atkDmg×2, 20 s; the original's 30 s cooldown
  // starts when the buff ENDS → 50 s from activation) · ult CLEAVE (≤200 px, ×3)
  minerva: { hp: 170, spd: 1.8, jf: -8.5, atkDmg: 26, atkRange: 32, skillRange: 48, skillMult: 2, dashDur: 0.20,
    skill: { kind: 'buff', mhpMul: 2, dmgMul: 2, dur: 20, cd: 50 },
    ult: { kind: 'cleave', radius: 200, dmgMul: 3, label: 'float_cleave' } },
  // RANGED — Q MEGA SHOT: an orb atkDmg×4 at 2.5 px/f toward the nearest foe PLUS a 55 px
  // swath (×2.5 = 80) · ult FREEZE SHOT (orb ×2, slow ×0.4 for 3 s, 2 px/f)
  elber: { hp: 115, spd: 2.1, jf: -9.0, atkDmg: 32, atkRange: 34, skillRange: 55, skillMult: 2.5, dashDur: 0.14, ranged: true,
    skill: { kind: 'mega', dmgMul: 4, speed: 2.5, color: 0xffcc44, radius: 24, melee: true },
    ult: { kind: 'mega', dmgMul: 2, slow: 0.4, slowDur: 3, speed: 2, color: 0x66ddff, label: 'float_freeze_shot' } },
  // GLASS CANNON — Q 44 px strike ×3.2 (134) · ult BARRAGE (5 near-flat bolts ×2 = 84)
  kote: { hp: 70, spd: 2.7, jf: -10.0, atkDmg: 42, atkRange: 28, skillRange: 44, skillMult: 3.2, dashDur: 0.09,
    skill: { kind: 'melee' },
    ult: { kind: 'barrage', shots: 5, dmgMul: 2, spread: 0.012, color: 0xff6600, label: 'float_barrage' } },
  // HEALER — Q heals every living hero +30 · ult BONE SHOT (orb ×5 = 90, 2 px/f)
  nick: { hp: 105, spd: 1.9, jf: -8.5, atkDmg: 18, atkRange: 30, skillRange: 0, skillMult: 0, isHealer: true, healAmt: 30, dashDur: 0.18,
    skill: { kind: 'heal', amt: 30 },
    ult: { kind: 'mega', dmgMul: 5, speed: 2, color: 0xe8e8d0, radius: 26, label: 'float_bone_shot' } },
  // RANGED GLASS — Q wormhole orb ×2.8 (84) at 3 px/f PLUS a 130 px swath (84) · ult PARTY INVISIBLE 5 s
  nesta: { hp: 65, spd: 2.9, jf: -10.0, atkDmg: 30, atkRange: 28, skillRange: 130, skillMult: 2.8, dashDur: 0.07, ranged: true,
    skill: { kind: 'mega', dmgMul: 2.8, speed: 3, color: 0x9955ff, radius: 22, melee: true },
    ult: { kind: 'invis', dur: 5, label: 'float_party_invisible' } },
};

// ═══ ENEMY ART ═══ type → { atlas, artH (idle art height px in the cell), tint? }.
// Foes are built through DragonScene.foe() with the ORIGINAL hitbox + hp/dmg/ai; the art is
// scaled so it stands 1.5× the hitbox height on its feet (the original's render rule).
const ENEMY_ART = {
  bakaris:        { artH: 60 }, goblin: { artH: 58 }, castle_soldier: { artH: 60 }, castle_archer: { artH: 60 },
  knight:         { artH: 60 }, hideout_fighter: { artH: 58 }, mimic: { artH: 46 }, darkmantle: { artH: 46 },
  draconian:      { artH: 58 }, draconian_kapak: { artH: 60 }, draconian_sivak: { artH: 69 }, lib_censor: { artH: 60 },
  animated_sword: { artH: 49 }, gauntlet: { artH: 47 }, spectator: { artH: 58 }, boilerdrak: { artH: 58 },
  ogre:           { artH: 63 }, kansaldi: { artH: 81 },
};

// ═══ FALLBACK PALETTES ═══ (only if an atlas fails to load — the shipped look is the atlas)
const FallbackPalettes = {
  heroes: {
    kote:    { skin: '#c98a5a', hair: '#241c18', top: '#3a7a55', bottom: '#5a5238', accent: '#c8c8d0', boots: '#2a2018' },
    minerva: { skin: '#e8c4a0', hair: '#c0392b', top: '#d4a830', bottom: '#8a8f98', accent: '#e8e0c8', boots: '#3a342a' },
    elber:   { skin: '#d8b088', hair: '#5a4030', top: '#4a7a3a', bottom: '#5a4a38', accent: '#c8a830', boots: '#3a3028' },
    nesta:   { skin: '#c8b8c0', hair: '#d0d0e0', top: '#3a2a5a', bottom: '#1a0a3a', accent: '#6a88ff', boots: '#241a34' },
    nick:    { skin: '#d0a066', hair: '#e0e0e8', top: '#1a1a3a', bottom: '#12122a', accent: '#44ff88', boots: '#2a2a3a' },
  },
  enemies: Object.fromEntries(Object.keys(ENEMY_ART).map(k => [k, { shape: 'biped', body: '#6a6a7a', accent: '#c0392b', eye: '#ffee44' }])),
};

// ═══ GAME CONFIG ═══
const GAME_CONFIG = { scrollsPerRun: 2, actLifecycle: true, langButtons: 'auto', textFit: true, physics: 'arcade', hazardDamage: true };
// >>> STUDIO STANDARD (phaser-1.16.0) — kept as the template ships it, then extended below.
Object.assign(GAME_CONFIG, {
  mobile: true,
  feel: { jumpBuffer: 0.12, companionSpacing: true, lookAhead: 56, landShake: true },
  combat: { companionAttack: true },
  mergeBodies: true,
  juice: true,
});
// <<< STUDIO STANDARD
Object.assign(GAME_CONFIG, {
  // The original's party-brawler rules (index.html:1459-1473, 1502-1540, 1610-1623):
  // companions strike foes within 80×40 px every 0.8 s (60 %); foes hop toward a hero above
  // them; a struck foe charges the nearest hero and keeps hunting; patrollers bump anyone.
  combat: { companionAttack: true, enemyHop: true, chargeOnHit: true, contactAll: true },
  feetAlign: true,                 // bodies stand on their drawn feet (the port's sunk-foe bug)
  heroBody: [20, 36],              // the original hitbox, exactly
  actorScale: { hero: 1.0, enemy: 1.0 },   // per-foe scale is set by DragonScene.foe()
  // THREE-LAYER ANIMATION: drawn walk frames (10 fps) + a held strike + slow idle breath,
  // procAnim motion on top (weight personalities), juice for impact.
  anims: { fps: 10, clips: { attack: { repeat: 0 }, idle: { fps: 3 } } },
  procAnim: {
    hero: true, enemy: true,
    profiles: {
      kote: { weight: 'light' }, nesta: { weight: 'light', bobHz: 10 }, elber: { weight: 'medium' }, nick: { weight: 'medium', amp: 0.9 }, minerva: { weight: 'heavy' },
      goblin: { weight: 'light' }, bakaris: { weight: 'light' }, darkmantle: { weight: 'light', amp: 0.7 }, animated_sword: { weight: 'light', amp: 0.8 }, spectator: { weight: 'light', amp: 0.7 },
      castle_archer: { weight: 'medium' }, draconian: { weight: 'medium' }, draconian_kapak: { weight: 'medium' }, hideout_fighter: { weight: 'medium' }, gauntlet: { weight: 'medium' },
      knight: { weight: 'heavy' }, castle_soldier: { weight: 'heavy' }, mimic: { weight: 'heavy' }, lib_censor: { weight: 'heavy' }, boilerdrak: { weight: 'heavy' }, ogre: { weight: 'heavy' },
      draconian_sivak: { weight: 'heavy' }, kansaldi: { weight: 'heavy', amp: 0.9 },
    },
  },
  bgParallax: 0.25,
  hudPortraits: { kote: 'assets/face_kote.png', minerva: 'assets/face_minerva.png', elber: 'assets/face_elber.png', nesta: 'assets/face_nesta.png', nick: 'assets/face_nick.png' },
});

// ═══ THE CAST A/B ═══ 'rd' = the studio's Retro Diffusion atlases · 'claude' = the heroes
// drawn by Claude in code (tools/bake-cast.mjs). Same cells + clips, so only paths change.
// Chosen on the title screen (?cast=… → remembered per browser).
const CAST_ART = (() => {
  try {
    const q = new URLSearchParams(location.search).get('cast');
    if (q === 'rd' || q === 'claude') { localStorage.setItem('azurerune_v2_cast', q); return q; }
    const s = localStorage.getItem('azurerune_v2_cast'); return s === 'claude' ? 'claude' : 'rd';
  } catch (e) { return 'rd'; }
})();
const CAST_DIR = CAST_ART === 'claude' ? 'cast-claude/' : '';
if (CAST_ART === 'claude') GAME_CONFIG.hudPortraits = Object.fromEntries(Object.keys(HERO_STATS).map(n => [n, `assets/cast-claude/face_${n}.png`]));

// ═══ ASSETS ═══
const SpriteConfig = {};
const WORLD_THEMES = ['castle', 'underwater', 'garden', 'library', 'hall', 'ruins'];
const WORLD_PROPS = {
  castle: ['barrel', 'crate', 'rack', 'banner'], underwater: ['coral', 'weed', 'chest'],
  garden: ['stall', 'lamp', 'sign', 'flowers'], library: ['books', 'desk', 'globe', 'candelabra'],
  hall: ['table', 'fern', 'masks'], ruins: ['cart', 'firebarrel', 'pile'],
};
const _atlas = (k, f) => ({ type: 'atlas', key: k, texture: `assets/${f}.png`, frames: `assets/${f}.json` });
const _img = (k, f) => ({ type: 'image', key: k, path: `assets/${f}.png` });
const ASSET_MANIFEST = [
  ...['kote', 'minerva', 'elber', 'nesta', 'nick'].map(n => _atlas('atlas_hero_' + n, CAST_DIR + 'hero_' + n)),
  ...Object.keys(ENEMY_ART).map(n => _atlas('atlas_enemy_' + n, 'enemy_' + n)),
  _img('npc_villager', 'npc_villager'), _img('npc_noble', 'npc_noble'), _img('pet_fox', 'pet_fox'), _img('pet_skeleton', 'pet_skeleton'),
  ...WORLD_THEMES.flatMap(t => ['far', 'mid', 'top', 'fill', 'plank'].map(p => _img(`${t}_${p}`, `world/${t}_${p}`))),
  _img('ruins_rubble', 'world/ruins_rubble'),
  ...Object.entries(WORLD_PROPS).flatMap(([t, ps]) => ps.map(p => _img(`prop_${t}_${p}`, `world/prop_${t}_${p}`))),
];

// ═══ MAP ═══ The original's worlds are 16–20 tiles tall in a 480 px (30-tile) view, so its
// playfield sat in the TOP 60 % of the screen over an empty band (camera y pinned at 0).
// Deliberate fix: the same tile layout is placed at the BOTTOM of a 30-row world
// (DragonScene.buildOrig offsets every row), so the ground is the bottom of the screen and
// the drawn backdrop fills the sky. Every coordinate in the level files stays ORIGINAL.
const MAP_H = 30;
const GROUND_Y = 27 * T;            // world y of the surface of a 3-row ground band (all originals)
