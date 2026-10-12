// Raw procedural generation — pure & deterministic: (mode, level | distance, seed) → spawn list.
// generator.js wraps buildLevel() with the winnability check (reject / regenerate / ease).
import { CONFIG } from './config.js';
import { Rng, hashSeed } from './rng.js';
import { ladderIndex } from './gates.js';

const D = CONFIG.difficulty;
const G = CONFIG.gen;

export function zombieHpBase(level, endless = false) {
  const growth = endless ? CONFIG.endless.hpGrowth : D.hpGrowth;
  return D.hpBase * Math.pow(growth, Math.max(0, level - 1));
}
export function gateScale(level, endless = false) {
  if (endless) return 1 + CONFIG.endless.gateLinear * Math.max(0, level - 1);
  return Math.pow(D.gateGrowth, Math.max(0, level - 1));
}
export function lanesFor(level) { return level >= CONFIG.threeLanesFromLevel ? 3 : 2; }
export function badChance(level) {
  return Math.min(D.badChanceMax, D.badChanceBase + D.badChancePerLevel * Math.max(0, level - 1));
}
export function waveSize(level) {
  return Math.min(D.waveMax, D.waveBase + D.wavePerLevel * Math.max(0, level - 1));
}
export function zombieMix(level) {
  let w = D.mix[0].w;
  for (const row of D.mix) if (level >= row.from) w = row.w;
  return w;
}
/** Endless: equivalent (fractional) level reached at a distance. */
export function eqLevel(distance) { return 1 + Math.max(0, distance) / CONFIG.endless.distancePerLevel; }

// ── gate rows ────────────────────────────────────────────────────────────────
function goodGate(rng, scale, endless) {
  if (rng.chance(D.multGoodChance * (endless ? CONFIG.endless.multChance : 1))) return { kind: 'mult', idx: ladderIndex(rng.chance(0.25) ? 3 : 2) };
  const v = Math.max(1, Math.round(rng.range(D.addGood[0], D.addGood[1]) * scale));
  return { kind: 'add', value: v, cap: Math.round(CONFIG.gates.addCapPerScale * scale) };
}
function badGate(rng, scale) {
  if (rng.chance(D.multBadChance)) return { kind: 'mult', idx: ladderIndex(rng.chance(0.3) ? -3 : -2) };
  const v = -Math.max(1, Math.round(rng.range(D.addBad[0], D.addBad[1]) * scale));
  return { kind: 'add', value: v, cap: Math.round(CONFIG.gates.addCapPerScale * scale) };
}
const isGoodSoldier = g => (g.kind === 'add' && g.value > 0) || (g.kind === 'mult' && CONFIG.multLadder[g.idx] > 0);

export function genGateRow(rng, lanes, level, friendly, endless = false) {
  const scale = gateScale(level, endless);
  if (friendly) { // opening row: every lane a green +n (no ×: a ×2 on 5 soldiers is a trap)
    const gates = [];
    for (let i = 0; i < lanes; i++) {
      const v = Math.max(1, Math.round(rng.range(D.addGood[0], D.addGood[1]) * scale * G.firstRowBoost));
      gates.push({ kind: 'add', value: v, cap: Math.max(v, Math.round(CONFIG.gates.addCapPerScale * scale)) });
    }
    return gates;
  }
  const rareLane = rng.chance(D.rareChance) ? rng.int(0, lanes - 1) : -1;
  const bad = badChance(level);
  const gates = [];
  for (let i = 0; i < lanes; i++) {
    if (i === rareLane) gates.push({ kind: rng.weighted(D.rareWeights) });
    else gates.push(rng.chance(bad) ? badGate(rng, scale) : goodGate(rng, scale, endless));
  }
  // a row always offers at least one green soldier gate
  if (!gates.some(isGoodSoldier)) {
    const lanesSoldier = [];
    for (let i = 0; i < lanes; i++) if (i !== rareLane) lanesSoldier.push(i);
    gates[rng.pick(lanesSoldier)] = goodGate(rng, scale, endless);
  }
  return gates;
}

// ── zombie groups ────────────────────────────────────────────────────────────
function placeRows(rng, out, count, level, hpBase, at0, dir, ease, xBias) {
  const mix = zombieMix(level);
  const { left, right } = CONFIG.road;
  let placed = 0, row = 0;
  while (placed < count) {
    const k = Math.min(count - placed, rng.int(G.zombiesPerRow[0], G.zombiesPerRow[1]));
    const at = at0 + dir * row * G.zombieRowGap + rng.range(-8, 8);
    for (let j = 0; j < k; j++) {
      const type = rng.weighted(mix);
      const t = CONFIG.zombieTypes[type];
      let x;
      if (xBias && rng.chance(0.6)) x = rng.pick(xBias) + rng.range(-40, 40);
      else x = left + ((j + 0.5) / k) * (right - left) + rng.range(-22, 22);
      x = Math.max(left + t.r, Math.min(right - t.r, x));
      out.push({ t: 'z', at: at + rng.range(-10, 10), type, x, hp: hpBase * t.hpMult * ease });
      placed++;
    }
    row++;
  }
}

function laneCenters(lanes) {
  const { left, right } = CONFIG.road, w = (right - left) / lanes, c = [];
  for (let i = 0; i < lanes; i++) c.push(left + w * (i + 0.5));
  return c;
}

/** Emit one block (gates | wave | mixed) at track position `at` into `items`. */
function emitBlock(rng, items, kind, at, level, lanes, hpBase, ease, friendly, sizeMult, endless = false) {
  if (kind === 'gates' || kind === 'mixed') {
    const gates = genGateRow(rng, lanes, level, friendly, endless);
    items.push({ t: 'g', at, lanes, gates });
    if (kind === 'mixed') {
      const n = Math.max(2, Math.round(waveSize(level) * 0.6 * sizeMult * rng.range(0.85, 1.15) * ease));
      const front = rng.range(G.mixedFrontGap[0], G.mixedFrontGap[1]);
      placeRows(rng, items, n, level, hpBase, at - front, -1, ease, laneCenters(lanes));
    }
  } else {
    const n = Math.max(2, Math.round(waveSize(level) * sizeMult * rng.range(0.85, 1.15) * ease));
    placeRows(rng, items, n, level, hpBase, at, +1, ease, null);
  }
}

function pickKind(rng, prev, prev2) {
  for (let tries = 0; tries < 8; tries++) {
    const k = rng.weighted(G.weights);
    const gateLike = k !== 'wave';
    // never three gate rows in a row, never three waves in a row
    if (gateLike && prev !== 'wave' && prev2 !== 'wave' && prev && prev2) continue;
    if (!gateLike && prev === 'wave' && prev2 === 'wave') continue;
    return k;
  }
  return prev === 'wave' ? 'gates' : 'wave';
}

/**
 * Campaign level (no validation). ease ≤ 1 softens zombie hp/counts and the boss.
 * Returns { mode, level, seed, ease, lanes, length, items[], blocks[], boss }.
 */
export function buildLevel(level, seed, ease = 1) {
  const rng = new Rng(hashSeed('level', level, seed, ease.toFixed(4)));
  const lanes = lanesFor(level);
  const hpBase = zombieHpBase(level);
  const items = [], blocks = [];
  const gapShrink = Math.max(0, level - 1) * G.gapShrinkPerLevel;
  let at = G.firstBlockAt, prev = null, prev2 = null;
  const ramp = a => D.waveRamp[0] + (D.waveRamp[1] - D.waveRamp[0]) * Math.min(1, a / G.levelLength);
  emitBlock(rng, items, 'gates', at, level, lanes, hpBase, ease, true, 1);
  blocks.push({ kind: 'gates', at });
  prev = 'gates';
  for (;;) {
    const gap = Math.max(G.minGap, rng.range(G.blockGap[0], G.blockGap[1]) - gapShrink);
    if (at + gap > G.levelLength - G.minGap) break;
    at += gap;
    const kind = pickKind(rng, prev, prev2);
    emitBlock(rng, items, kind, at, level, lanes, hpBase, ease, false, ramp(at));
    blocks.push({ kind, at });
    prev2 = prev; prev = kind;
  }
  // the last block before the boss is always a gate row: one more chance to power up
  at = Math.max(at + G.minGap, G.levelLength - G.minGap * 0.6);
  emitBlock(rng, items, 'gates', at, level, lanes, hpBase, ease, false, 1);
  blocks.push({ kind: 'gates', at });
  items.sort((a, b) => a.at - b.at);
  const length = at + G.minGap;
  return {
    mode: 'campaign', level, seed, ease, lanes, length, items, blocks,
    boss: { hp: hpBase * CONFIG.boss.minHpMult * ease, level }, // generator.js calibrates it
  };
}

/** Endless: one chunk of blocks covering [startAt, startAt + chunkLen). */
export function buildEndlessChunk(index, startAt, runSeed) {
  const rng = new Rng(hashSeed('endless', index, runSeed));
  const items = [];
  const E = CONFIG.endless;
  let at = startAt + (index === 0 ? G.firstBlockAt : 0);
  const end = startAt + E.chunkLen;
  let prev = index === 0 ? null : 'wave', prev2 = null, first = true;
  while (at < end) {
    const lvl = eqLevel(at);
    const lanes = lanesFor(Math.floor(lvl));
    const hpBase = zombieHpBase(lvl, true);
    const kind = index === 0 && first ? 'gates' : pickKind(rng, prev, prev2);
    emitBlock(rng, items, kind, at, lvl, lanes, hpBase, 1, index === 0 && first, 1, true);
    first = false;
    prev2 = prev; prev = kind;
    const gapShrink = Math.max(0, lvl - 1) * G.gapShrinkPerLevel;
    at += Math.max(G.minGap, rng.range(G.blockGap[0], G.blockGap[1]) - gapShrink);
  }
  items.sort((a, b) => a.at - b.at);
  return { items, end: at };
}
