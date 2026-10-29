// ═══════════════════════════════════════════════════════════════════════════
// CHRONICLES OF AZURERUNE v2 — LEVEL 1 · "SCHOOL DAY"
// Source of truth: game_v3/index.html class Lv1 (2136-2610) + buildCastleArena (829-849)
// + the shared Enem/Proj/NPC systems. Digest: tools/digest/L1.md. Music `castle` all level.
//   A1 THE FINAL EXAM      arena combat, 11 foes, Bakaris boss (phase-2 lob)
//   A2 BLOOD AND GRUDGE    cutscene over the frozen arena
//   A3 HALLWAY RUMORS      social walk: 4 NPCs (optional talk), gate at x>1800
//   A4 NIGHT INFILTRATION  3 one-way rows, platform-hopping guard (2-ring stealth) + 7 mimics
//   A5 DIVERGING PATHS     cutscene → Level 2
//
// ── L1.md §7 NUANCES → how this file reproduces them ────────────────────────
//  N1  heroes spawn inside the guard tower → DELIBERATE FIX (F1): same x as the original
//      (50/40 + 30·i), but each hero stands ON the surface its original snapGnd would have
//      buried it in (L1_feet: snapGnd scan, then climb out of the block) → Kote, Minerva,
//      Elber on the tower top, Nesta + Nick on the ground below.
//  N2  256-288 px world, camera never scrolls vertically → buildOrig puts the original rows
//      at the bottom of the 30-row world (GAMESPEC fix); the world is exactly one view tall,
//      so the camera still never scrolls vertically.
//  N3  dimmed tiled back-wall → not reproduced: the drawn castle/library backdrop fills the
//      sky (studio art, GAMESPEC policy 3).
//  N4  embedded balcony goblins (A1 x 3000/3600) and mimics (A4 x 3400/4000) → DELIBERATE FIX
//      (F1): they stand ON the balcony (still required for the win, so the player still has
//      to climb the stairs; they still hop at heroes above them via combat.enemyHop). The A1
//      Tower Guard sits on the balcony top exactly as in the original.
//  N5  no lose state / soft-lock → DELIBERATE FIX (F4): engine game over + "retry act",
//      auto-swap off a dead controlled hero (engine).
//  N6  deferred celebration → the A1 win shake (0.5 s / 4 px) waits through "Victory in the
//      exam!" and the whole A2 cutscene and plays when A3's intro closes (the queued shake
//      is carried across A3's beginAct); the A4 win shake is lost at the level change, as in
//      the original. The 25-particle burst (gold A1 / green A4) at the screen centre ANIMATES
//      (DELIBERATE FIX F7: the original froze it as a motionless clump for the whole cutscene).
//  N7  cutscenes keep the previous act on screen → cutsceneOver keeps the frozen world (its
//      tiles stay drawn — the original dropped tm); HUD tiles hidden as in the original; the
//      enemy counter stays at the stale "Enemies: 0/11".
//  N8  Bakaris phase 2 → engine `boss` at ≤50 % (spd×1.4); _bossBeh adds the 65-particle burst
//      (30 red / 20 yellow / 15 white), clears the engine's orange phase-2 tint (the original
//      has none) and fires the LOB: _projT starts at 3.0 and drains from the first frame, so
//      the first lob flies on the first phase-2 frame, then every 2.5 s; Proj = this.lob at
//      the front edge (x+w+2 / x−2, y+0.3h), vx = facing·4, vy = −3, gravity 0.24, dmg
//      floor(13·0.6) = 7. Boss/static contact cooldown 1.2 s (L1_slowContact).
//  N9  guard hop = fixed cycle floor→P1→P2→P3→floor, first after 3-7 s then every 3.5-7.5 s,
//      teleport with vy = 0, x unchanged → DELIBERATE FIX (F2): the x clamp was written with
//      32-px tiles ([160, 2400]) and let the guard hop into empty air past x=1279; it is now
//      [160, 1252] (the left bound kept — it already clears the tower — the right bound = the
//      platform end 80·T minus the guard's 28 px), and the floor stop is the ground surface
//      (the original's pY[0] sank it 16 px into the floor).
//  N10 detection measured to the CONTROLLED hero only (base updateStealth; centre-to-centre,
//      = the original's top-left distance + (4,2) px); companions never trigger it, patrol
//      contact still hurts them (combat.contactAll). While alerted the guard stops (static)
//      and faces the hero, restored when the ring is left (index.html:2501-2505).
//  N11 Nesta's X voids stealth for the rest of the act → DELIBERATE FIX (base/engine): the 5 s
//      invisibility now ends on benched heroes too. Static foes and Bakaris still hit
//      invisible heroes (engine canHit).
//  N12 A4 win ignores the guard but needs the controlled hero past x>1400 (left edge → centre
//      1410); A1 needs all 11 foes down (Tower Guard + balcony goblins included).
//  N13 any hit turns a static foe into a permanent chaser → engine chargeOnHit (no _noCharge on
//      the Tower Guard / small mimics; they have no specials to protect).
//  N14 universal enemy jump → engine combat.enemyHop for patrol/chase/boss; the engine skips
//      `static`, so L1_staticHop gives the static foes the same hop while they are static.
//  N15 companions auto-fight and take patrol damage → engine combat.companionAttack/contactAll.
//  N16 dash = 7-px blink → not reproduced (engine-wide hero kit, not a level concern).
//  N17 swap re-snaps everyone → DELIBERATE FIX (engine never snaps).
//  N18 NPC rules → local L1 check on top of talkNPCs: Z/J/Space, |NPC x − hero LEFT edge| < 100
//      and |(NPC feet−10) − hero top| < 60 (index.html:2437); "[SPACE]" shown above every
//      un-talked NPC at full alpha whatever the distance; NPCs wear hero sprites (Levna=Minerva,
//      Clystran=Elber, Darrett=Nesta, Andir=Nick); x 600/800/1000/1200; gate at hero left x
//      > 1800 (= centre 1810). Space also jumps, so the talker hangs mid-air during the lines
//      (as the original).
//  N19 the fox is never killed although A2 says "You hurt my familiar" → reproduced
//      (familiars() in every act).
//  N20 tutorial line omits K/X/R/1-5 → reproduced verbatim (dlg_lv1_act1_03, speaker
//      Tutorial); the "[X] ready" / "Scrolls: N [R]" corner texts come from scenes-base.
//  N21 HUD initials (Nesta/Nick both "N") → not reproduced (engine face portraits).
//  N22 A4 decorated with the library prop set → A4 is dressed in the `library` theme
//      (GAMESPEC theme table); music stays `castle` (the original re-calls castle).
//  N23 per-act HP reset to level-entry HP → engine applyStats ← G.heroHPs (written only by
//      nextLevel), so every act restarts at full HP in L1; each hero's X resets per act.
//
// ── DELIBERATE FIXES (GAMESPEC policy 2) ────────────────────────────────────
//  F1 actors spawned inside terrain (3 heroes in the tower in A1/A3/A4; goblins x 3000/3600 in
//     the A1 balcony; mimics x 3400/4000 in the A4 balcony) → standing on that surface.
//  F2 A4 guard x clamp [5·32, 75·32] → [160, 1252] (never hops into empty air) + floor stop on
//     the floor surface instead of 16 px into it.
//  F3 Bakaris keeps `ai:'boss'` (engine never flips a boss to chase) → phase 2 + lobs persist.
//  F4 no game over / soft-lock → engine game over + retry act (retry skips the act intro;
//     a stealth catch still rebuilds A4 AND replays its 4-line intro, as the original).
//  F5 party invisibility expires on benched heroes too (engine ticks every hero).
//  F6 playfield squeezed into the top 60 % of the screen → buildOrig (bottom of a 30-row world).
//  F7 the act-win particle burst animates instead of freezing as a static clump.
//  (Not fixed, faithful: the guard can still hop onto the hero's platform → instant catch;
//   the A1 first foe is at x=900, just past the 800-px opening view, as in the original.)
//
// ── KEY NOTES ──
//  Every string key exists in tools/i18n/strings-original.json; no invented keys. The
//  mimic "activate" strip (static mimics within 60 px) has no art in v2 → not reproduced.
//  A4 P rows (visual review): the original's translucent green P1/P2/P3 bands + screen-pinned
//  labels read as a developer overlay on the painted library, and the bare one-way rows were
//  near-invisible. They are now drawn as the library wing's wooden GALLERY WALKWAYS
//  (_l1Galleries, in-house art, library palette #5a3820/#8a5a30/#2e1a10): a timber beam under
//  each plank, posts + knee braces every 48 px down to the surface below, a balustrade rail
//  14 px above P2/P3, and a brass "P1/P2/P3" plaque (same Lang keys) hung under each row's
//  open left end. Purely visual: tiles, bodies, mechanics and timings are unchanged.
//  While the leader stands on the 48-px tower, ground companions bunny-hop beside it (the
//  original's "jump while the leader is >32 px above" rule, engine Companion).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// ── MAPS (ORIGINAL tile coordinates; buildOrig shifts the rows down) ─────────
// buildCastleArena (index.html:829-849), verbatim.
function L1_castleArena(tm, W, H) {
  for (let x = 0; x < W; x++) { tm.set(x, H - 3, 1); tm.set(x, H - 2, 1); tm.set(x, H - 1, 1); }  // 3-row ground
  for (let x = 0; x < 8; x++) for (let y = H - 6; y < H - 3; y++) tm.set(x, y, 1);                 // left guard-tower base
  const bs = Math.floor(W * 0.7);
  for (let x = bs; x < W; x++) { tm.set(x, H - 6, 1); tm.set(x, H - 5, 1); tm.set(x, H - 4, 1); }  // right balcony "for Bakaris"
  for (let x = bs - 4; x < bs; x++) { tm.set(x, H - 5, 1); tm.set(x, H - 4, 1); }                  // stair step B
  for (let x = bs - 8; x < bs - 4; x++) tm.set(x, H - 4, 1);                                       // stair step A
  const lp = Math.floor(W * 0.22);
  for (let i = lp; i < lp + 7; i++) tm.set(i, H - 7, 3);                                           // left one-way platform
  const mid = Math.floor(W / 2);
  for (let i = -4; i < 5; i++) tm.set(mid + i, H - 7, 3);                                          // centre platform
  for (let i = -3; i < 4; i++) tm.set(mid + i, H - 12, 3);                                         // high centre perch
}
// A4 (index.html:2302-2308): the arena + the three stealth rows P1/P2/P3 over x tiles 5..79.
function L1_stealthMap(tm, W, H) {
  L1_castleArena(tm, W, H);
  for (let i = 5; i < 80; i++) { tm.set(i, H - 5, 3); tm.set(i, H - 8, 3); tm.set(i, H - 11, 3); }
}
const L1_P_ROWS = [['ui_platform_p1', 5], ['ui_platform_p2', 8], ['ui_platform_p3', 11]];   // [label, H − row]

// ── PLACEMENT HELPERS ───────────────────────────────────────────────────────
// ORIGINAL feet y for an actor whose original top-left is (xL, yTop), width w: the
// original snapGnd (scan down from the row holding its top for the first solid tile under
// x+4 / x+w−4), then — deliberate fix F1 — climb out of any block it would be buried in.
function L1_feet(sc, xL, w, yTop) {
  const tm = sc.tm, dy = sc._dy, H = tm.h - dy;
  const c1 = Math.floor((xL + 4) / T), c2 = Math.floor((xL + w - 4) / T);
  const sol = r => tm.sol(c1, r + dy) || tm.sol(c2, r + dy);
  let r = Math.max(0, Math.floor(yTop / T));
  while (r < H && !sol(r)) r++;
  while (r > 0 && sol(r - 1)) r--;
  return r * T;
}
// Stand an actor (hero or foe) with its feet on WORLD y (2 px above → settles flush).
function L1_stand(a, feetWorld) { a.body.reset(a.x, feetWorld - a.displayHeight * (1 - a.originY) - 2); }
// Move an actor horizontally, keeping its velocity. Only the transform is written: Arcade's
// POST_UPDATE adds the step delta to it and the next preUpdate re-reads it. (Calling
// body.updateFromGameObject() here leaves prevFrame stale → POST_UPDATE shoves the actor back
// by the whole correction — the clamp sent the guard from 2000 to 532 instead of 1266.)
function L1_setX(a, cx) { a.x = cx; }
// Static/boss contact cooldown is 1.2 s in the original (1.0 for patrol/chase); the engine
// arms 1.0 for everyone, so add the missing 0.2 s the frame after a static/boss blow lands.
function L1_slowContact(e) {
  if ((e.ai === 'static' || e.ai === 'boss') && e._l1Akt != null && e.akt > e._l1Akt + 0.5) e.akt += 0.2;
  e._l1Akt = e.akt;
}
// The original's universal jump applies to static foes too (index.html:1532-1540); the
// engine's enemyHop skips `static`, so replicate it while the foe is still static.
function L1_staticHop(e, dt) {
  const hop = (typeof combat === 'function') ? combat('enemyHop') : null;
  if (!hop || e.ai !== 'static' || !G.sc) return;
  if (e._hopT === undefined) e._hopT = hop.cd0[0] + Math.random() * (hop.cd0[1] - hop.cd0[0]);
  e._hopT -= dt;
  if (e._hopT <= 0 && (e.body.blocked.down || e.body.touching.down) &&
      G.sc.heroes.some(x => x.on && Math.abs(x.x - e.x) < hop.dx && e.y - x.y > hop.dyMin && e.y - x.y < hop.dyMax)) {
    e.body.setVelocityY(hop.vy * FPS); e._hopT = hop.cd[0] + Math.random() * (hop.cd[1] - hop.cd[0]);
  }
}
// Bakaris (index.html:2193-2195, 1547-1570): phase-2 burst + the pre-drained lob timer.
function L1_bakarisBeh(dt) {
  const sc = this.scene; if (!sc) return;
  if (this._phase2 && !this._l1P2) {
    this._l1P2 = true;
    this.clearTint();                                   // the original has no phase-2 tint
    if (typeof FX !== 'undefined') {
      FX.burst(sc, this.x, this.y, { count: 30, tint: [0xff4400], speedMax: 260, lifespan: 1000 });
      FX.burst(sc, this.x, this.y, { count: 20, tint: [0xffcc00], speedMax: 200, lifespan: 800 });
      FX.burst(sc, this.x, this.y, { count: 15, tint: [0xffffff], speedMax: 140, lifespan: 600 });
    }
  }
  this._projT -= dt;                                    // drains from 3.0 even before phase 2
  if (this._projT <= 0 && this._phase2) {
    this._projT = 2.5;
    const dir = this.rt ? 1 : -1, b = this.body;
    const p = sc.lob(this, dir * 4, -3, Math.floor(this.dmg * 0.6));
    if (p && p.go && p.go.body) { p.go.body.reset(dir > 0 ? b.right + 2 : b.x - 2, b.y + b.height * 0.3); p.go.body.setVelocity(p.vx, p.vy); }
  }
  L1_slowContact(this);
}
function L1_staticBeh(dt) { L1_staticHop(this, dt); L1_slowContact(this); }

// A4 guard (index.html:2466-2476): fixed stop cycle; stop 0 = the floor under the guard.
const L1_GUARD_FEET = [null, 208, 160, 112];   // P1 / P2 / P3 surfaces (original y, H = 18)
const L1_GUARD_X = [160, 80 * 16 - 28];         // top-left clamp (deliberate fix F2)

// ═══════════════════════════════════════════════════════════════════════════
class Level1 extends DragonScene {
  constructor() { super('level1'); this.musicTheme = 'castle'; this.allowScrolls = true; }

  enter() { this.bAct1(); }

  // Shared world for A1/A3/A4 (and the cutscene rebuilds): map, props, party (F1), familiars.
  _l1World(n, theme, W, H, builder, partyX, propOpts) {
    this.beginAct(n);
    this.dress(theme);
    this.buildOrig(W, H, builder);
    this.props(n, propOpts || {});
    this.party(partyX, (H - 3) * T, PARTY5);
    for (const h of this.heroes) L1_stand(h, this.oy(L1_feet(this, h.x - 10, 20, (H - 4) * T)));   // createHeroes(x,(H-4)*T) + F1
    this.familiars();
  }
  // A foe from its ORIGINAL top-left spawn (x, yTop) + hitbox: standing where the original
  // snapGnd put it (F1 for the buried ones). Static foes get the static hop + 1.2 s contact.
  _l1Foe(xL, yTop, w, h, hp, dmg, ai, type, nameKey, spd) {
    const e = this.foe({ type, x: xL + w / 2, feet: this.oy(L1_feet(this, xL, w, yTop)), w, h, hp, dmg, ai, nameKey });
    if (spd != null) e.spd = spd;
    if (ai === 'static') e._bossBeh = L1_staticBeh;
    return e;
  }
  _l1Burst(tint) {
    const cam = this.cameras.main;
    if (typeof FX !== 'undefined') FX.burst(this, cam.scrollX + CW / 2, cam.scrollY + CH / 2, { count: 25, tint: [tint], speedMax: 240 });
  }

  // ── ACT 1 — THE FINAL EXAM (index.html:2178-2223) ─────────────────────────
  bAct1(retry) {
    const H = 18, y0 = (H - 4) * T;
    this._l1World(1, 'castle', 240, H, L1_castleArena, 50);
    UI.showHud();
    const bak = this._l1Foe(1800, y0, 24, 36, 150, 13, 'boss', 'bakaris', 'enemy_name_bakaris');
    bak._projT = 3.0; bak._bossBeh = L1_bakarisBeh;
    const goblin = x => this._l1Foe(x, y0, 20, 28, 140, 12, 'patrol', 'goblin', 'enemy_name_goblin');
    this.enemiesIn([
      bak,
      this._l1Foe(1120, y0, 28, 40, 130, 11, 'chase', 'castle_soldier', 'enemy_name_ayik_ur', 0.9),
      this._l1Foe(1400, y0, 28, 40, 130, 11, 'patrol', 'castle_archer', 'enemy_name_hrigg', 0.9),
      this._l1Foe(1600, y0, 28, 40, 130, 11, 'chase', 'hideout_fighter', 'enemy_name_iriad', 0.9),
      this._l1Foe((240 - 15) * T, (H - 7) * T, 28, 40, 130, 11, 'static', 'castle_archer', 'enemy_name_tower_guard', 0.9),
      goblin(900), goblin(1400), goblin(1900), goblin(2400), goblin(3000), goblin(3600),
    ]);
    this.setHint('hint_lv1_act1');
    if (retry) { this.live = true; return; }
    this.say([
      d('speaker_narrator', 'dlg_lv1_act1_01'), d('speaker_narrator', 'dlg_lv1_act1_02'),
      d('speaker_tutorial', 'dlg_lv1_act1_03'), d('speaker_bakaris', 'dlg_lv1_act1_04'),
      d('speaker_narrator', 'dlg_lv1_act1_05'),
    ], () => { this.live = true; });
  }

  // ── ACT 2 — BLOOD AND GRUDGE (cutscene, index.html:2226-2241) ─────────────
  bAct2() {
    UI.hideHud();
    this.cutsceneOver(2, () => this._l1World(1, 'castle', 240, 18, L1_castleArena, 50), [
      d('speaker_narrator', 'dlg_lv1_act2_01'), d('speaker_bakaris', 'dlg_lv1_act2_02'),
      d('speaker_nesta', 'dlg_lv1_act2_03'), d('speaker_narrator', 'dlg_lv1_act2_04'),
      d('speaker_narrator', 'dlg_lv1_act2_05'), d('speaker_narrator', 'dlg_lv1_act2_06'),
      d('speaker_narrator', 'dlg_lv1_act2_07'),
    ], () => this.bAct3());
    this.setHint('hint_lv1_act2');
  }

  // ── ACT 3 — HALLWAY RUMORS (index.html:2244-2293, talk/gate 2432-2447) ────
  bAct3(retry) {
    const H = 16, carried = this._shakeQ;           // N6: the A1 win shake is still pending
    this._l1World(3, 'castle', 300, H, L1_castleArena, 50, { avoid: [600, 800, 1000, 1200] });
    if (carried) this._shakeQ = carried;
    UI.showHud();
    this.enemiesIn([]);
    const feet = this.oy((H - 3) * T);
    const npc = (x, nameKey, look, spk, first) => ({
      x, feet, nameKey, sprite: { key: 'atlas_hero_' + look, frame: 'hero_' + look + '_idle_0' },
      lines: [0, 1, 2, 3].map(i => d(spk, 'dlg_lv1_act3_' + String(first + i).padStart(2, '0'))),
    });
    this._l1Npcs = [
      npc(600, 'npc_name_levna_drakehorn', 'minerva', 'speaker_levna', 1),
      npc(800, 'npc_name_clystran', 'elber', 'speaker_clystran', 5),
      npc(1000, 'npc_name_darrett', 'nesta', 'speaker_darrett', 9),
      npc(1200, 'npc_name_andir', 'nick', 'speaker_andir', 13),
    ];
    this.setHint('hint_lv1_act3');
    if (retry) { this.live = true; return; }
    this.say([d('speaker_narrator', 'dlg_lv1_act3_17'), d('speaker_narrator', 'dlg_lv1_act3_18')], () => { this.live = true; });
  }
  // The original talk rule (index.html:2434-2441): Z/J/Space, |NPC x − hero LEFT x| < 100,
  // |NPC y − hero top| < 60 with NPC y = its feet − 10. One NPC per press, once each.
  _l1Talk() {
    const objs = this._npcObjs, h = this.heroes[this.ai];
    if (!objs || !h || !h.on || D.on || !(I.pr('KeyZ') || I.pr('KeyJ') || I.pr('Space'))) return;
    for (const n of objs) {
      if (n.talked) continue;
      if (Math.abs(n.x - h.body.x) < 100 && Math.abs((n.feet - 10) - h.body.y) < 60) {
        n.talked = true; n.prompt.setVisible(false);
        this.say(n.lines);
        return;
      }
    }
  }

  // ── ACT 4 — NIGHT INFILTRATION (index.html:2296-2342, 2464-2514, 2543-2547) ─
  bAct4(retry) {
    const H = 18, y0 = (H - 4) * T;
    this._l1World(4, 'library', 300, H, L1_stealthMap, 40);
    UI.showHud();
    this.music('castle');                            // the original re-calls castle (a no-op)
    this._l1Galleries(H);                            // P1/P2/P3 as gallery walkways (index.html:2564-2572 labels → plaques)
    const guard = this._l1Foe(900, y0, 28, 40, 70, 11, 'patrol', 'knight', 'enemy_name_guard', 0.8);
    guard._l1PT = 3.0 + Math.random() * 4; guard._l1P = 0;
    this._l1Guard = guard;
    const small = x => this._l1Foe(x, (H - 5) * T, 16, 20, 90, 8, 'static', 'mimic', 'enemy_name_mimic_book', 0.9);
    const big = x => this._l1Foe(x, y0, 24, 28, 150, 14, 'patrol', 'mimic', 'enemy_name_mimic_book');
    this.enemiesIn([guard, small(1200), small(1400), big(1800), big(2400), big(2900), big(3400), big(4000)]);
    this.setupStealth(e => e === this._l1Guard);
    this.setHint('hint_lv1_act4');
    if (retry) { this.live = true; return; }
    this.say([
      d('speaker_narrator', 'dlg_lv1_act4_01'), d('speaker_narrator', 'dlg_lv1_act4_02'),
      d('speaker_nesta', 'dlg_lv1_act4_03'), d('speaker_nesta', 'dlg_lv1_act4_04'),
    ], () => { this.live = true; });
  }
  // The three one-way stealth rows drawn as the library wing's wooden galleries (visual only,
  // behind the actors, in front of the backdrop + the plank tiles). Each row is drawn over its
  // OPEN span — where the cell under the plank is not a solid block (P1 runs through the guard
  // tower at x < 128, so its walkway starts at the tower's edge).
  _l1Galleries(H) {
    const tm = this.tm, dy = this._dy, g = this.add.graphics().setDepth(-1.9);
    const DARK = 0x2e1a10, MID = 0x5a3820, LIGHT = 0x8a5a30, BRASS = 0xc8a84e, SHINE = 0xe8c86a;
    for (const [key, up] of L1_P_ROWS) {
      const r = H - up, y = this.oy(r * T);         // y = plank top (the tile paints y..y+5)
      let x0 = null, x1 = 0;
      for (let c = 5; c < 80; c++) if (!tm.solUp(c, r + 1 + dy)) { if (x0 === null) x0 = c * T; x1 = (c + 1) * T; }
      if (x0 === null) continue;
      const span = x1 - x0, top = y + 11;
      // timber beam under the plank (covers the tile's 2-px black underside)
      g.fillStyle(MID, 1).fillRect(x0, y + 5, span, 4);
      g.fillStyle(DARK, 1).fillRect(x0, y + 9, span, 2);
      // posts + knee braces every 48 px, down to the next surface below (the next row / the floor)
      for (let px = x0 + 8; px < x1 - 4; px += 48) {
        const c = Math.floor(px / T);
        let rr = r + 1; while (rr < H && !tm.sol(c, rr + dy)) rr++;
        const yb = this.oy(rr * T);
        if (yb - top < 3) continue;
        g.fillStyle(MID, 1).fillRect(px - 2, top, 4, yb - top);
        g.fillStyle(LIGHT, 1).fillRect(px - 2, top, 1, yb - top);
        g.fillStyle(DARK, 1).fillRect(px + 1, top, 1, yb - top);
        g.fillStyle(MID, 1).fillTriangle(px - 2, top, px - 8, top, px - 2, top + 6).fillTriangle(px + 2, top, px + 8, top, px + 2, top + 6);
      }
      // balustrade on the upper galleries: rail 14 px above the plank, balusters, newels at the posts
      if (up > 5) {
        for (let bx = x0 + 4; bx < x1 - 1; bx += 12) g.fillStyle(MID, 1).fillRect(bx, y - 12, 2, 12);
        for (let px = x0 + 8; px < x1 - 4; px += 48) { g.fillStyle(MID, 1).fillRect(px - 2, y - 16, 4, 16); g.fillStyle(LIGHT, 1).fillRect(px - 2, y - 16, 1, 16); }
        g.fillStyle(LIGHT, 1).fillRect(x0, y - 15, span, 2);
        g.fillStyle(DARK, 1).fillRect(x0, y - 13, span, 1);
      }
      // brass plaque hung under the row's open left end (between its first two posts)
      const pw = 20, ph = 11, plx = x0 + 18, ply = top + 2;
      g.fillStyle(DARK, 1).fillRect(plx + 4, top, 1, 2).fillRect(plx + pw - 5, top, 1, 2);   // hanging pins
      g.fillStyle(BRASS, 1).fillRoundedRect(plx, ply, pw, ph, 3);
      g.fillStyle(SHINE, 1).fillRect(plx + 3, ply + 1, pw - 6, 1);
      g.lineStyle(1, DARK, 1).strokeRoundedRect(plx, ply, pw, ph, 3);
      this.add.text(plx + pw / 2, ply + ph / 2 + 0.5, Lang.t(key), { fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#2e1a10' }).setOrigin(0.5).setDepth(-1.8);
    }
  }
  // Platform hop (fixed cycle, randomised interval) + the fixed x clamp (F2).
  _l1GuardHop(dt) {
    const g = this._l1Guard; if (!g || !g.on) return;
    const cx = Math.max(L1_GUARD_X[0] + 14, Math.min(L1_GUARD_X[1] + 14, g.x));
    if (cx !== g.x) L1_setX(g, cx);
    g._l1PT -= dt;
    if (g._l1PT <= 0) {
      g._l1P = (g._l1P + 1) % 4; g._l1PT = 3.5 + Math.random() * 4;
      const feet = g._l1P === 0 ? L1_feet(this, g.x - 14, 28, 14 * T) : L1_GUARD_FEET[g._l1P];
      L1_stand(g, this.oy(feet));                    // teleport, vy = 0, x unchanged
    }
  }
  // While the hero is inside the alert ring the guard stops and faces them (index.html:2501-2505).
  _l1GuardAlert() {
    const g = this._l1Guard, h = this.heroes[this.ai]; if (!g || !g.on) return;
    if (this._stAlert && h && h.on && !this.heroes.some(x => x.on && x._invis)) {
      if (!g._savedAi) g._savedAi = g.ai;
      g.ai = 'static'; g.body.setVelocityX(0); g.rt = h.x > g.x; g.setFlipX(!g.rt);
    } else if (g._savedAi) { g.ai = g._savedAi; g._savedAi = null; }
  }
  // Caught: the Guard's line, then the act is REBUILT and its intro replayed (index.html:2490, 2510).
  _l1Caught() {
    const g = this._l1Guard, h = this.heroes[this.ai];
    const close = g && g.on && h && Math.hypot(g.x - h.x, g.y - h.y) < 70;
    this.live = false;
    this.say([d('speaker_guard', close ? 'dlg_lv1_update_02' : 'dlg_lv1_update_03')], () => this.bAct4());
  }

  // ── ACT 5 — DIVERGING PATHS (cutscene → Level 2, index.html:2345-2360) ────
  bAct5() {
    UI.hideHud();
    this.cutsceneOver(5, () => this._l1World(4, 'library', 300, 18, L1_stealthMap, 40), [
      d('speaker_narrator', 'dlg_lv1_act5_01'), d('speaker_narrator', 'dlg_lv1_act5_02'),
      d('speaker_ispin', 'dlg_lv1_act5_03'), d('speaker_narrator', 'dlg_lv1_act5_04'),
      d('speaker_narrator', 'dlg_lv1_act5_05'), d('speaker_narrator', 'dlg_lv1_act5_06'),
      d('speaker_narrator', 'dlg_lv1_act5_07'),
    ], () => this.nextLevel('level2'));
    this.setHint('hint_lv1_act5');
  }

  // ── PER-FRAME ─────────────────────────────────────────────────────────────
  step(dt) {
    this.updateFamiliars(dt);
    if (this.act === 1) {
      // all 11 down → shake 0.5/4 (queued), 25 gold particles, "Victory in the exam!" → A2
      if (this.live && !this._won && this.enemiesAllDead()) this._l1Burst(0xc8a84e);
      this.combatWin(() => this.bAct2(), [d('speaker_narrator', 'dlg_lv1_update_04')]);
    } else if (this.act === 3) {
      this.talkNPCs(dt, this._l1Npcs);
      this._l1Talk();
      if (this._npcObjs) for (const n of this._npcObjs) if (!n.talked) n.prompt.setAlpha(0.92);   // always shown (N18)
      this.walkGate(dt, 1810, () => this.say([d('speaker_narrator', 'dlg_lv1_update_01')], () => this.bAct4()));
    } else if (this.act === 4) {
      if (!this.live || this._won) return;
      this._l1GuardHop(dt);
      this.updateStealth(dt, () => this._l1Caught());
      if (!this.live) return;
      this._l1GuardAlert();
      const h = this.heroes[this.ai];
      if (h && h.on && h.x > 1410 && this.enemies.slice(1).every(e => !e.on)) {
        this._won = true; this.act = -1;
        if (this._stG) this._stG.clear();
        this.winShake(0.5, 4); this._l1Burst(0x00aa44);
        this.say([d('speaker_narrator', 'dlg_lv1_update_05')], () => this.bAct5());
      }
    }
  }
}

if (typeof window !== 'undefined') window.Level1 = Level1;
