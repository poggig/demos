// Level generator with the winnability guarantee: build → simulate the reasonable path →
// accept, or regenerate with a new sub-seed (maxAttempts), then progressively ease the level.
// Deterministic: (level, runSeed) always yields the same level.
import { CONFIG } from './config.js';
import { hashSeed } from './rng.js';
import { buildLevel } from './levelgen.js';
import { simulateLevel, isWinnable } from './sim.js';
import { carryOverStart } from './crowd.js';
import { emptyUpgrades, upgradeCost, statsFromUpgrades, UPGRADES } from './economy.js';

export function generateLevel(level, runSeed) {
  const G = CONFIG.gen;
  let def = null, res = null, attempts = 0;
  for (let a = 0; a < G.maxAttempts; a++) {
    attempts++;
    def = buildLevel(level, hashSeed('run', runSeed, a), 1);
    res = calibrateBoss(def);
    if (isWinnable(res)) return finish(def, res, attempts, true);
  }
  // still too hard: keep the last layout's seed and soften it step by step
  const lastSeed = hashSeed('run', runSeed, G.maxAttempts - 1);
  for (let k = 1; k <= G.maxEaseTries; k++) {
    attempts++;
    def = buildLevel(level, lastSeed, Math.pow(G.easeStep, k));
    res = calibrateBoss(def);
    if (isWinnable(res)) return finish(def, res, attempts, true);
  }
  return finish(def, res, attempts, false);
}

/**
 * Boss hp = the damage the reference player REALLY deals to an unkillable boss from its spawn
 * until the boss has covered boss.targetProgress of its walk (misses, shields, zigzags, charges
 * and splits included), × ease, never below the level's floor. Then the level is re-simulated
 * with that boss. Deterministic like everything else.
 */
function calibrateBoss(def) {
  const B = CONFIG.boss;
  const target = B.introTargetProgress[def.level - 1] ?? B.targetProgress;
  const floor = def.boss.hp;
  def.boss.hp = 1e15;
  const probe = simulateLevel(def, { measureBoss: target });
  def.boss.hp = Math.max(floor, probe.bossDamageWindow * def.ease);
  return simulateLevel(def);
}

function finish(def, res, attempts, validated) {
  def.validated = validated;
  def.attempts = attempts;
  def.sim = res;
  return def;
}

/**
 * A whole campaign played by an autopilot, level after level, with the real carry-over rules
 * (25 % of survivors, weapon kept). aiMistake = chance of picking a random gate; gateUpgrades =
 * it shoots the gate it waits under; shop = after each level it spends its coins on the cheapest
 * upgrade, again and again. Returns { reached, levels: [{level, start, weapon, survivors, won}] }.
 */
export function simulateCampaign(runSeed, opts = {}) {
  const maxLevel = opts.maxLevel || 30;
  const upg = emptyUpgrades();
  let coins = 0, survivors = 0, weapon = 0;
  const levels = [];
  for (let L = 1; L <= maxLevel; L++) {
    const st = statsFromUpgrades(upg);
    const start = L === 1 ? st.start : carryOverStart(survivors, st.start);
    const def = generateLevel(L, runSeed);
    const r = simulateLevel(def, { start, weapon, rateMult: st.rateMult, damageMult: st.damageMult,
      aiMistake: opts.aiMistake || 0, aiSeed: hashSeed('mistakes', runSeed, L), gateUpgrades: !!opts.gateUpgrades, aiDodge: opts.aiDodge });
    levels.push({ level: L, start, weapon, survivors: r.soldiers, won: r.won, time: r.time, upgrades: { ...upg } });
    if (!r.won) return { reached: L, levels };
    survivors = r.soldiers; weapon = r.weapon; coins += r.coins;
    while (opts.shop) {
      let best = null, cost = Infinity;
      for (const k of UPGRADES) { const c = upgradeCost(k, upg[k]); if (c < cost) { cost = c; best = k; } }
      if (!best || cost > coins) break;
      coins -= cost; upg[best]++;
    }
  }
  return { reached: maxLevel + 1, levels };
}

/** Short stable fingerprint of a level layout (QA: ?seed= reproducibility). */
export function levelSignature(def) {
  const parts = [def.level, def.lanes, Math.round(def.length), Math.round(def.boss.hp * 100), def.boss.kind];
  for (const it of def.items) {
    if (it.t === 'g') {
      parts.push('g', Math.round(it.at));
      for (const g of it.gates) parts.push(g.kind, g.sign ?? '', g.rel !== undefined ? Math.round(g.rel * 1000) : '', g.min ?? '', g.idx ?? '');
    } else parts.push(it.t, it.type, Math.round(it.at), Math.round(it.x), it.hp !== undefined ? Math.round(it.hp * 100) : '');
  }
  return hashSeed(...parts).toString(16).padStart(8, '0');
}
