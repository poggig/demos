// ═══════════════════════════════════════════════════════════════════════════
// CHRONICLES OF AZURERUNE v2 — LEVEL 5 "When the Home Burns" (class Lv5, index.html:3756-4194)
// 7 acts on the SAME ruins field (buildRuinsField index.html:907-926, W 300 × H 18),
// theme `ruins`, music 'boss' for every act (incl. the calm A1, index.html:3791), party of 5
// re-created every act at the level-entry HP (G.heroHPs is never written in Lv5).
//   A1 walk (x>1000) + Armory Master  · A2 10 mercenaries · A3 6 draconians
//   A4 Sivak (stomp/enrage) · A5 Boilerdrak (gravity fireball lob; fire overlay from here)
//   A6 Ogre carrying an invulnerable Goblin Chief + 4 goblins · A7 Kansaldi: survive 10 s → ending
//
// NUANCE (tools/digest/L5.md §3) → how it is reproduced here
//  N1  Boss gimmicks die on the first hit (any hurt → permanent chase). DELIBERATE FIX
//      (GAMESPEC §2): specials persist — Sivak/Boilerdrak/Ogre are `ai:'boss'` (the engine
//      never flips a boss), Kansaldi is `static` + `noCharge` so his breath keeps working.
//  N2  Charge-on-hit phases through terrain → NOT reproduced: the engine's chargeOnHit
//      (1.5 s at spd×1.8 toward the nearest hero) collides with walls (a wall-phase is a bug).
//  N3  Enemy pens → reproduced by geometry: the original tiles, every foe at its original x,
//      no enemy step-up, the engine's universal hop (hero 24-128 px above within 240 px).
//      All four bosses spawn in the 800-1087 pen pressed against c48.
//  N4  Boilerdrak fireball = the original gravity Proj → this.lob (0.24 px/f², cap 6, life
//      3.5 s, dies on solids), speed 4 aimed body-centre → body-centre, dmg 18 (not the 21
//      contact), every 3.0 s (first at 3.0 s); nearest hero by LEFT-EDGE |x|. DELIBERATE FIX:
//      living heroes only (the original could aim at a corpse). Note: the shared LobProj
//      passes UP through one-way planks (the original's died on them) — scenes-base's call.
//  N5  Stomp: 3.5 s timer, fires only when grounded (waits for landing), every living hero
//      with LEFT-EDGE |dx| < 90 (no vertical check) takes floor(dmg·0.7) = 12 (18 enraged),
//      20 orange particles; interval never changes. Enrage at hp ≤ 30 %: spd×1.6,
//      dmg=floor(dmg×1.5), 30 #ff4400 particles. Exact.
//  N6  Goblin Chief rides at the original (ogre.x, ogre.y − ogre.h): its BODY top-left is
//      pinned to (ogre.body.x, ogre.body.y − ogre.body.height [40]) every frame, after the
//      physics step (the body re-derived at once, no frame lag) → left-aligned, feet 20 px above
//      the ogre's hitbox = on the 1.5×-drawn ogre's head; inv=999 re-armed every frame (no
//      flicker). Drop on the first frame the ogre is gone: "The Goblin Chief falls!", ai →
//      chase (reverts to patrol when far, like the original), inv 0, 20 #44cc44 particles.
//      DELIBERATE FIX: the shooter-charge twist (an endless wall-phasing charge at whoever
//      shot the riding chief) is not reproduced — after the drop it is a normal chaser.
//  N7  Kansaldi: static, never turns (faces RIGHT → breath VFX streams right, away from the
//      party; his atlas is drawn facing left, so it is flipped), contact 33; breath first at
//      4.0 s, then every 6.0 s (timer reset at breath start), active 1.2 s, 3 puffs per frame
//      at bx/bx+30/bx+60, a 15 %-per-frame chance that EVERY living hero with LEFT-EDGE
//      |dx| < 300 (behind him too) takes 8, gated by the hero's i-frames. The nearest hero
//      spawns 845 px away (original ≥ 820) → standing still is safe. The escape timer is a
//      HIDDEN 10 s, counted only while gameplay runs (never during dialogue/pause) — no
//      counter, no exit; killing him changes nothing (no kill check, as in the original).
//  N8  The finale loops into Lv1 → DELIBERATE FIX: the 13 ending lines, then G.victory().
//  N9  No lose state → DELIBERATE FIX: the engine's game over + "retry act" (party wipe).
//      R revive kept (allowScrolls = true, 2 per run).
//  N10 HP resets to the level-entry values every act → the engine's applyStats(G.heroHPs);
//      ultimates/buffs reset per act. Exact.
//  N11 The act-win shake plays only after the NEXT act's intro closes → reproduced: the win
//      shake is carried across the act change and re-queued after beginAct (the shared
//      winShake queue is cleared by beginAct, so it would otherwise be lost). The camera is
//      not reset between acts (it eases back to the party as in the original).
//  N12 Particles freeze during dialogue and survive act changes → partly: the embers freeze
//      during dialogue; Phaser objects are torn down by beginAct, so nothing leaks into the
//      next act (stale projectiles are a bug, not reproduced).
//  N13 Spanish flavour ("La Ruina Roja", "Sin Esperanza") → kept verbatim via the string table.
//  N14 Arturito (Nick's skeleton familiar) speaks ending line 5 → speaker_arturito.
//  N15 Armory Master: the original builds him WITH a line + "[SPACE]" prompt but Lv5.update
//      has no talk code, so the line is unreachable. DELIBERATE FIX: he is talkable (Z/J/Space,
//      once, optional — never gates the walk) with his ORIGINAL line "Arm yourselves. War
//      comes.". Drawn as the studio villager NPC instead of a second copy of Nick's sprite.
//  N16 #ecount keeps the Lv4 text in A1 → not reproduced (bug); A1 shows no counter.
//  N17 Embedded spawns → DELIBERATE FIX (GAMESPEC "spawned inside terrain"): the party keeps
//      the original x 60/90/120/150/180, except Nick (180, inside c12) who stands on the floor
//      just left of c12 (centre 165). Soldier 5 and the Draconian Scout at x 1400 (inside c88)
//      stand just right of c88 (where they walked out to); Goblin #1 at x 1200 (inside pillar
//      75) stands just right of the pillar. Heroes have no step-up (16 px rubble steps must be
//      hopped) — by geometry. (Companion slots past the map edge: the engine mirrors them.)
//  N18 Patrollers bump anyone, chase/boss/static only the controlled hero; companions auto-
//      attack (60 %, 0.8 s) → the engine's GAME_CONFIG.combat (contactAll, companionAttack).
//      Boss/static contact cooldown is 1.2 s in the original (engine 1.0) → re-timed per foe
//      by the L5 hook below. The engine's generic boss phase-2 (≤50 %) is switched OFF for
//      Sivak/Boilerdrak/Ogre (`_phase2` undefined in the original).
//  N19 Battlement Guard (A2) on p1 → DELIBERATE FIX: it spawns standing ON p1 (orig feet
//      y 160; the previous port dropped it to the floor) and, being static, is held at its x
//      (the original has no knockback — engine juice would slide it off the 80 px plank).
//  N20 Fixed dt=1/60 (timers 2× fast at 120 Hz) → DELIBERATE FIX: every timer counts seconds;
//      the 15 %-per-frame breath roll is 1 − 0.85^(dt·60) per update (same rate at any Hz).
//  Map: the original rubble pyramids are code 2; here they are code 5 (identical collision —
//      both solid — but drawn with the ruins rubble texture). Every coordinate is original.
//  Fire overlay (draw(), act ≥ 5): 15 random 20-60 px rects/frame, rgba(255,100-200,0,≤0.2),
//      drawn after the parallax and BEFORE the opaque tilemap, so in the original it only
//      flickered in the band under the floor. That band does not exist here (the ground is the
//      screen bottom) and hard rects over the drawn sky read as glitches, so it becomes a
//      random-alpha heat glow with the same palette, rising from the ground — a screen-fixed
//      layer at depth -12 (over the backdrop, behind terrain + actors) that flickers every
//      rendered frame, under dialogue too — plus drifting embers in front (studio addition;
//      they freeze during dialogue like the original's particles).
//  Dialogue: every line's speaker is the JSON `_speaker` (no invented keys). The A1→A2 lines
//      ("The battle of High Hill begins..." / "...something is wrong with the actors...") are
//      restored (the previous port skipped them).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const L5_W = 300, L5_H = 18, L5_FLOOR = 240;     // original map size + surface y (rows 15-17 solid)
const L5_RUBBLE = 5;                               // original code 2 → 5 (same collision, rubble art)
const L5_NICKX = 165;                              // Nick's spawn centre: just left of c12 (176-223)

// buildRuinsField (index.html:907-926), verbatim geometry in ORIGINAL tile coordinates.
function L5_ruinsField(tm, W, H) {
  for (let x = 0; x < W; x++) { tm.set(x, H - 3, 1); tm.set(x, H - 2, 1); tm.set(x, H - 1, 1); }
  // rubble: stepped pyramids (16/32/16 for h3, 16/32/48/32/16 for h4); j=0 overwrites the floor row
  [[12, 3], [28, 4], [48, 3], [70, 4], [88, 3]].forEach(([cx, h]) => {
    for (let di = -Math.floor(h / 2); di <= Math.floor(h / 2); di++) {
      const ht = h - Math.abs(di);
      for (let j = 0; j < ht; j++) tm.set(cx + di, H - 3 - j, L5_RUBBLE);
    }
  });
  // collapsed wall pillars: 1 tile wide, 80 px above the floor (tiles 75, 165, 240)
  [Math.floor(W * 0.25), Math.floor(W * 0.55), Math.floor(W * 0.8)].forEach(x => { for (let j = 0; j < 6; j++) tm.set(x, H - 3 - j, 1); });
  // ruined battlements: one-way planks p1 24-28 (y160), p2 114-118 (y128), p3 186-190 (y160), p4 255-258 (y128)
  const p1 = Math.floor(W * 0.08), p2 = Math.floor(W * 0.38), p3 = Math.floor(W * 0.62), p4 = Math.floor(W * 0.85);
  [[p1, H - 8, 5], [p2, H - 10, 5], [p3, H - 8, 5], [p4, H - 10, 4]].forEach(([sx, py, pw]) => { for (let i = 0; i < pw; i++) tm.set(sx + i, py, 3); });
}

// Per-foe hook (engine Enemy._bossBeh, runs inside Enemy.control every gameplay frame):
//  · boss/static contact cooldown 1.2 s (the engine re-arms akt = 1.0 after a landed touch);
//  · a static foe with _l5X never moves (the original has no knockback);
//  · the foe's own special (stomp / fireball / breath), called with `this` = the foe.
function L5_hook(e, special) {
  e._l5PrevAkt = e.akt;
  e._bossBeh = function (dt, hero, visible) {
    if ((this.ai === 'boss' || this.ai === 'static') && this.akt > this._l5PrevAkt + 0.5) this.akt += 0.2;
    if (this.ai === 'static' && this._l5X != null && this.x !== this._l5X) this.x = this._l5X;
    if (special) special.call(this, dt, hero, visible);
    this._l5PrevAkt = this.akt;
    this._l5Last = { x: this.x, y: this.y };
  };
  return e;
}
const L5_grounded = e => !!(e.body && (e.body.blocked.down || e.body.touching.down));

// SIVAK (index.html:1584-1600): stomp every 3.5 s when grounded + enrage at ≤ 30 %.
function L5_sivak(dt) {
  const s = this.scene;
  this._stompTimer -= dt;
  if (this._stompTimer <= 0 && L5_grounded(this)) {
    this._stompTimer = 3.5;
    FX.burst(s, this.x, this.body.bottom, { count: 20, tint: [0xff6600, 0xffaa33], speedMax: 200, lifespan: 700 });
    const dmg = Math.floor(this.dmg * 0.7);
    for (const h of s.heroes) if (h.on && Math.abs(h.body.x - this.body.x) < 90) h.hurt(dmg, this.x);
    this._stomps = (this._stomps || 0) + 1;
  }
  if (this._enraged === false && this.hp <= this.mhp * 0.3) {
    this._enraged = true;
    this.spd *= 1.6;
    this.dmg = Math.floor(this.dmg * 1.5);
    FX.burst(s, this.x, this.body.center.y, { count: 30, tint: [0xff4400, 0xff8800], speedMax: 240, lifespan: 900 });
  }
}

// BOILERDRAK (index.html:1571-1582): every 3.0 s a gravity fireball, speed 4, dmg 18.
function L5_boilerdrak(dt) {
  this._projTimer -= dt;
  if (this._projTimer > 0) return;
  this._projTimer = 3.0;
  const s = this.scene;
  let t = null, bd = 1e9;
  for (const h of s.heroes) if (h.on) { const dd = Math.abs(h.body.x - this.body.x); if (dd < bd) { bd = dd; t = h; } }
  if (!t) return;
  const cx = this.body.center.x, cy = this.body.center.y;
  const dx = t.body.center.x - cx, dy = t.body.center.y - cy, len = Math.hypot(dx, dy) || 1;
  s.lob({ x: cx, y: cy }, dx / len * 4, dy / len * 4, 18, 0xff6622);
  this._shots = (this._shots || 0) + 1;
}

// KANSALDI (index.html:1652-1676): fire breath 4.0 s → every 6.0 s, active 1.2 s.
function L5_kansaldi(dt) {
  const s = this.scene, dir = this.rt ? 1 : -1;
  const bx = dir > 0 ? this.body.right + 4 : this.body.x - 4;
  this._breathTimer -= dt;
  if (this._breathTimer <= 0 && !this._breathActive) {
    this._breathTimer = 6.0; this._breathActive = true; this._breathDur = 1.2;
    FX.burst(s, bx, this.body.y + this.body.height * 0.4, { count: 25, tint: [0xff4400, 0xff8800], speedMax: 240, lifespan: 600, gravityY: 60 });
    this._breaths = (this._breaths || 0) + 1;
  }
  if (!this._breathActive) return;
  this._breathDur -= dt;
  if (this._breathDur <= 0) { this._breathActive = false; return; }
  const by = this.body.y + this.body.height * 0.3, em = s._l5BreathEm;
  if (em && em.active) { em.explode(6, bx, by); em.explode(4, bx + dir * 30, by); em.explode(3, bx + dir * 60, by); }
  if (Math.random() < 1 - Math.pow(0.85, dt * 60)) {
    for (const h of s.heroes) if (h.on && Math.abs(h.body.x - this.body.x) < 300) h.hurt(8, this.x);
  }
}

// An ember for the act ≥ 5 overlay (screen space).
function L5_ember(anywhere) {
  return {
    x: Math.random() * CW, y: anywhere ? Math.random() * CH : CH + Math.random() * 30,
    vy: 18 + Math.random() * 46, sw: 10 + Math.random() * 22, f: 1 + Math.random() * 2.5, ph: Math.random() * 6.3,
    t: 0, s: Math.random() < 0.35 ? 3 : 2, a: 0.6 + Math.random() * 0.4,
    c: [0xffb040, 0xffd070, 0xffe8a8, 0xff8a20][Math.floor(Math.random() * 4)],
  };
}

class Level5 extends DragonScene {
  constructor() { super('level5'); this.musicTheme = 'boss'; this.allowScrolls = true; }

  enter() {
    // the act ≥ 5 fire overlay redraws on every rendered frame (it flickers under dialogue too)
    if (this._l5Tick) this.events.off('postupdate', this._l5Tick);
    this._l5Tick = (time, delta) => this._l5Overlay(delta);
    this.events.on('postupdate', this._l5Tick);
    this.events.once('shutdown', () => { if (this._l5Tick) this.events.off('postupdate', this._l5Tick); this._l5Tick = null; });
    this._l5Shake = null;
    this.bAct1();
  }

  // The shared act opening: beginAct → dress → original field → props → party → familiars.
  _l5Begin(n, avoid) {
    this.beginAct(n);
    this._fireG = null; this._emberG = null; this._embers = null; this._l5BreathEm = null;
    this._ogre = null; this._chief = null; this._ogreDead = false; this._escT = null; this._endDone = false;
    if (this._l5Shake) { this.winShake(this._l5Shake[0], this._l5Shake[1]); this._l5Shake = null; }   // N11
    this.dress('ruins');
    this.buildOrig(L5_W, L5_H, L5_ruinsField);
    this.props(n, { avoid: avoid || [] });
    this.party(60, L5_FLOOR, PARTY5);
    // N17 deliberate fix: Nick (original x 180) spawns inside c12 → on the floor just left of it
    const nick = this.heroes.find(h => h.customType === 'nick');
    if (nick) nick.body.reset(L5_NICKX, nick.y);
    this.familiars();
    if (n >= 5) this._l5Fire();
  }
  // Original-numbered foe; x = ORIGINAL top-left x (+ w/2 → hitbox centre), feet = original y.
  _l5Foe(o) {
    const e = this.foe(Object.assign({}, o, { x: o.x + o.w / 2, feet: this.oy(o.feet != null ? o.feet : L5_FLOOR) }));
    if (o.ai === 'boss') e._phase2 = undefined;                 // no generic phase 2 (original)
    if (o.ai === 'boss' || o.ai === 'static' || o.special) L5_hook(e, o.special);
    return e;
  }
  _l5Intro(retry, lines) {
    if (retry) { this.live = true; return; }
    this.say(lines, () => { this.live = true; });
  }
  // One-shot act win: burst (at `at` or the screen centre) + the shake carried into the
  // next act (N11) + the narrator line → next act.
  _l5Win(next, lineKey, shake, burst, at) {
    if (!this.live || this._won || !this.enemiesAllDead()) return;
    const cam = this.cameras.main;
    const p = at || { x: cam.scrollX + CW / 2, y: cam.scrollY + CH / 2 };
    FX.burst(this, p.x, p.y, { count: burst[0], tint: burst[1], speedMax: 260 });
    this._l5Shake = shake;
    this.combatWin(next, [d('speaker_narrator', lineKey)], false);
  }

  // ── A1 — Calm Before Storm (bAct1 3797-3817; gate 4053-4058) ──────────────
  bAct1(retry) {
    this._l5Begin(1, [600]);
    this.enemiesIn([]);
    this._l5Npcs = [{ x: 600, nameKey: 'npc_name_armory_master', lines: [d('speaker_armory_master', 'dlg_lv5_act1_01')] }];
    this.setHint('hint_lv5_act1');
    this._l5Intro(retry, [d('speaker_narrator', 'dlg_lv5_act1_02'), d('speaker_narrator', 'dlg_lv5_act1_03'), d('speaker_narrator', 'dlg_lv5_act1_04')]);
  }

  // ── A2 — Broken Illusion: 10 mercenaries (bAct2 3819-3850) ─────────────────
  bAct2(retry) {
    this._l5Begin(2);
    const S = (x, nameKey, type, ai, color, extra) => this._l5Foe(Object.assign({ type, x, w: 28, h: 40, hp: 130, dmg: 13, ai, spd: 0.9, nameKey, color }, extra || {}));
    const guard = S(400, 'enemy_name_battlement_guard', 'castle_soldier', 'static', '#446688', { feet: 160 });   // N19: ON p1
    guard._l5X = guard.x;
    this.enemiesIn([
      S(800, 'enemy_name_soldier_1', 'castle_soldier', 'chase', '#888888'),
      S(1000, 'enemy_name_soldier_2', 'knight', 'chase', '#999999'),
      S(2600, 'enemy_name_soldier_3', 'castle_archer', 'patrol', '#777777'),
      S(2800, 'enemy_name_soldier_4', 'hideout_fighter', 'chase', '#aaaaaa'),
      guard,
      S(1442, 'enemy_name_soldier_5', 'castle_soldier', 'patrol', '#888888'),     // orig x 1400 (inside c88) → N17
      S(1800, 'enemy_name_soldier_6', 'knight', 'chase', '#999999'),
      S(2200, 'enemy_name_soldier_7', 'castle_archer', 'patrol', '#777777'),
      S(3200, 'enemy_name_soldier_8', 'hideout_fighter', 'chase', '#aaaaaa'),
      S(3600, 'enemy_name_soldier_9', 'castle_soldier', 'patrol', '#888888'),
    ]);
    this.setHint('hint_lv5_act2');
    this._l5Intro(retry, [d('speaker_narrator', 'dlg_lv5_act2_01'), d('speaker_narrator', 'dlg_lv5_act2_02'), d('speaker_tutorial', 'dlg_lv5_act2_03')]);
  }

  // ── A3 — La Ruina Roja: 6 draconians (bAct3 3852-3879) ─────────────────────
  bAct3(retry) {
    this._l5Begin(3);
    const K = x => this._l5Foe({ type: 'draconian_kapak', x, w: 24, h: 56, hp: 160, dmg: 17, ai: 'chase', spd: 0.9, nameKey: 'enemy_name_draconian_kapak', color: '#b87333' });
    const Sc = (x, ai) => this._l5Foe({ type: 'draconian', x, w: 24, h: 36, hp: 120, dmg: 13, ai, spd: 0.9, nameKey: 'enemy_name_draconian_scout', color: '#6a8844' });
    this.enemiesIn([K(1000), K(2600), Sc(1442, 'patrol') /* orig 1400, inside c88 → N17 */, Sc(1800, 'chase'), Sc(2200, 'patrol'), Sc(3000, 'chase')]);
    this.setHint('hint_lv5_act3');
    this._l5Intro(retry, [d('speaker_kansaldi', 'dlg_lv5_act3_01'), d('speaker_kansaldi', 'dlg_lv5_act3_02'), d('speaker_tutorial', 'dlg_lv5_act3_03')]);
  }

  // ── A4 — First Wave: Sivak Draconian (bAct4 3881-3903) ─────────────────────
  bAct4(retry) {
    this._l5Begin(4);
    const sivak = this._l5Foe({ type: 'draconian_sivak', x: 900, w: 32, h: 60, hp: 225, dmg: 18, ai: 'boss', nameKey: 'enemy_name_sivak_draconian', color: '#556633', special: L5_sivak });
    sivak._stompTimer = 3.5; sivak._enraged = false;
    this._sivak = sivak;
    this.enemiesIn([sivak]);
    this.setHint('hint_lv5_act4');
    this._l5Intro(retry, [d('speaker_narrator', 'dlg_lv5_act4_01'), d('speaker_narrator', 'dlg_lv5_act4_02'), d('speaker_tutorial', 'dlg_lv5_act4_03')]);
  }

  // ── A5 — Iron and Fire: Boilerdrak (bAct5 3905-3927) ───────────────────────
  bAct5(retry) {
    this._l5Begin(5);
    const boil = this._l5Foe({ type: 'boilerdrak', x: 900, w: 28, h: 36, hp: 300, dmg: 21, ai: 'boss', nameKey: 'enemy_name_boilerdrak', color: '#ff6633', special: L5_boilerdrak });
    boil._projTimer = 3.0;
    this._boil = boil;
    this.enemiesIn([boil]);
    this.setHint('hint_lv5_act5');
    this._l5Intro(retry, [d('speaker_narrator', 'dlg_lv5_act5_01'), d('speaker_narrator', 'dlg_lv5_act5_02'), d('speaker_tutorial', 'dlg_lv5_act5_03')]);
  }

  // ── A6 — Last Stand: Ogre + Goblin Chief + 4 goblins (bAct6 3929-3957) ──────
  bAct6(retry) {
    this._l5Begin(6);
    const ogre = this._l5Foe({ type: 'ogre', x: 800, w: 28, h: 40, hp: 270, dmg: 17, ai: 'boss', nameKey: 'enemy_name_ogre', color: '#aa8855' });
    const chief = this._l5Foe({ type: 'goblin', x: 800, feet: L5_FLOOR - 40, w: 16, h: 20, hp: 120, dmg: 10, ai: 'static', nameKey: 'enemy_name_goblin_chief', color: '#44cc44' });
    chief.inv = 999;
    const Gb = (x, ai) => this._l5Foe({ type: 'goblin', x, w: 20, h: 28, hp: 100, dmg: 10, ai, nameKey: 'enemy_name_goblin', color: '#4a7c3f' });
    this.enemiesIn([ogre, chief, Gb(1217, 'patrol') /* orig 1200, inside pillar 75 → N17 */, Gb(1600, 'chase'), Gb(2000, 'patrol'), Gb(2400, 'chase')]);
    this._ogre = ogre; this._chief = chief; this._ogreDead = false;
    this._l5Ride();
    this.setHint('hint_lv5_act6');
    this._l5Intro(retry, [d('speaker_narrator', 'dlg_lv5_act6_01'), d('speaker_narrator', 'dlg_lv5_act6_02'), d('speaker_tutorial', 'dlg_lv5_act6_03')]);
  }
  // The ride rule (index.html:4067-4084), run every gameplay frame after the enemy updates.
  _l5Ride() {
    const og = this._ogre, ch = this._chief;
    if (!og || !ch || this._ogreDead) return;
    if (og.on && og.body) {
      if (!ch.on || !ch.body) return;
      // put the chief's BODY top-left at (ogre.x, ogre.y − ogre.h) in hitbox space. body.reset
      // parks the body at the sprite's top-left until the next physics step, so re-derive it
      // from the sprite now (contact tests this frame see the real hitbox) and zero the
      // frame delta (postUpdate must not move the sprite again).
      const bx = og.body.x, by = og.body.y - og.body.height, b = ch.body;
      b.reset(bx - ch.scaleX * (b.offset.x - ch.displayOriginX), by - ch.scaleY * (b.offset.y - ch.displayOriginY));
      b.updateFromGameObject(); b.prev.copy(b.position); b.prevFrame.copy(b.position); if (b.autoFrame) b.autoFrame.copy(b.position);
      ch.inv = 999;
      return;
    }
    // the ogre is gone (killed or culled): the chief drops and becomes a normal chaser
    this._ogreDead = true;
    if (ch.on) { ch.ai = 'chase'; ch._aiOrig = 'chase'; ch.inv = 0; }
    const at = og._l5Last || { x: og.x, y: og.y };
    FX.burst(this, at.x, at.y, { count: 20, tint: [0x44cc44, 0x88ff88], speedMax: 220 });
    this.say([d('speaker_narrator', 'dlg_lv5_update_03')]);
  }

  // ── A7 — Sin Esperanza: Kansaldi, survive 10 s (bAct7 3959-3983) ───────────
  bAct7(retry) {
    this._l5Begin(7);
    const k = this._l5Foe({ type: 'kansaldi', x: 1000, w: 40, h: 48, hp: 1500, dmg: 33, ai: 'static', noCharge: true, nameKey: 'enemy_name_kansaldi', color: '#1a0a0a', special: L5_kansaldi });
    k._breathTimer = 4.0; k._breathActive = false; k._breathDur = 0;
    k._l5X = k.x;
    k.setFlipX(true);                                  // the kansaldi atlas is drawn facing LEFT: flip so he faces right (rt) like the original

    this._kans = k;
    this._l5BreathEm = this.add.particles(0, 0, FX._tex(this), {
      lifespan: { min: 200, max: 420 }, speed: { min: 30, max: 170 }, angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 }, gravityY: -80, tint: [0xff2200, 0xff8800, 0xffcc00], emitting: false,
    }).setDepth(21);
    this.enemiesIn([k]);
    this._escT = 10;                                   // hidden (never displayed in the original)
    this.setHint('hint_lv5_act7');
    this._l5Intro(retry, [d('speaker_narrator', 'dlg_lv5_act7_01'), d('speaker_narrator', 'dlg_lv5_act7_02'), d('speaker_kansaldi', 'dlg_lv5_act7_03'), d('speaker_narrator', 'dlg_lv5_act7_04')]);
  }
  _l5Ending() {
    this._endDone = true; this.live = false; this.act = -1;
    const N = k => d('speaker_narrator', k);
    this.say([
      N('dlg_lv5_update_09'), d('speaker_becklin', 'dlg_lv5_update_10'), d('speaker_kote', 'dlg_lv5_update_11'),
      d('speaker_minerva', 'dlg_lv5_update_12'), d('speaker_arturito', 'dlg_lv5_update_13'), N('dlg_lv5_update_14'),
      N('dlg_lv5_update_15'), N('dlg_lv5_update_16'), N('dlg_lv5_update_17'), d('speaker_nesta', 'dlg_lv5_update_18'),
      d('speaker_nick', 'dlg_lv5_update_19'), N('dlg_lv5_update_20'), N('dlg_lv5_update_21'),
    ], () => G.victory());                             // deliberate fix: no loop into Lv1
  }

  // ── FIRE OVERLAY (act ≥ 5) ─────────────────────────────────────────────────
  _l5Fire() {
    this._fireG = this.add.graphics().setScrollFactor(0).setDepth(-12).setBlendMode(Phaser.BlendModes.ADD);
    this._emberG = this.add.graphics().setScrollFactor(0).setDepth(24).setBlendMode(Phaser.BlendModes.ADD);
    this._embers = Array.from({ length: 46 }, () => L5_ember(true));
  }
  _l5Overlay(delta) {
    if (G.sc !== this || G.state !== 'play' || !this._fireG || !this._fireG.active) return;
    // heat glow: a random-alpha warm wash every frame (the original's random rgba(255,100-200,0,≤0.2)
    // flicker) rising from the ground, behind the terrain and the actors
    const g = this._fireG, a = 0.16 + Math.random() * 0.16, gg = 100 + Math.random() * 100 | 0;
    g.clear();
    g.fillStyle((255 << 16) | (gg << 8), Math.random() * 0.06).fillRect(0, 0, CW, CH);
    g.fillGradientStyle(0xff8a20, 0xff8a20, 0xff6a10, 0xff6a10, 0, 0, a, a).fillRect(0, CH * 0.25, CW, CH * 0.75);
    if (!this._emberG || !this._emberG.active) return;
    const dt = Math.min(0.05, (delta || 16) / 1000), run = !D.on, e = this._emberG; e.clear();
    for (let i = 0; i < this._embers.length; i++) {
      let m = this._embers[i];
      if (run) { m.t += dt; m.y -= m.vy * dt; m.x += Math.sin(m.t * m.f + m.ph) * m.sw * dt; if (m.y < -6) m = this._embers[i] = L5_ember(false); }
      e.fillStyle(m.c, m.a * (0.6 + 0.4 * Math.sin(m.t * 9 + m.ph))).fillRect(m.x, m.y, m.s, m.s);
    }
  }

  // ── PER FRAME ──────────────────────────────────────────────────────────────
  step(dt) {
    this.updateFamiliars(dt);
    switch (this.act) {
      case 1:
        this.talkNPCs(dt, this._l5Npcs);
        this.walkGate(dt, 1010, () => this.say([d('speaker_narrator', 'dlg_lv5_update_01'), d('speaker_narrator', 'dlg_lv5_update_02')], () => this.bAct2()));
        break;
      case 2: this._l5Win(() => this.bAct3(), 'dlg_lv5_update_04', [0.5, 4], [25, [0xc8a84e, 0xffe08a]]); break;
      case 3: this._l5Win(() => this.bAct4(), 'dlg_lv5_update_05', [0.5, 4], [25, [0x00aa44, 0x66dd88]]); break;
      case 4: this._l5Win(() => this.bAct5(), 'dlg_lv5_update_06', [0.8, 6], [40, [0xff8833, 0xffcc66]], this._sivak && (this._sivak._l5Last || this._sivak)); break;
      case 5: this._l5Win(() => this.bAct6(), 'dlg_lv5_update_07', [0.8, 6], [50, [0xff4400, 0xff9933]], this._boil && (this._boil._l5Last || this._boil)); break;
      case 6:
        this._l5Ride();
        this._l5Win(() => this.bAct7(), 'dlg_lv5_update_08', [0.6, 5], [30, [0xd4a574, 0xffe0b0]]);
        break;
      case 7:
        if (this.live && !this._endDone && this._escT != null) { this._escT -= dt; if (this._escT <= 0) this._l5Ending(); }
        break;
    }
  }
}
