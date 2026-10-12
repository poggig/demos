// Level generator with the winnability guarantee: build → simulate the reasonable path →
// accept, or regenerate with a new sub-seed (maxAttempts), then progressively ease the level.
// Deterministic: (level, runSeed) always yields the same level.
import { CONFIG } from './config.js';
import { hashSeed } from './rng.js';
import { buildLevel } from './levelgen.js';
import { simulateLevel, isWinnable } from './sim.js';

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
 * Boss hp = the reasonable path's firepower when the boss appears × boss.targetSeconds
 * (never below the level's floor), then re-simulated. Deterministic like everything else.
 */
function calibrateBoss(def) {
  let res = simulateLevel(def);
  if (res.soldiersAtBoss > 0) {
    const B = CONFIG.boss;
    const secs = B.introTargetSeconds[def.level - 1] ?? B.targetSeconds;
    def.boss.hp = Math.max(def.boss.hp, res.powerAtBoss * secs);
    res = simulateLevel(def);
  }
  return res;
}

function finish(def, res, attempts, validated) {
  def.validated = validated;
  def.attempts = attempts;
  def.sim = res;
  return def;
}

/** Short stable fingerprint of a level layout (QA: ?seed= reproducibility). */
export function levelSignature(def) {
  const parts = [def.level, def.lanes, Math.round(def.length), Math.round(def.boss.hp * 100)];
  for (const it of def.items) {
    if (it.t === 'z') parts.push('z', it.type, Math.round(it.at), Math.round(it.x), Math.round(it.hp * 100));
    else {
      parts.push('g', Math.round(it.at));
      for (const g of it.gates) parts.push(g.kind, g.value ?? '', g.idx ?? '');
    }
  }
  return hashSeed(...parts).toString(16).padStart(8, '0');
}
