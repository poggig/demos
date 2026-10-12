// Winnability simulator — plays a campaign level with the "reasonable path": the autopilot
// takes the best gate of every row (max firepower), never aims at gates to repair them
// (gate upgrades OFF), starts with the BASE crowd and no shop upgrades. Same World code as the game.
import { CONFIG } from './config.js';
import { World } from './world.js';
import { statsPower } from './gates.js';

export function simulateLevel(def, opts = {}) {
  const w = new World({
    mode: 'campaign', def,
    start: opts.start ?? CONFIG.crowd.startSoldiers,
    rateMult: opts.rateMult ?? 1, damageMult: opts.damageMult ?? 1,
    ai: true, quiet: true, gateUpgrades: false,
  });
  const dt = CONFIG.step, maxSteps = Math.ceil(CONFIG.sim.maxSeconds / dt);
  let steps = 0, soldiersAtBoss = -1, powerAtBoss = 0;
  while (w.status === 'running' && steps < maxSteps) {
    w.step(dt);
    if (soldiersAtBoss < 0 && w.bossPhase) { soldiersAtBoss = w.soldiers; powerAtBoss = statsPower(w.stats); }
    steps++;
  }
  return {
    won: w.status === 'won',
    soldiers: w.soldiers,
    soldiersAtBoss,
    powerAtBoss,
    peak: w.peakSoldiers,
    time: w.time,
    bossProgress: w.status === 'won' ? w.bossProgress : 1,
    contacts: w.contacts,
    kills: w.kills,
    coins: w.coins,
    score: w.score,
  };
}

/** A level is accepted when the reasonable path beats the boss with margin to spare. */
export function isWinnable(res) {
  return res.won && res.soldiers >= 1 && res.bossProgress <= CONFIG.sim.bossMaxProgress;
}
