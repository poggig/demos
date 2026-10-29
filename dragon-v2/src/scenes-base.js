// ═══════════════════════════════════════════════════════════════════════════
// CHRONICLES OF AZURERUNE v2 — scenes-base: the shared mechanics layer + THE CONTRACT
// the five level files (lv1.js … lv5.js) are written against. Classic-script globals.
// Load order: phaser → engine → data → strings → fx → follow-familiar → scenes-base →
// lv1 … lv5 (lv5 ends with GAME_LEVELS) → main.
//
// COORDINATES: level files use the ORIGINAL game's tile/pixel coordinates. buildOrig()
// places an original H-row map at the bottom of the 30-row world (dy = MAP_H − H rows);
// convert any original pixel y with this.oy(y). x is unchanged.
//
// API (everything a level needs — see each method's comment):
//   this.dress(theme)                          before buildOrig: backdrop/layers/tiles of a theme
//   this.buildOrig(W, H, builderFn)            builderFn(tm, W, H) in ORIGINAL coords → {W,H,dy}
//   this.oy(yOrig)                             original pixel y → world y
//   this.props(seed, opts)                     scatter the theme's props on the ground surfaces
//   this.party(x, feetYOrig, roster)           spawn the party standing at original feet y
//   this.foe({type,x,feet,w,h,hp,dmg,ai,spd,ag,nameKey,tint,scale})   original-numbered enemy
//   this.familiars() / updateFamiliars(dt)     Nesta's fox + Nick's skeleton Arturito
//   this.lockEdges()                           heroes + foes collide with the map's left/right edge
//   this.cutsceneOver(rebuildFn, lines, next)  dialogue over the frozen previous scene
//   this.walkGate(dt, x, next, ...introLines)  advance when the controlled hero passes x
//   this.combatWin(next, winLines, shake)      advance when every foe is down
//   this.talkNPCs(dt, npcs)                    original talk rules (Z/J/Space, x+y range)
//   this.setupStealth(guardFn) / updateStealth(dt, onCaught)   180/70 px rings, 2.5 s
//   this.darkZone(x, y) / (auto) tick          the darkmantle's 320 px pools of light
//   this.startCountdown(s, key) / updateCountdown(dt)          "ESCAPE: Ns" (Lv2)
//   this.lob(e, vx, vy, dmg, color)            the original's gravity enemy projectile
//   this.winShake(dur, px)                     shake that plays once dialogue is closed
//   this.music(theme)                          switch the procedural theme
// Per-level flags (set in the constructor): this.allowScrolls (R revive; L1/L3/L5 true).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const HERO_DEFS = {
  kote: ['Kote', '#40aa88'], minerva: ['Minerva', '#cc44cc'], elber: ['Elber', '#44aa44'],
  nesta: ['Nesta', '#4488cc'], nick: ['Nick', '#d0a066'],
};
const PARTY5 = ['kote', 'minerva', 'elber', 'nesta', 'nick'];
const PARTY4 = ['kote', 'minerva', 'elber', 'nick'];

// ── FAMILIARS (cosmetic, no body): Nesta's fox + Nick's skeleton "Arturito" ──
class Familiar extends FollowFamiliar {
  build(scene) {
    const key = this._key;
    if (key && scene.textures.exists(key)) { const s = scene.add.image(0, 0, key).setOrigin(0.5, 1); s.setScale(this._h / s.height); this.go.add(s); }
    else { const g = scene.add.graphics(); g.fillStyle(this._col, 1).fillEllipse(0, -6, 20, 11); this.go.add(g); }
  }
}
class Fox extends Familiar { } Fox.prototype._key = 'pet_fox'; Fox.prototype._col = 0x888888; Fox.prototype._h = 22;
class Skeleton extends Familiar { } Skeleton.prototype._key = 'pet_skeleton'; Skeleton.prototype._col = 0xe8e8e0; Skeleton.prototype._h = 44;

// ── The original's enemy projectile (Proj, index.html:2001-2025): gravity 0.24 px/f²,
// max fall 6 px/f, life 3.5 s, dies on any solid tile, hits ANY living hero (companions
// too) and ignores invisibility. Pushed into scene.enemyProjectiles (the engine updates
// and reaps it like EnemyProj).
class LobProj {
  constructor(scene, x, y, vx, vy, dmg, color) {
    this.scene = scene; this.dmg = dmg; this.on = true; this.life = 3.5;
    this.go = scene.add.rectangle(x, y, 10, 10, color || 0xff8800).setDepth(5).setStrokeStyle(2, 0xffdd44);
    scene.physics.add.existing(this.go);
    this.go.body.setAllowGravity(false);
    this.vx = vx * FPS; this.vy = vy * FPS;
    this.go.body.setVelocity(this.vx, this.vy);
    scene.physics.add.collider(this.go, scene.solidList, () => this.kill(true));
  }
  update(dt, heroes) {
    if (!this.on || !this.go || !this.go.body) return;
    this.life -= dt; if (this.life <= 0) return this.kill();
    this.vy = Math.min(6 * FPS, this.vy + 0.24 * FPS * FPS * dt);
    this.go.body.setVelocity(this.vx, this.vy);
    const x = this.go.x, y = this.go.y;
    for (const h of heroes) if (h.on && Math.abs(h.x - x) < 14 && Math.abs(h.y - y) < 14 + h.body.height / 4) { h.hurt(this.dmg, x); return this.kill(true); }
    // the original Proj dies on ANY solid tile, one-way platforms included (the Arcade collider
    // above lets a one-way plank through from below)
    const tm = this.scene.tm; if (tm && tm.sol(Math.floor(x / T), Math.floor(y / T))) return this.kill(true);
  }
  kill(fx) { if (!this.on) return; this.on = false; if (fx && this.go && typeof FX !== 'undefined') FX.burst(this.scene, this.go.x, this.go.y, { count: 5, tint: [0xff8800, 0xff4400] }); if (this.go) { this.go.destroy(); this.go = null; } }
}

// ═══════════════════════════════════════════════════════════════════════════
class DragonScene extends GameScene {
  constructor(key) { super(key); this.allowScrolls = true; }

  beginAct(n) {
    super.beginAct(n);
    this.live = false; this._won = false; this._wgInit = false; this._wgDone = false;
    this._npcObjs = null; this._darkZones = []; this._darkRTs = [];
    this._cd = null; this._cdTxt = null; this._stGuards = null; this._stG = null; this._stFailed = false;
    this._labels = new Map(); this._ecTotal = 0;   // _shakeQ survives: a win shake plays as the next act begins (the original)
    this.fox = null; this.skel = null; this._heroTag = null;
    this.bgImage = null; this.bgLayers = null; this.tileTextures = null; this._theme = null; this._dy = 0;
  }

  // ── WORLD ────────────────────────────────────────────────────────────────
  // Set the drawn theme for the NEXT buildOrig/buildMap: far backdrop (×2), the mid
  // depth layer standing on the ground line, {top,fill} terrain, planks, rubble.
  dress(theme) {
    this._theme = theme;
    this.bgImage = theme + '_far';
    this.bgLayers = [{ key: theme + '_mid', scroll: 0.55, h: (theme === 'library' ? 120 : theme === 'castle' ? 100 : 140) * 2, y: GROUND_Y - (theme === 'library' ? 120 : theme === 'castle' ? 100 : 140) * 2, depth: -18 }];
    const edge = { top: theme + '_top', fill: theme + '_fill' };
    this.tileTextures = { 1: edge, 2: edge, 3: theme + '_plank', 5: theme === 'ruins' ? 'ruins_rubble' : edge };   // 4 (hazard) keeps the engine's red warning block
  }
  // builderFn(tm, W, H) writes the ORIGINAL map (H = its original height); every row is
  // shifted down by dy = MAP_H − H so the ground is the bottom of the screen.
  buildOrig(W, H, builderFn) {
    const dy = MAP_H - H; this._dy = dy;
    this.buildMap(W, (tm) => {
      const p = { w: W, h: H, set: (x, y, v) => tm.set(x, y + dy, v), get: (x, y) => (y < 0 ? 0 : tm.get(x, y + dy)), sol: (x, y) => tm.sol(x, y + dy), solUp: (x, y) => tm.solUp(x, y + dy) };
      builderFn(p, W, H);
    });
    this.lockEdges();
    return { W, H, dy };
  }
  oy(y) { return y + this._dy * T; }
  // Heroes + foes collide with the left/right world edge (never with top/bottom).
  lockEdges() { this.physics.world.setBoundsCollision(true, true, false, false); }
  // Scatter the theme's props on ground surfaces (seeded, like the original's genDecos):
  // only on a solid tile with ≥4 empty rows above, never within `avoid` px of listed x.
  props(seed, o = {}) {
    const list = (WORLD_PROPS[this._theme] || []).map(p => `prop_${this._theme}_${p}`).filter(k => this.textures.exists(k));
    if (!list.length || !this.tm) return;
    let s = (seed * 9301 + 49297) % 233280; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const tm = this.tm, every = o.every || 7, avoid = o.avoid || [];
    for (let x = 3; x < tm.w - 3; x += every + Math.floor(R() * every)) {
      let y = -1; for (let yy = 4; yy < tm.h; yy++) if (tm.solUp(x, yy) && !tm.sol(x, yy - 1) && !tm.sol(x, yy - 2) && !tm.sol(x, yy - 3) && !tm.sol(x, yy - 4)) { y = yy; break; }
      if (y < 0 || avoid.some(a => Math.abs(a - x * T) < 64)) continue;
      const key = list[Math.floor(R() * list.length)];
      this.add.image(x * T + 8, y * T + 1, key).setOrigin(0.5, 1).setScale(2).setDepth(-6);
    }
  }

  // ── ACTORS ───────────────────────────────────────────────────────────────
  // Party standing on original feet y (each hero ends 2 px above it and settles flush).
  party(x, feetYOrig, roster) {
    const fy = this.oy(feetYOrig);
    this.spawnParty(x, fy, roster);
    // the original's slots, kept on purpose: moving the leader forward put it inside a stealth
    // guard's 70 px instant-catch ring on an act rebuild (L1 A4); feel.companionSpacing spreads
    // the companions as soon as play starts
    this.heroes.forEach(h => { h.body.reset(h.x, fy - h.displayHeight * (1 - h.originY) - 2); h.body.setCollideWorldBounds(true); });
    this._heroTag = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: Lang.touch ? '12px' : '9px', color: '#ffffff', stroke: '#000000', strokeThickness: 2, align: 'center' }).setOrigin(0.5, 1).setDepth(30);
    return this.heroes;
  }
  // a world x for a centred label of width w, clamped inside the camera view
  _inView(x, w) { const v = this.cameras.main.worldView; return Math.max(v.x + w / 2 + 3, Math.min(v.right - w / 2 - 3, x)); }
  // an actor at world x is (at least partly) on screen
  _near(x) { const v = this.cameras.main.worldView; return x > v.x - 12 && x < v.right + 12; }
  // An enemy with the ORIGINAL numbers. x = hitbox centre x (world px), feet = world y of
  // the feet (use this.oy(origY + origH) for an original top-left spawn). The art stands
  // 1.5× the hitbox (the original's render rule) unless `scale` is given.
  foe(o) {
    const art = ENEMY_ART[o.type] || { artH: 58 };
    const s = o.scale || (1.5 * o.h) / art.artH;
    const e = new Enemy(this, o.x, (o.feet || GROUND_Y) - 40, o.w, o.h, o.nameKey ? Lang.t(o.nameKey) : o.type, o.color || '#ff6666', o.hp, o.dmg, o.ai || 'patrol', o.type);
    applyActorScale(e, o.w / s, o.h / s, s);
    e.body.reset(o.x, (o.feet || GROUND_Y) - e.displayHeight * (1 - e.originY) - 2);
    if (o.spd != null) e.spd = o.spd;
    if (o.ag != null) e.ag = o.ag;
    if (o.tint != null) e.setTint(o.tint);
    if (o.noCharge) e._noCharge = true;     // deliberate fix: keeps a boss/watcher's archetype + specials after a hit
    e.body.setCollideWorldBounds(true);
    e._nameKey = o.nameKey || null; e._tintBase = o.tint;
    return e;
  }
  // Register the act's foes (engine spawnEnemies) + remember the total for the HUD counter.
  enemiesIn(list) { this.spawnEnemies(list); this._ecTotal = list.length; return list; }
  // spawned at their owners' feet (not at a fixed ground spot, which put them inside raised terrain)
  familiars() {
    const at = t => { const o = this.heroes.find(h => h.customType === t); return o ? [o.x - 24, o.body.bottom] : [5 * T, GROUND_Y]; };
    const [fx, fy] = at('nesta'), [sx, sy] = at('nick');
    this.fox = new Fox(this, fx, fy, { offsetX: 30, offsetY: 0, depth: 2 });
    this.skel = new Skeleton(this, sx, sy, { offsetX: 34, offsetY: 0, depth: 2 });
  }
  // a familiar has no body: keep its feet ON the terrain under it — out of a step it trails
  // into, down onto the ground when its owner stands on something it can't reach (swim acts
  // leave it free)
  _groundFamiliar(fam) {
    const tm = this.tm; if (!tm || this._swim) return;
    const tx = Math.floor(fam.x / T); let ty = Math.floor((fam.y - 1) / T), k = 0;
    if (tm.sol(tx, ty)) { while (k < 6 && tm.sol(tx, ty - 1)) { ty--; k++; } fam.y = ty * T; }
    else { while (k < 8 && !tm.sol(tx, ty + 1)) { ty++; k++; } if (k < 8) fam.y = (ty + 1) * T; }
    fam.go.setPosition(fam.x, fam.y);
  }
  updateFamiliars(dt) {
    const follow = (fam, type) => { if (!fam || !fam.go) return; const o = this.heroes.find(h => h.customType === type && h.on); fam.go.setVisible(!!o); if (o) { fam.update(dt, { x: o.x, y: o.body.bottom - 18, rt: o.rt }); this._groundFamiliar(fam); } };   // FollowFamiliar adds an 18 px hero half-height
    follow(this.fox, 'nesta'); follow(this.skel, 'nick');
  }

  // ── ACT FLOW ─────────────────────────────────────────────────────────────
  // The original replays cutscene acts over the FROZEN previous scene. When a world is
  // still standing we keep it; on a retry from scratch rebuildFn() builds it first.
  cutsceneOver(n, rebuildFn, lines, next) {
    if (!this.tm && rebuildFn) rebuildFn();
    this.act = n; this.live = false;
    this.say(lines, () => { this.act = -1; if (next) next(); });
  }
  walkGate(dt, xPx, next, ...introLines) {
    if (this._wgDone) return;
    if (!this._wgInit) {
      this._wgInit = true;
      if (introLines.length) { this.live = false; this.say(introLines, () => { this.live = true; }); } else this.live = true;
    }
    const h = this.heroes[this.ai];
    if (this.live && h && h.on && h.x > xPx) { this._wgDone = true; this.act = -1; if (next) next(); }
  }
  combatWin(next, winLines, shake) {
    if (this.live && !this._won && this.enemiesAllDead()) {
      this._won = true; this.act = -1;
      if (shake !== false) this.winShake(shake ? shake[0] : 0.5, shake ? shake[1] : 4);
      if (winLines && winLines.length) this.say(winLines, () => next && next()); else if (next) next();
    }
  }
  // Camera shake that waits for any open dialogue to close (the original only shakes
  // while no dialogue is open — so a win shake lands as the next act begins).
  winShake(dur, px) { this._shakeQ = { dur, px }; }

  // ── NPCs (original rules, index.html:1720-1783) ──────────────────────────
  // npcs = [{ x, feet?, nameKey, lines:[d(...)], sprite?:{key,frame?,tint?,scale?}, onTalk? }]
  // Talk: Z, J or Space while |dx| < 60 and |dy| < 60; once each; "[SPACE]" prompt above
  // the head until talked to; name label always. onTalk(npc) runs after the lines.
  talkNPCs(dt, npcs) {
    if (!this._npcObjs) {
      this._npcObjs = npcs.map(n => {
        const feet = n.feet != null ? n.feet : GROUND_Y;
        const sp = n.sprite || { key: 'npc_villager' };
        let img;
        if (sp.frame && this.textures.exists(sp.key)) img = this.add.sprite(n.x, feet, sp.key, sp.frame);
        else img = this.add.image(n.x, feet, this.textures.exists(sp.key) ? sp.key : 'npc_villager');
        img.setOrigin(0.5, 1).setScale(sp.scale || (sp.frame ? 1 : 0.82)).setDepth(1).setFlipX(!!sp.flip);
        if (sp.tint != null) img.setTint(sp.tint);
        const top = feet - img.displayHeight;
        const label = this.add.text(n.x, top - 4, Lang.t(n.nameKey), { fontFamily: 'monospace', fontSize: Lang.touch ? '12px' : '9px', color: '#d8d0c0', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(3);
        const prompt = this.add.text(n.x, top - 16, Lang.t('ui_npc_prompt'), { fontFamily: 'monospace', fontSize: '11px', color: '#ffffc8', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(3);
        return Object.assign({}, n, { feet, img, label, prompt, talked: false });
      });
    }
    const h = this.heroes[this.ai];
    for (const n of this._npcObjs) {
      const near = h && h.on && Math.abs(h.x - n.x) < 60 && Math.abs(h.body.bottom - n.feet) < 60;
      const vis = this._near(n.x); n.label.x = this._inView(n.x, n.label.width); n.prompt.x = this._inView(n.x, n.prompt.width); n.label.setVisible(vis);
      n.prompt.setVisible(!n.talked && vis);
      n.prompt.setAlpha(near ? 1 : 0.55);
      if (near && !n.talked && !D.on && (I.pr('KeyZ') || I.pr('KeyJ') || I.pr('Space'))) {
        n.talked = true; n.prompt.setVisible(false);
        this.say(n.lines, () => { if (n.onTalk) n.onTalk(n); });
      }
    }
  }
  npcsTalked() { return !!this._npcObjs && this._npcObjs.every(n => n.talked); }

  // ── STEALTH (index.html:2477-2514): rings measured to the CONTROLLED hero only —
  // within 70 px → caught at once; within 180 px for 2.5 s → caught. Any invisible hero
  // defeats it. guardFn(e) → true for the watchers. onCaught() decides (the original
  // rebuilds the act AND replays its intro). Deliberate fix: party-invisibility now
  // expires on benched heroes too (engine ticks every hero), so it no longer disables
  // stealth for the rest of the act.
  setupStealth(guardFn) { this._stGuards = guardFn; this._stT = 2.5; this._stAlert = false; this._stFailed = false; this._stG = this.add.graphics().setDepth(8); }
  updateStealth(dt, onCaught) {
    if (!this._stGuards || this._stFailed) return;
    const g = this._stG; g.clear();
    const guards = this.enemies.filter(e => e.on && this._stGuards(e)), h = this.heroes[this.ai];
    const invis = this.heroes.some(x => x.on && x._invis);
    for (const e of guards) { g.lineStyle(1, 0xc8a84e, invis ? 0.15 : 0.4).strokeCircle(e.x, e.y, 180); g.lineStyle(1, 0xff4444, invis ? 0.2 : 0.55).strokeCircle(e.x, e.y, 70); }
    if (invis || !h || !h.on) { this._stAlert = false; return; }
    let alert = false, caught = false;
    for (const e of guards) { const dd = Math.hypot(e.x - h.x, e.y - h.y); if (dd < 70) caught = true; else if (dd < 180) alert = true; }
    if (alert && !this._stAlert) this._stT = 2.5;
    this._stAlert = alert;
    if (alert) { this._stT -= dt; const ag = guards[0]; g.fillStyle(0xffcc33, 0.9).fillRect(h.x - 20, h.body.top - 10, 40 * Math.max(0, this._stT / 2.5), 3); }
    if (caught || (alert && this._stT <= 0)) { this._stFailed = true; onCaught(); }
  }

  // ── DARKNESS (index.html:1618-1639, 2924-2997): each zone is its OWN 93 % black
  // screen mask with one 320 px hole, so overlapping zones stack (only where the holes
  // overlap stays lit). Zones are anchored in the world where the blow landed; 15 s.
  darkZone(x, y) {
    if (!this.textures.exists('__darkHole')) { const gg = this.make.graphics({ add: false }); gg.fillStyle(0xffffff, 1).fillCircle(320, 320, 320); gg.generateTexture('__darkHole', 640, 640); gg.destroy(); }
    const rt = this.add.renderTexture(0, 0, CW, CH).setOrigin(0, 0).setScrollFactor(0).setDepth(15);
    this._darkZones.push({ x, y, life: 15, rt });
  }
  _tickDark(dt) {
    const cam = this.cameras.main;
    for (const z of this._darkZones) {
      z.life -= dt;
      if (z.life <= 0) { z.rt.destroy(); continue; }
      // Phaser 4: erase(key, x, y) CENTRES the stamp, and queued fill/erase only commit on render()
      z.rt.clear(); z.rt.fill(0x000000, 0.93); z.rt.erase('__darkHole', z.x - cam.scrollX, z.y - cam.scrollY); z.rt.render();
    }
    this._darkZones = this._darkZones.filter(z => z.life > 0);
  }

  // ── COUNTDOWN (Lv2 "ESCAPE: Ns", index.html:2995-3010): blue, orange < 45, red < 20; no
  // refill; at 0 every hero dies (deliberate fix: the engine's game-over + retry, not a
  // soft-lock). Kept above the darkness so the player can always read it.
  startCountdown(seconds, key) { this._cd = seconds; this._cdKey = key || 'ui_air_escape'; this._cdTxt = this.add.text(CW / 2, 34, '', { fontFamily: 'monospace', fontSize: '15px', fontStyle: 'bold', color: '#88ccff', stroke: '#000814', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0).setDepth(45); }
  updateCountdown(dt) {
    if (this._cd == null) return;
    this._cd = Math.max(0, this._cd - dt);
    const s = Math.ceil(this._cd);
    this._cdTxt.setText(Lang.t(this._cdKey).replace('{s}', s)).setColor(this._cd < 20 ? '#ff5555' : this._cd < 45 ? '#ffaa44' : '#88ccff');
    if (this._cd <= 0) { this._cd = null; this.heroes.forEach(h => { if (h.on) { h.inv = 0; h.hurt(h.hp + 999); } }); }
  }

  // ── BOSS / ENEMY HELPERS ─────────────────────────────────────────────────
  lob(e, vx, vy, dmg, color) { const p = new LobProj(this, e.x, e.y, vx, vy, dmg, color); this.enemyProjectiles.push(p); return p; }
  nearestHero(x) { let b = null, bd = 1e9; for (const h of this.heroes) if (h.on) { const d = Math.abs(h.x - x); if (d < bd) { bd = d; b = h; } } return b; }
  music(theme) { this.musicTheme = theme; Music.play(theme); }

  // ── PER-FRAME UPKEEP ─────────────────────────────────────────────────────
  updateActors(dt) {
    super.updateActors(dt);
    if (this._darkZones && this._darkZones.length) this._tickDark(dt);
    // the original culls foes that fall 200 px below the map (they count as defeated)
    for (const e of this.enemies) if (e.on && e.y > MAP_H * T + 200) { e.inv = 0; e.hurt(e.hp + 9999); }
  }
  commonUpdateEnd(dt) {
    // R revive only where the original allowed it (L1/L3/L5); "REVIVED!" float
    const before = G.scrollsLeft;
    if (!this.allowScrolls) { const s = G.scrollsLeft; G.scrollsLeft = 0; super.commonUpdateEnd(dt); G.scrollsLeft = s; }
    else super.commonUpdateEnd(dt);
    if (G.scrollsLeft < before) { const a = this.heroes[this.ai]; if (a) this._float('float_revived', a.x, a.y - 40, '#88ff88'); }
    this._overlays(dt);
  }
  // A dead hero's HUD tile is a revive button on touch screens (the pad has no R).
  swap(idx) {
    const h = this.heroes[idx];
    if (h && !h.on && this.allowScrolls && G.scrollsLeft > 0) { I.vPress('KeyR'); setTimeout(() => I.vRelease('KeyR'), 50); return; }
    super.swap(idx);
  }
  _overlays(dt) {
    // queued win shake → play once no dialogue is open
    // (force = true: a kill's juice micro-shake must not swallow the win shake)
    if (this._shakeQ && !D.on) { this.cameras.main.shake(this._shakeQ.dur * 1000, this._shakeQ.px / 1600, true); this._shakeQ = null; }
    // "PARTY HEALED!" on the healer's skill
    if (this._healFlash > 0.95 && !this._healShown) { this._healShown = true; this._float('ui_party_healed', this.cameras.main.scrollX + CW / 2, this.cameras.main.scrollY + CH / 2 - 60, '#66ff99'); }
    if (this._healFlash <= 0) this._healShown = false;
    // controlled-hero tag: name, Q cooldown, ↑ while a double jump is left (index.html:1395-1400)
    const h = this.heroes[this.ai];
    if (this._heroTag) {
      if (h && h.on) {
        const air = !(h.body.blocked.down || h.body.touching.down);
        const cd = h.skillCD > 0 ? '\n' + Lang.t('ui_skill_cd').replace('{cd}', h.skillCD.toFixed(1)) : '';
        this._heroTag.setText((air && h.jumps < h.maxJumps ? Lang.t('ui_double_jump_arrow') + '\n' : '') + h.nm + cd).setColor(h.col).setPosition(h.x, h.y - h.displayHeight * h.originY - 2).setVisible(true);   // above the DRAWN head (the body is only 36 px)
      } else this._heroTag.setVisible(false);
    }
    // enemy name labels (always) + HP bars once damaged (index.html:1713-1714)
    if (!this._lblG) this._lblG = this.add.graphics().setDepth(29);
    if (!this._lblG.active) this._lblG = this.add.graphics().setDepth(29);
    const g = this._lblG; g.clear();
    for (const e of this.enemies) {
      let L = this._labels.get(e);
      if (!e.on) { if (L) { L.destroy(); this._labels.delete(e); this._deathFx(e); } continue; }
      if (!L) { L = this.add.text(0, 0, e.nm, { fontFamily: 'monospace', fontSize: Lang.touch ? '12px' : '9px', color: '#ffaaaa', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(29); this._labels.set(e, L); }
      const top = e.y - e.displayHeight * e.originY;
      L.setPosition(this._inView(e.x, L.width), top - 6).setVisible(this._near(e.x));   // never cut by the screen edge; none for off-screen foes
      if (e.hp < e.mhp) { g.fillStyle(0x333333, 1).fillRect(e.x - 15, top - 5, 30, 3); g.fillStyle(e.hp / e.mhp > 0.5 ? 0x44aa44 : 0xff4444, 1).fillRect(e.x - 15, top - 5, 30 * Math.max(0, e.hp / e.mhp), 3); }
    }
    // off-screen foe cue: in a live act with foes left but none in view, a pulsing arrow at the
    // screen edge points to the nearest one (the HUD alone said 'Enemies 11/11' with nobody in sight)
    this._foeCue(h);
    // HUD extras (DOM, top-right): enemies alive/total · [X] ready/used · scrolls · music
    this._hudx(h);
  }
  // victory: hide the top-right HUD at once (the state-watch interval would leave it up to 200 ms)
  _enterVictory() {
    const el = document.getElementById('hudx'); if (el) el.style.display = 'none';
    super._enterVictory();
    // a finale that celebrates the party: the five heroes line up under THE END, bursts of light
    const o = document.getElementById('overlay'); if (o && !o.querySelector('.partyStrip')) o.insertBefore(partyStrip(1.6), o.querySelector('.opts'));
    const cam = this.cameras.main;
    if (typeof FX !== 'undefined') [[0.25, 0xffcc33], [0.5, 0x88ccff], [0.75, 0xff88cc]].forEach(([f, c], i) => this.time.delayedCall(i * 350, () => FX.burst(this, cam.scrollX + CW * f, cam.scrollY + CH * 0.35, { count: 40, tint: [c, 0xffffff], speedMax: 260 })));
  }
  // every dialogue hides the top-right HUD extras (the box sits over them) and the foe arrow at once
  say(dlgs, cb) { const el = document.getElementById('hudx'); if (el) el.style.display = 'none'; if (this._cue && this._cue.active) this._cue.setVisible(false); return super.say(dlgs, cb); }
  commonUpdateStart(dt) { this._frameFoes(dt); return super.commonUpdateStart(dt); }
  // ACT-OPENING FRAMING: while an act's intro dialogue is open and the nearest living foe is
  // off-screen to the right (bosses stand at the original's x, often just past the edge), the
  // camera eases right until the whole foe is in frame (24 px margin). When play starts, feel.lookAhead eases the camera back.
  _frameFoes(dt) {
    const cam = this.cameras.main, h = this.heroes[this.ai];
    if (!D.on || this.live || !cam || !cam.followOffset || !h || !h.on) return;
    const alive = this.enemies.filter(e => e.on && e.x > h.x); if (!alive.length) return;
    const near = alive.reduce((a, e) => e.x < a.x ? e : a);
    const full = near.x + near.displayWidth / 2 + 24 - CW;                  // scrollX that shows the whole foe
    // a BOSS (boss AI, or ≥ 300 hp like the static Kansaldi) within two screens gets the full establishing shot (the hero may leave the frame while
    // the line is read); anyone else only as far as keeps the hero 28 px inside the left edge
    const want = (near.ai === 'boss' || near.mhp >= 300) && full - h.x < 2 * CW ? full : Math.min(full, h.x - 28);
    if (want <= cam.scrollX + 1) return;                     // already framed
    const off = h.x - CW / 2 - want;                         // followOffset.x for that scroll
    cam.followOffset.x += (off - cam.followOffset.x) * Math.min(1, dt * 3);
  }
  _foeCue(h) {
    if (!this._cue || !this._cue.active) this._cue = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#ffcc66', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0).setDepth(44).setVisible(false);
    const cam = this.cameras.main, v = cam.worldView, alive = this.enemies.filter(e => e.on);
    // not in acts where the foes are to be AVOIDED (stealth) or walked past (a walk gate)
    const avoid = !!this._stGuards || (this._wgInit && !this._wgDone);
    if (!this.live || D.on || avoid || !h || !alive.length || alive.some(e => e.x > v.x - 8 && e.x < v.right + 8)) { this._cue.setVisible(false); return; }
    const near = alive.reduce((a, e) => Math.abs(e.x - h.x) < Math.abs(a.x - h.x) ? e : a), right = near.x > h.x;
    this._cue.setText(right ? '▶' : '◀').setPosition(right ? CW - 26 : 26, CH / 2).setAlpha(0.8 + 0.2 * Math.sin(performance.now() / 180)).setVisible(true);
  }
  _deathFx(e) { if (typeof FX !== 'undefined') FX.burst(this, e.x, e.y, { count: 15, tint: [0xffffff, 0xff6666, e._tintBase || 0xffaa66], speedMax: 160 }); }
  _hudx(h) {
    let el = document.getElementById('hudx');
    if (!el) { el = document.createElement('div'); el.id = 'hudx'; el.style.cssText = 'position:absolute;top:6px;right:8px;text-align:right;font:bold 11px "Courier New",monospace;line-height:1.5;pointer-events:none;z-index:6;text-shadow:0 1px 2px #000'; document.getElementById('ui').appendChild(el); }
    const alive = this.enemies.filter(e => e.on).length;
    const parts = [];
    if (this._ecTotal) parts.push(`<span style="color:#ff8888">${Lang.t('ui_enemy_count').replace('{alive}', alive).replace('{total}', this._ecTotal)}</span>`);
    if (h && h._ult) parts.push(`<span style="color:${h._rUsed ? '#777' : '#ffdd44'}">${Lang.t(h._rUsed ? 'ui_ult_used' : 'ui_ult_ready')}</span>`);
    if (this.allowScrolls) parts.push(`<span style="color:#ffdd44">${Lang.t('ui_scrolls').replace('{n}', G.scrollsLeft)}</span>`);
    parts.push(`<span style="color:#ffffffaa">${Lang.t(Music.muted ? 'ui_music_muted' : 'ui_music_on')}</span>`);
    const html = parts.join('<br>');
    if (el._last !== html) { el.innerHTML = html; el._last = html; }
    el.style.display = G.state === 'play' && !D.on ? 'block' : 'none';   // hidden under dialogue (the box sits at the top)
  }
}

// ── the party line-up (title + finale): each hero's idle frame from the CURRENT cast's atlas
function partyStrip(z) {
  const box = document.createElement('div'); box.className = 'partyStrip';
  box.style.cssText = 'display:flex;gap:' + Math.round(6 * z) + 'px;justify-content:center;align-items:flex-end;margin:6px 0 10px;pointer-events:none';
  for (const n of ['kote', 'minerva', 'elber', 'nesta', 'nick']) {
    const d = document.createElement('div');
    d.style.cssText = 'width:' + Math.round(56 * z) + 'px;height:' + Math.round(64 * z) + 'px;background:url(assets/' + CAST_DIR + 'hero_' + n + '.png) 0 0/' + Math.round(560 * z) + 'px ' + Math.round(64 * z) + 'px no-repeat;image-rendering:pixelated;filter:drop-shadow(0 3px 0 rgba(0,0,0,.6))';
    box.appendChild(d);
  }
  return box;
}
// ── TITLE: the cast A/B switch (Retro Diffusion art ⇄ Claude-drawn art). Reloads with
// ?cast=… (data.js picks the atlas paths before Phaser loads). Label follows the language.
function castSwitch() {
  const title = document.getElementById('title'); if (!title || document.getElementById('castBox')) return;
  const box = document.createElement('div'); box.id = 'castBox';
  box.style.cssText = 'margin-top:14px;display:flex;gap:6px;align-items:center;color:#a8c8e8;font-size:11px';
  const lbl = document.createElement('span'); box.appendChild(lbl);
  const mk = (id, txt) => { const b = document.createElement('button'); b.className = 'btn'; b.id = id; b.textContent = txt; b.style.cssText = 'min-width:0;padding:4px 12px;font-size:10px'; b.style.borderColor = CAST_ART === (id === 'castRD' ? 'rd' : 'claude') ? '#ffffff' : '#c8a84e'; b.onclick = () => { const v = id === 'castRD' ? 'rd' : 'claude'; if (v !== CAST_ART) location.search = '?cast=' + v; }; box.appendChild(b); };
  mk('castRD', 'Retro Diffusion'); mk('castClaude', 'Claude');
  title.appendChild(box);
  const lv = document.getElementById('levelBtns'); if (lv && !title.querySelector('.partyStrip')) title.insertBefore(partyStrip(Lang.touch ? 0.9 : 1.15), lv);
  const refresh = () => { lbl.textContent = Lang.t('ui_cast_label'); };
  refresh(); const lb = document.getElementById('langBtns'); if (lb) lb.addEventListener('click', () => setTimeout(refresh, 0));
}

if (typeof window !== 'undefined') {
  Object.assign(window, { DragonScene, HERO_DEFS, PARTY5, PARTY4, Familiar, Fox, Skeleton, LobProj });
  window.addEventListener('load', castSwitch);
  // the top-right HUD extras belong to play/pause only (hide them on title/victory)
  setInterval(() => { const el = document.getElementById('hudx'); if (el && ((G.state !== 'play' && G.state !== 'paused') || D.on)) el.style.display = 'none'; }, 100);
}
