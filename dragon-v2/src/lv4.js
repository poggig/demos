// ═══════════════════════════════════════════════════════════════════════════
// CHRONICLES OF AZURERUNE v2 — LEVEL 4: "Yurthgreen Masquerade"
// Faithful remake of the original Lv4 (game_v3/index.html:3441-3753; digest
// tools/digest/L4.md). Theme `hall` for every act, music `library` (index.html:3476),
// party of FIVE (Nesta rejoins, index.html:3444-3453), no R revive (allowScrolls=false).
//
//   A1  Mingle & talk   — the 360-tile masquerade hall, 6 optional guests, gate x>1600
//   A2  Minerva's knighting — 9 lines over the frozen A1 hall
//   A3  Nesta's pact (10 lines over the A1 hall) → the 300-tile battle hall →
//       "Prove yourself." → 9 shadow foes in their pillar pens → 2 win lines
//   A4  Ispin's pearl vision — 10 lines over the frozen battlefield
//   A5  The masquerade ends — 6 lines → nextLevel('level5')
//
// ── NUANCES (L4.md §3) → how they are reproduced ─────────────────────────────
//  N1  party spawned EMBEDDED in the left dais (must jump to free itself) → NOT reproduced:
//      deliberate fix (GAMESPEC "actors spawned inside terrain"): the party spawns standing
//      ON the dais top (A1 orig y 160, A3 orig y 192), 90 px right of the original x 60…180
//      (L4_SPAWN_X = 150) so the engine's companion follow slots are inside the map (at
//      x 60 three companions hop against the left world wall for as long as you idle).
//  N2  the dais is a 3-row SOLID raised floor (A1 0-687 px, A3 0-575 px, 48 px tall) →
//      reproduced tile-for-tile (L4_buildMasqueradeHall = buildMasqueradeHall). Bakaris +
//      Levna were drawn 32 px sunk into it → deliberate fix: they stand on its top.
//  N3  ONE 96 px pillar (1152-1183) gates A1; Tem Temble (1300) is the only guest past it;
//      chandelier + pillars 2-4 never reached → reproduced (same builder, W=360, gate at
//      x>1600 — the original tests the hitbox LEFT edge, so the centre test is 1600+10).
//      A double jump is required (single apex ≈ 83 px < 96) — kept.
//  N4  pillars pen the A3 foes (5 pens) → reproduced (W=300 builder, original x per foe);
//      companions can be stranded behind a pillar (single auto-jump) → reproduced, softened
//      only by the engine's studio-standard regroup (a companion > 600 px away rejoins).
//  N5  charge-on-hit → GAME_CONFIG.combat.chargeOnHit (spd×1.8 for 1.5 s at the nearest
//      hero, ai flips to chase for good). NOT reproduced: the charge phasing through
//      pillars and the endless charge after a hit inside the i-frames (clear bugs; the
//      engine keeps tile collision and always times the charge out).
//  N6  universal enemy hop (dx<240, 24-128 px above, cd 0.5-2 then 2.5-4.5 s) →
//      combat.enemyHop (engine).
//  N7  patrollers hurt ANY hero, chase only the controlled one, invisibility ignored by
//      patrol/chase → combat.contactAll + the engine's archetypes.
//  N8  dialogue acts reuse the previous scene: A2 + the A3 pact over the frozen A1 hall
//      (party at the gate, guests still standing), A4 + A5 over the frozen battlefield
//      ("Enemies 0/9" still up) → reproduced with cutsceneOver (no rebuild, no respawn).
//  N9  two-step A3 opening: pact on the OLD map → map swap → "Prove yourself." shown at the
//      STALE camera (it frames the agents' pen 992-1919) → camera pans back to the party →
//      reproduced: the camera keeps the A1 scrollX during that line, then re-follows with
//      a lerp (pans back).
//  N10 particles frozen during dialogue at WORLD (400,240), resuming in Lv5 → NOT
//      reproduced (cross-level particle leak = bug). Deliberate fix: the A3-win blue burst
//      (#4466aa ×20) and the A4 gold/pale-yellow pearl bursts (#d4af37 ×30, #ffff88 ×20)
//      play at the SCREEN centre the original meant (CW/2, CH/2), visibly (own emitter at
//      (0,0) — the shared FX.burst lands particles at 2x,2y in Phaser 4, see _l4Burst).
//  N11 no screen shake in Lv4 (A3 sets shk 0.5/4 but Lv4.update never applies it) →
//      deliberate fix: the act-win shake the other levels have (0.5 s / 4 px) fires on
//      the last foe's fall. It plays at once (not queued via winShake): every act after
//      A3 is pure dialogue, so a queued "after dialogue" shake would never land.
//      (The studio-standard landing micro-shake, feel.landShake, is game-wide.)
//  N12 no R revive / no Scrolls counter in Lv4 → allowScrolls=false. Dead heroes don't
//      overwrite G.heroHPs at the hand-off → engine nextLevel stores living heroes only.
//  N13 talk = Z/J/Space (also attacks/jumps that frame), "[SPACE]" bubble until talked,
//      once per guest, optional → DragonScene.talkNPCs (the lead's shared window ±60 px
//      instead of the original's −90…+110 px of hero centre / |dy|<60).
//  N14 guests are DOUBLES of the party (Becklin = Nesta's sheet, Levna = Minerva's,
//      Clystran = Elber's, Cudgel = Nick's, Tem Temble = Kote's; Bakaris his own, UNMASKED)
//      → reproduced with the RD hero atlases (idle frame, facing right as in the
//      original); each double carries a light masquerade tint so it doesn't read as the
//      party member itself (cosmetic). Lohezet (the masked figure) and the Lord Regent are
//      never drawn in the original → not drawn here either.
//  N15 H=16/18 maps pinned to the top of the screen → GAMESPEC deliberate fix (buildOrig
//      puts the same rows at the bottom of the 30-row world).
//  N16 frame-rate dependence → the engine's fixed 60 Hz step.
//  N17 ultimates reset only when heroes are re-created (A1, A3 combat) → party() is
//      called exactly there (applyStats resets _rUsed); HP re-read from G.heroHPs there too.
//  N18 HUD: hint bar, "Enemies a/b", foe labels, HP bar once damaged → DragonScene HUD.
//  N19 dash = 1-frame 7 px nudge → engine dash (studio standard).
//  Music: `library` for the whole level, no change for the combat act (index.html:3476).
//  Foes: the ORIGINAL HP/dmg (140/14, 130/13, 100/10), spd 0.9, aggro 130, hitboxes
//  24×36 / 16×24, sprites hideout_fighter / castle_archer, untinted (the original colours
//  #222244/#334455 only tinted the death particles → kept as the death-burst colour).
//
// ── DELIBERATE FIXES (summary) ───────────────────────────────────────────────
//  · party spawns standing on the dais (A1 + A3), not inside it, 90 px right (N1);
//  · Bakaris + Levna stand on the dais top, not 32 px inside it (N2);
//  · act-win camera shake 0.5 s / 4 px on the A3 win (N11);
//  · the A3-win and A4 bursts are visible at the screen centre (N10);
//  · a party wipe in A3 → the engine's game over + "retry act" (the original has no
//    defeat); the retry skips the pact + "Prove yourself." (contract: no intro on retry);
//  · charging foes keep tile collision (no pillar phasing) and always stop (N5).
// ── LOCAL WORKAROUNDS for shared code (flagged to the lead; remove once fixed there) ──
//  · (the Level4.updateFamiliars override is gone: scenes-base now grounds the familiars)
//  · _l4Burst: written when FX.burst double-offset its particles in Phaser 4 (fixed in the
//    module since); its own emitter is correct either way;
//  · the act-win shake is forced (the kill's 70 ms juice shake would make Phaser drop it).
// Keys: every line uses its own dlg_lv4_* key and the speaker from strings-original.json
// `_speaker` — nothing invented.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

// The original builder, verbatim (index.html:889-905). tm.set takes ORIGINAL rows.
function L4_buildMasqueradeHall(tm, W, H) {
  for (let x = 0; x < W; x++) { tm.set(x, H - 3, 1); tm.set(x, H - 2, 1); tm.set(x, H - 1, 1); }   // 3-row ground
  const step = Math.floor(W / 5);                                                                // 4 pillars, 2 wide, 7 rows
  for (let p = 1; p < 5; p++) { const px = p * step; for (let y = H - 3; y > H - 10; y--) { tm.set(px, y, 1); tm.set(px + 1, y, 1); } }
  const balW = Math.floor(W * 0.12);                                                             // the two 3-row daises
  for (let x = 0; x < balW; x++) { tm.set(x, H - 6, 1); tm.set(x, H - 5, 1); tm.set(x, H - 4, 1); }
  for (let x = W - balW; x < W; x++) { tm.set(x, H - 6, 1); tm.set(x, H - 5, 1); tm.set(x, H - 4, 1); }
  const mid = Math.floor(W / 2);                                                                 // chandelier (one-way)
  for (let i = -3; i < 4; i++) tm.set(mid + i, H - 11, 3);
}

// A1 guests (index.html:3495-3502): original centre x, feet y (orig px — deliberate fix:
// ON the surface they stand over), name label, the hero sheet they wear, their one line.
const L4_GUESTS = [
  { x: 300,  feetO: 160, nameKey: 'npc_name_bakaris',    sheet: 'bakaris', tint: null,     sp: 'speaker_bakaris',    line: 'dlg_lv4_act1_01' },
  { x: 500,  feetO: 160, nameKey: 'npc_name_levna',      sheet: 'minerva', tint: 0xffc0d8, sp: 'speaker_levna',      line: 'dlg_lv4_act1_02' },
  { x: 700,  feetO: 208, nameKey: 'npc_name_clystran',   sheet: 'elber',   tint: 0xb8ccff, sp: 'speaker_clystran',   line: 'dlg_lv4_act1_03' },
  { x: 900,  feetO: 208, nameKey: 'npc_name_becklin',    sheet: 'nesta',   tint: 0xc4ffb4, sp: 'speaker_becklin',    line: 'dlg_lv4_act1_04' },
  { x: 1100, feetO: 208, nameKey: 'npc_name_cudgel',     sheet: 'nick',    tint: 0xffd4a0, sp: 'speaker_cudgel',     line: 'dlg_lv4_act1_05' },
  { x: 1300, feetO: 208, nameKey: 'npc_name_tem_temble', sheet: 'kote',    tint: 0xd4bcff, sp: 'speaker_tem_temble', line: 'dlg_lv4_act1_06' },
];

// A3 shadows (index.html:3551-3562): original LEFT x, w, h, hp, dmg, ai, sprite — all spd 0.9.
const L4_SHADOWS = [
  [760,  24, 36, 140, 14, 'chase',  'hideout_fighter'],
  [1160, 24, 36, 140, 14, 'patrol', 'hideout_fighter'],
  [1560, 16, 24, 100, 10, 'chase',  'castle_archer'],
  [800,  24, 36, 130, 13, 'patrol', 'hideout_fighter'],
  [1400, 24, 36, 130, 13, 'chase',  'hideout_fighter'],
  [2000, 24, 36, 130, 13, 'patrol', 'hideout_fighter'],
  [2600, 24, 36, 130, 13, 'chase',  'hideout_fighter'],
  [3200, 16, 24, 100, 10, 'patrol', 'castle_archer'],
  [4000, 16, 24, 100, 10, 'chase',  'castle_archer'],
];

// Party spawn x. The original spawns the party at x 60…180 (Kote at 60) INSIDE the dais.
// Deliberate fix: standing on the dais top, shifted right by 90 px (Kote 150, the party 150…270,
// still on the dais) so that every companion's follow slot (engine: 44 + 34·i px behind the
// leader) lies inside the map — at x 60 the last three companions' slots are off the left
// edge and they hop against the world wall forever while the leader idles.
const L4_SPAWN_X = 150;

// Dialogue (speaker from strings-original.json `_speaker`, line for line).
const L4_N = 'speaker_narrator';
const L4_INTRO = [d(L4_N, 'dlg_lv4_act1_07'), d(L4_N, 'dlg_lv4_act1_08')];
const L4_GATE = [d(L4_N, 'dlg_lv4_update_03')];
const L4_KNIGHTING = [
  d(L4_N, 'dlg_lv4_act2_01'), d('speaker_lord_regent', 'dlg_lv4_act2_02'), d('speaker_minerva', 'dlg_lv4_act2_03'),
  d('speaker_lord_regent', 'dlg_lv4_act2_04'), d('speaker_lord_regent', 'dlg_lv4_act2_05'), d('speaker_minerva', 'dlg_lv4_act2_06'),
  d('speaker_lord_regent', 'dlg_lv4_act2_07'), d(L4_N, 'dlg_lv4_act2_08'), d(L4_N, 'dlg_lv4_act2_09'),
];
const L4_PACT = [
  d(L4_N, 'dlg_lv4_act3_01'), d('speaker_lohezet', 'dlg_lv4_act3_02'), d('speaker_nesta', 'dlg_lv4_act3_03'),
  d('speaker_lohezet', 'dlg_lv4_act3_04'), d('speaker_lohezet', 'dlg_lv4_act3_05'), d('speaker_lohezet', 'dlg_lv4_act3_06'),
  d('speaker_nesta', 'dlg_lv4_act3_07'), d('speaker_lohezet', 'dlg_lv4_act3_08'), d('speaker_nesta', 'dlg_lv4_act3_09'),
  d('speaker_lohezet', 'dlg_lv4_act3_10'),
];
const L4_PROVE = [d('speaker_lohezet', 'dlg_lv4__startact3combat_01')];
const L4_SEALED = [d('speaker_lohezet', 'dlg_lv4_update_01'), d('speaker_nesta', 'dlg_lv4_update_02')];
const L4_VISION = [
  d(L4_N, 'dlg_lv4_act4_01'), d('speaker_ispin', 'dlg_lv4_act4_02'), d('speaker_ispin', 'dlg_lv4_act4_03'),
  d(L4_N, 'dlg_lv4_act4_04'), d('speaker_kote', 'dlg_lv4_act4_05'), d('speaker_ispin', 'dlg_lv4_act4_06'),
  d('speaker_kote', 'dlg_lv4_act4_07'), d('speaker_ispin', 'dlg_lv4_act4_08'), d(L4_N, 'dlg_lv4_act4_09'),
  d(L4_N, 'dlg_lv4_act4_10'),
];
const L4_FAREWELL = [
  d(L4_N, 'dlg_lv4_act5_01'), d('speaker_becklin', 'dlg_lv4_act5_02'), d('speaker_becklin', 'dlg_lv4_act5_03'),
  d('speaker_becklin', 'dlg_lv4_act5_04'), d(L4_N, 'dlg_lv4_act5_05'), d(L4_N, 'dlg_lv4_act5_06'),
];

class Level4 extends DragonScene {
  constructor() {
    super('level4');
    this.musicTheme = 'library';     // index.html:3476 — the whole level, combat included
    this.allowScrolls = false;       // Lv4 has no R revive and no Scrolls counter
  }
  enter() { this.bAct1(); }

  // ── shared builders (class-private, prefixed) ─────────────────────────────
  // The A1 masquerade hall: W=360, H=16, decos seed 1; the six guests are created at once
  // so they stand in the hall during the intro (step() does not run while dialogue is open).
  _l4Hall(atGate) {
    this.dress('hall');
    this.buildOrig(360, 16, L4_buildMasqueradeHall);
    this.props(1, { avoid: [...L4_GUESTS.map(g => g.x), 1168, 2880] });
    if (atGate) this.party(1500, 208, PARTY5);   // cutscene rebuild only: the party where A1 ended
    else this.party(L4_SPAWN_X, 160, PARTY5);    // deliberate fix: ON the dais top (orig y 160), see L4_SPAWN_X
    this.familiars();
    this.enemiesIn([]);
    this._l4Guests = L4_GUESTS.map(g => ({
      x: g.x, feet: this.oy(g.feetO), nameKey: g.nameKey, lines: [d(g.sp, g.line)],
      sprite: g.sheet === 'bakaris'
        ? { key: 'atlas_enemy_bakaris', frame: 'enemy_bakaris_idle_0' }
        : { key: 'atlas_hero_' + g.sheet, frame: 'hero_' + g.sheet + '_idle_0', tint: g.tint },
    }));
    this.talkNPCs(0, this._l4Guests);   // creates the guests now (nobody is within reach at spawn)
  }
  // The A3 battle hall: W=300, H=18, decos seed 3; party on the dais top (orig y 192).
  _l4Battlefield(withFoes) {
    this.dress('hall');
    this.buildOrig(300, 18, L4_buildMasqueradeHall);
    this.props(3, { avoid: [976, 1936, 2896, 3856, 2400] });
    this.party(L4_SPAWN_X, 192, PARTY5);         // deliberate fix: ON the dais top (orig y 192)
    this.familiars();
    const feet = this.oy(240);   // the floor surface; every foe snaps to it in the original
    this.enemiesIn(withFoes ? L4_SHADOWS.map(([x, w, h, hp, dmg, ai, type]) => {
      const scout = type === 'castle_archer';
      const e = this.foe({ type, x: x + w / 2, feet, w, h, hp, dmg, ai, spd: 0.9,
        nameKey: scout ? 'enemy_name_shadow_scout' : 'enemy_name_shadow_agent', color: scout ? '#334455' : '#222244' });
      e._tintBase = scout ? 0x334455 : 0x222244;   // the original colour = the death-burst colour only
      return e;
    }) : []);
  }

  // ── A1 — Mingle & talk (index.html:3482-3509) ────────────────────────────
  bAct1(retry) {
    this.beginAct(1);
    this._l4Hall(false);
    this.setHint('hint_lv4_act1');
    if (!retry) this.say(L4_INTRO, () => { this.live = true; });
    else this.live = true;
  }

  // ── A2 — Minerva's knighting, over the frozen A1 hall (index.html:3511-3525) ──
  bAct2(retry) {
    this.setHint('hint_lv4_act2');
    this.cutsceneOver(2, () => { this.beginAct(2); this._l4Hall(true); this.setHint('hint_lv4_act2'); }, L4_KNIGHTING, () => this.bAct3());
  }

  // ── A3 — Nesta's pact over the A1 hall, then the shadow fight (index.html:3527-3568) ──
  bAct3(retry) {
    if (retry) return this._l4Combat(true);   // a retry goes straight back to the fight
    this.setHint('hint_lv4_act3');
    this.cutsceneOver(3, () => { this.beginAct(3); this._l4Hall(true); this.setHint('hint_lv4_act3'); }, L4_PACT, () => this._l4Combat(false));
  }
  _l4Combat(retry) {
    const cam = this.cameras.main, staleX = cam.scrollX;   // the A1 camera (≈ x 1200 at the gate)
    this.beginAct(3);
    this._l4Battlefield(true);
    this.setHint('hint_lv4__startact3combat');
    if (retry) { this.live = true; return; }
    // N9: "Prove yourself." is shown at the camera left over from A1, which frames the
    // agents' pen (992-1919); once the line closes the camera pans back to the party.
    cam.stopFollow(); cam.scrollX = staleX;
    this.say(L4_PROVE, () => {
      const h = this.heroes[this.ai];
      if (h) { cam.startFollow(h, true, 0.12, 0.12); cam.scrollX = staleX; }   // startFollow snaps → restore → lerp pan
      this.live = true;
    });
  }

  // ── A4 — Ispin's pearl vision, over the frozen battlefield (index.html:3570-3587) ──
  bAct4(retry) {
    this.setHint('hint_lv4_act4');
    if (this.tm) this._l4Burst([0xd4af37, 0xffe7a0], 30, [0xffff88, 0xffffff], 20);   // the pearls glow (N10)
    this.cutsceneOver(4, () => { this.beginAct(4); this._l4Battlefield(false); this.setHint('hint_lv4_act4'); }, L4_VISION, () => this.bAct5());
  }

  // ── A5 — the masquerade ends (index.html:3589-3600) → Level 5 ────────────
  bAct5(retry) {
    this.setHint('hint_lv4_act5');
    this.cutsceneOver(5, () => { this.beginAct(5); this._l4Battlefield(false); this.setHint('hint_lv4_act5'); }, L4_FAREWELL, () => this.nextLevel('level5'));
  }

  // Burst(s) at the screen centre (the original's CW/2, CH/2 — meant as screen space).
  // Local emitter at (0,0): FX.burst puts its emitter AT (x,y) and then explode(n, x, y) emits
  // relative to it in Phaser 4, so its particles land at (2x, 2y) — off-screen here.
  _l4Burst(tintA, nA, tintB, nB) {
    const cam = this.cameras.main, x = cam.scrollX + CW / 2, y = cam.scrollY + CH / 2;
    const tex = (typeof FX !== 'undefined' && FX._tex) ? FX._tex(this) : null;
    if (!tex) return;
    const one = (tint, n, spd) => {
      const em = this.add.particles(0, 0, tex, { lifespan: 2400, speed: { min: 60, max: spd }, angle: { min: 200, max: 340 }, gravityY: 380,
        scale: { start: 1, end: 0 }, rotate: { start: 0, max: 360 }, tint, emitting: false }).setDepth(20);
      em.explode(n, x, y);
      this.time.delayedCall(2650, () => em.destroy());
    };
    one(tintA, nA, 200);
    if (tintB) one(tintB, nB, 150);
  }

  // ── PER-FRAME ────────────────────────────────────────────────────────────
  step(dt) {
    this.updateFamiliars(dt);
    if (this.act === 1) {
      this.talkNPCs(dt, this._l4Guests);
      // controlled hero's LEFT edge > 1600 (index.html:3716) → "Moving deeper…" → A2
      this.walkGate(dt, 1610, () => this.say(L4_GATE, () => this.bAct2()));
    } else if (this.act === 3 && this.live) {
      if (!this._won && this.enemiesAllDead()) {
        // deliberate fix (N11): the act-win shake lands now — every later act is dialogue
        // force: the killing blow's juice shake (70 ms) starts in this same frame and would
        // otherwise make Phaser refuse the act-win shake
        this.cameras.main.shake(500, 4 / 1600, true);
        this._l4Burst([0x4466aa, 0x88aaff], 20);
      }
      this.combatWin(() => this.bAct4(), L4_SEALED, false);
    }
  }
}

if (typeof window !== 'undefined') window.Level4 = Level4;
