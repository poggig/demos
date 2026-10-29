// ═══════════════════════════════════════════════════════════════════════════
// CHRONICLES OF AZURERUNE v2 — LEVEL 3 "LIBRARY OF SECRETS" (studio engine phaser-1.16.0)
// Faithful remake of the original Lv3 class (game_v3/index.html:3022-3438; digest
// tools/digest/L3.md). Theme `library` for every act; PARTY4 (Nesta is absent — Kote,
// Minerva, Elber, Nick; Arturito follows Nick, the fox stays hidden).
//   A1 SILENCE THRESHOLD   stealth past the Library Censor (staircase → balcony), win x>2000
//   A2 DESCENT TO THE FORBIDDEN  vertical climb, win when the hero's TOP rises above y=100
//   A3 ECHOES OF THE PAST  2 Animated Swords + the Cursed Gauntlet (clear all)
//   A4 DECEPTIONS AND DEPTHS  The Spectator (teleports) + 2 Cursed Watchers (clear all)
//   A5 ESCAPE              reach x>3000 → Level 4
//
// NUANCES (L3.md §7) → how this file reproduces them
//  N1  96-px bookshelf walls block the ground (the "gap for pathing" comment is false):
//      L3_libraryHalls() is the original buildLibraryHalls(240,20) verbatim — walls x52-53 /
//      115-116 / 177-178 rows 11-16, mid-spans row 9 (x54-113, x117-175), balcony row 5
//      (x2-237). Every corridor is gated by a double jump. Companions only single-jump, so
//      they strand at walls as in the original; the engine's spaced follow regroups one that
//      ends >600 px off-screen (accepted by the lead).
//  N2  staircase ONLY in A1: the floating steps (2+s, 17-s) s=0..11 are added by bAct1 only.
//  N3  balcony = guaranteed stealth, mid-span is not: same geometry + scenes-base's 180/70
//      rings measured centre-to-centre → balcony dy = 191 px here (> 180, original 188),
//      mid-span dy = 127 (alert within |dx|<128; original 124/130). The original's cue (a
//      screen-wide green band over rows 5-6 + a pulsing green "→ UPPER PATH →") read as a
//      developer overlay on the painted library (visual review) → DELIBERATE CHANGE (look
//      only, F7): a painted wooden arrow sign at the staircase foot lettered ui_upper_path +
//      a faint warm glow where the stairs reach the balcony (_l3upperSign).
//  N4  detection: only the CONTROLLED hero (scenes-base), only after the intro (the
//      original's `tut`), Narrator "Detected!..." (<70 px) / "The guard noticed you!..."
//      (2.5 s inside 180 px) → bAct1() = full rebuild AND the 4-line intro replays; the
//      music is not restarted. While alerted the censor freezes and faces the hero
//      (the original's `_savedAi` → 'static'), released when the hero leaves the ring.
//      Watchers = the Censor + the Censor Guards (lead's brief); the guards all stand
//      beyond the x>2000 exit, so in play only the Censor can ever detect — as original.
//      NB the geometry seals the ground route: the stair top (13,6) sits right under the
//      one-way balcony (no drop-through), so the climbing hero can only land on the balcony and
//      never reaches the c2 floor — detection is unreachable by play, exactly as in the original
//      (its Ent.mv lands any falling body on any sol tile in its feet row). Kept faithful.
//  N5  three guards spawned beyond the 3840-px edge → DELIBERATE FIX (below); HUD 7/7.
//  N6  A2 narration "Descending…/Watch for trap platforms!" kept verbatim (no traps exist).
//  N7  A2 win on the hero's TOP edge < y 100 (original px) → body.top < oy(100): a hop off
//      the wall top or a mid-span wins without landing on the balcony. NB as in the
//      original (177 px vs 136 needed), Kote's double jump from the floor (≈137-157 px in
//      this engine) already reaches the target; Minerva/Nick/Elber (112/112/126 px) need
//      the climb: floor → wall top (double jump) → a hop.
//  N8  Spectator teleport: a 4.0 s timer that runs down continuously and, once ≤0, WAITS
//      until the controlled hero is within 80 px horizontally (left edges, as original),
//      then blinks to hero ± (200…250) px on a RANDOM side, y unchanged, 12 purple
//      particles at the destination, timer reset to 4.0 — L3_spectatorBeh (_bossBeh hook).
//  N9  the first hit killed the teleport forever → DELIBERATE FIX (below).
//  N10 "floats above the abyss" is flavour: it spawns at (H-8)T and was snapped to the c3
//      floor → spawned standing on the c3 floor (feet oy(272)).
//  N11 sword / gauntlet / watcher were procedural fallbacks → the game's drawn atlases
//      (enemy_animated_sword / enemy_gauntlet) + procAnim profiles (the studio art layer).
//  N12 A3 = exactly the original 3 foes, all in c1/c2 (1344 static sword 28×40 140hp,
//      800 patrol sword 130hp, 1100 chase gauntlet 130hp, spd 0.9).
//  N13 Nesta speaks the A1 tip although absent → kept (speaker_nesta = the JSON _speaker).
//      Becklin unreachable before the x>3000 exit → DELIBERATE FIX (below).
//  N14 music: `stealth` in A1 (and across A1 restarts), `library` from A2 to the end.
//  N15 stale "Enemies: 7/7" in A2/A5 is a HUD bug → not reproduced (counter only shows in
//      acts with foes). The A3/A4 win shake 0.5 s/4 px is DEFERRED until the dialogue
//      closes (winShake) — the original shakes only while no dialogue is open, so it
//      lands as the next act starts (L1 nuance 6); A1/A2/A5 have no shake.
//  N16 R scrolls + counter present (allowScrolls); every act re-applies the level-entry HP
//      (engine applyStats ← G.heroHPs, written only at level transitions) — as original.
//  +   party offsets x+0/+30/+60/+120 (Nesta's +90 slot stays empty); A1 at x=40, A2 x=40,
//      A3-A5 x=50. Static foes keep the original's 1.2 s contact cooldown (engine: 1.0).
//      A3/A4 wins: 25 purple (#9944ff) / gold (#c8a84e) particles at the screen centre.
//
// DELIBERATE FIXES (GAMESPEC policy §2)
//  F1  A1 Censor Guards #4-6 spawned at x 3900/4200/4500 (outside the 3840-px map, frozen
//      in out-of-bounds "solid") → placed inside c4 near the right end at 3640/3720/3800
//      (same chase/patrol/chase AIs).
//  F2  A1 Minerva spawned overlapping staircase steps (4,15)/(5,14) → every hero is
//      settled onto the first free surface under/around its original spawn (Minerva
//      stands on step (5,14), Kote on (3,16) exactly as the original snapped him).
//  F3  Spectator: the first hit (charge-on-hurt → permanent chase) switched its teleport
//      off → `noCharge: true`, ai stays 'static', the teleport works all fight.
//  F4  Spectator teleport clamp was hard-coded to x 50..1800 (left of its own spawn) and
//      could drop it INSIDE a bookshelf wall → clamped inside the map [50, W·T−50] (lead's
//      brief) and, if the landing spot overlaps a wall, nudged to the wall's nearer side.
//  F5  A5 Becklin (x=3200, Bakaris sprite) could never be talked to (the x>3000 exit fires
//      first; talking needs x>3100) → kept at his original spot, and he speaks his line
//      ("You made it through the library.") as the exit fires, before the Narrator's
//      "You escaped the library!" — his only line is no longer dead content.
//  F6  (now engine-side) stacked per-row wall bodies killed a jump pressed against a wall (double
//      jump 11 px instead of 110-137) — found here, fixed by GAME_CONFIG.mergeBodies (engine).
//  F7  the A1 green band + pulsing text → an in-world painted arrow sign + warm glow (see N3).
//  (The A3/A4 win shake is re-queued after the next act's build: beginAct clears _shakeQ.)
//  (+ the engine-level fixes: game over + retry act instead of the soft-lock, dead
//   controlled hero auto-swaps, no swap snapping, the playfield at the screen bottom.)
// Keys: every line uses its own dlg_lv3_* key + the JSON _speaker; no invented keys.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// The original buildLibraryHalls(tm,W,H) (index.html:874-887), verbatim, in ORIGINAL rows
// (buildOrig shifts them to the bottom of the 30-row world). `stairs` = the A1-only steps.
function L3_libraryHalls(tm, W, H, stairs) {
  for (let x = 0; x < W; x++) { tm.set(x, H - 3, 1); tm.set(x, H - 2, 1); tm.set(x, H - 1, 1); }
  const walls = [Math.floor(W * 0.22), Math.floor(W * 0.48), Math.floor(W * 0.74)];   // 52, 115, 177
  walls.forEach(wx => { for (let y = H - 9; y < H - 3; y++) { tm.set(wx, y, 1); tm.set(wx + 1, y, 1); } });
  for (let x = walls[0] + 2; x < walls[1] - 1; x++) tm.set(x, H - 11, 3);   // mid-span A x54-113
  for (let x = walls[1] + 2; x < walls[2] - 1; x++) tm.set(x, H - 11, 3);   // mid-span B x117-175
  for (let x = 2; x < W - 2; x++) tm.set(x, H - 15, 3);                     // reading balcony x2-237
  if (stairs) for (let s = 0; s < 12; s++) tm.set(2 + s, H - 3 - s, 1);       // A1 staircase (3,16)…(13,6)
}
const L3_W = 240, L3_H = 20;
const L3_PARTY_DX = [0, 30, 60, 120];   // createHeroes: Kote +0, Minerva +30, Elber +60, Nick +120
const L3_HERO_H = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.heroBody) ? GAME_CONFIG.heroBody[1] : 36;   // the original hitbox height

// First free feet y (world px) for a body centred at cx: start at `feet` and climb out of
// any solid tile the body overlaps (deliberate fix F2 — never spawn inside terrain).
function L3_freeFeet(tm, cx, bw, bh, feet) {
  for (let k = 0; k < 40; k++) {
    const x0 = Math.floor((cx - bw / 2) / T), x1 = Math.floor((cx + bw / 2 - 1) / T);
    const y0 = Math.floor((feet - bh) / T), y1 = Math.floor((feet - 1) / T);
    let top = null;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tm.solUp(tx, ty) && (top === null || ty < top)) top = ty;
    if (top === null) return feet;
    feet = top * T;
  }
  return feet;
}
// A left edge for a body of width w spanning [top,bottom) that does not overlap a solid
// column (deliberate fix F4 — the Spectator never blinks into a bookshelf wall).
function L3_freeLeft(tm, left, w, top, bottom) {
  const y0 = Math.floor(top / T), y1 = Math.floor((bottom - 1) / T);
  const colSolid = c => { for (let ty = y0; ty <= y1; ty++) if (tm.solUp(c, ty)) return true; return false; };
  for (let k = 0; k < 3; k++) {
    const c0 = Math.floor(left / T), c1 = Math.floor((left + w - 1) / T);
    let hit = -1; for (let c = c0; c <= c1; c++) if (colSolid(c)) { hit = c; break; }
    if (hit < 0) return left;
    let a = hit, b = hit;
    while (a > 0 && colSolid(a - 1)) a--;
    while (b < tm.w - 1 && colSolid(b + 1)) b++;
    const l = a * T - w - 1, r = (b + 1) * T + 1;
    left = (l >= 0 && (Math.abs(l - left) <= Math.abs(r - left) || r + w > tm.w * T)) ? l : r;
  }
  return left;
}
// Static foes: the original static branch re-arms contact damage after 1.2 s (engine 1.0).
// Detect the engine's fresh `akt = 1.0` (a jump up) and add the missing 0.2 s.
function L3_staticContact(e) {
  if (e.ai === 'static' && e._l3akt != null && e.akt > e._l3akt + 0.5) e.akt += 0.2;
  e._l3akt = e.akt;
}
// The Spectator (index.html:1641-1650 + F3/F4). `this` = the Spectator (engine _bossBeh hook).
function L3_spectatorBeh(dt, hero) {
  const sc = this.scene; if (!sc || !this.body || !this.on) return;
  L3_staticContact(this);
  if (hero && hero.on) { this.rt = hero.x > this.x; this.setFlipX(!this.rt); }   // it watches you
  this._teleT -= dt;
  if (this._teleT > 0 || !hero || !hero.on || Math.abs(this.body.x - hero.body.x) >= this._tpMinDist) return;
  this._teleT = 4.0;
  const w = this.body.width, maxL = sc.tm.w * T - 50 - w;
  let nl = Math.max(50, Math.min(maxL, hero.body.x + (Math.random() > 0.5 ? 1 : -1) * (200 + Math.random() * 50)));
  nl = Math.max(50, Math.min(maxL, L3_freeLeft(sc.tm, nl, w, this.body.top, this.body.bottom)));
  this.body.reset(this.x + (nl - this.body.x), this.y);
  this.body.setVelocity(0, 0);
  this._l3tp = (this._l3tp || 0) + 1;
  if (typeof FX !== 'undefined') FX.burst(sc, this.x, this.y, { count: 12, tint: [0x9944ff, 0xbb77ff], speedMax: 140, lifespan: 700 });
}

class Level3 extends DragonScene {
  constructor() { super('level3'); this.musicTheme = 'stealth'; this.allowScrolls = true; }

  // The original enter(): Music.play('stealth') → bAct1. A replayed level reuses this scene
  // instance (constructor not re-run), so the A1 theme is re-asserted here.
  enter() { this.music('stealth'); this.bAct1(); }

  // Shared act scaffold: theme → original map → props → party (original offsets, settled).
  _l3world(n, stairs, avoid) {
    this.beginAct(n);
    this.dress('library');
    this.buildOrig(L3_W, L3_H, (tm, W, H) => L3_libraryHalls(tm, W, H, stairs));   // walls: one body each via GAME_CONFIG.mergeBodies
    this.props(n, { avoid: avoid || [] });
  }
  // The A1 safe-route cue, IN THE WORLD (the original's screen-wide green band + pulsing green
  // text read as a developer overlay on the painted library — visual review): a painted wooden
  // arrow sign on a post standing on the floor at the staircase foot (the free floor pocket
  // x 0-47, left of step (3,16)), pointing up the stairs, lettered with ui_upper_path; plus a
  // faint warm lamp-glow where the stairs reach the balcony. Behind the actors, no motion.
  _l3upperSign() {
    const floor = this.oy(272), bx = 1, bw = 38, bh = 36, by = floor - 62, postX = 17;   // clear of Kote's spawn on step (3,16)
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x2e1c0e, 1).fillRect(postX, by + bh - 4, 6, floor - (by + bh - 4));          // post
    g.fillStyle(0x5a3a20, 1).fillRect(postX + 1, by + bh - 4, 3, floor - (by + bh - 4));
    g.fillStyle(0x3a2412, 1).fillRect(bx, by, bw, bh);                                         // darker border
    g.fillStyle(0x9a6a3c, 1).fillRect(bx + 2, by + 2, bw - 4, bh - 4);                         // board
    g.fillStyle(0x8a5c32, 1).fillRect(bx + 3, by + 11, bw - 6, 1).fillRect(bx + 3, by + 29, bw - 6, 1);   // grain
    g.fillStyle(0xb07e4c, 1).fillRect(bx + 2, by + 2, bw - 4, 1);                              // lit top edge
    g.fillStyle(0x2a1a10, 1).fillRect(bx + 4, by + 4, 2, 2).fillRect(bx + bw - 6, by + 4, 2, 2);          // nails
    // painted pale arrow pointing up-right (up the staircase)
    const ax0 = bx + 9, ay0 = by + 17, ax1 = bx + 25, ay1 = by + 7, ux = 0.848, uy = -0.530, px = 0.530, py = 0.848;
    g.lineStyle(3, 0xf2e4bc, 1).lineBetween(ax0, ay0, ax1, ay1);
    g.fillStyle(0xf2e4bc, 1).fillTriangle(ax1 + ux * 6, ay1 + uy * 6, ax1 + px * 4, ay1 + py * 4, ax1 - px * 4, ay1 - py * 4);
    // the lettering: ui_upper_path without its arrow glyphs (the painted arrow replaces them)
    const word = Lang.t('ui_upper_path').replace(/[→←]/g, '').trim() || Lang.t('ui_upper_path');
    const t = this.add.text(bx + bw / 2, by + 27, word, { fontFamily: 'monospace', fontSize: '7px', fontStyle: 'bold', color: '#2a1608', align: 'center', wordWrap: { width: bw - 8 }, lineSpacing: -2 }).setOrigin(0.5).setDepth(-1);
    if (t.width > bw - 6) t.setScale((bw - 6) / t.width);
    // warm lamp-glow on the balcony where the staircase arrives (top step (13,6) → balcony row 5)
    if (!this.textures.exists('l3_warmglow')) {
      const c = this.textures.createCanvas('l3_warmglow', 96, 96), x = c.getContext();
      const gr = x.createRadialGradient(48, 48, 2, 48, 48, 48);
      gr.addColorStop(0, 'rgba(255,200,120,0.55)'); gr.addColorStop(0.5, 'rgba(255,170,80,0.18)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 96, 96); c.refresh();
    }
    this.add.image(14 * T, this.oy(80) - 6, 'l3_warmglow').setScale(1.1, 0.55).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7).setDepth(-1);
    this._l3sign = { board: g, label: t, word };
  }
  _l3party(x) {
    this.party(x, 272, PARTY4);
    this.heroes.forEach((h, i) => {
      const cx = x + 10 + L3_PARTY_DX[i];
      const feet = L3_freeFeet(this.tm, cx, h.body.width, h.body.height, this.oy(272));
      h.body.reset(cx, feet - h.displayHeight * (1 - h.originY) - 2);
    });
    this.familiars();
  }

  // ── ACT 1 — SILENCE THRESHOLD (stealth) · index.html:3062-3094, 3266-3307, 3389-3416 ──
  bAct1(retry) {
    this._l3world(1, true, [48, 112, 176]);
    this._l3party(40);
    const gy = this.oy(272);
    const censor = this.foe({ type: 'lib_censor', x: 1200 + 14, feet: gy, w: 28, h: 40, hp: 130, dmg: 11, ai: 'patrol', spd: 0.8, nameKey: 'enemy_name_library_censor', color: '#4466aa' });
    const guard = (x, ai) => this.foe({ type: 'castle_soldier', x: x + 12, feet: gy, w: 24, h: 36, hp: 120, dmg: 12, ai, spd: 0.7, nameKey: 'enemy_name_censor_guard', color: '#556688' });
    // F1: the original's #4-6 stood at 3900/4200/4500 (beyond the map) → inside c4.
    const list = [censor, guard(2500, 'patrol'), guard(3000, 'chase'), guard(3500, 'patrol'), guard(3640, 'chase'), guard(3720, 'patrol'), guard(3800, 'chase')];
    list.forEach(e => { e._l3watch = true; });
    this.enemiesIn(list);
    this.setupStealth(e => e._l3watch);
    this._l3upperSign();   // the safe-route cue, as a painted sign in the world
    this.setHint('hint_lv3_act1');
    if (!retry) this.say([
      d('speaker_narrator', 'dlg_lv3_act1_01'), d('speaker_narrator', 'dlg_lv3_act1_02'),
      d('speaker_tutorial', 'dlg_lv3_act1_03'), d('speaker_nesta', 'dlg_lv3_act1_04'),
    ], () => { this.live = true; });
    else this.live = true;
  }
  _l3stepA1(dt, h) {
    if (!this.live || this._won) return;
    this.updateStealth(dt, () => {
      const hh = this.heroes[this.ai];
      const near = !!hh && this.enemies.some(e => e.on && e._l3watch && Math.hypot(e.x - hh.x, e.y - hh.y) < 70);
      this.live = false;
      this.say([d('speaker_narrator', near ? 'dlg_lv3_update_01' : 'dlg_lv3_update_02')], () => this.bAct1());
    });
    if (!this.live) return;
    // the original freezes the watcher and turns it toward the hero while alerted
    for (const e of this.enemies) {
      if (!e.on || !e._l3watch) continue;
      const alert = h && h.on && Math.hypot(e.x - h.x, e.y - h.y) < 180;
      if (alert) { if (!e._l3saved) e._l3saved = e.ai; e.ai = 'static'; e.body.setVelocityX(0); e.rt = h.x > e.x; e.setFlipX(!e.rt); }
      else if (e._l3saved) { e.ai = e._l3saved; e._l3saved = null; }
    }
    if (h && h.on && h.body.x > 2000) {
      this._won = true; this.live = false;
      this.say([d('speaker_narrator', 'dlg_lv3_update_03')], () => this.bAct2());
    }
  }

  // ── ACT 2 — DESCENT TO THE FORBIDDEN (vertical climb) · index.html:3096-3114, 3309-3315 ──
  bAct2(retry) {
    this.music('library');
    this._l3world(2, false);
    this._l3party(40);
    this.enemiesIn([]);
    this.setHint('hint_lv3_act2');
    if (!retry) this.say([d('speaker_narrator', 'dlg_lv3_act2_01'), d('speaker_narrator', 'dlg_lv3_act2_02')], () => { this.live = true; });
    else this.live = true;
  }
  _l3stepA2(h) {
    if (!this.live || this._won || !h || !h.on) return;
    // the original: hero.y (top edge of its fixed 36-px hitbox) < 100. Measured from the feet:
    // procAnim's jump stretch re-sizes the Arcade body a few px, the original box never changed.
    if (h.body.bottom - L3_HERO_H < this.oy(100)) {
      this._won = true; this.live = false;
      this.say([d('speaker_narrator', 'dlg_lv3_update_04')], () => this.bAct3());
    }
  }

  // ── ACT 3 — ECHOES OF THE PAST · index.html:3116-3143, 3363-3367 ──
  bAct3(retry) {
    this.music('library');
    this._l3world(3, false);
    this._l3party(50);
    const gy = this.oy(272);
    const sword = this.foe({ type: 'animated_sword', x: 1344 + 14, feet: gy, w: 28, h: 40, hp: 140, dmg: 14, ai: 'static', spd: 0.9, nameKey: 'enemy_name_animated_sword', color: '#9944ff' });
    sword._bossBeh = function () { L3_staticContact(this); };
    this.enemiesIn([
      sword,
      this.foe({ type: 'animated_sword', x: 800 + 12, feet: gy, w: 24, h: 36, hp: 130, dmg: 12, ai: 'patrol', spd: 0.9, nameKey: 'enemy_name_animated_sword', color: '#9944ff' }),
      this.foe({ type: 'gauntlet', x: 1100 + 12, feet: gy, w: 24, h: 36, hp: 130, dmg: 13, ai: 'chase', spd: 0.9, nameKey: 'enemy_name_cursed_gauntlet', color: '#443322' }),
    ]);
    this.setHint('hint_lv3_act3');
    if (!retry) this.say([d('speaker_narrator', 'dlg_lv3_act3_01'), d('speaker_narrator', 'dlg_lv3_act3_02'), d('speaker_tutorial', 'dlg_lv3_act3_03')], () => { this.live = true; });
    else this.live = true;
  }

  // ── ACT 4 — DECEPTIONS AND DEPTHS (the Spectator) · index.html:3145-3173, 1641-1650 ──
  bAct4(retry) {
    this.music('library');
    this._l3world(4, false);
    this._l3party(50);
    const gy = this.oy(272);
    const spec = this.foe({ type: 'spectator', x: 1984 + 12, feet: gy, w: 24, h: 32, hp: 165, dmg: 16, ai: 'static', noCharge: true, nameKey: 'enemy_name_the_spectator', color: '#6644aa' });
    spec._teleT = 4.0; spec._tpMinDist = 80; spec._bossBeh = L3_spectatorBeh;
    this.enemiesIn([
      spec,
      this.foe({ type: 'gauntlet', x: 800 + 12, feet: gy, w: 24, h: 36, hp: 120, dmg: 12, ai: 'patrol', spd: 0.7, nameKey: 'enemy_name_cursed_watcher', color: '#6644aa' }),
      this.foe({ type: 'gauntlet', x: 1400 + 12, feet: gy, w: 24, h: 36, hp: 120, dmg: 12, ai: 'chase', spd: 0.7, nameKey: 'enemy_name_cursed_watcher', color: '#6644aa' }),
    ]);
    this.setHint('hint_lv3_act4');
    if (!retry) this.say([d('speaker_narrator', 'dlg_lv3_act4_01'), d('speaker_narrator', 'dlg_lv3_act4_02'), d('speaker_tutorial', 'dlg_lv3_act4_03')], () => { this.live = true; });
    else this.live = true;
  }

  // A3/A4 win: every foe down → shake 0.5/4 (deferred past the dialogue) + 25 particles.
  _l3combatWin(tint, lineKey, next) {
    if (!this.live || this._won || !this.enemiesAllDead()) return;
    this._won = true; this.live = false;
    this.winShake(0.5, 4);
    const cam = this.cameras.main;
    if (typeof FX !== 'undefined') FX.burst(this, cam.scrollX + CW / 2, cam.scrollY + CH / 2, { count: 25, tint: [tint, 0xffffff], speedMax: 260 });
    // DragonScene.beginAct clears _shakeQ, and the next act is built from this dialogue's
    // callback — re-queue after the build so the shake still lands as the next act begins.
    this.say([d('speaker_narrator', lineKey)], () => { next(); if (!this._shakeQ) this.winShake(0.5, 4); });
  }

  // ── ACT 5 — ESCAPE · index.html:3175-3196, 3318-3336 ──
  bAct5(retry) {
    this.music('library');
    this._l3world(5, false, [3200]);
    this._l3party(50);
    this.enemiesIn([]);
    // Becklin (Bakaris sprite) at x=3200 in c4, facing the way the party comes from.
    const feet = this.oy(272), key = 'atlas_enemy_bakaris';
    const fr = this.textures.exists(key) ? Art._displayFrame(this, key, 'enemy_bakaris_') : null;
    const img = fr ? this.add.sprite(3200, feet, key, fr) : this.add.image(3200, feet, 'npc_noble');
    img.setOrigin(0.5, 1).setScale(fr ? 0.9 : 0.82).setFlipX(true).setDepth(1);
    this.add.text(3200, feet - img.displayHeight - 4, Lang.t('npc_name_becklin'), { fontFamily: 'monospace', fontSize: '9px', color: '#d8d0c0', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(3);
    this._l3becklin = img;
    this.setHint('hint_lv3_act5');
    if (!retry) this.say([d('speaker_narrator', 'dlg_lv3_act5_02')], () => { this.live = true; });
    else this.live = true;
  }
  _l3stepA5(h) {
    if (!this.live || this._won || !h || !h.on) return;
    if (h.body.x > 3000) {
      this._won = true; this.live = false;
      // F5: Becklin greets the party at the exit (unreachable in the original), then the exit line.
      this.say([d('speaker_becklin', 'dlg_lv3_act5_01'), d('speaker_narrator', 'dlg_lv3_update_05')], () => this.nextLevel('level4'));
    }
  }

  // ── PER-FRAME ──
  step(dt) {
    this.updateFamiliars(dt);
    const h = this.heroes[this.ai];
    if (this.act === 1) this._l3stepA1(dt, h);
    else if (this.act === 2) this._l3stepA2(h);
    else if (this.act === 3) this._l3combatWin(0x9944ff, 'dlg_lv3_update_06', () => this.bAct4());
    else if (this.act === 4) this._l3combatWin(0xc8a84e, 'dlg_lv3_update_07', () => this.bAct5());
    else if (this.act === 5) this._l3stepA5(h);
  }
}

if (typeof window !== 'undefined') window.Level3 = Level3;
