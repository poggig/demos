// ═══════════════════════════════════════════════════════════════════════════
// PHASER ENGINE TEMPLATE — sacred, content-agnostic core (Phaser 4 era).
// Adopted 2026-07-07 (DECISIONS D19/D20). Replaces the hand-rolled JS engine.
// No level content lives here — data.js (config) and scenes.js (levels) ARE the
// game. Keep this file byte-identical across games; extend it only behind a
// GAME_CONFIG flag with a CHANGELOG entry + a headless regression (golden rule 1).
//
// WHAT PHASER GIVES US FOR FREE (why we migrated, D18/D19):
//  · Real Arcade physics: swept AABB collision → rest-gap == 0 (bodies settle
//    flush on tile tops) and NO tunneling at max fall speed / dash. The old
//    engine's hover/embed bug is structurally gone — it was discrete integer
//    stepping + a mismatched foot sensor; Phaser resolves penetration properly.
//  · fixedStep:true → refresh-rate independence for free (the old engine
//    hand-rolled a 60Hz accumulator; Arcade does it).
//  · Continuous camera follow → dialogue-only acts never inherit a stale camera
//    (the old ActLifecycle camera-snap existed only to paper over that).
//
// CONTRACT PARITY with the hand-rolled engine (so the M6 port is mechanical):
//  data.js  → HERO_STATS, EHP, FallbackPalettes, GAME_CONFIG, MAP_H, tile-grid
//             map builders buildX(tm,W,H), Lang.strings   (near-identical)
//  scenes.js→ HERO_DEFS, level classes extending GameScene, GAME_LEVELS
//  A level supplies: constructor(sceneKey){ super(sceneKey); this.musicTheme }
//                    enter()                     — called once on scene create
//                    bAct1(retry)..bActN(retry)  — SAME names; act builders
//                    step(dt)                    — per-frame win/level logic
//  (the old per-level draw() is gone — Phaser renders sprites in retained mode.)
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// ── World constants (parity with the hand-rolled engine) ──
const T = 16, CW = 800, CH = 480;
const GAME_VERSION = 'phaser-1.16.0';
// The old engine's stat numbers are per-1/60s-frame (spd 2.1 px/frame, jf -9,
// GR 0.6, MF 10). Arcade works in px/second, so we scale by FPS. Keeping data.js
// numbers in per-frame units makes the M6 stat port a copy-paste.
const FPS = 60;
const GRAVITY = 0.6 * FPS * FPS;   // 2160 px/s²  (old GR=0.6 px/frame²)
const MAX_FALL = 10 * FPS;         // 600 px/s    (old MF=10 px/frame)
const cfg = (k, d) => (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG[k] !== undefined) ? GAME_CONFIG[k] : d;
// FEEL (phaser-1.16.0) — GAME_CONFIG.feel = { jumpBuffer, companionSpacing, lookAhead }.
// Input forgiveness + party/camera polish for non-gamer recipients. Each key absent →
// that behaviour is the exact legacy one (byte-identical).
const feel = (k, d) => { const f = cfg('feel', null); return (f && f[k] !== undefined) ? f[k] : d; };
// COMBAT AI (phaser-1.16.0) — GAME_CONFIG.combat = { companionAttack, enemyHop, chargeOnHit,
// contactAll }: the classic party-brawler behaviours of the studio's first hand-rolled game
// (companions swing at nearby foes; foes hop up to a hero standing above them; a struck foe
// charges and keeps hunting; patrollers bump the whole party). Each key true → defaults,
// or an object to tune; absent → legacy (byte-identical).
const COMBAT_DEFAULTS = {
  companionAttack: { range: 80, vrange: 40, cd: 0.8, mul: 0.6 },
  enemyHop: { dx: 240, dyMin: 24, dyMax: 128, vy: -9, cd0: [0.5, 2], cd: [2.5, 4.5] },
  chargeOnHit: { dur: 1.5, mul: 1.8 },
  contactAll: true,
};
const combat = k => { const c = cfg('combat', null); if (!c || !c[k]) return null; return c[k] === true ? COMBAT_DEFAULTS[k] : (typeof c[k] === 'object' ? Object.assign({}, COMBAT_DEFAULTS[k], c[k]) : c[k]); };

// ── ACTOR SCALE (GTM-8 · phaser-1.10.0) ──
// Render heroes/enemies LARGER against full-frame RD art (owner ask: sprites too
// small). GAME_CONFIG.actorScale = a number (all actors), OR an object keyed by
// 'hero'/'enemy' and/or a specific type ({ hero:1.6, enemy:1.4, dragon:3 }). Default
// 1 → no setScale, byte-identical to pre-1.10.0. Arcade bodies do NOT auto-scale
// with setScale (probe GTM-8), so we resize the body to the scaled dims — Arcade's
// default setSize(center) centers the body in the SCALED frame, so a full-frame body
// stays flush (rest-gap 0, verified by 2026-07-14-actor-scale regression).
function actorScaleFor(kind, type) {
  const c = cfg('actorScale', 1);
  if (typeof c === 'number') return c || 1;
  if (c && typeof c === 'object') { const v = c[type] != null ? c[type] : c[kind]; return v != null ? v : 1; }
  return 1;
}
function applyActorScale(spr, bodyW, bodyH, s) {
  // Remember the base transform so PROCEDURAL animation (phaser-1.13.0) can overlay a
  // small visual squash/sway on top without losing the actor's real scale/body dims.
  spr._baseScale = s || 1; spr._baseBW = bodyW; spr._baseBH = bodyH;
  if (!s || s === 1) { if (cfg('feetAlign', false)) fixBody(spr, bodyW, bodyH); return; }
  spr.setScale(s);
  // setSize AFTER setScale is itself multiplied by the sprite scale (probe GTM-8),
  // so pass the BASE dims → body world = bodyW*s × bodyH*s, auto-centered in the
  // scaled frame → a full-frame body stays flush on the ground (rest-gap 0).
  fixBody(spr, bodyW, bodyH);
}
// FEET ALIGN (GAME_CONFIG.feetAlign, phaser-1.16.0): a collision body SHORTER than its art
// frame (a 20×36 hitbox inside a 56×64 drawn cell) is centred by Arcade, so the drawn feet
// hang below the body — actors read sunk into the floor (and NPC-sized art floats). With
// the flag, the body is bottom-anchored to the frame: drawn feet = body bottom = the floor.
// Offsets are in unscaled frame px (Arcade multiplies them by the sprite scale). Absent →
// the legacy centred setSize (byte-identical).
function fixBody(spr, bw, bh) {
  if (cfg('feetAlign', false) && spr.frame && spr.body) {
    // Arcade multiplies size AND offset by the sprite's CURRENT scale, which procAnim squashes
    // every frame (idle breath ±2 %) — the body bottom then jitters ±0.6 px into the floor.
    // Compensate so the world body stays bw·base × bh·base with its bottom on the BASE-scale
    // drawn feet, whatever the visual squash (at sx = sy = base this is exactly the plain form).
    const base = spr._baseScale || 1, sx = Math.abs(spr.scaleX) || 1, sy = Math.abs(spr.scaleY) || 1;
    const fw = spr.frame.realWidth, fh = spr.frame.realHeight, w = bw * base / sx, h = bh * base / sy;
    spr.body.setSize(w, h, false);
    spr.body.setOffset(fw / 2 - (bw * base / 2) / sx, fh / 2 + (base * fh / 2 - bh * base) / sy);
  } else spr.body.setSize(bw, bh);
}

// ── PROCEDURAL ANIMATION (GTM-10 · phaser-1.13.0; v2 GTM-12 · phaser-1.14.0) ──
// "Animate the motion ourselves." RD is great at a single clean CHARACTER POSE but its
// frame-by-frame animation is jerky; so a game ships crisp poses and the engine does the
// MOTION with smooth 60fps transforms keyed to the actor's STATE. Visual only: setScale
// (small squash/stretch) + setAngle (Arcade's AABB ignores rotation) on top of the base
// actorScale; the body is re-fixed each frame, so collision is untouched.
//
// GAME_CONFIG.procAnim: `true` (all heroes+enemies) or an object:
//   { hero, enemy,                        // enable per kind
//     poseSwap: true,                     // v2: swap to a REAL drawn `<base>_attack_0` frame
//                                         //     during a strike, when the atlas ships one —
//                                         //     RD draws the poses, the engine does the motion
//     profiles: { <type>: { weight:'light'|'medium'|'heavy', bobHz, leanDeg, amp } } }
//                                         // v2: per-TYPE motion personality — a nimble rogue
//                                         //     bobs fast + leans hard, an armored knight is
//                                         //     slow + planted. Unlisted types = 'medium'.
// v2 also adds: a HURT recoil (auto-detected hp drop), a LANDING squash (air→ground), and
// lerped state transitions (no pops). Absent → no-op (byte-identical, pre-1.13.0 parity).
function procEnabled(kind) {
  const c = cfg('procAnim', false);
  if (c === true) return true;
  if (c && typeof c === 'object') return !!c[kind];
  return false;
}
const PROC_WEIGHTS = {
  light:  { hz: 13.5, amp: 1.25, lean: 1.35 },
  medium: { hz: 11,   amp: 1,    lean: 1 },
  heavy:  { hz: 8.5,  amp: 0.75, lean: 0.6 },
};
function procProfile(spr) {
  if (spr._procProf) return spr._procProf;
  const c = cfg('procAnim', false);
  const p = (c && typeof c === 'object' && c.profiles && c.profiles[spr.customType]) || {};
  const w = PROC_WEIGHTS[p.weight] || PROC_WEIGHTS.medium;
  return (spr._procProf = {
    hz: p.bobHz != null ? p.bobHz : w.hz,
    amp: p.amp != null ? p.amp : w.amp,
    lean: p.leanDeg != null ? p.leanDeg / 5 : w.lean,   // leanDeg = absolute run-sway degrees (base 5)
  });
}
// (scaleX, scaleY, angleDeg) for a state at time t, modulated by the actor's profile.
// `frameAnims`: when GAME_CONFIG.anims plays REAL walk frames, the run transform DAMPS
// (×0.35 squash, ×0.6 lean) so the drawn gait isn't double-wobbled (GTM-13 hybrid).
function procPose(st, t, atkPhase, prof, frameAnims) {
  const A = prof.amp, L = prof.lean, HZ = prof.hz;
  switch (st) {
    case 'run': { const fa = frameAnims ? 0.35 : 1, fl = frameAnims ? 0.6 : 1; const b = Math.abs(Math.sin(t * HZ)); return { sx: 1 + (0.02 - b * 0.05) * A * fa, sy: 1 + (b * 0.07 - 0.03) * A * fa, ang: Math.sin(t * HZ) * 5 * L * fl }; }
    case 'jump': return { sx: 1 - 0.1 * A, sy: 1 + 0.12 * A, ang: -7 * L };
    case 'fall': return { sx: 1 + 0.07 * A, sy: 1 - 0.07 * A, ang: 4 * L };
    case 'dash': return { sx: 1 + 0.22 * A, sy: 1 - 0.14 * A, ang: -12 * L };
    case 'hurt': return { sx: 1 + 0.06 * A, sy: 1 - 0.09 * A, ang: 10 * L };                 // recoil back
    case 'land': return { sx: 1 + 0.14 * A, sy: 1 - 0.12 * A, ang: 0 };                      // touchdown squash
    case 'attack': case 'skill': { const p = Math.max(0, Math.min(1, atkPhase)); const punch = Math.sin(p * Math.PI); return { sx: 1 + punch * 0.14 * A, sy: 1 - punch * 0.06 * A, ang: -18 * punch * L }; }
    default: { const br = Math.sin(t * 3); return { sx: 1 - br * 0.012 * A, sy: 1 + br * 0.02 * A, ang: Math.sin(t * 1.4) * 1.2 * L }; }   // idle breathe
  }
}
function applyProc(spr, dt) {
  spr._procT = (spr._procT || 0) + dt;
  const dir = spr.rt ? 1 : -1;
  const prof = procProfile(spr);
  const c = cfg('procAnim', false);
  // Landing squash: falling last frame + grounded now → a brief touchdown squash.
  const grounded = spr.body ? (spr.body.blocked.down || spr.body.touching.down) : true;
  if (spr._procAir && grounded) spr._landT = 0.11;
  spr._procAir = spr.body ? !grounded : false;
  if (spr._landT > 0) spr._landT -= dt;
  // Hurt recoil: auto-detect an hp DROP (works for heroes AND enemies, no hurt() hook).
  if (spr._procHp != null && spr.hp != null && spr.hp < spr._procHp) spr._procHurtT = 0.22;
  spr._procHp = spr.hp;
  if (spr._procHurtT > 0) spr._procHurtT -= dt;
  // State: heroes carry `st`; enemies derive from the attack telegraph + body speed.
  let st = spr.st;
  if (st === undefined) st = (spr._atkAnimT > 0 ? 'attack' : (spr.body && Math.abs(spr.body.velocity.x) > 8 ? 'run' : 'idle'));
  const striking = st === 'attack' || st === 'skill';
  if (!striking && spr._procHurtT > 0) st = 'hurt';
  else if (!striking && spr._landT > 0 && (st === 'idle' || st === 'run')) st = 'land';
  let atkPhase = 0;
  if (spr.st === 'attack' && spr.atkT != null) atkPhase = 1 - spr.atkT / 0.3;
  else if (spr.st === 'skill' && spr.skillT != null) atkPhase = 1 - spr.skillT / 0.5;
  else if (spr._atkAnimT > 0) atkPhase = 1 - spr._atkAnimT / ENEMY_ATTACK_POSE;
  // POSE-SWAP (v2): during a strike, display the atlas's REAL drawn attack pose if it ships one.
  if (c && typeof c === 'object' && c.poseSwap && spr.texture && spr.frame) {
    if (spr._frameBase === undefined) {
      const fn = spr.frame.name || '';
      const m = fn.match(/^(.*)_(idle|walk|attack|jump)_\d+$/);
      spr._frameBase = m ? m[1] : null; spr._idleFrame = m ? fn : null;
    }
    if (spr._frameBase) {
      const atkFrame = spr._frameBase + '_attack_0';
      if (striking && spr.texture.has(atkFrame)) { if (spr.frame.name !== atkFrame) spr.setFrame(atkFrame); }
      else if (!striking && spr._idleFrame && spr.frame.name !== spr._idleFrame) spr.setFrame(spr._idleFrame);
    }
  }
  const p = procPose(st, spr._procT, atkPhase, prof, !!cfg('anims', false));
  // Lerp toward the target pose — smooth state transitions, no pops (snappy k).
  const k = Math.min(1, dt * 18);
  spr._pSx = spr._pSx == null ? p.sx : spr._pSx + (p.sx - spr._pSx) * k;
  spr._pSy = spr._pSy == null ? p.sy : spr._pSy + (p.sy - spr._pSy) * k;
  spr._pAng = spr._pAng == null ? p.ang : spr._pAng + (p.ang - spr._pAng) * k;
  const base = spr._baseScale || 1;
  spr.setScale(base * spr._pSx, base * spr._pSy);     // squash/stretch only; facing stays via setFlipX
  spr.setAngle(spr._pAng * dir);                      // lean is facing-corrected
  if (spr.body) fixBody(spr, spr._baseBW || spr.body.width, spr._baseBH || spr.body.height);   // keep collision box fixed (feet-anchored under feetAlign)
}

// ── COMBAT JUICE (GTM-13 · phaser-1.15.0) ──
// "The enemies when they fight are subpar" — impact was missing, not art. Config-gated
// game-feel layer: GAME_CONFIG.juice = true (all on) or { flash, hitstop, knockback,
// sparks, shake, shadows, windup } per-key. Absent → no-op (byte-identical).
//   flash     — the struck actor flashes white for ~90 ms.
//   hitstop   — physics time dilates hard (timeScale 8) for 50/90 ms on hit/kill.
//   knockback — the victim takes a horizontal impulse away from the attacker.
//   sparks    — a tiny engine-drawn impact burst at the victim (no module dep).
//   shake     — camera micro-shake on kills and boss-class hits.
//   shadows   — a soft blob shadow under every actor (grounds the sprites).
//   windup    — enemies TELEGRAPH melee: a 0.18 s leaned-back windup before the blow
//               lands; step away in time and it WHIFFS (readable, dodgeable combat).
function juiceOn(key) {
  const c = cfg('juice', false);
  if (c === true) return true;
  if (c && typeof c === 'object') return c[key] !== false && (key in c ? !!c[key] : c.all !== false);
  return false;
}
function jSpark(scene, x, y, color, n) {
  if (!scene || !scene.add) return;
  for (let i = 0; i < (n || 5); i++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 10;
    const r = scene.add.rectangle(x, y, 3, 3, color || 0xfff2c0, 1).setDepth(50);
    scene.tweens.add({ targets: r, x: x + Math.cos(a) * d * 2.2, y: y + Math.sin(a) * d * 1.6, alpha: 0, scale: 0.4, duration: 190 + Math.random() * 90, onComplete: () => r.destroy() });
  }
}
// One hit's worth of feel, applied to the VICTIM sprite (hero or enemy).
function jHitFX(victim, srcX, heavy) {
  const scene = victim.scene; if (!scene) return;
  if (juiceOn('flash')) victim._jFlashT = 0.09;
  if (juiceOn('knockback') && srcX != null && victim.body && victim.body.enable) {
    const dir = victim.x >= srcX ? 1 : -1;
    victim.body.velocity.x += dir * (heavy ? 150 : 95);
  }
  if (juiceOn('sparks')) jSpark(scene, victim.x + (srcX != null ? (srcX > victim.x ? 8 : -8) : 0), victim.y - (victim.body ? victim.body.height * 0.35 : 12), heavy ? 0xffd24a : 0xfff2c0, heavy ? 9 : 5);
  if (juiceOn('hitstop')) { scene._jHsT = Math.max(scene._jHsT || 0, heavy ? 0.09 : 0.05); scene.physics.world.timeScale = 8; }
  if (juiceOn('shake') && heavy) scene.cameras.main.shake(70, 0.004);
}
// Per-frame juice upkeep for one actor: white-flash decay + the blob shadow.
function jTickActor(spr, dt) {
  if (!spr || !spr.scene) { if (spr && spr._jShadow && spr._jShadow.scene) { spr._jShadow.destroy(); spr._jShadow = null; } return; }   // destroyed actor
  if (spr._jFlashT != null) {
    // Phaser 4 removed setTintFill (it became a console.error shim that does nothing —
    // caught by the GTM-13 playtest audit). The 4.x way: setTint + TintModes.FILL.
    if (spr._jFlashT > 0) { spr._jFlashT -= dt; spr.setTint(0xffffff); if (spr.setTintMode) spr.setTintMode(Phaser.TintModes.FILL); }
    else if (spr._jFlashT > -1) { spr.clearTint(); if (spr.setTintMode) spr.setTintMode(Phaser.TintModes.MULTIPLY); spr._jFlashT = -1; }
  }
  if (juiceOn('shadows')) {
    if (spr._jShadow && !spr._jShadow.scene) spr._jShadow = null;   // act teardown destroyed it
    if (!spr._jShadow && spr.on && spr.scene && spr.body) {
      const w = Math.max(14, spr.body.width * 1.05);
      spr._jShadow = spr.scene.add.ellipse(spr.x, spr.body.bottom + 2, w, 5, 0x000000, 0.27).setDepth((spr.depth || 2) - 1);
    }
    if (spr._jShadow) {
      if (!spr.on || !spr.visible) { spr._jShadow.setVisible(false); }
      else {
        const grounded = spr.body.blocked.down || spr.body.touching.down;
        spr._jShadow.setVisible(true).setPosition(spr.x, spr.body.bottom + 2).setAlpha(grounded ? 0.27 : 0.13);
      }
    }
  }
}

// ── SWIM MODE tunables (E-b, M7 · phaser-1.3.0) ──
// Buoyant Arcade swim, DORMANT unless a scene calls scene.enterSwim(): gravity
// is turned off per body, hold UP/DOWN thrusts vertically, water drag damps all
// motion, and a slight negative buoyancy (sinkV) makes an idle diver drift down
// and settle FLUSH on the seabed (rest-gap==0 still holds). No jump/double-jump;
// Z still attacks. Values are per-1/60s-frame px like the platformer stats and
// are scaled by FPS. Speeds sit far under a tile/frame (16px) so swim can never
// tunnel. Kept on Arcade (NOT Matter) so a level can MIX platformer acts and a
// swim act on ONE proven physics world without re-proving the gates (D26).
// Tune globally via GAME_CONFIG.swim or per-act via enterSwim(opts).
const SWIM_DEFAULTS = {
  swimSpd: null,   // horizontal swim speed px/frame (null → the hero's own spd)
  thrust: 2.6,     // vertical swim speed on hold UP/DOWN (px/frame → 156 px/s)
  drag: 0.86,      // per-frame velocity retention when no input (water resistance)
  sinkV: 0.7,      // idle terminal sink speed px/frame (gentle negative buoyancy)
  maxV: 5.2         // swim speed clamp px/frame (312 px/s ≪ 960 px/s tile/frame)
};

// ── FLY MODE tunables (E-b, M7 · phaser-1.3.0) — jetpack/lift feel ──
// Like swim (gravity off, per-body velocity), but ASYMMETRIC vertical: hold UP to
// LIFT, release to fall under an accelerating (air, not water) descent; light air
// drag so horizontal momentum carries. Dormant unless scene.enterFly(). Same
// tunnel-safety: velocities clamped ≪ a tile/frame.
const FLY_DEFAULTS = {
  flySpd: null,    // horizontal fly speed px/frame (null → the hero's own spd)
  lift: 3.4,       // upward thrust velocity while UP held (px/frame → 204 px/s)
  fall: 0.34,      // downward acceleration when not lifting (px/frame² → gravity-lite)
  drag: 0.94,      // per-frame horizontal retention (thin air → coasts far)
  maxV: 6.5         // fly speed clamp px/frame (390 px/s ≪ 960)
};

// ── DRIVE MODE tunables (E-b, M7 · phaser-1.3.0) — side-view vehicle momentum ──
// Gravity STAYS ON (a ground vehicle) so collision is the proven platformer path
// (rest-gap==0/no-tunnel inherited verbatim). The only change is horizontal FEEL:
// accelerate toward a top speed, coast down via friction (momentum), reverse with
// LEFT, and a small hop on UP for bumps. Dormant unless scene.enterDrive().
const DRIVE_DEFAULTS = {
  accel: 0.28,     // horizontal acceleration px/frame² (throttle)
  maxSpd: 5.5,     // top speed px/frame (330 px/s ≪ 960 → no tunnel; MAX_FALL still caps y)
  friction: 0.94,  // per-frame horizontal retention when off-throttle (coast)
  hop: -7.5        // one-shot jump velocity on UP while grounded (px/frame)
};

// ═══ TRANSLATION SYSTEM (identical contract to the old engine) ═══
// Every player-facing line goes through Lang.t(); the language toggle applies
// to the whole game. Strings live in data.js (Lang.strings).
const Lang = {
  current: 'en',
  strings: { en: {} },
  set(lang) { this.current = lang; },
  // A DEFINED translation wins even when it is the empty string (a deliberate
  // blank line — e.g. a victory overlay a game wants understated). Only fall
  // through to the key NAME when the key is genuinely ABSENT. (The old `||`
  // chain treated '' as falsy and leaked the raw key name onto the screen —
  // caught by the M6 proposal eval; phaser-1.2.0.)
  t(key) {
    const cur = this.strings[this.current], en = this.strings.en;
    // TOUCH VARIANTS (phaser-1.16.0): on a touch device (GAME_CONFIG.mobile) a `<key>_touch`
    // string, when the game ships one, replaces `<key>` — "[TAP]" instead of "[SPACE or CLICK]".
    if (this.touch) { const tk = key + '_touch'; if (cur && tk in cur) return cur[tk]; if (en && tk in en) return en[tk]; }
    if (cur && key in cur) return cur[key];
    if (en && key in en) return en[key];
    return key;
  }
};
// Dialogue line helper: d('narrator','some_key') → {sp,tx} resolved at show-time.
function d(sp, tx) { return { sp, tx }; }

// ═══ INPUT (just-pressed shim over Phaser keyboard, bound to the active scene) ═══
// Game/module code keeps calling I.down('KeyZ') / I.pr('Space') exactly like the
// old engine (so timing-bar and friends port unchanged). I.pr is a real
// just-pressed edge, readable multiple times per frame (unlike raw JustDown).
const CODE2KEY = {
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB',
  KeyA: 'A', KeyD: 'D', KeyW: 'W', KeyS: 'S', KeyZ: 'Z', KeyJ: 'J',
  KeyQ: 'Q', KeyL: 'L', KeyK: 'K', KeyX: 'X', KeyR: 'R', KeyM: 'M',
  Digit1: 'ONE', Digit2: 'TWO', Digit3: 'THREE', Digit4: 'FOUR', Digit5: 'FIVE'
};
const I = {
  _keys: {}, _pending: new Set(), _pressed: new Set(), _down: new Set(), _v: new Set(), _scene: null, _kd: null, _ku: null,
  bind(scene) {
    if (this._scene && this._kd) { this._scene.input.keyboard.off('keydown', this._kd); this._scene.input.keyboard.off('keyup', this._ku); }
    this._scene = scene;
    this._keys = {}; this._pending = new Set(); this._pressed = new Set(); this._down = new Set(); this._v = new Set();
    const KC = Phaser.Input.Keyboard.KeyCodes;
    for (const code in CODE2KEY) this._keys[code] = scene.input.keyboard.addKey(KC[CODE2KEY[code]], true, false); // capture=true → no page scroll on Space/Arrows/Tab
    // Edge detection is EVENT-driven: accumulate first-keydowns between frames
    // and ignore auto-repeat. Polling isDown at frame boundaries drops sub-frame
    // taps — the classic eaten-jump bug. This mirrors the old engine's j-set.
    // (A Space/Enter that advances a dialogue never reaches this: the window handler below
    // preventDefault()s it and Phaser's keyboard manager skips prevented events.)
    this._kd = e => { const c = e.code; if (c && CODE2KEY[c] && !this._down.has(c)) { this._down.add(c); this._pending.add(c); } };
    this._ku = e => { const c = e.code; if (c) this._down.delete(c); };
    scene.input.keyboard.on('keydown', this._kd);
    scene.input.keyboard.on('keyup', this._ku);
  },
  newFrame() { this._pressed = this._pending; this._pending = new Set(); },
  down(c) { return !!(this._keys[c] && this._keys[c].isDown) || this._v.has(c); },
  pr(c) { return this._pressed.has(c); },
  // VIRTUAL keys (phaser-1.16.0, the touch pad): a held on-screen button reads exactly
  // like a held keyboard key — same down()/pr() edges, so every act and module works
  // on a phone with zero per-game code. Empty unless GAME_CONFIG.mobile shows the pad.
  vPress(c) { if (!this._v.has(c)) { this._v.add(c); if (!(typeof D !== 'undefined' && D.on)) this._pending.add(c); } },   // a tap that advances a dialogue is not also a press
  vRelease(c) { this._v.delete(c); }
};

// ═══ HTML UI CHROME (title / hud / dialogue / hint / overlay) ═══
// Kept as DOM overlays (as the hand-rolled engine did): crisp localized text,
// pointer-friendly, trivially assertable in headless tests. Phaser owns the
// canvas world; these sit on top.
const UI = {
  el(id) { return document.getElementById(id); },
  langCodes() {
    return cfg('langButtons', false)
      ? Object.keys(Lang.strings).map(c => c.toUpperCase())
      : ['EN'];
  },
  buildTitle() {
    const langBox = this.el('langBtns');
    const codes = this.langCodes();
    langBox.innerHTML = '';
    langBox.style.display = codes.length < 2 ? 'none' : 'flex';
    codes.forEach(c => {
      const b = document.createElement('button');
      b.className = 'btn'; b.id = 'lang' + c;
      b.style.cssText = 'padding:4px 12px;font-size:10px';
      b.textContent = c;
      b.onclick = () => { Lang.set(c.toLowerCase()); this.refreshTitleText(); };
      langBox.appendChild(b);
    });
    const box = this.el('levelBtns'); box.innerHTML = '';
    GAME_LEVELS.forEach((lv, i) => {
      const b = document.createElement('button');
      b.className = 'btn'; b.id = 'lvlBtn' + i;
      b.textContent = Lang.t(lv.nameKey);
      b.onclick = () => G.start(lv);
      box.appendChild(b);
    });
    this.refreshTitleText();
  },
  refreshTitleText() {
    this.el('title').querySelector('h1').textContent = Lang.t('title');
    this.el('title').querySelector('h2').textContent = Lang.t('subtitle');
    GAME_LEVELS.forEach((lv, i) => { const b = this.el('lvlBtn' + i); if (b) b.textContent = Lang.t(lv.nameKey); });
    this.el('dlg').querySelector('.pr').textContent = Lang.t('press_space');
    this.langCodes().forEach(l => { const b = this.el('lang' + l); if (b) b.style.borderColor = Lang.current === l.toLowerCase() ? '#fff' : '#c8a84e'; });
    if (Mobile.on) Mobile.refreshText();
  },
  showTitle() { this.el('title').style.display = 'flex'; this.el('hud').style.display = 'none'; this.el('hint').textContent = ''; this.hideOverlay(); this.refreshTitleText(); },
  hideTitle() { this.el('title').style.display = 'none'; },
  showHud() { this.el('hud').style.display = 'flex'; },
  hideHud() { this.el('hud').style.display = 'none'; },
  hud(scene) {
    // GAME_CONFIG.hudPortraits (phaser-1.11.0): a map { <heroType>: '<imagePath>' }.
    // When a hero's TYPE has an entry, the HUD tile shows that face crop instead of
    // the name-initial badge — surfaces studio character art + disambiguates same-initial
    // heroes. Absent (or a type with no entry) = the legacy initial badge, byte-identical.
    const portraits = cfg('hudPortraits', null);
    let h = '';
    scene.heroes.forEach((hero, i) => {
      const a = i === scene.ai ? 'act' : '';
      const pct = Math.max(0, hero.hp / hero.mhp * 100);
      const col = pct > 50 ? '#4a4' : pct > 25 ? '#aa4' : '#a44';
      const dim = hero.on ? '' : 'opacity:0.35;filter:grayscale(1);';
      const face = portraits && portraits[hero.customType];
      const badge = face
        ? `<img class="pf" src="${face}" alt="${hero.nm}" style="border:1px solid ${hero.col}99;background:${hero.col}22">`
        : `<div style="width:28px;height:28px;background:${hero.col}33;border-radius:2px;display:flex;align-items:center;justify-content:center"><span style="color:${hero.col};font-size:13px;font-weight:bold">${hero.nm[0]}</span></div>`;
      h += `<div class="hs ${a}" style="${dim}" onclick="G.sc.swap(${i})">${badge}<div class="hp-bar"><div class="hp-fill" style="width:${pct}%;background:${col}"></div></div><div class="nm">${hero.nm}</div></div>`;
    });
    this.el('hud').innerHTML = h;
  },
  setHint(key) { this.el('hint').textContent = key ? Lang.t(key) : ''; },
  // Generic overlay used for pause / game-over. options: [[langKey, handler], …]
  showOverlay(titleKey, options) {
    const o = this.el('overlay');
    o.querySelector('.ot').textContent = Lang.t(titleKey);
    const box = o.querySelector('.opts'); box.innerHTML = '';
    options.forEach(([k, fn]) => {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = Lang.t(k); b.onclick = fn;
      box.appendChild(b);
    });
    o.style.display = 'flex';
  },
  showVictory() {
    const o = this.el('overlay');
    o.querySelector('.ot').textContent = Lang.t('the_end');
    const box = o.querySelector('.opts'); box.innerHTML = '';
    const c1 = document.createElement('div'); c1.className = 'oo'; c1.textContent = Lang.t('credits'); box.appendChild(c1);
    const c2 = document.createElement('div'); c2.className = 'credits'; c2.textContent = Lang.t('credits_party'); box.appendChild(c2);
    const c3 = document.createElement('div'); c3.className = 'oo'; c3.style.marginTop = '14px'; c3.textContent = Lang.t('press_any'); box.appendChild(c3);
    o.style.display = 'flex';
  },
  hideOverlay() { this.el('overlay').style.display = 'none'; },
  hideDlg() { this.el('dlg').style.display = 'none'; }
};

// ═══ DIALOGUE (HTML overlay; Lang keys resolved at display time) ═══
const D = {
  on: false, dlgs: [], idx: 0, cb: null,
  show(dlgs, cb) {
    this.dlgs = dlgs; this.idx = 0; this.cb = cb; this.on = true;
    UI.el('dlg').style.display = 'block';
    this._render();
  },
  _render() {
    const el = UI.el('dlg');
    const cur = this.dlgs[this.idx];
    if (!cur) return;
    el.querySelector('.sp').textContent = cur.sp ? Lang.t(cur.sp) : '';
    el.querySelector('.tx').textContent = cur.tx ? Lang.t(cur.tx) : '';
  },
  advance() {
    if (!this.on) return;
    this.idx++;
    if (this.idx >= this.dlgs.length) {
      this.on = false; UI.hideDlg();
      const cb = this.cb; this.cb = null;
      if (cb) cb();
    } else this._render();
  },
  reset() { this.on = false; this.dlgs = []; this.idx = 0; this.cb = null; UI.hideDlg(); }
};
// Space/Enter/click advance dialogue (window-level, so it works regardless of
// which Phaser scene owns focus — mirrors the old engine's backup advance).
window.addEventListener('keydown', e => {
  if (D.on && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); D.advance(); }
  Music.init(); Music.resume();
});
// A click that lands on a UI BUTTON (level-start, retry/restart, language) is that
// button's click — it must NOT also advance dialogue. Pre-1.8.1 the level-start
// click bubbled here AFTER the scene had synchronously opened its intro dialogue,
// eating line 1 (F40; game-over Retry / pause Restart hit the same path on acts
// that reopen dialogue). Clicks anywhere else advance exactly as before; the
// keyboard path above is untouched.
window.addEventListener('click', e => {
  const t = e.target;
  if (t && t.closest && t.closest('button')) return;
  if (D.on) D.advance();
});

// ═══ MOBILE (phaser-1.16.0): fit-to-screen + touch pad + rotate prompt ═══
// The recipient opens the game from a chat link — on a PHONE. GAME_CONFIG.mobile =
// true | { fit, pad, rotate, fullscreen }:
//  · fit        — the 800×480 stage (canvas + DOM chrome) scales to fill any viewport,
//                 desktop included (CSS transform; game logic is untouched).
//  · pad        — 'auto' (touch devices) | true | false: an on-screen pad whose buttons
//                 drive VIRTUAL keys (I.vPress/vRelease) — every act, module and menu
//                 works by touch with zero per-game code. ▲▼ appear only in swim/fly.
//  · rotate     — portrait on a touch device shows a "rotate your phone" screen.
//  · fullscreen — the first level start asks for fullscreen + landscape lock where the
//                 browser allows it (Android; iOS Safari ignores it harmlessly).
// Absent → nothing here runs: no DOM, no listeners, no transform (byte-identical).
const MOBILE_TEXT = {
  rotate_phone: { en: 'Rotate your phone to play', it: 'Ruota il telefono per giocare', es: 'Gira el teléfono para jugar' },
};
const Mobile = {
  on: false, touch: false, opts: null, scale: 1, _padEl: null, _held: new Map(), _vis: {}, _dims: {}, _shown: null,
  init() {
    const c = cfg('mobile', false); if (!c) return;
    this.on = true;
    this.opts = Object.assign({ fit: true, pad: 'auto', rotate: true, fullscreen: true }, c === true ? {} : c);
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    this.touch = this.opts.pad === true || (this.opts.pad === 'auto' && (coarse || navigator.maxTouchPoints > 0 || 'ontouchstart' in window));
    const meta = document.querySelector('meta[name=viewport]');
    if (meta) meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');   // no viewport-fit=cover: the notch stays outside the page, so the side gutters are fully usable for the docked pad
    this._css();
    if (this.touch) { document.body.classList.add('touch'); Lang.touch = true; }
    if (this.opts.fit) {
      this.fit();
      window.addEventListener('resize', () => this.fit());
      window.addEventListener('orientationchange', () => setTimeout(() => this.fit(), 250));
      if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.fit());
    }
    if (this.opts.rotate) this._rotate();
    if (this.touch) { this._pad(); if (this.opts.fit) this.fit(); }
    // Audio unlock needs a real gesture on mobile browsers (keyboard already does this).
    window.addEventListener('pointerdown', () => { Music.init(); Music.resume(); }, { capture: true });
    // A tap/click on the victory screen returns to the title (keyboard: Space/Enter).
    UI.el('overlay').addEventListener('click', () => { if (G.state === 'victory') G.title(); });
  },
  fit() {
    const box = document.getElementById('gameContainer'); if (!box) return;
    const vv = window.visualViewport, vw = vv ? vv.width : window.innerWidth, vh = vv ? vv.height : window.innerHeight;
    const s = Math.max(0.2, Math.min(vw / CW, vh / CH));
    this.scale = s;
    box.style.position = 'fixed'; box.style.left = '50%'; box.style.top = '50%';
    box.style.transformOrigin = '50% 50%';
    box.style.transform = `translate(-50%, -50%) scale(${s})`;
    try { if (window.game && game.scale && game.scale.updateBounds) game.scale.updateBounds(); } catch (e) { }
    this.layout(vw - CW * s);
  },
  // GUTTER DOCK: a landscape phone letterboxes the 5:3 stage with black side gutters
  // (844×390 → 97 px each side). When a gutter is ≥ 88 px the pad moves INTO them — the
  // d-pad in the left gutter, the actions in the right — so no button ever covers the
  // play area; narrower gutters keep the overlay layout (CSS defaults).
  layout(spare) {
    if (!this._padEl) return;
    const g = spare / 2, dock = g >= 88, k = Math.min(1.15, g / 97);
    const P = dock ? {
      'tp-down': ['l', g / 2 - 22 * k, 12, 44], 'tp-left': ['l', g / 2 - 45 * k, 62, 44], 'tp-right': ['l', g / 2 + 1 * k, 62, 44], 'tp-up': ['l', g / 2 - 22 * k, 112, 44],
      'tp-jump': ['r', g / 2 - 28 * k, 12, 56], 'tp-attack': ['r', g / 2 - 28 * k, 76, 56], 'tp-dash': ['r', g / 2 + 2 * k, 140, 40], 'tp-skill': ['r', g / 2 - 42 * k, 140, 40],
      'tp-ult': ['r', g / 2 - 20 * k, 188, 40], 'tp-swap': ['rt', g / 2 + 4 * k, 8, 36], 'tp-pause': ['rt', g / 2 - 40 * k, 8, 36],
    } : null;
    this._docked = dock;
    for (const b of this._padEl.children) {
      const s = b.style, p = P && P[b.id];
      s.left = s.right = s.top = s.bottom = '';
      if (!p) { s.removeProperty('--s'); continue; }
      const [side, x, y, size] = p;
      s.setProperty('--s', Math.round(size * k) + 'px');
      if (side === 'l') { s.left = Math.round(x) + 'px'; s.bottom = Math.round(y * k) + 'px'; }
      else if (side === 'r') { s.right = Math.round(x) + 'px'; s.bottom = Math.round(y * k) + 'px'; }
      else { s.right = Math.round(x) + 'px'; s.top = Math.round(y) + 'px'; }
    }
  },
  text(key) {
    const cur = Lang.strings[Lang.current], en = Lang.strings.en;
    if (cur && key in cur) return cur[key];
    const m = MOBILE_TEXT[key]; if (m) return m[Lang.current] || m.en;
    return (en && key in en) ? en[key] : key;
  },
  refreshText() { const r = document.getElementById('rotateMsg'); if (r) r.lastChild.textContent = this.text('rotate_phone'); },
  _css() {
    const st = document.createElement('style'); st.id = 'mobileCss';
    st.textContent = [
      'html,body{height:100%}body{height:100dvh;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;overscroll-behavior:none;-webkit-tap-highlight-color:transparent}',
      '#touchPad{position:fixed;inset:0;pointer-events:none;z-index:40;display:none}',
      '#touchPad .tp-b{position:absolute;pointer-events:auto;width:var(--s);height:var(--s);border-radius:50%;box-sizing:border-box;background:rgba(10,12,30,.40);border:2px solid rgba(240,230,192,.50);color:rgba(240,230,192,.92);font:bold calc(var(--s)*.40)/1 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;touch-action:none}',
      '#touchPad .tp-b.on{background:rgba(200,168,78,.55);border-color:#fff}',
      '#touchPad .tp-b.off{opacity:.3}',
      '#tp-left{--s:64px;left:calc(14px + env(safe-area-inset-left));bottom:40px}',
      '#tp-right{--s:64px;left:calc(98px + env(safe-area-inset-left));bottom:40px}',
      '#tp-up{--s:56px;left:calc(60px + env(safe-area-inset-left));bottom:112px}',
      '#tp-down{--s:56px;left:calc(60px + env(safe-area-inset-left));bottom:0px}',
      '#tp-jump{--s:70px;right:calc(14px + env(safe-area-inset-right));bottom:18px}',
      '#tp-attack{--s:70px;right:calc(96px + env(safe-area-inset-right));bottom:44px}',
      '#tp-dash{--s:50px;right:calc(24px + env(safe-area-inset-right));bottom:100px}',
      '#tp-skill{--s:50px;right:calc(110px + env(safe-area-inset-right));bottom:126px}',
      '#tp-ult{--s:50px;right:calc(178px + env(safe-area-inset-right));bottom:18px}',
      '#tp-swap{--s:42px;right:calc(62px + env(safe-area-inset-right));top:10px}',
      '#tp-pause{--s:42px;right:calc(12px + env(safe-area-inset-right));top:10px}',
      '#rotateMsg{position:fixed;inset:0;z-index:60;display:none;flex-direction:column;gap:14px;align-items:center;justify-content:center;background:#0a0a1a;color:#f0e6c0;font:bold 20px system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:24px}',
      '#rotateMsg .ri{font-size:54px;color:#c8a84e}',
      '@media (orientation: portrait){body.touch #rotateMsg{display:flex}}',
      'body.touch #dlg{font-size:18px}body.touch #dlg .sp{font-size:15px}body.touch #dlg .pr{font-size:12px}',
      'body.touch .btn{font-size:16px;padding:11px 34px}body.touch #hint{font-size:12px}body.touch .hs .nm{font-size:10px}',
    ].join('\n');
    document.head.appendChild(st);
  },
  _rotate() {
    const r = document.createElement('div'); r.id = 'rotateMsg';
    const i = document.createElement('div'); i.className = 'ri'; i.textContent = '⟳';
    const t = document.createElement('div'); t.textContent = this.text('rotate_phone');
    r.appendChild(i); r.appendChild(t); document.body.appendChild(r);
  },
  _pad() {
    const pad = document.createElement('div'); pad.id = 'touchPad';
    [['tp-left', 'ArrowLeft', '◀'], ['tp-right', 'ArrowRight', '▶'], ['tp-up', 'ArrowUp', '▲'], ['tp-down', 'ArrowDown', '▼'],
      ['tp-jump', 'Space', '▲'], ['tp-attack', 'KeyZ', '⚔︎'], ['tp-dash', 'KeyK', '»'], ['tp-skill', 'KeyQ', '★'],
      ['tp-ult', 'KeyX', '✸'], ['tp-swap', 'Tab', '⇄'], ['tp-pause', 'Escape', 'Ⅱ']].forEach(([id, k, label]) => {
      const b = document.createElement('div'); b.className = 'tp-b'; b.id = id; b.dataset.k = k; b.textContent = label; pad.appendChild(b);
    });
    document.body.appendChild(pad);
    this._padEl = pad;
    const held = this._held;
    const press = (pid, el) => {
      const prev = held.get(pid); if (prev === el) return;
      if (prev) { I.vRelease(prev.dataset.k); prev.classList.remove('on'); held.delete(pid); }
      if (el) { held.set(pid, el); I.vPress(el.dataset.k); el.classList.add('on'); }
    };
    pad.addEventListener('pointerdown', e => {
      const el = e.target && e.target.closest ? e.target.closest('.tp-b') : null; if (!el) return;
      e.preventDefault(); press(e.pointerId, el);
    });
    // slide a thumb across the d-pad (◀ ↔ ▶) without lifting it
    window.addEventListener('pointermove', e => {
      const cur = held.get(e.pointerId); if (!cur || !cur.dataset.k.startsWith('Arrow')) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY), el = hit && hit.closest ? hit.closest('#touchPad .tp-b') : null;
      if (el && el !== cur && el.dataset.k.startsWith('Arrow')) press(e.pointerId, el);
    });
    const up = e => { if (held.has(e.pointerId)) press(e.pointerId, null); };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  },
  _releaseAll() { this._held.forEach(el => { I.vRelease(el.dataset.k); el.classList.remove('on'); }); this._held.clear(); },
  _show(id, on) { if (this._vis[id] === on) return; this._vis[id] = on; const e = document.getElementById(id); if (e) e.style.display = on ? 'flex' : 'none'; },
  _dim(id, on) { if (this._dims[id] === on) return; this._dims[id] = on; const e = document.getElementById(id); if (e) e.classList.toggle('off', on); },
  // Called every frame by GameScene.update and on Title: pad only during play; ▲▼ only
  // in swim/fly; ult only for heroes that have one (dimmed once spent); skill dims on CD.
  sync() {
    if (!this._padEl) return;
    const sc = G.sc, play = G.state === 'play' && !!sc;
    const vis = play ? 'block' : 'none';
    if (this._shown !== vis) { this._padEl.style.display = vis; this._shown = vis; if (!play) this._releaseAll(); }
    if (!play) return;
    const h = sc.heroes && sc.heroes[sc.ai], alt = !!(sc._swim || sc._fly);
    this._show('tp-up', alt); this._show('tp-down', alt);
    this._show('tp-ult', !!(h && h._ult)); this._dim('tp-ult', !!(h && h._rUsed));
    this._dim('tp-skill', !!(h && h.skillCD > 0));
    this._show('tp-swap', !!(sc.heroes && sc.heroes.filter(x => x.on).length > 1));
  },
  goFullscreen() {
    if (!this.touch || !this.opts.fullscreen) return;
    try {
      const d = document.documentElement;
      if (!document.fullscreenElement && d.requestFullscreen) {
        d.requestFullscreen({ navigationUI: 'hide' }).then(() => {
          try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => { }); } catch (e) { }
        }).catch(() => { });
      }
    } catch (e) { }
  }
};

// ═══ TILEMAP GRID (identical set/get/sol/solUp API → map builders port verbatim) ═══
// Tile codes: 0 empty · 1 solid · 2 decor-solid · 3 one-way platform ·
// 4 hazard · 5 rubble. buildMap() realizes this grid into Arcade static bodies.
class TM {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); }
  set(x, y, v) { if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.d[y * this.w + x] = v; }
  get(x, y) { if (x < 0 || x >= this.w) return 1; if (y < 0) return 0; if (y >= this.h) return 1; return this.d[y * this.w + x]; }
  sol(x, y) { const v = this.get(x, y); return v >= 1 && v <= 5; }
  solUp(x, y) { const v = this.get(x, y); return v >= 1 && v <= 5 && v !== 3; }
}

// ═══ PROCEDURAL ART (palette-distinct textures from FallbackPalettes, zero PNGs) ═══
// The studio art policy promises every hero/enemy is visually distinct with
// zero image assets. We bake a small pixel-art canvas per type into a Phaser
// texture from its FallbackPalettes entry. Idiomatic replacement for the old
// _drawHeroFallback / _drawEnemyFallback immediate-mode draws. Richer per-frame
// animation + real sprite atlases are the M7 asset pipeline (E-c).
const Art = {
  heroKey(type) { return 'hero_' + type; },
  enemyKey(type) { return 'enemy_' + type; },
  _pal(map, type) { return (typeof FallbackPalettes !== 'undefined' && FallbackPalettes[map] && FallbackPalettes[map][type]) || {}; },
  // A game MAY ship a studio-baked atlas (E-c, D27) under key `atlas_hero_<type>` /
  // `atlas_enemy_<type>` with frames named `hero_<type>_<n>` / `enemy_<type>_<n>`
  // (tools/make-atlas.mjs). When loaded (ASSET_MANIFEST), ensureX PREFERS it over
  // baking; frameFor gives the display frame. Absent → baked palette art (default).
  // Initial display frame for a shipped atlas. Prefers a neutral pose that EXISTS:
  // idle-clip frame 0, else walk-clip frame 0, else flat-strip frame 0, else the
  // first packed frame. A flat walk strip has `<prefix>0` → BYTE-IDENTICAL to the
  // pre-1.7.0 `<prefix>0`; a per-state atlas (no `<prefix>0`) resolves to a real
  // frame instead of a missing one (no Phaser "no frame" warning).
  _displayFrame(scene, texKey, prefix) {
    const t = scene.textures.get(texKey);
    const want = [prefix + 'idle_0', prefix + 'walk_0', prefix + '0'];
    for (const w of want) if (t.has(w)) return w;
    const names = t.getFrameNames();   // excludes __BASE
    return names.length ? names[0] : undefined;
  },
  heroFrame(scene, type) { const tk = 'atlas_hero_' + type; return scene.textures.exists(tk) ? this._displayFrame(scene, tk, 'hero_' + type + '_') : undefined; },
  enemyFrame(scene, type) { const tk = 'atlas_enemy_' + type; return scene.textures.exists(tk) ? this._displayFrame(scene, tk, 'enemy_' + type + '_') : undefined; },
  // ── ATLAS ANIMATION PLAYBACK (E-c v2, M8 · phaser-1.6.0; PER-STATE CLIPS M10 · phaser-1.7.0) ──
  // When a studio-baked atlas ships MULTIPLE frames (`tools/make-atlas.mjs`) AND
  // GAME_CONFIG.anims is on, build looping animation(s) on the GLOBAL anim manager
  // (shared across scenes/acts/retries — created once, guarded by anims.exists) and
  // let the actor drive them from its state. Returns `{anims, idle, walk, nonloop}` or null.
  //
  // Two atlas shapes, auto-detected from the packed frame names:
  //  · FLAT WALK STRIP `<kind>_<type>_<n>` (the M8 default) → one `<kind>_<type>_walk`
  //    anim; `anims = {walk}`. BYTE-IDENTICAL to phaser-1.6.0.
  //  · NAMED CLIPS `<kind>_<type>_<clip>_<n>` (M10 baker `clips` param) → one looping
  //    `<kind>_<type>_<clip>` anim per clip (idle/walk/attack/jump); `anims` maps each
  //    clip name → its anim key. syncAnim selects by actor state (STATE2CLIP). A clip may
  //    be tuned per-clip via GAME_CONFIG.anims.clips (phaser-1.8.0): `{fps}` overrides its
  //    frame rate, `{repeat:0}` makes it play once and HOLD its last frame (returned in
  //    `nonloop`) — e.g. a decisive strike. Absent overrides → all loop at the global fps.
  //
  // DORMANT by default: no `anims` flag → null → the actor shows its single
  // constructor frame, byte-identical to phaser-1.5.0. A procedural (no-atlas) actor
  // OR a <2-frame atlas also returns null (nothing to animate) — graceful, never a
  // blank sprite. GAME_CONFIG.anims may be `true` or `{fps:<n>}` (default 8).
  animsFor(scene, kind, type) {
    const ac = cfg('anims', false);
    if (!ac) return null;
    const texKey = 'atlas_' + kind + '_' + type;
    if (!scene.textures.exists(texKey)) return null;          // procedural actor → no anim
    const prefix = kind + '_' + type + '_';                   // frame names: <kind>_<type>_...
    const all = scene.textures.get(texKey).getFrameNames().filter(n => n.indexOf(prefix) === 0);
    if (all.length < 2) return null;                          // single-frame atlas → nothing to animate
    const fps = (ac && ac.fps) || 8;
    const byNum = pfxLen => (a, b) => (parseInt(a.slice(pfxLen), 10) || 0) - (parseInt(b.slice(pfxLen), 10) || 0);
    // Classify each frame: a named clip `<clip>_<n>` vs a flat-strip index `<n>`.
    const clips = {}, flat = [];
    for (const n of all) {
      const rest = n.slice(prefix.length);
      const m = /^([a-z]+)_(\d+)$/.exec(rest);
      if (m) (clips[m[1]] || (clips[m[1]] = [])).push(n);
      else if (/^\d+$/.test(rest)) flat.push(n);
    }
    const clipKeys = Object.keys(clips);
    if (!clipKeys.length) {                                   // ── FLAT WALK STRIP (phaser-1.6.0 behavior) ──
      const walk = prefix + 'walk';
      if (flat.length < 2) return null;
      if (!scene.anims.exists(walk)) {
        const names = flat.sort(byNum(prefix.length));
        scene.anims.create({ key: walk, frames: names.map(n => ({ key: texKey, frame: n })), frameRate: fps, repeat: -1 });
      }
      return { anims: { walk }, walk, idle: prefix + '0' };
    }
    // ── NAMED CLIPS (per-state, phaser-1.7.0; per-clip PLAYBACK OVERRIDES phaser-1.8.0) ──
    // one looping anim per packed clip, UNLESS GAME_CONFIG.anims.clips overrides it.
    // `anims.clips` maps a clip NAME → { fps, repeat }: `fps` overrides the global frame
    // rate for that clip; `repeat:0` makes it NON-LOOPING (play once, then HOLD its last
    // frame — a decisive strike/pose that lands and stays, not a flicker-loop). Absent →
    // every clip loops at the global fps, BYTE-IDENTICAL to phaser-1.7.0. Non-looping
    // clip keys are returned in `nonloop` so syncAnim knows not to restart a held clip.
    const perClip = (ac && ac.clips) || {};
    const map = {}, nonloop = new Set();
    for (const clip of clipKeys) {
      const key = prefix + clip;                              // <kind>_<type>_<clip>
      map[clip] = key;
      const ov = perClip[clip] || {};
      const rep = ov.repeat === undefined ? -1 : ov.repeat;   // default loop (phaser-1.7.0)
      if (rep === 0) nonloop.add(key);                        // play-once-and-hold clip
      if (!scene.anims.exists(key)) {
        const names = clips[clip].sort(byNum((prefix + clip + '_').length));
        scene.anims.create({ key, frames: names.map(n => ({ key: texKey, frame: n })), frameRate: ov.fps || fps, repeat: rep });
      }
    }
    // Frame to hold when the current state has no clip: idle clip frame 0, else walk
    // clip frame 0, else the first packed frame (never a blank sprite).
    const idle = (clips.idle && clips.idle[0]) || (clips.walk && clips.walk[0]) || all[0];
    return { anims: map, walk: map.walk, idle, nonloop };
  },
  ensureHero(scene, type, w, h) {
    if (scene.textures.exists('atlas_hero_' + type)) return 'atlas_hero_' + type;   // studio atlas wins
    const key = this.heroKey(type);
    if (scene.textures.exists(key)) return key;
    const p = this._pal('heroes', type);
    const skin = p.skin || '#c8a866', hair = p.hair || '#3a2a1a', top = p.top || '#4a6a8a',
      bottom = p.bottom || '#4a4a2a', accent = p.accent || top, boots = p.boots || '#1a1a0a';
    const tex = scene.textures.createCanvas(key, w, h);
    const c = tex.getContext(); const sx = w / 20, sc = h / 36;
    const R = (col, x, y, ww, hh) => { c.fillStyle = col; c.fillRect(x * sx, y * sc, ww * sx, hh * sc); };
    R(hair, 6, 4, 8, 4);         // hair
    R(skin, 7, 7, 6, 6);         // head
    R(top, 5, 14, 10, 11);       // torso
    R(accent, 4, 14, 1.5, 8); R(accent, 14.5, 14, 1.5, 8); // arms
    R(bottom, 5, 24, 10, 7);     // legs
    R(boots, 5, 31, 4.5, 5); R(boots, 10.5, 31, 4.5, 5);   // boots
    tex.refresh();
    return key;
  },
  ensureEnemy(scene, type, w, h) {
    if (scene.textures.exists('atlas_enemy_' + type)) return 'atlas_enemy_' + type;   // studio atlas wins
    const key = this.enemyKey(type);
    if (scene.textures.exists(key)) return key;
    const p = this._pal('enemies', type);
    const body = p.body || '#775566', accent = p.accent || '#aa8899', eye = p.eye || '#ffee88', shape = p.shape || 'biped';
    const tex = scene.textures.createCanvas(key, w, h);
    const c = tex.getContext();
    const cx = w / 2;
    c.clearRect(0, 0, w, h);
    if (shape === 'blob' || shape === 'fish') {
      c.fillStyle = body; c.beginPath(); c.ellipse(cx, h * 0.55, w * 0.4, h * 0.34, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = eye; c.fillRect(cx - w * 0.16, h * 0.42, w * 0.1, w * 0.1); c.fillRect(cx + w * 0.06, h * 0.42, w * 0.1, w * 0.1);
    } else if (shape === 'machine') {
      c.fillStyle = body; c.fillRect(w * 0.14, h * 0.15, w * 0.72, h * 0.8);
      c.fillStyle = accent; c.fillRect(w * 0.14, h * 0.15, w * 0.72, h * 0.14);
      c.fillStyle = eye; c.fillRect(cx - w * 0.1, h * 0.4, w * 0.2, h * 0.12);
    } else { // biped / brute / flyer
      c.fillStyle = body; c.fillRect(w * 0.24, h * 0.32, w * 0.52, h * 0.5);
      c.fillStyle = accent; c.beginPath(); c.ellipse(cx, h * 0.2, w * 0.24, h * 0.16, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = eye; c.fillRect(cx - w * 0.14, h * 0.15, w * 0.08, w * 0.08); c.fillRect(cx + w * 0.06, h * 0.15, w * 0.08, w * 0.08);
      c.fillStyle = body; c.fillRect(w * 0.26, h * 0.8, w * 0.16, h * 0.2); c.fillRect(w * 0.58, h * 0.8, w * 0.16, h * 0.2);
    }
    tex.refresh();
    return key;
  }
};

// Hero state → atlas clip name (per-state clips, phaser-1.7.0). A FLAT walk strip
// exposes only `walk`, so every non-`run` state finds no clip and falls through to
// the idle frame — BYTE-IDENTICAL to phaser-1.6.0. A per-state atlas additionally
// answers idle/attack/jump. `dash`/`skill`→attack; `fall`→jump. `dash` is
// intentionally unmapped (holds the idle frame, as pre-1.7.0 did for non-run).
const HERO_STATE2CLIP = { run: 'walk', idle: 'idle', jump: 'jump', fall: 'jump', attack: 'attack', skill: 'attack' };

// Play a clip on a sprite, honoring a NON-LOOPING (repeat:0) clip (per-clip playback
// overrides, phaser-1.8.0). A looping clip uses the phaser-1.7.0 path exactly
// (`play(key, true)` — ignoreIfPlaying, so it does not restart each frame). A
// non-looping clip must NOT be restarted once it has run to its last frame: after it
// completes, Phaser keeps `currentAnim` set and holds the final frame, so we return as
// long as this clip is the current one (playing OR held). It (re)starts only when the
// sprite's current anim is a DIFFERENT clip — i.e. a freshly-entered state or a new
// strike (the intervening walk/idle clip always resets `currentAnim` between strikes).
// BYTE-IDENTICAL to phaser-1.7.0 when `nonloop` is empty/absent (every call → the else).
function playClip(sprite, a, key) {
  if (a.nonloop && a.nonloop.has(key)) {
    const cur = sprite.anims.currentAnim;
    if (cur && cur.key === key) return;   // this clip is already playing, or finished + holding its last frame
    sprite.anims.play(key);               // fresh (re)start: a new state / a new strike
    return;
  }
  sprite.anims.play(key, true);           // looping clip: ignoreIfPlaying (phaser-1.7.0 path)
}

// ═══ HERO (Arcade sprite; input-driven, real physics) ═══
class Hero extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type, name, color) {
    const tk = Art.ensureHero(scene, type, 20, 36);
    super(scene, x, y, tk, Art.heroFrame(scene, type));   // atlas frame if shipped, else baked texture
    scene.add.existing(this); scene.physics.add.existing(this);
    this.customType = type; this.nm = name; this.col = color;
    this.setOrigin(0.5, 0.5);
    // GAME_CONFIG.heroBody = [w, h] sizes the hero collision body to match a
    // larger RD-character atlas cell (feet-align: a full-cell-height, narrower body).
    // Default [20, 36] → byte-identical to pre-1.10.0. (Enemies size via their ctor w,h.)
    const _hb = cfg('heroBody', null), _bw = _hb ? _hb[0] : 20, _bh = _hb ? _hb[1] : 36;
    this.body.setSize(_bw, _bh); this.body.setMaxVelocity(9999, MAX_FALL);
    applyActorScale(this, _bw, _bh, actorScaleFor('hero', type));
    this.on = true; this.ctrl = false; this.rt = true; this.st = 'idle';
    this.jumps = 0; this.maxJumps = 2;
    this.atkT = 0; this.atkCD = 0; this.skillT = 0; this.skillCD = 0; this.dshT = 0; this.dashCD = 0; this.inv = 0;
    this._swingHit = new Set();
    this._anims = Art.animsFor(scene, 'hero', type);   // atlas walk cycle if GAME_CONFIG.anims + multi-frame atlas, else null
    this.applyStats(type);
  }
  // Drive the atlas animation from the movement state (phaser-1.6.0; per-state clips
  // phaser-1.7.0). Selects the clip for `st` (STATE2CLIP); a flat walk strip only
  // answers `run`→walk, every other state holds the idle frame → byte-identical to
  // pre-1.7.0. No-op when `_anims` is null (no flag / procedural / single-frame atlas).
  syncAnim() {
    const a = this._anims; if (!a) return;
    const key = a.anims[HERO_STATE2CLIP[this.st]];          // anim for this state, or undefined
    if (key) { playClip(this, a, key); return; }            // looping: ignoreIfPlaying; non-looping: play-once-hold (phaser-1.8.0)
    if (this.anims.isPlaying) this.anims.stop();
    if (this.frame.name !== a.idle) this.setFrame(a.idle);
  }
  applyStats(type) {
    const s = (typeof HERO_STATS !== 'undefined' && HERO_STATS[type]) || {};
    this.mhp = s.hp || 100; this.hp = this.mhp;
    if (G.heroHPs && G.heroHPs[type] !== undefined) this.hp = Math.max(1, Math.min(G.heroHPs[type], this.mhp));
    this.spd = s.spd || 2.1; this.jf = s.jf || -9; this.atkDmg = s.atkDmg || 24;
    this._skillMult = s.skillMult || 2; this._atkRange = s.atkRange || 30; this._skillRange = s.skillRange || 50;
    this.dashDur = s.dashDur || 0.12; this._isHealer = s.isHealer || false; this._healAmt = s.healAmt || 0;
    this._ranged = s.ranged || false;   // ranged heroes fire a projectile on attack (no melee box)
    // PERSONALIZED ABILITY descriptors (phaser-1.12.0) — content-agnostic: the GAME's
    // HERO_STATS assigns each hero a `skill` (Q) and `ult` (X) descriptor; the engine
    // dispatches them to generic primitives. Absent → legacy generic skill + no ultimate
    // (byte-identical to pre-1.12.0). See _useSkill / GameScene.triggerUltimate.
    this._skill = s.skill || null; this._ult = s.ult || null;
    this._rUsed = false;                // ultimate charge (once per act; reset here on act (re)build)
    this._buffActive = false; this._buffT = 0; this._buffCd = 0;   // Titan-Form-style self-buff
    this._invis = false; this._invisT = 0;                          // party-invisible (Nesta ult)
  }
  control(dt) {
    if (!this.on) return;
    if (this.inv > 0) this.inv -= dt;
    if (this.atkCD > 0) this.atkCD -= dt;
    if (this.dashCD > 0) this.dashCD -= dt;
    if (this.skillCD > 0) this.skillCD -= dt;
    // Personalized-ability timers (phaser-1.12.0) — tick for EVERY hero (controlled or
    // companion) so a buff/invisibility keeps counting after a swap. No-op when unused.
    if (this._buffCd > 0) this._buffCd -= dt;
    if (this._buffActive) { this._buffT -= dt; if (this._buffT <= 0) { this._buffActive = false; this.mhp = this._preBuffMhp; this.hp = Math.min(this.hp, this.mhp); this.atkDmg = this._preBuffDmg; } }
    if (this._invis) { this._invisT -= dt; if (this._invisT <= 0) { this._invis = false; this.setAlpha(1); } }
    // ALT PHYSICS MODES (E-b): buoyant/lift/vehicle control replaces the platformer
    // model. Companions (ctrl:false) do cooldowns only here and are driven by Companion.
    if (this._swim) { if (this.ctrl) this._swimControl(dt); return; }
    if (this._fly) { if (this.ctrl) this._flyControl(dt); return; }
    if (this._drive) { const g = this.body.blocked.down || this.body.touching.down; if (g) this.jumps = 0; if (this.ctrl) this._driveControl(dt, g); return; }
    const grounded = this.body.blocked.down || this.body.touching.down;
    // Defect fix (phaser-1.16.0): on a render frame that runs NO physics step (high-refresh
    // screens, headless), blocked.down is still the pre-jump value, so the counter reset right
    // after take-off and allowed a third jump. A body moving UP is never "grounded" for this.
    if (grounded && this.body.velocity.y >= 0) this.jumps = 0;
    // LANDING SHAKE (feel.landShake, phaser-1.16.0): the controlled hero hitting the ground
    // from a real fall gives the camera a 0.2 s micro-shake. Absent → nothing.
    if (this.ctrl && feel('landShake', false)) { if (grounded && this._fallVy > 6 * FPS) this.scene.cameras.main.shake(200, 0.004); this._fallVy = grounded ? 0 : this.body.velocity.y; }
    if (!this.ctrl) return; // companions are driven by their controller
    const dashing = this.dshT > 0;
    let mov = false;
    if (this.st !== 'attack' && this.st !== 'skill' && !dashing) {
      if (I.down('ArrowLeft') || I.down('KeyA')) { this.body.setVelocityX(-this.spd * FPS); this.rt = false; this.setFlipX(true); mov = true; }
      else if (I.down('ArrowRight') || I.down('KeyD')) { this.body.setVelocityX(this.spd * FPS); this.rt = true; this.setFlipX(false); mov = true; }
      else this.body.setVelocityX(0);
      const jp = I.pr('ArrowUp') || I.pr('KeyW') || I.pr('Space');
      if (jp && this.jumps < this.maxJumps) { this.body.setVelocityY(this.jf * FPS); this.jumps++; this._jBuf = 0; }
      // JUMP BUFFER (feel.jumpBuffer, phaser-1.16.0): a jump pressed with no jumps left is
      // remembered for jumpBuffer s and fires on touchdown — the "I pressed it!" landing
      // jump. Absent → _jBuf stays 0 and this branch never runs (byte-identical).
      else if (jp) this._jBuf = feel('jumpBuffer', 0);
      else if (this._jBuf > 0) { this._jBuf -= dt; if (grounded) { this.body.setVelocityY(this.jf * FPS); this.jumps = 1; this._jBuf = 0; } }
      if ((I.pr('KeyZ') || I.pr('KeyJ')) && this.atkCD <= 0) { this.st = 'attack'; this.atkCD = 0.4; this.atkT = 0.3; this._swingHit.clear(); this._projFired = false; }
      if ((I.pr('KeyQ') || I.pr('KeyL')) && this.skillCD <= 0) this._useSkill();
      if (I.pr('KeyK') && this.dashCD <= 0) { this.dshT = this.dashDur; this.dashCD = 0.6; this._dashDir = this.rt ? 1 : -1; this.inv = Math.max(this.inv, this.dashDur + 0.05); this.st = 'dash'; }
    }
    // Ranged heroes fire a projectile once per attack swing (atkBox is null for them)
    if (this._ranged && this.st === 'attack' && !this._projFired) {
      this._projFired = true;
      const dir = this.rt ? 1 : -1;
      G.sc.projectiles.push(new HeroProj(this.scene, this.x + dir * (this.body.width / 2 + 4), this.y, dir, this.atkDmg));
    }
    if (this.st !== 'attack') this._projFired = false;
    if (dashing) { this.body.setVelocityX((this._dashDir || 1) * 7 * FPS); this.st = 'dash'; }
    if (this.dshT > 0) { this.dshT -= dt; if (this.dshT <= 0 && this.st === 'dash') this.st = 'idle'; }
    if (this.st === 'attack') { this.atkT -= dt; if (this.atkT <= 0) this.st = 'idle'; }
    else if (this.st === 'skill') { this.skillT -= dt; if (this.skillT <= 0) this.st = 'idle'; }
    else if (!grounded) this.st = this.body.velocity.y < 0 ? 'jump' : 'fall';
    else if (mov) this.st = 'run';
    else this.st = 'idle';
    this.setTint(this.st === 'attack' || this.st === 'skill' ? 0xffee88 : (this.inv > 0 && (((this.inv * 12) | 0) % 2) ? 0xff8888 : 0xffffff));
  }
  // ── SWIM movement (E-b, phaser-1.3.0): hold UP/DOWN to thrust, water drag on
  // release, gentle sink when idle; Z still attacks. Gravity is off on the body
  // (enterSwim), so vertical motion is fully velocity-driven — bounded by maxV
  // (≪ tile/frame) so it can never tunnel; on the seabed the idle-sink term keeps
  // the body flush (rest-gap==0). No jump/dash; buoyancy, not ballistics.
  _swimControl(dt) {
    const s = this._swim, b = this.body;
    const sp = (s.swimSpd || this.spd) * FPS, th = s.thrust * FPS, mv = s.maxV * FPS, sink = s.sinkV * FPS;
    const df = Math.pow(s.drag, dt * FPS);   // frame-rate-INDEPENDENT damping (== s.drag over 1/60s)
    if (this.st !== 'attack' && this.st !== 'skill') {
      // horizontal — swim, or glide to a stop against water drag
      if (I.down('ArrowLeft') || I.down('KeyA')) { b.setVelocityX(-sp); this.rt = false; this.setFlipX(true); }
      else if (I.down('ArrowRight') || I.down('KeyD')) { b.setVelocityX(sp); this.rt = true; this.setFlipX(false); }
      else b.setVelocityX(b.velocity.x * df);
      // vertical — hold UP/DOWN to swim; idle eases toward a gentle sink (buoyancy)
      if (I.down('ArrowUp') || I.down('KeyW')) b.setVelocityY(-th);
      else if (I.down('ArrowDown') || I.down('KeyS')) b.setVelocityY(th);
      else b.setVelocityY(b.velocity.y * df + sink * (1 - df));
      // Z still attacks underwater (parity); skill still available
      if ((I.pr('KeyZ') || I.pr('KeyJ')) && this.atkCD <= 0) { this.st = 'attack'; this.atkCD = 0.4; this.atkT = 0.3; this._swingHit.clear(); this._projFired = false; }
      if ((I.pr('KeyQ') || I.pr('KeyL')) && this.skillCD <= 0) this._useSkill();
    }
    // clamp both axes to the swim max (keeps every velocity well under a tile/frame)
    if (b.velocity.x > mv) b.setVelocityX(mv); else if (b.velocity.x < -mv) b.setVelocityX(-mv);
    if (b.velocity.y > mv) b.setVelocityY(mv); else if (b.velocity.y < -mv) b.setVelocityY(-mv);
    // ranged fire once per swing (parity with the platformer path)
    if (this._ranged && this.st === 'attack' && !this._projFired) {
      this._projFired = true;
      const dir = this.rt ? 1 : -1;
      G.sc.projectiles.push(new HeroProj(this.scene, this.x + dir * (this.body.width / 2 + 4), this.y, dir, this.atkDmg));
    }
    if (this.st !== 'attack') this._projFired = false;
    if (this.st === 'attack') { this.atkT -= dt; if (this.atkT <= 0) this.st = 'idle'; }
    else if (this.st === 'skill') { this.skillT -= dt; if (this.skillT <= 0) this.st = 'idle'; }
    else this.st = (Math.abs(b.velocity.x) > 8 || Math.abs(b.velocity.y) > 8) ? 'run' : 'idle';
    this.setTint(this.st === 'attack' || this.st === 'skill' ? 0xffee88 : (this.inv > 0 && (((this.inv * 12) | 0) % 2) ? 0xff8888 : 0xffffff));
  }
  // ── FLY movement (E-b, phaser-1.3.0): hold UP to LIFT, release to fall under an
  // accelerating descent; horizontal momentum with light air drag. Gravity off on
  // the body (enterFly); vertical is velocity-driven and clamped ≪ tile/frame → no
  // tunnel; a solid floor/ceiling still stops it flush (rest-gap==0).
  _flyControl(dt) {
    const s = this._fly, b = this.body;
    const sp = (s.flySpd || this.spd) * FPS, lift = s.lift * FPS, fall = s.fall * FPS, mv = s.maxV * FPS;
    const df = Math.pow(s.drag, dt * FPS);   // frame-rate-independent air damping
    if (this.st !== 'attack' && this.st !== 'skill') {
      if (I.down('ArrowLeft') || I.down('KeyA')) { b.setVelocityX(-sp); this.rt = false; this.setFlipX(true); }
      else if (I.down('ArrowRight') || I.down('KeyD')) { b.setVelocityX(sp); this.rt = true; this.setFlipX(false); }
      else b.setVelocityX(b.velocity.x * df);
      if (I.down('ArrowUp') || I.down('KeyW') || I.down('Space')) b.setVelocityY(-lift);
      else b.setVelocityY(b.velocity.y + fall * FPS * dt);   // accelerating fall (gravity-lite)
      if ((I.pr('KeyZ') || I.pr('KeyJ')) && this.atkCD <= 0) { this.st = 'attack'; this.atkCD = 0.4; this.atkT = 0.3; this._swingHit.clear(); this._projFired = false; }
      if ((I.pr('KeyQ') || I.pr('KeyL')) && this.skillCD <= 0) this._useSkill();
    }
    if (b.velocity.x > mv) b.setVelocityX(mv); else if (b.velocity.x < -mv) b.setVelocityX(-mv);
    if (b.velocity.y > mv) b.setVelocityY(mv); else if (b.velocity.y < -mv) b.setVelocityY(-mv);
    if (this._ranged && this.st === 'attack' && !this._projFired) { this._projFired = true; const dir = this.rt ? 1 : -1; G.sc.projectiles.push(new HeroProj(this.scene, this.x + dir * (this.body.width / 2 + 4), this.y, dir, this.atkDmg)); }
    if (this.st !== 'attack') this._projFired = false;
    if (this.st === 'attack') { this.atkT -= dt; if (this.atkT <= 0) this.st = 'idle'; }
    else if (this.st === 'skill') { this.skillT -= dt; if (this.skillT <= 0) this.st = 'idle'; }
    else this.st = (Math.abs(b.velocity.x) > 8 || Math.abs(b.velocity.y) > 8) ? 'run' : 'idle';
    this.setTint(this.st === 'attack' || this.st === 'skill' ? 0xffee88 : (this.inv > 0 && (((this.inv * 12) | 0) % 2) ? 0xff8888 : 0xffffff));
  }
  // ── DRIVE movement (E-b, phaser-1.3.0): gravity STAYS ON (ground vehicle → the
  // proven platformer collision, gates inherited). Horizontal is momentum:
  // accelerate to a top speed, coast down via friction, reverse with LEFT, hop on UP.
  _driveControl(dt, grounded) {
    const s = this._drive, b = this.body;
    const acc = s.accel * FPS * FPS * dt, maxS = s.maxSpd * FPS;
    const ff = Math.pow(s.friction, dt * FPS);   // frame-rate-independent coast friction
    if (this.st !== 'attack' && this.st !== 'skill') {
      if (I.down('ArrowRight') || I.down('KeyD')) { b.setVelocityX(Math.min(maxS, b.velocity.x + acc)); this.rt = true; this.setFlipX(false); }
      else if (I.down('ArrowLeft') || I.down('KeyA')) { b.setVelocityX(Math.max(-maxS, b.velocity.x - acc)); this.rt = false; this.setFlipX(true); }
      else b.setVelocityX(b.velocity.x * ff);       // coast (momentum)
      if ((I.pr('ArrowUp') || I.pr('KeyW') || I.pr('Space')) && grounded) b.setVelocityY(s.hop * FPS);
      if ((I.pr('KeyZ') || I.pr('KeyJ')) && this.atkCD <= 0) { this.st = 'attack'; this.atkCD = 0.4; this.atkT = 0.3; this._swingHit.clear(); this._projFired = false; }
      if ((I.pr('KeyQ') || I.pr('KeyL')) && this.skillCD <= 0) this._useSkill();
    }
    if (b.velocity.x > maxS) b.setVelocityX(maxS); else if (b.velocity.x < -maxS) b.setVelocityX(-maxS);
    if (this._ranged && this.st === 'attack' && !this._projFired) { this._projFired = true; const dir = this.rt ? 1 : -1; G.sc.projectiles.push(new HeroProj(this.scene, this.x + dir * (this.body.width / 2 + 4), this.y, dir, this.atkDmg)); }
    if (this.st !== 'attack') this._projFired = false;
    if (this.st === 'attack') { this.atkT -= dt; if (this.atkT <= 0) this.st = 'idle'; }
    else if (this.st === 'skill') { this.skillT -= dt; if (this.skillT <= 0) this.st = 'idle'; }
    else if (!grounded) this.st = 'jump';
    else this.st = Math.abs(b.velocity.x) > 8 ? 'run' : 'idle';
    this.setTint(this.st === 'attack' || this.st === 'skill' ? 0xffee88 : (this.inv > 0 && (((this.inv * 12) | 0) % 2) ? 0xff8888 : 0xffffff));
  }
  // Dispatch the hero's personalized SKILL (Q) by its descriptor kind (phaser-1.12.0);
  // no descriptor → legacy heal(healer)/melee. Content-agnostic primitives:
  //   buff  — self-buff (mhp×/atk×) for a duration then a cooldown (Titan Form)
  //   heal  — heal every living hero by amt
  //   proj  — fire a straight HeroProj (ranged bolt)
  //   mega  — fire a homing MegaProj orb toward the nearest enemy
  //   melee — the wide skill-range melee box (default; atkBox handles the hit)
  _useSkill() {
    const sk = this._skill;
    if (sk && sk.kind === 'buff') {                       // TITAN FORM — self toggle
      if (this._buffActive || this._buffCd > 0) { this.skillCD = 0.3; return; }
      this.skillCD = 3.0;
      this._buffActive = true; this._buffT = sk.dur || 20; this._buffCd = sk.cd || 30;
      this._preBuffMhp = this.mhp; this._preBuffDmg = this.atkDmg;
      this.mhp = Math.round(this.mhp * (sk.mhpMul || 2));
      this.hp = Math.min(this.hp + this._preBuffMhp, this.mhp);
      this.atkDmg = Math.round(this.atkDmg * (sk.dmgMul || 2));
      if (G.sc._float) G.sc._float('titan_form', this.x, this.y - 30, '#ff88ff');
      return;
    }
    this.skillCD = 3.0;
    if ((sk && sk.kind === 'heal') || (!sk && this._isHealer)) {   // PARTY HEAL
      this.st = 'skill'; this.skillT = 0.5;
      const amt = (sk && sk.amt) || this._healAmt || 25;
      G.sc.heroes.forEach(h => { if (h.on) h.hp = Math.min(h.mhp, h.hp + amt); });
      G.sc._healFlash = 1.0;
      if (G.sc._float) G.sc._float('party_healed', this.x, this.y - 30, '#66ee88');
      return;
    }
    if (sk && sk.kind === 'mega') {                       // RANGED SKILL ORB (nesta)
      this.st = 'skill'; this.skillT = 0.5;
      this._fireMega(sk.dmgMul || 2, { color: sk.color || 0x9955ff, radius: sk.radius || 24 });
      return;
    }
    if (sk && sk.kind === 'proj') {                       // RANGED SKILL BOLT (elber)
      this.st = 'skill'; this.skillT = 0.5;
      const dir = this.rt ? 1 : -1;
      G.sc.projectiles.push(new HeroProj(this.scene, this.x + dir * (this.body.width / 2 + 4), this.y, dir, Math.round(this.atkDmg * (sk.dmgMul || 2)), sk.color || 0xffdd66));
      return;
    }
    this.st = 'skill'; this.skillT = 0.5; this._swingHit.clear();   // MELEE skill box (kote/legacy)
  }
  // Fire a homing MegaProj toward the nearest living enemy (or straight ahead if none).
  _fireMega(dmgMul, opts = {}) {
    const t = G.sc._nearestEnemy ? G.sc._nearestEnemy(this.x, this.y) : null;
    const dir = this.rt ? 1 : -1;
    const tx = t ? t.x : this.x + dir * 400, ty = t ? t.y : this.y;
    const dx = tx - this.x, dy = ty - this.y, len = Math.hypot(dx, dy) || 1;
    const sp = (opts.speed || 3) * FPS;
    G.sc.projectiles.push(new MegaProj(this.scene, this.x, this.y, dx / len * sp, dy / len * sp, Math.round(this.atkDmg * dmgMul), opts));
  }
  atkBox() {
    if (this.st !== 'attack' && this.st !== 'skill') return null;
    if (this.st === 'skill' && this._isHealer) return null;
    // non-melee skills (buff/heal/proj/mega) do their work in _useSkill — no melee box,
    // unless the descriptor says `melee: true` (phaser-1.16.0): the orb ALSO comes with a
    // skillRange swath for the 0.5 s skill state (dmg atkDmg × skillMult).
    if (this.st === 'skill' && this._skill && this._skill.kind !== 'melee' && !this._skill.melee) return null;
    if (this._ranged && this.st === 'attack') return null; // ranged: projectile, not a melee box
    const r = this.st === 'skill' ? this._skillRange : this._atkRange;
    const b = this.body;
    return this.rt
      ? { x: b.x + b.width, y: b.y - 4, w: r, h: b.height + 8, dmg: this.st === 'skill' ? this.atkDmg * this._skillMult : this.atkDmg }
      : { x: b.x - r, y: b.y - 4, w: r, h: b.height + 8, dmg: this.st === 'skill' ? this.atkDmg * this._skillMult : this.atkDmg };
  }
  hurt(n, srcX) {
    if (this.inv > 0 || !this.on) return;
    this.hp -= n; this.inv = 0.6;
    jHitFX(this, srcX, false);                                  // juice: flash/knockback/sparks/hitstop (no-op unless GAME_CONFIG.juice)
    if (this.hp <= 0) { this.hp = 0; this.on = false; this.setVisible(false); this.body.setVelocity(0, 0); this.body.enable = false; }
  }
}

// ═══ HERO PROJECTILE (ranged attack — Arcade body, no gravity) ═══
class HeroProj {
  constructor(scene, x, y, dir, dmg, color, vy) {
    this.dmg = dmg; this.on = true; this.life = 2.0;
    this.go = scene.add.rectangle(x, y, 12, 4, color || 0xaaddff).setDepth(5);
    scene.physics.add.existing(this.go);
    this.go.body.setAllowGravity(false);
    this.go.body.setVelocity(dir * 9 * FPS, vy || 0);   // 9 px/frame horiz; vy for the barrage fan
    scene.physics.add.collider(this.go, scene.solidList, () => this.kill());
  }
  update(dt, enemies) {
    if (!this.on) return;
    this.life -= dt; if (this.life <= 0) return this.kill();
    const b = this.go.body;
    for (const e of enemies) {
      if (!e.on) continue;
      const eb = e.body;
      if (b.x < eb.x + eb.width && b.x + b.width > eb.x && b.y < eb.y + eb.height && b.y + b.height > eb.y) { e.hurt(this.dmg, this.x); return this.kill(); }
    }
  }
  kill() { if (!this.on) return; this.on = false; if (this.go) { this.go.destroy(); this.go = null; } }
}

// ═══ ENEMY PROJECTILE (hostile — Arcade body, no gravity; hits heroes) ═══
// Mirror of HeroProj, promoted from sofia's game-side EnemyShot (D24 queue → 2nd
// use in atlas-demo). Arbitrary velocity vx/vy so it reskins as a steam jet, a
// sparkler lob, a turret bolt. Engine-managed: push into scene.enemyProjectiles;
// the scene updates + reaps them each frame (like scene.projectiles for HeroProj).
class EnemyProj {
  constructor(scene, x, y, vx, vy, dmg, color, w, h) {
    this.dmg = dmg; this.on = true; this.life = 2.4;
    this.go = scene.add.rectangle(x, y, w || 11, h || 6, color || 0xff5533).setDepth(4);
    scene.physics.add.existing(this.go);
    this.go.body.setAllowGravity(false);
    this.go.body.setVelocity(vx, vy);
    scene.physics.add.collider(this.go, scene.solidList, () => this.kill());
  }
  update(dt, heroes) {
    if (!this.on) return;
    this.life -= dt; if (this.life <= 0) return this.kill();
    if (!this.go || !this.go.body) return;
    const b = this.go.body;
    for (const h of heroes) {
      if (!h.on) continue;
      const hb = h.body;
      if (b.x < hb.x + hb.width && b.x + b.width > hb.x && b.y < hb.y + hb.height && b.y + b.height > hb.y) { h.hurt(this.dmg, this.x); return this.kill(); }
    }
  }
  kill() { if (!this.on) return; this.on = false; if (this.go) { this.go.destroy(); this.go = null; } }
}

// ═══ MEGA PROJECTILE (ability orb — homes toward a target, PASSES THROUGH walls) ═══
// The heavy ultimate/skill orb (freeze shot, bone shot, ranged skill): a large slow orb
// that flies toward a target point and hits the first enemy within its radius, applying an
// optional on-hit SLOW (enemy spd × mul for slowDur). Unlike HeroProj it ignores terrain —
// an ultimate reads as unstoppable. Content-agnostic; the game assigns it via a hero's
// `ult`/`skill` descriptor (phaser-1.12.0). Push into scene.projectiles (same update loop).
class MegaProj {
  constructor(scene, x, y, vx, vy, dmg, opts = {}) {
    this.dmg = dmg; this.on = true; this.life = opts.life || 3.5; this.rr = opts.radius || 22;
    this._slow = opts.slow || 0; this._slowDur = opts.slowDur || 3;
    this.go = scene.add.circle(x, y, this.rr * 0.6, opts.color || 0xffcc44, 0.85).setDepth(6);
    scene.physics.add.existing(this.go);
    this.go.body.setAllowGravity(false);
    this.go.body.setVelocity(vx, vy);
  }
  update(dt, enemies) {
    if (!this.on) return;
    this.life -= dt; if (this.life <= 0) return this.kill();
    if (!this.go || !this.go.body) return;
    const x = this.go.x, y = this.go.y;
    for (const e of enemies) {
      if (!e.on) continue;
      if (Math.abs(e.x - x) < this.rr && Math.abs(e.y - y) < this.rr) {
        e.hurt(this.dmg, x);
        if (this._slow && e.on) e.applySlow(this._slow, this._slowDur);
        return this.kill();
      }
    }
  }
  kill() { if (!this.on) return; this.on = false; if (this.go) { this.go.destroy(); this.go = null; } }
}

// ═══ COMPANION (AI-driven party member: follows the active hero, auto-jumps) ═══
class Companion {
  constructor(hero) { this.hero = hero; }
  update(dt, active, enemies) {
    const h = this.hero;
    if (!h.on || h.ctrl) return;
    this._fight(dt, enemies);
    this._move(dt, active);
    this._pose();
  }
  _move(dt, active) {
    const h = this.hero;
    if (h._swim || h._fly) return this._swimFollow(active);   // gravity-off modes: 2-axis follow
    if (feel('companionSpacing', false)) return this._spacedFollow(dt, active);
    const offset = 50 + (h._compIdx || 0) * 40;               // (drive keeps gravity → platformer follow below)
    const dx = (active.x - offset * (active.rt ? 1 : -1)) - h.x, dist = Math.abs(active.x - h.x);
    if (dist > 60 + offset) { h.body.setVelocityX((dx > 0 ? 1 : -1) * h.spd * FPS * 0.85); h.rt = dx > 0; h.setFlipX(!h.rt); h.st = 'run'; }
    else if (dist > 25) { h.body.setVelocityX((dx > 0 ? 1 : -1) * h.spd * FPS * 0.35); h.st = 'run'; }
    else { h.body.setVelocityX(0); h.st = 'idle'; }
    // auto-jump when the active hero is above and we're grounded
    if ((h.body.blocked.down || h.body.touching.down) && active.y < h.y - 40) h.body.setVelocityY(h.jf * FPS);
  }
  // SPACED follow (feel.companionSpacing, phaser-1.16.0). The legacy follow steers by the
  // distance to the ACTIVE hero, so a companion already at its slot keeps nudging ±0.35
  // speed (jitter) and the party bunches into one blob. Here each companion steers to its
  // OWN slot (44 + 34·i px behind the leader), eases in proportionally, stops dead inside
  // 8 px and faces the leader's way; it hops walls it bumps into, and a companion lost far
  // off-screen regroups onto the leader (never into terrain: the leader's spot is free).
  _spacedFollow(dt, active) {
    const h = this.hero, i = h._compIdx || 0, dir = active.rt ? 1 : -1;
    // a slot that falls outside the world (leader near an edge) mirrors to the leader's other
    // side — otherwise the companion presses into the world edge and hops forever
    const wW = h.scene.physics.world.bounds.width, gap = 44 + i * 34;
    let tx = active.x - gap * dir; if (tx < 12 || tx > wW - 12) tx = active.x + gap * dir;
    tx = Math.max(12, Math.min(wW - 12, tx));
    const dx = tx - h.x, adx = Math.abs(dx);
    const aGround = active.body.blocked.down || active.body.touching.down;
    if (aGround && (Math.abs(active.x - h.x) > CW * 0.75 || Math.abs(active.y - h.y) > CH * 0.8)) {
      h.body.reset(active.x, active.y - 4); h.body.setVelocity(0, 0); h.st = 'idle'; return;
    }
    if (adx > 90) { h.body.setVelocityX(Math.sign(dx) * h.spd * FPS * 0.95); h.rt = dx > 0; h.st = 'run'; }
    else if (adx > 8) { h.body.setVelocityX(Math.sign(dx) * h.spd * FPS * Math.max(0.3, adx / 90)); h.rt = dx > 0; h.st = 'run'; }
    else { h.body.setVelocityX(0); h.rt = active.rt; h.st = 'idle'; }
    h.setFlipX(!h.rt);
    const g = h.body.blocked.down || h.body.touching.down;
    if (g && (active.y < h.y - 40 || ((h.body.blocked.left || h.body.blocked.right) && adx > 8))) h.body.setVelocityY(h.jf * FPS);
  }
  // COMPANION ATTACK (combat.companionAttack, phaser-1.16.0): every `cd` s a companion strikes
  // the nearest live enemy within range×vrange for mul×atkDmg (and shows its attack pose for
  // 0.25 s). The movement code below still owns velocity/state; _cAtkT re-asserts the pose.
  _fight(dt, enemies) {
    const ca = combat('companionAttack'); if (!ca) return;
    const h = this.hero;
    if (h._cAtkCd > 0) h._cAtkCd -= dt;
    if (h._cAtkT > 0) h._cAtkT -= dt;
    if (h._cAtkCd > 0 || !enemies) return;
    let best = null, bd = 1e9;
    for (const e of enemies) { if (!e.on) continue; const dx = Math.abs(e.x - h.x); if (dx < ca.range && Math.abs(e.y - h.y) < ca.vrange && dx < bd) { bd = dx; best = e; } }
    if (!best) return;
    h._cAtkCd = ca.cd; h._cAtkT = 0.25; h.rt = best.x > h.x; h.setFlipX(!h.rt);
    best.hurt(Math.round(h.atkDmg * ca.mul), h.x);
  }
  _pose() { const h = this.hero; if (h._cAtkT > 0) h.st = 'attack'; }
  // Swim follow: gravity is off on the body, so drive BOTH axes toward a trailing
  // point near the active swimmer, easing to a drift-stop with the same water drag.
  _swimFollow(active) {
    const h = this.hero, b = h.body, s = h._swim || h._fly;
    const sp = (s.swimSpd || s.flySpd || h.spd) * FPS * 0.75;
    const offset = 40 + (h._compIdx || 0) * 30;
    const tx = active.x - offset * (active.rt ? 1 : -1);
    const dx = tx - h.x, dy = active.y - h.y;
    b.setVelocityX(Math.abs(dx) > 12 ? (dx > 0 ? sp : -sp) : b.velocity.x * s.drag);
    b.setVelocityY(Math.abs(dy) > 12 ? (dy > 0 ? sp : -sp) : b.velocity.y * s.drag);
    h.rt = dx > 0; h.setFlipX(!h.rt);
    h.st = (Math.abs(b.velocity.x) > 8 || Math.abs(b.velocity.y) > 8) ? 'run' : 'idle';
  }
}

// Enemy strike-pose hold (per-state clips, phaser-1.7.0): after a boss/enemy lands a
// melee hit, hold its `attack` clip this long (a readable telegraph). Purely visual —
// dormant unless the enemy atlas packs an `attack` clip (else byte-identical).
const ENEMY_ATTACK_POSE = 0.4;

// ═══ ENEMY (Arcade sprite; patrol / chase / static / boss archetypes) ═══
class Enemy extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, w, h, name, color, hp, dmg, ai, type) {
    const tk = Art.ensureEnemy(scene, type, w, h);
    super(scene, x, y, tk, Art.enemyFrame(scene, type));   // atlas frame if shipped, else baked texture
    scene.add.existing(this); scene.physics.add.existing(this);
    this.nm = name; this.col = color; this.hp = hp; this.mhp = hp; this.dmg = dmg;
    this.ai = ai; this._aiOrig = ai; this.customType = type;
    this.setOrigin(0.5, 0.5); this.body.setSize(w, h); this.body.setMaxVelocity(9999, MAX_FALL);
    applyActorScale(this, w, h, actorScaleFor('enemy', type));
    this.on = true; this.rt = true; this.dir = 1; this.pt = 0; this.akt = 0; this.inv = 0; this._atkAnimT = 0; this._slowT = 0;
    this.spd = 0.7; this.ag = 130; this._phase2 = ai === 'boss' ? false : undefined;
    this._anims = Art.animsFor(scene, 'enemy', type);   // atlas walk cycle / per-state clips if GAME_CONFIG.anims + multi-frame enemy atlas
  }
  // Enemies have no rich movement state: play the `attack` clip briefly after a strike
  // (a boss telegraph), else the walk cycle off horizontal speed, else hold idle. A
  // flat walk strip has no `attack`/`m.attack` → byte-identical to phaser-1.6.0.
  syncAnim() {
    const a = this._anims; if (!a || !this.body) return;
    const m = a.anims;
    if (this._atkAnimT > 0 && m.attack) { playClip(this, a, m.attack); return; }   // strike telegraph (may be non-looping-hold, phaser-1.8.0)
    if (Math.abs(this.body.velocity.x) > 8 && m.walk) { playClip(this, a, m.walk); return; }
    if (this.anims.isPlaying) this.anims.stop();
    if (this.frame.name !== a.idle) this.setFrame(a.idle);
  }
  control(dt, hero) {
    if (!this.on) return;
    if (this.inv > 0) this.inv -= dt;
    if (this._atkAnimT > 0) this._atkAnimT -= dt;   // strike-pose hold (visual only)
    if (this._slowT > 0) { this._slowT -= dt; if (this._slowT <= 0 && this._spdBase !== undefined) this.spd = this._spdBase; }   // freeze-slow expiry (phaser-1.12.0)
    this.akt -= dt;
    // PARTY-INVISIBLE (phaser-1.12.0): patrol/chase can't perceive an invisible hero, so
    // they don't aggro/track/melee it — but 'boss' and 'static' STILL hit it (the original's
    // deliberate asymmetry: invisibility beats mooks + stealth guards, not bosses/turrets).
    const visible = hero && !hero._invis;
    const dxh = hero ? Math.abs(this.x - hero.x) : 999;
    if (this.ai === 'patrol') {
      if (this.body.blocked.left) this.dir = 1; else if (this.body.blocked.right) this.dir = -1;
      this.pt += dt; if (this.pt > 2.5) { this.dir *= -1; this.pt = 0; }
      this.body.setVelocityX(this.spd * FPS * this.dir); this.rt = this.dir > 0; this.setFlipX(!this.rt);
      if (dxh < this.ag && visible) this.ai = 'chase';
    } else if (this.ai === 'chase') {
      if (dxh > 280 || !visible) { this.ai = this._aiOrig === 'chase' ? 'patrol' : this._aiOrig; this.body.setVelocityX(0); }
      else { const dd = hero.x > this.x ? 1 : -1; this.body.setVelocityX(this.spd * FPS * 1.4 * dd); this.rt = dd > 0; this.setFlipX(!this.rt); }
    } else if (this.ai === 'static') {
      this.body.setVelocityX(0);
    } else if (this.ai === 'boss') {
      const dd = hero.x > this.x ? 1 : -1; this.body.setVelocityX(this.spd * FPS * 1.8 * dd); this.rt = dd > 0; this.setFlipX(!this.rt);
      if (this._phase2 === false && this.hp <= this.mhp * 0.5) { this._phase2 = true; this.spd *= 1.4; this.setTint(0xff8844); }
    }
    // CHARGE (combat.chargeOnHit, phaser-1.16.0): a struck non-boss foe rushes the NEAREST
    // living hero for `dur` s at spd×mul (set in hurt); it overrides the archetype's velocity.
    if (this._chargeT > 0) {
      this._chargeT -= dt;
      const t = this._nearestHero();
      if (t) { const dd = t.x > this.x ? 1 : -1; this.body.setVelocityX(this.spd * FPS * this._chargeMul * dd); this.rt = dd > 0; this.setFlipX(!this.rt); }
    }
    // HOP (combat.enemyHop): grounded + a live hero within dx and dyMin..dyMax ABOVE → jump.
    const hop = combat('enemyHop');
    if (hop && this.ai !== 'static' && G.sc) {
      if (this._hopT === undefined) this._hopT = hop.cd0[0] + Math.random() * (hop.cd0[1] - hop.cd0[0]);
      this._hopT -= dt;
      if (this._hopT <= 0 && (this.body.blocked.down || this.body.touching.down) && G.sc.heroes.some(x => x.on && Math.abs(x.x - this.x) < hop.dx && this.y - x.y > hop.dyMin && this.y - x.y < hop.dyMax)) {
        this.body.setVelocityY(hop.vy * FPS); this._hopT = hop.cd[0] + Math.random() * (hop.cd[1] - hop.cd[0]);
      }
    }
    // enemy-specific boss timers (stomp / fireball / teleport / fire-breath) — opt-in hook,
    // no-op unless the game set a timer field on the instance (phaser-1.12.0).
    if (this._bossBeh) this._bossBeh(dt, hero, visible);
    // CONTACT-ALL (combat.contactAll): patrollers (and charging foes) bump ANY overlapping,
    // visible party member — companions included — not only the controlled hero.
    if ((this.ai === 'patrol' || this._chargeT > 0) && combat('contactAll') && G.sc && this.akt <= 0) {
      const v = G.sc.heroes.find(x => x !== hero && x.on && !x._invis && this._overlaps(x));
      if (v) { v.hurt(this.dmg, this.x); this.akt = 1.0; this._atkAnimT = ENEMY_ATTACK_POSE; }
    }
    const canHit = visible || this.ai === 'boss' || this.ai === 'static';
    if (hero && canHit && this.akt <= 0 && !this._jWindT && this._overlaps(hero)) {
      if (juiceOn('windup')) {
        // TELEGRAPH (juice.windup): pose the strike NOW, land it 0.18 s later — step away and it WHIFFS.
        this._jWindT = 0.18; this._atkAnimT = ENEMY_ATTACK_POSE + 0.18;
      } else { hero.hurt(this.dmg, this.x); this.akt = 1.0; this._atkAnimT = ENEMY_ATTACK_POSE; }
    }
    if (this._jWindT) {
      this._jWindT -= dt;
      if (this._jWindT <= 0) { this._jWindT = 0; this.akt = 1.0; if (hero && canHit && this._overlaps(hero)) hero.hurt(this.dmg, this.x); }
    }
  }
  // On-hit slow (freeze shot): drop speed to spd×mul for `dur`s, restored on expiry.
  applySlow(mul, dur) { if (this._spdBase === undefined) this._spdBase = this.spd; this.spd = this._spdBase * mul; this._slowT = dur; }
  _overlaps(o) {
    const a = this.body, b = o.body;
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }
  _nearestHero() { let best = null, bd = 1e9; if (G.sc) for (const h of G.sc.heroes) { if (!h.on) continue; const d = Math.abs(h.x - this.x); if (d < bd) { bd = d; best = h; } } return best; }
  hurt(n, srcX) {
    if (this.inv > 0 || !this.on) return;
    this.hp -= n; this.inv = 0.3;
    const dying = this.hp <= 0;
    // combat.chargeOnHit: a struck non-boss foe charges and keeps hunting (static/patrol → chase).
    // A foe flagged `_noCharge` (a teleporting watcher, a breathing dragon) keeps its archetype.
    const ch = !dying && this.ai !== 'boss' && !this._noCharge && combat('chargeOnHit');
    if (ch) { this._chargeT = ch.dur; this._chargeMul = ch.mul; if (this.ai !== 'chase') { this.ai = 'chase'; this._aiOrig = 'chase'; } }
    jHitFX(this, srcX, dying || this.ai === 'boss');            // juice: kills + boss hits are HEAVY
    if (dying) { this.hp = 0; this.on = false; if (this._jShadow) { this._jShadow.destroy(); this._jShadow = null; } this.destroy(); }
  }
}

// ═══ TIMING MINIGAME (the fishing-bar pattern — full re-derived module, D20) ═══
// The timing-bar module VANISHES INTO THIS BUILT-IN on Phaser (D20 — "several
// shrink or vanish into built-ins"): the engine's reference bar is promoted to
// the full-featured version so games reskin by OPTIONS, not by copying a class
// (a game-side `class TimingBar` would collide with this global in classic
// scripts). Backward-compatible superset — old callers pass none of the extra
// options and get the original behavior. Provenance: sofia (shoe/karaoke/
// candles), proposal, dnd-recap dice, farewell. No fail state by design:
// missing never punishes; celebration minigames frustrate, not hurt. Registry
// contract: NEVER call bar.update(dt) yourself — addBar() does; there is no
// draw() to call (retained-mode chrome, redrawn inside update).
//
// Options: period, zone, need, instrKey, onHit(nHits), onDone();
//   cueMode  — misses AND empty sweeps also advance (a "song" plays on
//              regardless; need counts attempts). karaoke-style.
//   labelFor(bar)=>Lang key — dynamic title (per-cue captions).
//   centerMin/centerMax — random hit-zone center range (default 0.30–0.70).
//   onMiss(nAttempts) — called on a miss or an empty sweep.
//   caption(key) — flash a ~2.2s Lang-key line under the bar (feedback).
class TimingBar {
  constructor(scene, o) {
    this.scene = scene;
    this.period = o.period || 1.6; this.zone = o.zone || 0.22; this.need = o.need || 3;
    this.cueMode = !!o.cueMode;
    this.instrKey = o.instrKey; this.labelFor = o.labelFor || null;
    this.centerMin = o.centerMin === undefined ? 0.30 : o.centerMin;
    this.centerMax = o.centerMax === undefined ? 0.70 : o.centerMax;
    this.onHit = o.onHit; this.onMiss = o.onMiss; this.onDone = o.onDone;
    this.hits = 0; this.attempts = 0; this.results = []; this.t = 0; this.pos = 0; this.done = false;
    this._capT = 0; this._capKey = null;
    this._roll();
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(50);
    this.label = scene.add.text(CW / 2, CH - 128, '', { fontFamily: 'monospace', fontSize: '12px', color: '#f0e6c0' }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    this.sub = scene.add.text(CW / 2, CH - 115, '', { fontFamily: 'monospace', fontSize: '10px', color: '#8a92a8' }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
    this.cap = scene.add.text(CW / 2, CH - 62, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffd9a8' }).setOrigin(0.5).setScrollFactor(0).setDepth(51);
  }
  _roll() { this.center = this.centerMin + Math.random() * (this.centerMax - this.centerMin); }
  caption(key) { this._capKey = key; this._capT = 2.2; }
  _registerMiss() {
    this.attempts++; this.results.push(false);
    if (this.onMiss) this.onMiss(this.attempts);
    this._roll(); this.t = 0;
    if (this.cueMode && this.attempts >= this.need) this._finish();
  }
  update(dt) {
    if (this.done) return;
    if (this._capT > 0) this._capT -= dt;
    this.t += dt;
    if (this.t >= this.period) {
      if (this.cueMode) { this._registerMiss(); if (this.done) return; } // song continues
      else this.t -= this.period;                                        // re-sweep, no penalty
    }
    const ph = this.t / this.period; this.pos = ph < 0.5 ? ph * 2 : (1 - ph) * 2;
    if (I.pr('KeyZ') || I.pr('Space')) {
      if (Math.abs(this.pos - this.center) <= this.zone / 2) {
        this.hits++; this.attempts++; this.results.push(true);
        if (this.onHit) this.onHit(this.hits);
        if (this.done) return;
        if (this.cueMode ? this.attempts >= this.need : this.hits >= this.need) { this._finish(); return; }
        this._roll(); this.t = 0;
      } else { this._registerMiss(); }
    }
    this._draw();
  }
  _draw() {
    if (this.done) return;
    const bw = 360, bh = 16, bx = (CW - bw) / 2, by = CH - 108;
    const g = this.g; g.clear();
    g.fillStyle(0x08081e, 0.85).fillRect(bx - 10, by - 36, bw + 20, bh + 80);
    g.lineStyle(1, 0xc8a84e, 1).strokeRect(bx - 10, by - 36, bw + 20, bh + 80);
    g.fillStyle(0x1c2432, 1).fillRect(bx, by, bw, bh);
    g.fillStyle(0xffcc33, 1).fillRect(bx + (this.center - this.zone / 2) * bw, by, this.zone * bw, bh);
    g.fillStyle(0xffffff, 1).fillRect(bx + this.pos * bw - 2, by - 4, 4, bh + 8);
    for (let i = 0; i < this.need; i++) {
      const done = i < this.results.length;
      g.fillStyle(done ? (this.results[i] ? 0xffcc33 : 0x884444) : 0x3a3f4c, 1).fillRect(bx + i * 16, by + bh + 6, 12, 6);
    }
    const label = this.labelFor ? Lang.t(this.labelFor(this)) : (this.instrKey ? Lang.t(this.instrKey) : '');
    this.label.setText(label);
    this.sub.setText(this.labelFor && this.instrKey ? Lang.t(this.instrKey) : '');
    if (this._capT > 0 && this._capKey) this.cap.setAlpha(Math.min(1, this._capT / 0.5)).setText(Lang.t(this._capKey));
    else this.cap.setText('');
  }
  _finish() { this.done = true; this.destroy(); if (this.onDone) this.onDone(); }
  destroy() {
    if (this.g) { this.g.destroy(); this.g = null; }
    if (this.label) { this.label.destroy(); this.label = null; }
    if (this.sub) { this.sub.destroy(); this.sub = null; }
    if (this.cap) { this.cap.destroy(); this.cap = null; }
  }
}

// ═══ GAME SCENE BASE — the sacred level base (party/combat/act/dialogue/pause) ═══
// A level scene extends this and supplies enter() + bAct1..N(retry) + step(dt).
// This class is content-agnostic — never fork it for one game.
class GameScene extends Phaser.Scene {
  constructor(key) { super(key); this.musicTheme = 'castle'; }

  // ── Phaser lifecycle ──
  create() {
    G.sc = this; G._active = this.scene.key; G.state = 'play';
    I.bind(this);
    this.heroes = []; this.enemies = []; this.npcs = []; this.companions = []; this.bars = []; this.projectiles = []; this.enemyProjectiles = [];
    this.act = 0; this.ai = 0; this.tm = null; this.solidList = []; this.hazardList = [];
    this._healFlash = 0; this._frozen = false;
    this.cameras.main.setBackgroundColor('#0a1628');
    Music.stop(); if (this.musicTheme) Music.play(this.musicTheme);
    UI.showHud(); UI.hideOverlay();
    this.enter();
  }
  update(time, delta) {
    if (G.sc !== this) return;
    const dt = Math.min(0.05, delta / 1000);
    I.newFrame();
    if (Mobile.on) Mobile.sync();
    Music.resume();
    if (I.pr('KeyM')) Music.toggle();
    if (G.state === 'paused') return this._pauseMenu();
    if (G.state === 'gameover') return this._gameoverMenu();
    if (G.state === 'victory') { if (I.pr('Space') || I.pr('Enter')) G.title(); return; }
    if (G.state !== 'play') return;
    if (I.pr('Escape')) return this._enterPause();
    if (this.commonUpdateStart(dt)) return;
    this.updateActors(dt);
    this.resolveCombat(dt);
    if (typeof this.step === 'function') this.step(dt);
    this.commonUpdateEnd(dt);
  }

  // ── Act builders' toolkit ──
  // Called at the top of every bActN builder: tears down the previous act's
  // world so retry / act-transition rebuild cleanly.
  beginAct(n) {
    this.act = n; this.bars = [];
    this.physics.world.colliders.destroy();
    this.children.removeAll(true);            // destroys every game object + body
    this.heroes = []; this.enemies = []; this.npcs = []; this.companions = []; this.projectiles = []; this.enemyProjectiles = [];
    this.solidList = []; this.hazardList = []; this.tm = null; this._healFlash = 0;
    this._swim = null; this._fly = null; this._drive = null;   // acts default to platformer (alt modes opt-in)
    D.reset();
    if (this.physics.world.isPaused) this.physics.world.resume();
  }
  // Grid → Arcade static bodies (merged horizontal runs) + colored visuals +
  // parallax backdrop. Real swept collision = rest-gap 0, no tunneling.
  buildMap(W, builderFn) {
    const H = (typeof MAP_H !== 'undefined') ? MAP_H : 34;
    const tm = new TM(W, H); this.tm = tm;
    builderFn(tm, W, H);
    this._buildParallax(W, H);
    this._buildLayers(W, H);
    // TILE EDGES (phaser-1.16.0): a tileTextures entry may be { top, fill } instead of one
    // key — a tile with open space above paints with `top` (grass lip, stone cap, plank
    // edge), the mass below with `fill`, so terrain reads as part of the drawing instead
    // of a uniform slab. Runs split where the edge kind changes. A plain string entry (or
    // no tileTextures) → edgeKind is null everywhere → runs/bodies byte-identical.
    const _tt = this.tileTextures || cfg('tileTextures', null);
    // MERGED BODIES (GAME_CONFIG.mergeBodies, phaser-1.16.0): one static body per tile ROW
    // turns a 6-tile wall into six stacked bodies; Arcade separates Y first, so a hero
    // pressed against the wall while rising snags on every seam and its jump dies (dragon-v2
    // L3: double jump 11 px pressed vs 110 px free). With the flag, solid tiles (1/2/5) get
    // their physics from maximal rectangles (row runs merged down identical columns); the
    // per-row visuals are unchanged, one-way (3) and hazard (4) tiles keep their own bodies.
    const mergeB = !!cfg('mergeBodies', false);
    const edgeKind = (x, y, v) => { const e = _tt && _tt[v]; if (!e || typeof e !== 'object') return null; const u = tm.get(x, y - 1); return (u >= 1 && u <= 5 && u !== 3) ? 'fill' : 'top'; };
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        const v = tm.get(x, y);
        if (v >= 1 && v <= 5) {
          const ek = edgeKind(x, y, v);
          let x2 = x; while (x2 < W && tm.get(x2, y) === v && edgeKind(x2, y, v) === ek) x2++;
          const rw = (x2 - x) * T;
          const color = v === 3 ? 0x6a5a3a : v === 4 ? 0x7a2a2a : v === 2 ? 0x3a3a5a : v === 5 ? 0x5a4636 : 0x44506a;
          const rect = this.add.rectangle(x * T, y * T, rw, T, color).setOrigin(0, 0);
          // TILE TEXTURING (GTM-8 · phaser-1.10.0): GAME_CONFIG.tileTextures maps a tile
          // CODE → a loaded ASSET_MANIFEST {type:'image'} key (an RD tile texture). When
          // present, the rect stays for physics but goes invisible and a TileSprite
          // paints the run with the texture (tiled to the T grid) — fixes "naked
          // platforms". Absent → the exact legacy colored-rect stroke (byte-identical).
          const _ent = _tt && _tt[v]; const _texKey = _ent && (typeof _ent === 'object' ? (_ent[ek] || _ent.fill || _ent.top) : _ent);
          if (_texKey && this.textures.exists(_texKey)) {
            rect.setFillStyle(color, 0);
            const src = this.textures.get(_texKey).getSourceImage();
            const ts = this.add.tileSprite(x * T, y * T, rw, T, _texKey).setOrigin(0, 0).setDepth(-2);
            ts.tileScaleX = T / (src.width || T); ts.tileScaleY = T / (src.height || T);
          } else {
            rect.setStrokeStyle(1, 0x2a3242, 0.6);
          }
          if (v === 4) {
            // Hazard = overlap-damage, non-solid. The rect needs a STATIC body for
            // spawnParty's overlap pass to fire (pre-1.8.1 it got none, so code-4
            // tiles were silently inert — F39). Gated: GAME_CONFIG.hazardDamage
            // (template default ON); absent → legacy inert rect (a game copy built
            // pre-1.8.1 that used hazard tiles decoratively keeps its behavior).
            // Not in solidList → overlap only, never a collider.
            if (cfg('hazardDamage', false)) { this.physics.add.existing(rect, true); rect.body.updateFromGameObject(); }
            this.hazardList.push(rect);
          }
          else if (mergeB && v !== 3) { /* visual only — the merged pass below owns its physics */ }
          else {
            this.physics.add.existing(rect, true); rect.body.updateFromGameObject();
            if (v === 3) { rect.body.checkCollision.down = false; rect.body.checkCollision.left = false; rect.body.checkCollision.right = false; }
            this.solidList.push(rect);
          }
          x = x2;
        } else x++;
      }
    }
    if (mergeB) this._mergedSolids(tm, W, H);
    this.physics.world.setBounds(0, 0, W * T, H * T + 600);
    this.cameras.main.setBounds(0, 0, W * T, H * T);
    return { W, H };
  }
  _mergedSolids(tm, W, H) {
    const solid = v => v === 1 || v === 2 || v === 5, open = new Map(), rects = [];
    for (let y = 0; y <= H; y++) {
      const runs = new Map();
      if (y < H) { let x = 0; while (x < W) { if (solid(tm.get(x, y))) { let x2 = x; while (x2 < W && solid(tm.get(x2, y))) x2++; runs.set(x + ',' + x2, [x, x2]); x = x2; } else x++; } }
      for (const [k, r] of open) { if (runs.has(k)) { r.y1 = y + 1; runs.delete(k); } else { rects.push(r); open.delete(k); } }
      for (const [k, [x0, x1]] of runs) open.set(k, { x0, x1, y0: y, y1: y + 1 });
    }
    for (const r of rects) {
      const b = this.add.rectangle(r.x0 * T, r.y0 * T, (r.x1 - r.x0) * T, (r.y1 - r.y0) * T, 0x000000, 0).setOrigin(0, 0);
      this.physics.add.existing(b, true); b.body.updateFromGameObject();
      this.solidList.push(b);
    }
    this._mergedCount = rects.length;
  }
  _buildParallax(W, H) {
    // IMAGE BACKDROP (D40 / GTM-7 · phaser-1.9.0) — opt-in: a scene that sets
    // this.bgImage (or a game that sets GAME_CONFIG.bgImage) to a LOADED
    // ASSET_MANIFEST image key gets a studio-generated (RD) scene drawn as a
    // world-covering parallax backdrop INSTEAD of the procedural gradient+band
    // below. A scene that sets neither runs the exact legacy path → every
    // pre-1.9.0 game is byte-identical (golden rule 1). See _buildImageParallax.
    const bgKey = this.bgImage || cfg('bgImage', null);
    if (bgKey && this.textures.exists(bgKey)) { this._buildImageParallax(W, H, bgKey); return; }
    const top = this.bgTop || 0x0d2847, bot = this.bgBot || 0x0a1628;
    const g = this.add.graphics().setScrollFactor(0).setDepth(-20);
    g.fillGradientStyle(top, top, bot, bot, 1).fillRect(0, 0, CW, CH);
    // one parallax silhouette band (scrollFactor < 1) — bg-themes re-derivation is M6
    const band = this.add.graphics().setScrollFactor(0.35).setDepth(-15);
    band.fillStyle(0x101c30, 0.9);
    for (let i = 0; i < Math.ceil(W * T / 180) + 4; i++) { const bx = i * 180 % (CW * 3); band.fillRect(bx, CH - 210, 44, 150); }
  }
  // ── IMAGE BACKDROP (D40 / GTM-7 · phaser-1.9.0) ──
  // Draw the loaded texture `bgKey` as a horizontally-parallax backdrop that
  // covers the FULL scrolled world (width W*T, viewport height CH). A single
  // this.add.image never covers a scrolled world at scrollFactor<1 — this is the
  // covers-the-whole-world math that a per-game add.image gets wrong. Uses a
  // TileSprite so any world width is covered by tiling the (typically 16:9) RD
  // scene; the tile is aspect-scaled so ONE copy fills CH vertically (no vertical
  // repeat, no stretch distortion). A solid base fill (bgBot) sits beneath as
  // letterbox insurance. Depth: base -21, image -20 (behind every world object).
  // Parallax depth factor: this.bgImageScroll ?? GAME_CONFIG.bgParallax ?? 0.5.
  // At factor p and origin x=0, an object of width W*T+CW covers the viewport for
  // the entire camera scroll range [0, W*T-CW] (right edge stays ≥ CW), so the
  // backdrop never runs out. Vertically fixed (scrollFactorY 0), like the gradient.
  _buildImageParallax(W, H, bgKey) {
    const base = this.add.graphics().setScrollFactor(0).setDepth(-21);
    base.fillStyle(this.bgBot || 0x0a1628, 1).fillRect(0, 0, CW, CH);
    const src = this.textures.get(bgKey).getSourceImage();
    const scale = CH / (src.height || CH);   // one texture copy fills the viewport height, native aspect
    const p = (this.bgImageScroll != null) ? this.bgImageScroll : cfg('bgParallax', 0.5);
    const ts = this.add.tileSprite(0, 0, W * T + CW, CH, bgKey).setOrigin(0, 0).setScrollFactor(p, 0).setDepth(-20);
    ts.tileScaleX = scale; ts.tileScaleY = scale;
    this._bgImageLayer = ts;   // handle for playtest/QA introspection
  }
  // ── DEPTH LAYERS (phaser-1.16.0) ──
  // this.bgLayers || GAME_CONFIG.bgLayers = [{ key, scroll, y, h, alpha, depth, tint }]:
  // extra horizontally-tiled image layers ON TOP of the backdrop — a mid-ground
  // silhouette band (scroll ~0.6, depth -18), or a foreground occluder strip (scroll >1,
  // depth above the actors, e.g. 40). Each layer is a TileSprite covering the whole
  // scrolled world at its own scroll factor (vertically fixed, like the backdrop); `y`/`h`
  // place it on the viewport (default: bottom-anchored at the texture's height). Keys must
  // be loaded or runtime-generated textures; missing keys are skipped. Absent → no-op.
  _buildLayers(W, H) {
    const layers = this.bgLayers || cfg('bgLayers', null); this._layerObjs = [];
    if (!Array.isArray(layers)) return;
    for (const L of layers) {
      if (!L || !L.key || !this.textures.exists(L.key)) continue;
      const src = this.textures.get(L.key).getSourceImage();
      const hh = L.h || src.height || CH, y = (L.y != null) ? L.y : CH - hh, p = (L.scroll != null) ? L.scroll : 0.6;
      const ts = this.add.tileSprite(0, y, Math.ceil(W * T * Math.max(1, p)) + CW, hh, L.key).setOrigin(0, 0).setScrollFactor(p, 0).setDepth(L.depth != null ? L.depth : -18);
      const sc = hh / (src.height || hh); ts.tileScaleX = sc; ts.tileScaleY = sc;
      if (L.alpha != null) ts.setAlpha(L.alpha);
      if (L.tint != null) ts.setTint(L.tint);
      this._layerObjs.push(ts);
    }
  }
  spawnParty(x, y, roster) {
    const defs = (typeof HERO_DEFS !== 'undefined') ? HERO_DEFS : {};
    this.heroes = roster.map((type, i) => {
      const [nm, col] = defs[type] || [type, '#40aa88'];
      return new Hero(this, x + i * 30 + 10, y - 18, type, nm, col);
    });
    this.heroes[0].ctrl = true; this.ai = 0;
    this.heroes.forEach(h => {
      this.physics.add.collider(h, this.solidList);
      if (this.hazardList.length) this.physics.add.overlap(h, this.hazardList, () => h.hurt(6), null, this);
    });
    this.rebuildCompanions();
    this.cameras.main.startFollow(this.heroes[this.ai], true, 0.12, 0.12);
    UI.hud(this);
    return this.heroes;
  }
  spawnEnemies(list) {
    this.enemies = list;
    this.enemies.forEach(e => { this.physics.add.collider(e, this.solidList); });
    return this.enemies;
  }
  // ── SWIM MODE (E-b, M7 · phaser-1.3.0) ──
  // Turn the CURRENT act into buoyant Arcade swim: gravity off per hero body,
  // hold UP/DOWN to thrust, water drag, gentle negative buoyancy → an idle diver
  // drifts down and settles flush on the seabed (rest-gap==0 holds). Call AFTER
  // spawnParty in a bAct builder. Platformer acts never call it, so `_swim` stays
  // null and every existing game is byte-identical (golden rule 1: opt-in). Tune
  // globally via GAME_CONFIG.swim, per-act via opts; returns the resolved config.
  enterSwim(opts) {
    this._swim = Object.assign({}, SWIM_DEFAULTS, cfg('swim', {}), opts || {});
    this.heroes.forEach(h => { h._swim = this._swim; h.jumps = 0; if (h.body) { h.body.setAllowGravity(false); h.body.setVelocity(0, 0); } });
    return this._swim;
  }
  // Return the act to normal platformer physics (rarely needed — acts default to
  // platformer via beginAct — but symmetric for a mid-act surface transition).
  exitSwim() {
    this._swim = null;
    this.heroes.forEach(h => { h._swim = null; if (h.body) h.body.setAllowGravity(true); });
  }
  // ── FLY MODE (E-b, M7) — jetpack/lift: gravity off, hold UP to lift, accelerating
  // fall on release, horizontal momentum. Same opt-in/dormant discipline as swim.
  enterFly(opts) {
    this._fly = Object.assign({}, FLY_DEFAULTS, cfg('fly', {}), opts || {});
    this.heroes.forEach(h => { h._fly = this._fly; h.jumps = 0; if (h.body) { h.body.setAllowGravity(false); h.body.setVelocity(0, 0); } });
    return this._fly;
  }
  exitFly() {
    this._fly = null;
    this.heroes.forEach(h => { h._fly = null; if (h.body) h.body.setAllowGravity(true); });
  }
  // ── DRIVE MODE (E-b, M7) — side-view vehicle: gravity STAYS ON (proven platformer
  // collision → gates inherited), horizontal is accelerate/coast momentum. hop on UP.
  enterDrive(opts) {
    this._drive = Object.assign({}, DRIVE_DEFAULTS, cfg('drive', {}), opts || {});
    this.heroes.forEach(h => { h._drive = this._drive; if (h.body) h.body.setVelocityX(0); });
    return this._drive;
  }
  exitDrive() {
    this._drive = null;
    this.heroes.forEach(h => { h._drive = null; });
  }
  rebuildCompanions() {
    this.companions = [];
    this.heroes.forEach((h, i) => { if (i !== this.ai && h.on) { h._compIdx = this.companions.length; this.companions.push(new Companion(h)); } });
  }
  swap(idx) {
    if (idx === this.ai || !this.heroes[idx] || !this.heroes[idx].on) return;
    const cur = this.heroes[this.ai], nxt = this.heroes[idx];
    const tx = nxt.x, ty = nxt.y; nxt.x = cur.x; nxt.y = cur.y; cur.x = tx; cur.y = ty;
    cur.body.setVelocity(0, 0); nxt.body.setVelocity(0, 0);
    cur.ctrl = false; cur.st = 'idle'; nxt.ctrl = true; nxt.st = 'idle';
    this.ai = idx; this.rebuildCompanions();
    this.cameras.main.startFollow(nxt, true, 0.12, 0.12);
    UI.hud(this);
  }
  addBar(bar) { this.bars.push(bar); return bar; }
  setHint(key) { this._hintKey = key; UI.setHint(key); }
  say(dlgs, cb) { this.freeze(); D.show(dlgs, () => { this.unfreeze(); if (cb) cb(); }); }
  enemiesAllDead() { return this.enemies.length > 0 && this.enemies.every(e => !e.on); }
  // Nearest living enemy to a point (for homing MegaProj + ultimate targeting).
  _nearestEnemy(x, y) { let best = null, bd = 1e9; for (const e of this.enemies) { if (!e.on) continue; const d = Math.abs(e.x - x); if (d < bd) { bd = d; best = e; } } return best; }
  // Floating combat text (ability call-out): rises + fades. key is a Lang key or literal.
  _float(key, x, y, color) {
    const txt = (typeof Lang !== 'undefined' && Lang.t(key)) || key;
    const t = this.add.text(x, y, txt, { fontFamily: 'monospace', fontSize: '15px', color: color || '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(60);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 1100, ease: 'Quad.out', onComplete: () => t.destroy() });
  }
  // ULTIMATE (X) — dispatch the active hero's `ult` descriptor to a generic primitive
  // (phaser-1.12.0). Once per act (_rUsed reset in applyStats on act (re)build). No-op if
  // the hero has no `ult` descriptor → byte-identical for games that don't define ultimates.
  triggerUltimate() {
    const h = this.heroes[this.ai];
    if (!h || !h.on || h._rUsed || !h._ult) return;
    h._rUsed = true;
    const u = h._ult, cx = h.x, cy = h.y, dir = h.rt ? 1 : -1;
    if (u.kind === 'cleave') {
      const r = u.radius || 200, mul = u.dmgMul || 3;
      this.enemies.forEach(e => { if (e.on && Math.hypot(e.x - cx, e.y - cy) < r) e.hurt(h.atkDmg * mul); });
      this._float(u.label || 'cleave', cx, cy - 30, '#ff88ff');
    } else if (u.kind === 'barrage') {
      const shots = u.shots || 5, mul = u.dmgMul || 2, spread = u.spread || 0.18, half = shots >> 1;
      for (let i = -half; i <= half; i++) this.projectiles.push(new HeroProj(this, cx, cy, dir, Math.round(h.atkDmg * mul), u.color || 0xff6600, i * spread * 9 * FPS));
      this._float(u.label || 'barrage', cx, cy - 30, '#ffaa44');
    } else if (u.kind === 'invis') {
      const dur = u.dur || 5;
      this.heroes.forEach(hh => { if (hh.on) { hh._invis = true; hh._invisT = dur; hh.setAlpha(0.35); } });
      this._float(u.label || 'party_invisible', cx, cy - 30, '#88ccff');
    } else if (u.kind === 'mega') {
      h._fireMega(u.dmgMul || 2, { color: u.color || 0xffcc44, radius: u.radius || 26, slow: u.slow || 0, slowDur: u.slowDur || 3, speed: u.speed || 3 });
      this._float(u.label || 'ultimate', cx, cy - 30, u.slow ? '#66ccff' : '#e8e8d0');
    }
  }

  // ── Per-frame skeleton (called by update in fixed order) ──
  commonUpdateStart(dt) {
    if (this._healFlash > 0) this._healFlash -= dt;
    if (D.on) return true;
    if (I.pr('Tab')) {
      let n = (this.ai + 1) % this.heroes.length, c = 0;
      while ((!this.heroes[n] || !this.heroes[n].on) && c < this.heroes.length) { n = (n + 1) % this.heroes.length; c++; }
      this.swap(n);
    }
    for (let i = 0; i < this.heroes.length; i++) if (I.pr('Digit' + (i + 1))) this.swap(i);
    return false;
  }
  updateActors(dt) {
    const active = this.heroes[this.ai];
    if (active && !active.on) this._autoSwapOnDeath();
    this.heroes.forEach(h => h.control(dt));
    this.companions.forEach(c => c.update(dt, this.heroes[this.ai], this.enemies));
    this.enemies.forEach(e => e.control(dt, this.heroes[this.ai]));
    this.npcs.forEach(n => n.update && n.update(dt));
    this.projectiles.forEach(p => p.update(dt, this.enemies));
    this.projectiles = this.projectiles.filter(p => p.on);
    this.enemyProjectiles.forEach(p => p.update(dt, this.heroes));   // hostile EnemyProj (promoted, D24 queue)
    this.enemyProjectiles = this.enemyProjectiles.filter(p => p.on);
    // Atlas animation playback (walk cycle phaser-1.6.0; per-state clips phaser-1.7.0) —
    // guarded so it is a true no-op (zero loop overhead) for the procedural default;
    // each actor's syncAnim early-returns when it has no atlas anim, so mixed
    // atlas/procedural is safe.
    if (cfg('anims', false)) { this.heroes.forEach(h => h.syncAnim()); this.enemies.forEach(e => e.on && e.syncAnim()); }
    // PROCEDURAL animation (phaser-1.13.0): breathe life into single-pose actors with
    // smooth transforms keyed to state. No-op unless GAME_CONFIG.procAnim is set.
    if (procEnabled('hero')) this.heroes.forEach(h => h.on && applyProc(h, dt));
    if (procEnabled('enemy')) this.enemies.forEach(e => e.on && applyProc(e, dt));
    // COMBAT JUICE upkeep (phaser-1.15.0): flash decay + blob shadows + hit-stop restore.
    if (cfg('juice', false)) {
      this.heroes.forEach(h => jTickActor(h, dt));
      this.enemies.forEach(e => jTickActor(e, dt));
      if (this._jHsT > 0) { this._jHsT -= dt; if (this._jHsT <= 0) this.physics.world.timeScale = 1; }
    }
  }
  _autoSwapOnDeath() {
    const idx = this.heroes.findIndex(h => h.on);
    if (idx < 0) return;
    this.heroes[idx].ctrl = true; this.heroes[idx].st = 'idle';
    this.ai = idx; this.rebuildCompanions();
    this.cameras.main.startFollow(this.heroes[idx], true, 0.12, 0.12);
  }
  resolveCombat(dt) {
    this.heroes.forEach(hero => {
      const ab = hero.atkBox(); if (!ab) return;
      this.enemies.forEach(e => {
        if (!e.on || hero._swingHit.has(e)) return;
        const b = e.body;
        if (e.x - b.width / 2 < ab.x + ab.w && e.x + b.width / 2 > ab.x && e.y - b.height / 2 < ab.y + ab.h && e.y + b.height / 2 > ab.y) {
          hero._swingHit.add(e); e.hurt(ab.dmg || hero.atkDmg, hero.x);
        }
      });
    });
  }
  commonUpdateEnd(dt) {
    this.bars.forEach(b => b && typeof b.update === 'function' && b.update(dt));
    this.bars = this.bars.filter(b => b && !b.done);
    // CAMERA LOOK-AHEAD (feel.lookAhead px, phaser-1.16.0): the camera eases ahead of the
    // way the hero faces, so what's coming is on screen instead of behind. Absent → 0.
    const la = feel('lookAhead', 0);
    if (la) { const a = this.heroes[this.ai], cam = this.cameras.main; if (a && cam && cam.followOffset) cam.followOffset.x += ((a.rt ? -la : la) - cam.followOffset.x) * Math.min(1, dt * 2.5); }
    UI.hud(this);
    if (I.pr('KeyX')) this.triggerUltimate();   // personalized ultimate (phaser-1.12.0)
    if (I.pr('KeyR') && G.scrollsLeft > 0) {
      const dead = this.heroes.find(h => !h.on);
      if (dead) { dead.on = true; dead.hp = Math.floor(dead.mhp * 0.3); dead.setVisible(true); dead.body.enable = true; const a = this.heroes[this.ai]; dead.x = a.x; dead.y = a.y - 10; dead.body.setVelocity(0, 0); G.scrollsLeft--; this.rebuildCompanions(); }
    }
    if (this.heroes.length && this.heroes.every(h => !h.on)) G.gameOver();
  }

  // ── State transitions ──
  freeze() { if (!this.physics.world.isPaused) this.physics.world.pause(); this._frozen = true; }
  unfreeze() { if (G.state === 'play' && !D.on) { this.physics.world.resume(); this._frozen = false; } }
  restartAct() { G.state = 'play'; UI.hideOverlay(); const fn = this['bAct' + this.act]; if (typeof fn === 'function') fn.call(this, true); this.physics.world.resume(); }
  // Transition to another level scene mid-run, carrying hero HP forward (the
  // next level's spawnParty restores it via Hero.applyStats ← G.heroHPs).
  nextLevel(nextKey) {
    this.heroes.forEach(h => { if (h.on) G.heroHPs[h.customType] = h.hp; });
    const nl = (typeof GAME_LEVELS !== 'undefined') && GAME_LEVELS.find(l => l.key === nextKey);
    Music.stop();
    game.scene.stop(this.scene.key);
    G._active = nextKey;
    game.scene.start(nextKey);   // next GameScene.create() sets G.sc/state/music
    return nl;
  }
  _enterPause() { G.state = 'paused'; this.freeze(); UI.showOverlay('paused', [['resume', () => this._resume()], ['restart_act', () => this.restartAct()], ['quit_title', () => G.title()]]); }
  _resume() { G.state = 'play'; UI.hideOverlay(); this.physics.world.resume(); }
  _pauseMenu() { if (I.pr('Escape')) this._resume(); else if (I.pr('KeyR')) this.restartAct(); else if (I.pr('KeyQ')) G.title(); }
  _enterGameOver() { G.state = 'gameover'; this.freeze(); UI.showOverlay('game_over', [['retry_act', () => this.restartAct()], ['quit_title', () => G.title()]]); }
  _gameoverMenu() { if (I.pr('KeyR')) this.restartAct(); else if (I.pr('KeyQ')) G.title(); }
  _enterVictory() { G.state = 'victory'; this.freeze(); UI.hideHud(); UI.setHint(''); UI.showVictory(); }
}

// ═══ BOOT SCENE — loads assets (if any) + bakes textures, then hands to Title ═══
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const bar = UI.el('loadBar');
    this.load.on('progress', p => { if (bar) bar.style.width = (p * 100) + '%'; });
    // ASSET_MANIFEST load path (E-c, D27): images + studio-baked texture ATLASES.
    // Empty manifest = procedural-only (baked palette art), the zero-cost default.
    (typeof ASSET_MANIFEST !== 'undefined' ? ASSET_MANIFEST : []).forEach(a => {
      if (a.type === 'image') this.load.image(a.key, a.path);
      else if (a.type === 'atlas') this.load.atlas(a.key, a.texture, a.frames);
    });
  }
  create() {
    UI.el('loadScr').style.display = 'none';
    Mobile.init();   // GAME_CONFIG.mobile (phaser-1.16.0) — no-op when absent
    UI.buildTitle();
    this.scene.start('Title');
  }
}

// ═══ TITLE SCENE — shows the DOM title / language / level-select chrome ═══
class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() { G.state = 'title'; G.sc = null; this.cameras.main.setBackgroundColor('#0a1628'); UI.showTitle(); if (Mobile.on) Mobile.sync(); }
}

// ═══ GLOBAL STATE BRIDGE (parity: playtester asserts G.state / G.sc.heroes) ═══
const G = {
  state: 'boot', sc: null, heroHPs: {}, scrollsLeft: 2, _active: null, _pendingMusic: null,
  start(lv) {
    this.heroHPs = {}; this.scrollsLeft = cfg('scrollsPerRun', 2);
    if (Mobile.on) Mobile.goFullscreen();
    UI.hideTitle(); UI.hideOverlay(); D.reset();
    if (this._active) game.scene.stop(this._active);
    game.scene.stop('Title');
    this._active = lv.key;
    game.scene.start(lv.key);           // GameScene.create() sets state/sc/music
  },
  title() {
    this.state = 'title'; Music.stop();
    if (this._active) { game.scene.stop(this._active); this._active = null; }
    this.sc = null; UI.hideHud(); UI.hideOverlay(); D.reset();
    game.scene.start('Title');
  },
  gameOver() { if (this.state !== 'play' || !this.sc) return; this.sc._enterGameOver(); },
  victory() { if (!this.sc) return; this.sc._enterVictory(); }
};

// ═══ MUSIC (procedural Web Audio chiptune — engine-agnostic, works with Phaser) ═══
// 5 mood themes: castle · underwater · library · boss · stealth. Silent-safe in
// headless (AudioContext may stay suspended without a user gesture; guarded).
const Music = (() => {
  let ctx = null, master = null, _muted = false, _theme = null, _sched = null, _beat = 0, _next = 0, _startId = 0;
  function init() { if (ctx) return; try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.25; master.connect(ctx.destination); } catch (e) { } }
  function note(freq, type, vol, t, dur) { if (!ctx || _muted || !freq || freq <= 0) return; try { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.025); g.gain.setValueAtTime(vol, t + dur * 0.72); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.06); } catch (e) { } }
  const THEMES = {
    castle: { bpm: 120, mel: [294, 349, 440, 523, 440, 349, 294, 262, 330, 392, 440, 523, 392, 330, 294, 262], bas: [147, 147, 110, 110, 131, 131, 147, 147, 147, 147, 110, 110, 131, 131, 147, 147], play(i, t, b) { note(this.mel[i % 16], 'square', 0.065, t, b * 0.52); note(this.bas[i % 16], 'sawtooth', 0.15, t, b * 0.86); } },
    underwater: { bpm: 80, mel: [262, 0, 311, 0, 262, 0, 392, 0, 311, 0, 262, 0, 392, 0, 466, 0], play(i, t, b) { const m = this.mel[i % 16]; if (m) { note(m, 'sine', 0.075, t, b * 1.8); note(m / 2, 'sine', 0.13, t, b * 3.6); } } },
    library: { bpm: 88, mel: [220, 0, 262, 0, 247, 0, 220, 294, 262, 0, 220, 0, 196, 0, 220, 0], play(i, t, b) { const m = this.mel[i % 16]; if (m) { note(m, 'sine', 0.075, t, b * 1.4); note(m * 2, 'sine', 0.03, t, b * 0.9); } } },
    boss: { bpm: 138, arp: [294, 349, 440, 523, 440, 349, 294, 262, 294, 349, 440, 523, 588, 523, 440, 349], play(i, t, b) { note(147, 'sawtooth', 0.17, t, b * 0.72); note(this.arp[i % 16], 'square', 0.055, t, b * 0.42); } },
    stealth: { bpm: 58, mel: [196, 0, 0, 0, 220, 0, 0, 0, 185, 0, 0, 0, 196, 0, 0, 0], play(i, t, b) { const m = this.mel[i % 16]; if (m) { note(m, 'sine', 0.055, t, b * 3.0); note(m * 2, 'sine', 0.02, t, b * 1.8); } } }
  };
  function schedule() { if (!_theme || !ctx) return; const th = THEMES[_theme]; if (!th) return; const b = 60 / th.bpm, ahead = 0.5; if (_next < ctx.currentTime) _next = ctx.currentTime + 0.05; while (_next < ctx.currentTime + ahead) { try { th.play(_beat, _next, b); } catch (e) { } _next += b; _beat++; } _sched = setTimeout(schedule, 200); }
  return {
    get muted() { return _muted; }, init,
    play(t) { if (_theme === t && _sched) return; if (_sched) { clearTimeout(_sched); _sched = null; } _theme = t; _beat = 0; const id = ++_startId; if (!ctx) init(); if (!ctx) return; const go = () => { if (_startId !== id || _theme !== t) return; _next = ctx.currentTime + 0.1; schedule(); }; if (ctx.state === 'suspended') ctx.resume().then(go).catch(() => { }); else go(); },
    stop() { if (_sched) { clearTimeout(_sched); _sched = null; } _theme = null; _beat = 0; },
    resume() { try { if (!ctx) return; if (ctx.state === 'suspended') ctx.resume().then(() => { if (_theme && !_sched) { _next = ctx.currentTime + 0.05; schedule(); } }).catch(() => { }); else if (_theme && !_sched) { _next = ctx.currentTime + 0.05; schedule(); } } catch (e) { } },
    toggle() { if (!ctx) init(); _muted = !_muted; if (master) master.gain.value = _muted ? 0 : 0.25; }
  };
})();

// Expose the handful of globals the headless playtester asserts against, so both
// bare `G` (global lexical scope) and `window.G` resolve in page.evaluate.
window.G = G; window.Lang = Lang; window.I = I; window.D = D; window.Music = Music; window.T = T; window.GAME_VERSION = GAME_VERSION;
