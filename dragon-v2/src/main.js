// ═══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP — assembles the Phaser game from the level registry. Content-
// agnostic: never edit this per game. Arcade physics is the default (E-b);
// a game that needs richer bodies (M7 swim/drive/fly) can switch `physics`
// to 'matter' here + set GAME_CONFIG.physics — the vendored phaser.min.js
// carries both, so no re-vendoring.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'gameParent',
  width: CW, height: CH,
  backgroundColor: '#0a1628',
  pixelArt: true,                       // NEAREST filtering — crisp palette pixel-art
  scale: { mode: Phaser.Scale.NONE },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: GRAVITY },    // 2160 px/s² (old GR=0.6/frame)
      fps: 60, fixedStep: true,         // refresh-rate independence for free
      debug: false
    }
  },
  // Boot → Title → level scenes (registered by their own key via super(key)).
  scene: [BootScene, TitleScene].concat(GAME_LEVELS.map(l => l.cls))
});
window.game = game;
