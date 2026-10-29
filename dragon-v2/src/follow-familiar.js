// ═══════════════════════════════════════════════════════════════════════════
// MODULE (Phaser era): follow-familiar — a harmless companion sprite that
// trails the controlled hero. Re-derived from templates/modules/follow-
// familiar.js (D20). Provenance: Gerald the monstera (sofia-bday-30), Waffle
// (proposal), Clarence the mule (dnd-recap), Patito the rubber duck (farewell).
//
// Idiomatic Phaser changes — this is the module that "shrinks into a built-in":
//  · The familiar is now a real Phaser Container of drawn shapes (a retained
//    scene object) instead of an immediate-mode draw() called every frame.
//    It is destroyed automatically by GameScene.beginAct() (children.removeAll),
//    so acts rebuild it cleanly — no manual teardown.
//  · update() still lerp-trails the controlled hero (fast catch-up after a
//    dash, gentle drift when close) and bobs; positions are Phaser world
//    coords (hero.x/hero.y are body CENTERS on Phaser, origin 0.5).
//  · No physics body → no collision, never triggers enemies. Pure personality.
//
// Usage:
//   class Gerald extends FollowFamiliar{ build(scene){ /* add pot+leaves to
//     this.go (a scene.add.container) */ } }
//   this.gerald = new Gerald(scene, x, y, {nameKey:'gerald_name'});
//   in the scene's step()/update(): this.gerald.update(dt, this.heroes[this.ai]);
// Subclass build(scene) with your own shapes added to this.go. The default
// build is a bobbing colored blob — fine for previews, replace it for delivery.
//
// Options: offsetX (px behind hero facing, default 30), offsetY (relative to
// hero feet, default -14), speed cap (default 200), color, depth (default 1),
// nameKey (Lang key → a small label above the familiar).
// Omit the familiar from underwater acts unless the character swims.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

class FollowFamiliar {
  constructor(scene, x, y, o = {}) {
    this.scene = scene; this.x = x; this.y = y; this._bob = 0;
    this.offsetX = o.offsetX === undefined ? 30 : o.offsetX;
    this.offsetY = o.offsetY === undefined ? -14 : o.offsetY;
    this.speed = o.speed === undefined ? 200 : o.speed;
    this.color = o.color || '#8ab4d4';
    this.nameKey = o.nameKey || null;
    this.go = scene.add.container(x, y).setDepth(o.depth === undefined ? 1 : o.depth);
    this.build(scene);
    if (this.nameKey) {
      this.label = scene.add.text(0, -22, Lang.t(this.nameKey), { fontFamily: 'monospace', fontSize: '8px', color: '#aaaaaa' }).setOrigin(0.5);
      this.go.add(this.label);
    }
  }
  // Default art — override in a subclass with your own shapes on this.go.
  build(scene) {
    const col = Phaser.Display.Color.HexStringToColor(this.color).color;
    const g = scene.add.graphics();
    g.fillStyle(col, 1).fillEllipse(0, -5, 12, 14);
    this.go.add(g);
  }
  update(dt, hero) {
    if (!hero || !this.go) return;
    this._bob += dt;
    const feet = hero.body ? hero.body.height / 2 : 18;
    const tx = hero.x + (hero.rt ? -this.offsetX : this.offsetX);
    const ty = hero.y + feet + this.offsetY;
    const dx = tx - this.x, dy = ty - this.y;
    const spd = Math.min(this.speed, Math.sqrt(dx * dx + dy * dy) * 6);
    if (Math.abs(dx) > 3) this.x += Math.sign(dx) * Math.min(Math.abs(dx), spd * dt);
    if (Math.abs(dy) > 3) this.y += Math.sign(dy) * Math.min(Math.abs(dy), spd * dt);
    this.go.setPosition(this.x, this.y + Math.sin(this._bob * 4) * 1.5);
  }
  destroy() { if (this.go) { this.go.destroy(); this.go = null; } }
}

if (typeof window !== 'undefined') window.FollowFamiliar = FollowFamiliar;
