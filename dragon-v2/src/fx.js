// ═══════════════════════════════════════════════════════════════════════════
// MODULE (Phaser era): fx — celebration FX helper (particle burst + tweened float).
// PROMOTED on 2nd use (D24 queue → sofia game-side FX + acceptance-finale copy →
// atlas-demo). A self-contained Phaser particle burst + a rising/fading Text float,
// baking its own 1-frame spark texture (zero image assets). Replaces the old
// engine's P.emit confetti + G._floats array.
//
// Usage (copy into games/<slug>/src/modules/, script-tag BETWEEN data.js and
// scenes.js):
//   FX.burst(scene, x, y, {count, tint:[0x..,..], lifespan, speedMin, speedMax,
//                          gravityY, scale});   // explode a burst at (x,y)
//   FX.float(scene, x, y, 'text', '#ffcc33');    // a Lang string rises + fades
// Reskin by the opts object (colors/count/spread), never fork the math.
//
// GTM-5 defect fixes (F47/F49 — pure defect fixes, F40-class, opts still win):
//   · float: text is CLAMPED inside the camera's world view (it could run
//     off-canvas mid-word, F47) and gets a dark outline so it reads over any
//     backdrop.
//   · burst: default lifespan 1000→2400 ms and gravityY 500→380 — finale
//     confetti was gone before anyone (or any capture) saw it (F49). Call
//     sites that pass their own lifespan/gravityY are unaffected.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const FX = {
  _tex(scene) {
    if (!scene.textures.exists('fx_spark')) {
      const t = scene.textures.createCanvas('fx_spark', 6, 6);
      const c = t.getContext(); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 6, 6); t.refresh();
    }
    return 'fx_spark';
  },
  burst(scene, x, y, o = {}) {
    const life = o.lifespan || 2400;                      // F49: was 1000 — confetti died before the finale beat read
    // The emitter sits at (0,0): Phaser 4 explode(n, x, y) is RELATIVE to the emitter, so an
    // emitter created at (x,y) threw every burst to (2x, 2y) — off screen (found by the v2 remake).
    const em = scene.add.particles(0, 0, FX._tex(scene), {
      lifespan: life, speed: { min: o.speedMin || 60, max: o.speedMax || 220 },
      angle: { min: 200, max: 340 }, gravityY: o.gravityY || 380, scale: { start: o.scale || 1, end: 0 },
      rotate: { start: 0, max: 360 }, tint: o.tint || [0xffcc33, 0xffffff], emitting: false,
    }).setDepth(20);
    em.explode(o.count || 24, x, y);
    scene.time.delayedCall(life + 250, () => em.destroy());
    return em;
  },
  float(scene, x, y, txt, color) {
    const t = scene.add.text(x, y, txt, {
      fontFamily: 'monospace', fontSize: '13px', color: color || '#ffcc33', fontStyle: 'bold',
      stroke: '#181014', strokeThickness: 3,              // F47: outline so it reads over any backdrop
    }).setOrigin(0.5).setDepth(30);
    // F47: clamp inside the camera's world view — a float near the world edge
    // rendered half off-canvas ("…GO DADDY!" clipped mid-word in the WS-C audit).
    const cam = scene.cameras && scene.cameras.main;
    if (cam) {
      const v = cam.worldView, pad = 4, hw = t.width / 2;
      t.x = Math.max(v.x + hw + pad, Math.min(v.x + v.width - hw - pad, t.x));
      t.y = Math.max(v.y + t.height / 2 + 24 + pad, t.y);   // keep the 24px rise on-screen too
    }
    const ty = t.y;
    scene.tweens.add({ targets: t, y: ty - 24, alpha: 0, duration: 1000, ease: 'Quad.out', onComplete: () => t.destroy() });
    return t;
  },
};

if (typeof window !== 'undefined') window.FX = FX;
