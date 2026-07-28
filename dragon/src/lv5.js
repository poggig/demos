// ═══════════════════════════════════════════════════════════════════════════
// CHRONICLES OF AZURERUNE — Level 5: "When the Home Burns" (engine phaser-1.12.0)
// The finale. 7 acts on the burning ruins map (bg_ruins / tile_ruins /
// buildRuinsField / music 'boss'), party of 5:
//   A1 Calm before the storm — walk-in, talk the Armory Master, advance east.
//   A2 Broken illusion — 8 mercenaries (soldier/knight/archer/fighter + a static
//      battlement sentry).
//   A3 The red ruin — 2 Draconian Kapaks + 3 Draconian Scouts.
//   A4 First boss — SIVAK Draconian (AoE ground-stomp + enrage at 30%).
//   A5 Second boss — BOILERDRAK (aimed fireball EnemyProjs). Fire overlay starts.
//   A6 Last stand — an OGRE carrying an invulnerable GOBLIN CHIEF (the Chief only
//      becomes killable once the Ogre falls) + 3 trash goblins.
//   A7 No hope — KANSALDI the Dragon Commander: an UNWINNABLE fire finale. There is
//      NO kill condition — you SURVIVE a 20s escapeTimer, then the 13-line
//      sacrifice-and-flee ending plays and G.victory() fires.
// Classic-script global; extends DragonScene (scenes-base.js). GAME_LEVELS defined
// at the end of this file (last level loaded).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

class Level5 extends DragonScene {
  constructor() {
    super('level5');
    this.musicTheme = 'boss';
    this.bgImage = 'bg_ruins';
    this.bgTop = 0x3a1a1a; this.bgBot = 0x2a0a0a;
    this.tileTextures = { 1: 'tile_ruins', 2: 'tile_ruins', 3: 'tile_ruins', 5: 'tile_ruins' };
    this.escapeTimer = 0;
  }
  enter() { this.bAct1(); }

  // Reset our per-act overlays on every (re)build (super destroys the graphics/text).
  beginAct(n) {
    super.beginAct(n);
    this._fireG = null; this._surviveTxt = null;
  }

  // Every act rebuilds the SAME ruins field (W=300); only the enemies change.
  _ruinsMap() {
    const r = this.buildMap(300, buildRuinsField);
    this.groundBlend(0x2a1008, r.W, r.H);
    return r;
  }

  // ── ACT 1 — Calm Before the Storm ──────────────────────────────────────────
  bAct1(retry) {
    this.beginAct(1);
    const { H } = this._ruinsMap();
    const gy = (H - 4) * T;
    this.spawnParty(60, gy, PARTY5);
    this.spawnEnemies([]);
    this.familiars(gy);
    this._npcs = [{ x: 600, name: 'npc_armory', lines: ['l5a1_npc'] }];
    this._a1done = false;
    this.setHint('l5a1_hint');
    if (retry) { this.live = true; return; }
    this.say([d('narrator', 'l5a1_1'), d('narrator', 'l5a1_2'), d('narrator', 'l5a1_3')], () => { this.live = true; });
  }

  // ── ACT 2 — Broken Illusion: Mercenaries ───────────────────────────────────
  bAct2(retry) {
    this.beginAct(2);
    const { H } = this._ruinsMap();
    const gy = (H - 4) * T;
    this.spawnParty(60, gy, PARTY5);
    const es = [
      new Enemy(this, 800, gy, 28, 40, 'Mercenary', '#888888', EHP.soldier, 13, 'chase', 'castle_soldier'),
      new Enemy(this, 1000, gy, 28, 40, 'Mercenary', '#999999', EHP.soldier, 13, 'chase', 'knight'),
      new Enemy(this, 1400, gy, 28, 40, 'Mercenary', '#888888', EHP.soldier, 13, 'patrol', 'castle_soldier'),
      new Enemy(this, 1800, gy, 28, 40, 'Mercenary', '#999999', EHP.soldier, 13, 'chase', 'knight'),
      new Enemy(this, 2200, gy, 28, 40, 'Mercenary', '#777777', EHP.soldier, 13, 'patrol', 'castle_archer'),
      new Enemy(this, 2600, gy, 28, 40, 'Mercenary', '#777777', EHP.soldier, 13, 'patrol', 'castle_archer'),
      new Enemy(this, 2800, gy, 28, 40, 'Mercenary', '#aaaaaa', EHP.soldier, 13, 'chase', 'hideout_fighter'),
      new Enemy(this, 400, (H - 9) * T, 28, 40, 'Battlement Guard', '#446688', EHP.soldier, 13, 'static', 'castle_soldier'),
    ];
    es.forEach(e => { e.spd = 0.9; });
    this.spawnEnemies(es);
    this.familiars(gy);
    this.setHint('l5a2_hint');
    if (retry) { this.live = true; return; }
    this.say([d('narrator', 'l5a2_1'), d('narrator', 'l5a2_2'), d('tutorial', 'l5a2_3')], () => { this.live = true; });
  }

  // ── ACT 3 — The Red Ruin: Draconians ───────────────────────────────────────
  bAct3(retry) {
    this.beginAct(3);
    const { H } = this._ruinsMap();
    const gy = (H - 4) * T;
    this.spawnParty(60, gy, PARTY5);
    const es = [
      new Enemy(this, 1000, (H - 5) * T, 24, 56, 'Draconian Kapak', '#b87333', EHP.elite, 17, 'chase', 'draconian_kapak'),
      new Enemy(this, 2600, (H - 5) * T, 24, 56, 'Draconian Kapak', '#b87333', EHP.elite, 17, 'chase', 'draconian_kapak'),
      new Enemy(this, 1400, gy, 24, 36, 'Draconian Scout', '#6a8844', EHP.soldier, 13, 'patrol', 'draconian'),
      new Enemy(this, 1800, gy, 24, 36, 'Draconian Scout', '#6a8844', EHP.soldier, 13, 'chase', 'draconian'),
      new Enemy(this, 2200, gy, 24, 36, 'Draconian Scout', '#6a8844', EHP.soldier, 13, 'patrol', 'draconian'),
    ];
    es.forEach(e => { e.spd = 0.9; });
    this.spawnEnemies(es);
    this.familiars(gy);
    this.setHint('l5a3_hint');
    if (retry) { this.live = true; return; }
    this.say([d('Kansaldi', 'l5a3_1'), d('Kansaldi', 'l5a3_2'), d('tutorial', 'l5a3_3')], () => { this.live = true; });
  }

  // ── ACT 4 — First Wave Boss: SIVAK Draconian ───────────────────────────────
  bAct4(retry) {
    this.beginAct(4);
    const { H } = this._ruinsMap();
    const gy = (H - 4) * T;
    this.spawnParty(60, gy, PARTY5);
    const sivak = new Enemy(this, 900, (H - 7) * T, 32, 60, 'Sivak Draconian', '#556633', EHP.boss, 18, 'boss', 'draconian_sivak');
    sivak._phase2 = undefined;   // Sivak's only phase mechanic is attachSivak's enrage (no generic speed phase-2)
    this.attachSivak(sivak);
    this.spawnEnemies([sivak]);
    this.familiars(gy);
    this.setHint('l5a4_hint');
    if (retry) { this.live = true; return; }
    this.say([d('narrator', 'l5a4_1'), d('narrator', 'l5a4_2'), d('tutorial', 'l5a4_3')], () => { this.live = true; });
  }

  // ── ACT 5 — Iron and Fire Boss: BOILERDRAK ─────────────────────────────────
  bAct5(retry) {
    this.beginAct(5);
    const { H } = this._ruinsMap();
    const gy = (H - 4) * T;
    this.spawnParty(60, gy, PARTY5);
    const boiler = new Enemy(this, 900, gy, 28, 36, 'Boilerdrak', '#ff6633', EHP.boss, 21, 'boss', 'boilerdrak');
    boiler._phase2 = undefined;   // faithful: no generic phase-2, only the aimed-fireball attacher
    this.attachBoilerdrak(boiler);
    this.spawnEnemies([boiler]);
    this.familiars(gy);
    this.setHint('l5a5_hint');
    if (retry) { this.live = true; return; }
    this.say([d('narrator', 'l5a5_1'), d('narrator', 'l5a5_2'), d('tutorial', 'l5a5_3')], () => { this.live = true; });
  }

  // ── ACT 6 — Last Stand: OGRE + GOBLIN CHIEF piggyback ──────────────────────
  bAct6(retry) {
    this.beginAct(6);
    const { H } = this._ruinsMap();
    const gy = (H - 4) * T;
    this.spawnParty(60, gy, PARTY5);
    const ogre = new Enemy(this, 800, (H - 5) * T, 28, 40, 'Ogre', '#aa8855', EHP.boss - 30, 17, 'boss', 'ogre');
    ogre._phase2 = undefined;
    const goblin = new Enemy(this, 800, (H - 5) * T, 16, 20, 'Goblin Chief', '#44cc44', EHP.elite, 10, 'static', 'goblin');
    goblin.inv = 999;   // invulnerable while riding the Ogre
    const trash = [
      new Enemy(this, 1200, gy, 20, 28, 'Goblin', '#4a7c3f', EHP.grunt, 10, 'patrol', 'goblin'),
      new Enemy(this, 1600, gy, 20, 28, 'Goblin', '#4a7c3f', EHP.grunt, 10, 'chase', 'goblin'),
      new Enemy(this, 2000, gy, 20, 28, 'Goblin', '#4a7c3f', EHP.grunt, 10, 'patrol', 'goblin'),
    ];
    this.ogre = ogre; this.goblin = goblin; this._ogreDead = false;
    this.spawnEnemies([ogre, goblin, ...trash]);
    this.familiars(gy);
    this.setHint('l5a6_hint');
    if (retry) { this.live = true; return; }
    this.say([d('narrator', 'l5a6_1'), d('narrator', 'l5a6_2'), d('tutorial', 'l5a6_3')], () => { this.live = true; });
  }

  // ── ACT 7 — No Hope: KANSALDI, the Dragon Commander (SURVIVE / ESCAPE) ──────
  bAct7(retry) {
    this.beginAct(7);
    const { H } = this._ruinsMap();
    const gy = (H - 4) * T;
    this.spawnParty(60, gy, PARTY5);
    const k = new Enemy(this, 1000, (H - 5) * T, 40, 48, 'Kansaldi', '#1a0a0a', 1500, 33, 'static', 'kansaldi');
    this.attachKansaldiBreath(k);
    this.kansaldi = k;
    this.spawnEnemies([k]);
    this.familiars(gy);
    this.escapeTimer = 20; this._ending = false;
    this._surviveTxt = this.add.text(CW / 2, 24, '', { fontFamily: 'monospace', fontSize: '15px', color: '#ff5544', stroke: '#1a0000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(40);
    this.setHint('l5a7_hint');
    if (retry) { this.live = true; return; }
    this.say([d('narrator', 'l5a7_1'), d('narrator', 'l5a7_2'), d('Kansaldi', 'l5a7_3'), d('narrator', 'l5a7_4')], () => { this.live = true; });
  }

  // ── Fire overlay: flickering ember rects while act ≥ 5 (or the negative-act ending). ──
  _fireOverlay() {
    const on = (this.act >= 5 || this.act <= -5);
    if (!this._fireG) this._fireG = this.add.graphics().setScrollFactor(0).setDepth(30);
    const g = this._fireG; g.clear();
    if (!on) return;
    const cols = [0xff5522, 0xff8844, 0xffaa33];
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * CW, y = CH - Math.random() * 90, w = 4 + Math.random() * 8, hh = 10 + Math.random() * 40;
      g.fillStyle(cols[i % 3], 0.15 + Math.random() * 0.2).fillRect(x, y, w, hh);
    }
  }

  step(dt) {
    this.updateFamiliars(dt);
    this._fireOverlay();
    const a = this.act;
    if (a === 1) {
      this.talkNPCs(dt, this._npcs);
      const h = this.heroes[this.ai];
      if (this.live && !this._a1done && h && h.on && h.x > 1000) { this._a1done = true; this.act = -1; this.bAct2(); }
    } else if (a === 2) {
      this.combatWin(() => this.bAct3(), 'l5a2_win');
    } else if (a === 3) {
      this.combatWin(() => this.bAct4(), 'l5a3_win');
    } else if (a === 4) {
      this.combatWin(() => this.bAct5(), 'l5a4_win');
    } else if (a === 5) {
      this.combatWin(() => this.bAct6(), 'l5a5_win');
    } else if (a === 6) {
      const og = this.ogre, gob = this.goblin;
      if (og && gob) {
        if (og.on && !this._ogreDead) {
          // Chief rides the Ogre's shoulders, pinned + untouchable each frame.
          const rideY = (og.body ? og.body.top : og.y) - (gob.body ? gob.body.height : 20);
          gob.inv = 999;
          if (gob.body) gob.body.reset(og.x, rideY); else { gob.x = og.x; gob.y = rideY; }
        } else if (!og.on && !this._ogreDead) {
          // Ogre toppled → the Chief drops and becomes vulnerable and aggressive.
          this._ogreDead = true;
          gob.ai = 'chase'; gob._aiOrig = 'chase'; gob.inv = 0;
          FX.burst(this, gob.x, gob.y, { count: 18, tint: [0x44cc44, 0x88ff88, 0xffffff], speedMax: 180 });
          this.say([d('narrator', 'l5a6_fall')], () => { });
        }
      }
      this.combatWin(() => this.bAct7(), 'l5a6_win');
    } else if (a === 7) {
      // UNWINNABLE by damage — the only win path is the escape timer running out.
      if (this.live && !this._ending) {
        this.escapeTimer -= dt;
        if (this._surviveTxt) this._surviveTxt.setText(Lang.t('survive') + ': ' + Math.max(0, Math.ceil(this.escapeTimer)) + 's');
        if (this.escapeTimer <= 0) {
          this._ending = true; this.act = -7;
          if (this._surviveTxt) this._surviveTxt.setText('');
          this.say([
            d('narrator', 'l5end_1'), d('becklin', 'l5end_2'), d('kote', 'l5end_3'), d('minerva', 'l5end_4'),
            d('narrator', 'l5end_5'), d('narrator', 'l5end_6'), d('narrator', 'l5end_7'), d('narrator', 'l5end_8'),
            d('narrator', 'l5end_9'), d('nesta', 'l5end_10'), d('nick', 'l5end_11'), d('narrator', 'l5end_12'), d('narrator', 'l5end_13'),
          ], () => { G.victory(); });
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME_LEVELS — the level registry (main.js registers .cls as Phaser scenes; the
// engine UI labels the level buttons with .nameKey). Level1..Level4 are defined in
// lv1.js..lv4.js (loaded before this file); Level5 above.
// ═══════════════════════════════════════════════════════════════════════════
const GAME_LEVELS = [
  { nameKey: 'lvl1', key: 'level1', cls: Level1, music: 'castle' },
  { nameKey: 'lvl2', key: 'level2', cls: Level2, music: 'underwater' },
  { nameKey: 'lvl3', key: 'level3', cls: Level3, music: 'library' },
  { nameKey: 'lvl4', key: 'level4', cls: Level4, music: 'library' },
  { nameKey: 'lvl5', key: 'level5', cls: Level5, music: 'boss' },
];

if (typeof window !== 'undefined') { window.Level5 = Level5; window.GAME_LEVELS = GAME_LEVELS; }
