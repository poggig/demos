// Winnability simulator — plays a campaign level with the "reasonable path": the autopilot takes
// the best gate of every row (max firepower; its bullets improve the gate in front of it, as in
// the game, but it never aims at gates on purpose), grabs allied pickups, hunts the biggest
// threat between rows and side-steps vehicles; it also tries to sidestep acid and boulders, but
// less well than a human who keeps moving — so the winnability proof errs on the safe side.
// It enters level L with the REFERENCE state (levelgen.refStart / refWeapon / refMults: crowd,
// weapon and shop upgrades). Same World code as the game.
import { CONFIG } from './config.js';
import { World } from './world.js';
import { statsPower } from './gates.js';
import { refStart, refWeapon, refMults } from './levelgen.js';

export function simulateLevel(def, opts = {}) {
  const ref = refMults(def.level);
  const w = new World({
    mode: 'campaign', def,
    start: opts.start ?? refStart(def.level),
    weapon: opts.weapon ?? refWeapon(def.level),
    rateMult: opts.rateMult ?? ref.rateMult, damageMult: opts.damageMult ?? ref.damageMult,
    ai: true, aiStyle: opts.aiStyle, aiMistake: opts.aiMistake || 0, aiSeed: opts.aiSeed || 0, aiDodge: opts.aiDodge !== false,
    quiet: true, gateUpgrades: opts.gateUpgrades ?? CONFIG.sim.repairGates,
  });
  const dt = CONFIG.step, maxSteps = Math.ceil(CONFIG.sim.maxSeconds / dt);
  let steps = 0, soldiersAtBoss = -1, powerAtBoss = 0, bossDamageWindow = -1;
  while (w.status === 'running' && steps < maxSteps) {
    w.step(dt);
    if (soldiersAtBoss < 0 && w.bossPhase) { soldiersAtBoss = w.soldiers; powerAtBoss = statsPower(w.stats); }
    // calibration: damage the boss takes until it has covered `measureBoss` of its walk
    if (opts.measureBoss && w.bossArriveT >= 0 && w.bossWalk() >= opts.measureBoss) { bossDamageWindow = w.bossDamage; break; }
    steps++;
  }
  if (opts.measureBoss && bossDamageWindow < 0) bossDamageWindow = w.bossDamage; // crowd fell first
  return {
    won: w.status === 'won',
    soldiers: w.soldiers,
    weapon: w.stats.weapon,
    soldiersAtBoss,
    powerAtBoss,
    bossDamageWindow,
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
