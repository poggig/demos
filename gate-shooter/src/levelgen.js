// Raw procedural generation — pure & deterministic: (mode, level | distance, seed) → spawn list.
// generator.js wraps buildLevel() with the winnability check (reject / regenerate / ease).
// Item kinds: g = gate row (relative specs, sized on the crowd when it appears), z = zombie,
// v = enemy vehicle (bus / car), a = allied pickup (tank / truck).
import { CONFIG } from './config.js';
import { Rng, hashSeed } from './rng.js';
import { ladderIndex } from './gates.js';

const D = CONFIG.difficulty;
const G = CONFIG.gen;
const GT = CONFIG.gates;

export function zombieHpBase(level, endless = false) {
  const growth = endless ? CONFIG.endless.hpGrowth : D.hpGrowth;
  const intro = D.introHpMult[Math.floor(level) - 1] ?? 1;
  return D.hpBase * intro * Math.pow(growth, Math.max(0, level - 1));
}
/** Campaign: zombie hp multiplier at a fraction f (0..1) of the level's road — the horde gets
 *  tougher as the crowd grows through the level's gates. */
export function hpRamp(f) {
  const [a, b] = D.hpRamp;
  return a + (b - a) * Math.max(0, Math.min(1, f));
}
/** Scale of the gate CAPS (green +n max, red −n max) at a level. */
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
export function bossKind(level) {
  const o = CONFIG.boss.order;
  return o[(Math.max(1, level) - 1) % o.length];
}
export function bossElite(level) { return Math.floor((Math.max(1, level) - 1) / CONFIG.boss.order.length); }
/** Endless: equivalent (fractional) level reached at a distance. */
export function eqLevel(distance) { return 1 + Math.max(0, distance) / CONFIG.endless.distancePerLevel; }

/** Reference state a reasonable player brings into level L (proved by the chained-run test). */
export function refStart(level) {
  const R = CONFIG.ref, n = R.start.length, L = Math.max(1, level);
  if (L <= n) return R.start[L - 1];
  return Math.max(1, Math.round(R.start[n - 1] * Math.pow(R.startGrowth, L - n)));
}
export function refWeapon(level) {
  const ladder = CONFIG.ref.weapons;
  const id = ladder[Math.min(ladder.length - 1, Math.floor(Math.max(0, level - 1) * CONFIG.ref.weaponPerLevel))];
  return weaponIndex(id);
}
export function weaponIndex(id) {
  const i = CONFIG.weapons.findIndex(w => w.id === id);
  if (i < 0) throw new Error('unknown weapon ' + id);
  return i;
}
/** A random weapon of the level's pool (from ≤ level, weighted by 'offer') — gates and crates. */
export function pickWeapon(rng, level) {
  const weights = {};
  CONFIG.weapons.forEach((w, i) => { if (w.offer > 0 && w.from <= level) weights[i] = w.offer; });
  return Number(rng.weighted(weights));
}
/** Shop levels (damage and fire rate each) the reference player has bought before level L. */
export function refShopLevel(level) {
  return Math.floor(Math.max(0, level - 1) * CONFIG.ref.shopPerLevel);
}
/** Damage / fire-rate multipliers of the reference player on level L (its shop upgrades). */
export function refMults(level) {
  const k = refShopLevel(level), S = CONFIG.shop;
  return {
    damageMult: 1 + Math.min(k, S.damage.max) * S.damage.perLevel,
    rateMult: 1 + Math.min(k, S.rate.max) * S.rate.perLevel,
  };
}

// ── gate rows (specs are RELATIVE; gates.resolveGateSpec sizes them on the live crowd) ─────────
function goodGate(rng, endless) {
  if (rng.chance(D.multGoodChance * (endless ? CONFIG.endless.multChance : 1))) {
    return { kind: 'mult', idx: ladderIndex(rng.chance(D.mult3Chance) ? 3 : 2) };
  }
  return { kind: 'add', sign: 1, rel: rng.range(GT.goodRel[0], GT.goodRel[1]), min: rng.int(GT.goodMin[0], GT.goodMin[1]) };
}
function badGate(rng, level) {
  if (rng.chance(Math.min(D.multBadMax, D.multBadChance + D.multBadPerLevel * Math.max(0, level - 1)))) return { kind: 'mult', idx: ladderIndex(rng.chance(D.div3Chance) ? -3 : -2) };
  return { kind: 'add', sign: -1, rel: rng.range(GT.badRel[0], GT.badRel[1]) };
}
export const isGoodSoldierSpec = g => (g.kind === 'add' && g.sign > 0) || (g.kind === 'mult' && CONFIG.multLadder[g.idx] > 0);

export function genGateRow(rng, lanes, level, friendly, endless = false, gentle = false) {
  const gates = [];
  if (friendly) { // opening row: every lane a green +n (with 1 soldier it reads +1, +2, +3)
    for (let i = 0; i < lanes; i++) gates.push({ kind: 'add', sign: 1, rel: rng.range(0.4, 0.8), min: rng.int(1, 3) });
    return gates;
  }
  const rareLane = rng.chance(D.rareChance) ? rng.int(0, lanes - 1) : -1;
  const bad = badChance(level) * (gentle ? G.gentleBad[Math.min(1, Math.floor(level) - 1)] : 1);
  for (let i = 0; i < lanes; i++) {
    if (i === rareLane) {
      const kind = rng.weighted(D.rareWeights);
      gates.push(kind === 'weapon' ? { kind, w: pickWeapon(rng, level) } : { kind });
    }
    else if (rng.chance(bad)) gates.push(gentle ? { kind: 'add', sign: -1, rel: rng.range(GT.badRel[0], GT.badRel[1]) } : badGate(rng, level));
    else gates.push(goodGate(rng, endless));
  }
  // a row always offers at least one green soldier gate
  if (!gates.some(isGoodSoldierSpec)) {
    const soldierLanes = [];
    for (let i = 0; i < lanes; i++) if (i !== rareLane) soldierLanes.push(i);
    gates[rng.pick(soldierLanes)] = goodGate(rng, endless);
  }
  return gates;
}

/** Make sure some gate row in (from, to] offers a WEAPON gate (keeps one green soldier gate). */
function ensureWeaponGate(rng, items, from, to, level) {
  const rows = items.filter(it => it.t === 'g' && it.at > from && it.at <= to);
  if (!rows.length || rows.some(r => r.gates.some(g => g.kind === 'weapon'))) return;
  const row = rng.pick(rows);
  const goodLanes = row.gates.map((g, i) => (isGoodSoldierSpec(g) ? i : -1)).filter(i => i >= 0);
  const score = i => {
    const g = row.gates[i];
    if (goodLanes.length === 1 && goodLanes[0] === i) return -1;   // never remove the only green
    return g.kind !== 'add' && g.kind !== 'mult' ? 3 : !isGoodSoldierSpec(g) ? 2 : 1;
  };
  let best = -1, bestS = -1;
  for (let i = 0; i < row.gates.length; i++) { const s = score(i) + rng.next() * 0.5; if (s > bestS) { bestS = s; best = i; } }
  row.gates[best] = { kind: 'weapon', w: pickWeapon(rng, level) };
}

// ── zombies, vehicles, allies ────────────────────────────────────────────────
function laneCenters(lanes) {
  const { left, right } = CONFIG.road, w = (right - left) / lanes, c = [];
  for (let i = 0; i < lanes; i++) c.push(left + w * (i + 0.5));
  return c;
}

/** gentleBefore: track position before which only the gentle mix is used (level openings). */
function placeRows(rng, out, count, level, hpBase, at0, dir, ease, xBias, gentleBefore) {
  const mix = zombieMix(level);
  const { left, right } = CONFIG.road;
  let placed = 0, row = 0;
  while (placed < count) {
    const k = Math.min(count - placed, rng.int(G.zombiesPerRow[0], G.zombiesPerRow[1]));
    const at = at0 + dir * row * G.zombieRowGap + rng.range(-8, 8);
    for (let j = 0; j < k; j++) {
      const type = rng.weighted(at < gentleBefore ? G.gentleMix : mix);
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

function placeVehicle(rng, out, level, lanes, hpBase, at, ease) {
  if (level < G.vehicleFrom || !rng.chance(G.vehicleChance)) return;
  const type = level >= G.carFrom && rng.chance(0.5) ? 'car' : 'bus';
  const x = rng.pick(laneCenters(lanes));
  out.push({ t: 'v', at, type, x, hp: hpBase * CONFIG.vehicles[type].hpMult * ease });
}

/** A weapon crate on the road after a wave: drive into it to swap to its (random) weapon. */
function placeCrate(rng, out, level, lanes, at) {
  if (!rng.chance(G.crateChance)) return;
  out.push({ t: 'a', at, type: 'crate', x: rng.pick(laneCenters(lanes)), w: pickWeapon(rng, level) });
}

function placeAlly(rng, out, lanes, at) {
  if (!rng.chance(G.allyChance)) return;
  out.push({ t: 'a', at, type: rng.chance(0.55) ? 'tank' : 'truck', x: rng.pick(laneCenters(lanes)) });
}

/** Emit one block (gates | wave | mixed) at track position `at` into `items`. */
function emitBlock(rng, items, kind, at, level, lanes, hpBase, ease, friendly, sizeMult, endless = false, gentleBefore = 0) {
  const gentle = at < gentleBefore;
  if (kind === 'gates' || kind === 'mixed') {
    const gates = genGateRow(rng, lanes, level, friendly, endless, gentle);
    items.push({ t: 'g', at, lanes, gates });
    if (!friendly) placeAlly(rng, items, lanes, at + 250);
    if (kind === 'mixed') {
      const n = Math.max(2, Math.round(waveSize(level) * 0.6 * sizeMult * rng.range(0.85, 1.15) * ease));
      const front = rng.range(G.mixedFrontGap[0], G.mixedFrontGap[1]);
      placeRows(rng, items, n, level, hpBase, at - front, -1, ease, laneCenters(lanes), gentleBefore);
    }
  } else {
    const n = Math.max(2, Math.round(waveSize(level) * sizeMult * rng.range(0.85, 1.15) * ease));
    placeRows(rng, items, n, level, hpBase, at, +1, ease, null, gentleBefore);
    placeVehicle(rng, items, level, lanes, hpBase, at + 140, ease);
    placeCrate(rng, items, level, lanes, at + 330);
  }
}

/**
 * Nothing hostile may start ON screen: when a level / run begins, every item closer than the spawn
 * line would appear mid-road, a second or two from the crowd. Push everything after the opening
 * gate row (items[0], visible from the start on purpose) back so the first zombie or vehicle
 * enters from the top. Returns the shift (px) applied.
 */
function clearOpening(items, blocks) {
  let first = Infinity;
  for (const it of items) if (it.t === 'z' || it.t === 'v') first = Math.min(first, it.at);
  const lead = CONFIG.crowd.y - CONFIG.track.spawnY;
  const shift = Number.isFinite(first) ? Math.max(0, lead + G.hostileEnterMargin - first) : 0;
  if (shift > 0) {
    for (let i = 1; i < items.length; i++) items[i].at += shift;
    for (let i = 1; i < blocks.length; i++) blocks[i].at += shift;
  }
  return shift;
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
  const hpAt = a => hpBase * hpRamp(a / G.levelLength);
  emitBlock(rng, items, 'gates', at, level, lanes, hpBase, ease, true, 1);
  blocks.push({ kind: 'gates', at });
  prev = 'gates';
  for (;;) {
    const gap = Math.max(G.minGap, rng.range(G.blockGap[0], G.blockGap[1]) - gapShrink);
    if (at + gap > G.levelLength - G.minGap) break;
    at += gap;
    const kind = pickKind(rng, prev, prev2);
    // level 1's opening (its gentle part, and at least its first wave) is the tutorial: one-bullet zombies
    const tutorial = level === 1 && kind !== 'gates' && (at < G.levelLength * G.gentleUntil || !items.some(it => it.t === 'z'));
    const hp = tutorial ? Math.min(hpAt(at), G.tutorialWaveHp) : hpAt(at);
    emitBlock(rng, items, kind, at, level, lanes, hp, ease, false, ramp(at), false, G.levelLength * G.gentleUntil);
    blocks.push({ kind, at });
    prev2 = prev; prev = kind;
  }
  // the last block before the boss is always a gate row: one more chance to power up
  at = Math.max(at + G.minGap, G.levelLength - G.minGap * 0.6);
  emitBlock(rng, items, 'gates', at, level, lanes, hpAt(at), ease, false, 1);
  blocks.push({ kind: 'gates', at });
  at += clearOpening(items, blocks);
  ensureWeaponGate(rng, items, G.firstBlockAt, G.levelLength * G.weaponGateBy, level);
  items.sort((a, b) => a.at - b.at);
  const length = at + G.minGap;
  return {
    mode: 'campaign', level, seed, ease, lanes, length, items, blocks,
    // generator.js calibrates hp; kind/elite pick the boss archetype and its speed-up
    boss: { hp: hpBase * CONFIG.boss.minHpMult * ease, level, kind: bossKind(level), elite: bossElite(level) },
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
    const sizeMult = D.waveRamp[0] + (1 - D.waveRamp[0]) * Math.min(1, at / E.rampDistance);
    emitBlock(rng, items, kind, at, lvl, lanes, hpBase, 1, index === 0 && first, sizeMult, true, E.chunkLen * 1.2);
    first = false;
    prev2 = prev; prev = kind;
    const gapShrink = Math.max(0, lvl - 1) * G.gapShrinkPerLevel;
    at += Math.max(G.minGap, rng.range(G.blockGap[0], G.blockGap[1]) - gapShrink);
  }
  if (index === 0) at += clearOpening(items, []);   // the next chunk starts after the shifted items
  items.sort((a, b) => a.at - b.at);
  return { items, end: at };
}
