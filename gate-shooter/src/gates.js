// Gate logic — pure. A gate row holds one gate per lane; crossing a row applies ONLY the gate
// of the lane under the crowd's centre. Shooting a soldier gate improves it.
import { CONFIG } from './config.js';

export const MINUS = '−', TIMES = '×', DIVIDE = '÷';

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
export function makeRareGate(kind) {
  const r = CONFIG.gates.rare;
  if (kind === 'rate') return { kind, value: r.rateValue, progress: 0 };
  if (kind === 'damage') return { kind, value: r.damageValue, progress: 0 };
  if (kind === 'weapon') return { kind, value: 1, progress: 0 };
  throw new Error('unknown rare gate ' + kind);
}

export const isSoldierGate = g => g.kind === 'add' || g.kind === 'mult';
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
  return 'good'; // rare gates always help
}

/**
 * Register `hits` bullet hits on a gate ("colpi": every bullet that reaches the gate is a hit —
 * a merged bullet counts once, so a huge crowd can't max every gate instantly). Returns steps gained.
 *  +/− : +1 every CONFIG.gateHitsPerStep hits, up to the gate's cap.
 *  ×/÷ : one ladder step every CONFIG.multHitsPerStep hits (÷3 → ÷2 → ×2 → ×3 …).
 *  rare gates do not change when shot (they still stop the bullet).
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

/** Display label of a soldier gate: "+5", "−3", "×2", "÷3". */
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

/**
 * Apply any gate to the player stats { soldiers, rateMult, damageMult, weapon } (mutates).
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
    if (stats.weapon < CONFIG.weapons.length - 1) stats.weapon++;
    else stats.damageMult = Math.min(CONFIG.stats.maxDamageMult, stats.damageMult * CONFIG.gates.rare.weaponMaxedDamage);
  }
  return { before, after: stats.soldiers };
}

/** Total firepower (DPS) of a stats block — what the "reasonable path" maximizes. */
export function statsPower(s) {
  return s.soldiers * weaponDps(s.weapon) * s.rateMult * s.damageMult;
}

/** Firepower after crossing gate g (stats untouched). */
export function powerAfter(stats, g) {
  const s = { soldiers: stats.soldiers, rateMult: stats.rateMult, damageMult: stats.damageMult, weapon: stats.weapon };
  applyGate(s, g);
  return statsPower(s);
}
