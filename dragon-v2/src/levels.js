// ═══════════════════════════════════════════════════════════════════════════
// LEVEL REGISTRY — one title button per level. Defensive (typeof) so a level file under
// construction can be booted alone; the shipped game has all five.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const GAME_LEVELS = [
  typeof Level1 !== 'undefined' && { nameKey: 'lvl1', key: 'level1', cls: Level1, music: 'castle' },
  typeof Level2 !== 'undefined' && { nameKey: 'lvl2', key: 'level2', cls: Level2, music: 'underwater' },
  typeof Level3 !== 'undefined' && { nameKey: 'lvl3', key: 'level3', cls: Level3, music: 'library' },
  typeof Level4 !== 'undefined' && { nameKey: 'lvl4', key: 'level4', cls: Level4, music: 'library' },
  typeof Level5 !== 'undefined' && { nameKey: 'lvl5', key: 'level5', cls: Level5, music: 'boss' },
].filter(Boolean);
