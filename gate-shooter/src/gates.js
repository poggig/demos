// Gate logic — pure. A gate row holds one gate per lane; crossing a row applies ONLY the gate
// of the lane under the crowd's centre. Shooting a soldier gate improves it (up to a cap).
import { CONFIG } from './config.js';

export const MINUS = '−', TIMES = '×', DIVIDE = '÷';
export const BONUS_KINDS = ['airstrike', 'heli'];
export const RARE_KINDS = ['rate', 'damage', 'weapon', 'airstrike', 'heli'];

export function makeAddGate(value, cap = Infinity) {
  return { kind: 'add', value: Math.trunc(value), cap: Math.max(cap, value), progress: 0 };
}
export function makeMultGate(idx) {
  const top = CONFIG.multLadder.length - 1;
  return { kind: 'mult', idx: Math.max(0, Math.min(top, idx)), progress: 0 };
}
/** Ladder index of a factor (e.g. 2 → index of ×2, -3 → index of ÷3). */
export function ladderIndex(factor) {
  const i = CONFIG.multLadder.indexOf(factor);
  if (i < 0) throw new Error('factor not on the ladder: ' + factor);
  return i;
}
/** w: weapon index offered by a WEAPON gate. */
export function makeRareGate(kind, w = 1) {
  const r = CONFIG.gates.rare;
  if (kind === 'rate') return { kind, value: r.rateValue, progress: 0 };
  if (kind === 'damage') return { kind, value: r.damageValue, progress: 0 };
  if (kind === 'weapon') return { kind, w: Math.max(0, Math.min(CONFIG.weapons.length - 1, w | 0)), value: 1, progress: 0 };
  if (RARE_KINDS.includes(kind)) return { kind, value: 1, progress: 0 };
  throw new Error('unknown special gate ' + kind);
}

/**
 * Turn a generator spec into a live gate, sizing +/− gates on the CURRENT crowd:
 *  green {kind:'add', sign:+1, rel, min} → +clamp(round(crowd×rel), min, addCap×scale)
 *  red   {kind:'add', sign:−1, rel}      → −clamp(round(crowd×rel), 1, badCap×scale)
 * so one soldier sees +1/+2/+3, a big crowd sees capped values, and red gates always hurt.
 */
export function resolveGateSpec(spec, crowd, scale) {
  const G = CONFIG.gates;
  if (spec.kind === 'add') {
    const n = Math.max(0, crowd);
    if (spec.sign > 0) {
      const hi = Math.max(spec.min, Math.round(G.addCap * scale));
      const v = Math.max(spec.min, Math.min(hi, Math.round(n * spec.rel)));
      return makeAddGate(v, Math.max(v + 1, Math.round(v * G.repairGood)));
    }
    const hi = Math.max(1, Math.round(G.badCap * scale));
    const m = Math.max(1, Math.min(hi, Math.round(n * spec.rel)));
    return makeAddGate(-m, Math.max(1, Math.round(m * G.repairBad)));
  }
  if (spec.kind === 'mult') {
    const f = CONFIG.multLadder[spec.idx];
    if (f > 0 && crowd * (f - 1) > G.multGainCap * scale) {     // too big a jump: offer the best +n
      const v = Math.max(1, Math.round(G.addCap * scale));
      return makeAddGate(v, Math.max(v + 1, Math.round(v * G.repairGood)));
    }
    return makeMultGate(spec.idx);
  }
  return makeRareGate(spec.kind, spec.w);
}

export const isSoldierGate = g => g.kind === 'add' || g.kind === 'mult';
export const isBonusGate = g => BONUS_KINDS.includes(g.kind);
export const multFactor = g => CONFIG.multLadder[g.idx];

/** Soldiers after crossing a soldier gate: integer, rounded DOWN, never below 0. */
export function applySoldierGate(soldiers, g) {
  let r;
  if (g.kind === 'add') r = soldiers + g.value;
  else if (g.kind === 'mult') {
    const f = multFactor(g);
    r = f > 0 ? soldiers * f : soldiers / -f;
  } else return soldiers;
  r = Math.floor(r);
  return Math.max(0, Math.min(CONFIG.crowd.maxSoldiers, r));
}

/** 'good' (green) | 'bad' (red) | 'neutral' — recomputed live as shooting changes the value. */
export function gateTone(g) {
  if (g.kind === 'add') return g.value > 0 ? 'good' : g.value < 0 ? 'bad' : 'neutral';
  if (g.kind === 'mult') return multFactor(g) > 0 ? 'good' : 'bad';
  return 'good'; // special gates always help
}

/**
 * Register `hits` bullet hits on a gate ("colpi": every bullet that reaches the gate is a hit —
 * a merged bullet counts once, so a huge crowd can't max every gate instantly). Returns steps gained.
 *  +/− : +1 every CONFIG.gateHitsPerStep hits, up to the gate's cap.
 *  ×/÷ : one ladder step every CONFIG.multHitsPerStep hits (÷3 → ÷2 → ×2 → ×3).
 *  special gates do not change when shot (they still stop the bullet).
 */
export function hitGate(g, hits) {
  let steps = 0;
  if (g.kind === 'add') {
    if (g.value >= g.cap) { g.progress = 0; return 0; }
    g.progress += hits;
    steps = Math.min(Math.floor(g.progress / CONFIG.gateHitsPerStep), g.cap - g.value);
    g.value += steps;
    g.progress -= steps * CONFIG.gateHitsPerStep;
    if (g.value >= g.cap) g.progress = 0;
  } else if (g.kind === 'mult') {
    const top = CONFIG.multLadder.length - 1;
    if (g.idx >= top) { g.progress = 0; return 0; }
    g.progress += hits;
    steps = Math.min(Math.floor(g.progress / CONFIG.multHitsPerStep), top - g.idx);
    g.idx += steps;
    g.progress -= steps * CONFIG.multHitsPerStep;
    if (g.idx >= top) g.progress = 0;
  }
  return steps;
}

/** Display label of a gate value: "+5", "−3", "×2", "÷3", "+25%", "×1.5". */
export function gateLabel(g) {
  if (g.kind === 'add') return g.value < 0 ? MINUS + (-g.value) : '+' + g.value;
  if (g.kind === 'mult') { const f = multFactor(g); return f > 0 ? TIMES + f : DIVIDE + (-f); }
  if (g.kind === 'rate') return '+' + Math.round(g.value * 100) + '%';
  if (g.kind === 'damage') return TIMES + g.value;
  return '';
}

/** Damage per second of ONE soldier with a weapon (before multipliers). */
export function weaponDps(weaponIndex) {
  const w = CONFIG.weapons[weaponIndex];
  return (CONFIG.baseDamage * w.damage * w.pellets) / w.interval;
}
/** The simulator's rating of a weapon: raw DPS × its 'value' (range, splash, crowd control). */
export function weaponRating(weaponIndex) {
  return weaponDps(weaponIndex) * (CONFIG.weapons[weaponIndex].value ?? 1);
}

/** Swap to weapon w (kept for the run); the weapon already held → ×sameWeaponDamage instead. */
export function giveWeapon(stats, w) {
  if (w === stats.weapon) stats.damageMult = Math.min(CONFIG.stats.maxDamageMult, stats.damageMult * CONFIG.gates.rare.sameWeaponDamage);
  else stats.weapon = w;
}

/**
 * Apply a gate to the player stats { soldiers, rateMult, damageMult, weapon } (mutates).
 * Bonus gates (air strike / helicopter) don't touch the stats: the World triggers them.
 * Returns { before, after } soldiers for feedback.
 */
export function applyGate(stats, g) {
  const before = stats.soldiers;
  if (isSoldierGate(g)) {
    stats.soldiers = applySoldierGate(stats.soldiers, g);
  } else if (g.kind === 'rate') {
    stats.rateMult = Math.min(CONFIG.stats.maxRateMult, stats.rateMult + g.value);
  } else if (g.kind === 'damage') {
    stats.damageMult = Math.min(CONFIG.stats.maxDamageMult, stats.damageMult * g.value);
  } else if (g.kind === 'weapon') {
    giveWeapon(stats, g.w);
  }
  return { before, after: stats.soldiers };
}

/** Total firepower of a stats block (weapon RATED, see weaponRating) — what the "reasonable path" maximizes. */
export function statsPower(s) {
  return s.soldiers * weaponRating(s.weapon) * s.rateMult * s.damageMult;
}

/** Value of crossing gate g, in firepower (stats untouched). Bonus gates count as +bonusValue. */
export function powerAfter(stats, g) {
  if (isBonusGate(g)) return statsPower(stats) * (1 + CONFIG.sim.bonusValue);
  const s = { soldiers: stats.soldiers, rateMult: stats.rateMult, damageMult: stats.damageMult, weapon: stats.weapon };
  applyGate(s, g);
  // a better weapon is worth extra: it is KEPT for the rest of the run
  const upgrade = g.kind === 'weapon' && weaponRating(s.weapon) > weaponRating(stats.weapon);
  return statsPower(s) * (upgrade ? 1 + CONFIG.sim.weaponValue : 1);
}
