// Battle simulation, unit by unit, following the classic combat rules:
// - up to 6 rounds; every unit fires once per round at a random enemy unit
// - a shot weaker than 1% of the target's shield bounces off
// - shield damage is taken in whole percents of the max shield; overflow hits the hull
// - shields fully regenerate each round
// - a unit whose hull is below 70% explodes with chance 1 - hull/maxHull after each hit
// - rapid fire: after a shot at a target type with RF r, fire again with chance (r-1)/r
// - weapons / shielding / armour tech: +10% per level
import { UNITS, SHIPS, DEFENCES } from './data.js';

const IDS = Object.keys(UNITS);
const IDX = Object.fromEntries(IDS.map((id, i) => [id, i]));
const RF = IDS.map((id) => {
  const row = new Float64Array(IDS.length);
  for (const [t, v] of Object.entries(UNITS[id].rf || {})) row[IDX[t]] = v;
  return row;
});

function buildSide(units, tech) {
  const n = Object.values(units).reduce((a, v) => a + (v || 0), 0);
  const type = new Uint8Array(n), hull = new Float64Array(n), shield = new Float64Array(n);
  const maxHull = new Float64Array(IDS.length), maxShield = new Float64Array(IDS.length), atk = new Float64Array(IDS.length);
  let k = 0;
  for (const id of IDS) {
    const c = units[id] || 0;
    if (!c) continue;
    const d = UNITS[id], i = IDX[id];
    maxHull[i] = ((d.cost[0] + d.cost[1]) / 10) * (1 + 0.1 * (tech.armourTech || 0));
    maxShield[i] = d.shield * (1 + 0.1 * (tech.shieldingTech || 0));
    atk[i] = d.attack * (1 + 0.1 * (tech.weaponsTech || 0));
    for (let j = 0; j < c; j++, k++) { type[k] = i; hull[k] = maxHull[i]; shield[k] = maxShield[i]; }
  }
  return { n, type, hull, shield, maxHull, maxShield, atk };
}

function fire(shooter, target, rng, stats) {
  for (let u = 0; u < shooter.n; u++) {
    const st = shooter.type[u];
    const dmg = shooter.atk[st];
    let again = true;
    while (again) {
      const t = rng.int(target.n);
      const tt = target.type[t];
      stats.shots++;
      if (target.hull[t] > 0) {
        const ms = target.maxShield[tt];
        if (dmg < 0.01 * ms) {
          stats.absorbed += dmg;
        } else if (dmg <= target.shield[t]) {
          // Shields lose damage in whole percents of their maximum.
          const lost = ms > 0 ? (Math.floor((dmg / ms) * 100) / 100) * ms : 0;
          target.shield[t] -= lost;
          stats.absorbed += dmg;
        } else {
          stats.absorbed += target.shield[t];
          stats.damage += dmg - target.shield[t];
          target.hull[t] -= dmg - target.shield[t];
          target.shield[t] = 0;
          if (target.hull[t] > 0) {
            const mh = target.maxHull[tt];
            if (target.hull[t] < 0.7 * mh && rng() < 1 - target.hull[t] / mh) target.hull[t] = 0;
          }
          if (target.hull[t] < 0) target.hull[t] = 0;
        }
      }
      const r = RF[st][tt];
      again = r > 1 && rng() < (r - 1) / r;
    }
  }
}

function compact(side) {
  let k = 0;
  for (let i = 0; i < side.n; i++) {
    if (side.hull[i] > 0) {
      side.type[k] = side.type[i];
      side.hull[k] = side.hull[i];
      side.shield[k] = side.maxShield[side.type[i]];
      k++;
    }
  }
  side.n = k;
}

function count(side) {
  const out = {};
  for (let i = 0; i < side.n; i++) {
    const id = IDS[side.type[i]];
    out[id] = (out[id] || 0) + 1;
  }
  return out;
}

const diff = (a, b) => {
  const o = {};
  for (const [id, v] of Object.entries(a)) if (v - (b[id] || 0) > 0) o[id] = v - (b[id] || 0);
  return o;
};

/**
 * attacker / defender: { units: {id: n}, tech: {...} }
 * Returns counts before/after, losses, per-round summaries and winner.
 */
export function simulateBattle(attacker, defender, rng, maxRounds = 6) {
  const A = buildSide(attacker.units, attacker.tech);
  const D = buildSide(defender.units, defender.tech);
  const startA = count(A), startD = count(D);
  const rounds = [];
  let r = 0;
  while (r < maxRounds && A.n > 0 && D.n > 0) {
    const sa = { shots: 0, damage: 0, absorbed: 0 }, sd = { shots: 0, damage: 0, absorbed: 0 };
    fire(A, D, rng, sa);
    fire(D, A, rng, sd);
    compact(A);
    compact(D);
    r++;
    rounds.push({ attacker: sa, defender: sd, attackerLeft: count(A), defenderLeft: count(D) });
  }
  const endA = count(A), endD = count(D);
  const winner = A.n > 0 && D.n === 0 ? 'attacker' : D.n > 0 && A.n === 0 ? 'defender' : A.n === 0 && D.n === 0 ? 'draw' : 'draw';
  return {
    winner, rounds,
    attackerStart: startA, defenderStart: startD,
    attackerEnd: endA, defenderEnd: endD,
    attackerLost: diff(startA, endA), defenderLost: diff(startD, endD),
  };
}

// Debris from destroyed ships (defences leave none), as [metal, crystal].
export function debrisFrom(lost, ratio) {
  let m = 0, c = 0;
  for (const [id, n] of Object.entries(lost)) {
    if (!SHIPS[id]) continue;
    m += SHIPS[id].cost[0] * n;
    c += SHIPS[id].cost[1] * n;
  }
  return [Math.floor(m * ratio), Math.floor(c * ratio)];
}

// Each destroyed defence unit is rebuilt with probability `chance`.
export function rebuildDefences(lost, chance, rng) {
  const back = {};
  for (const [id, n] of Object.entries(lost)) {
    if (!DEFENCES[id]) continue;
    let k = 0;
    if (n > 1000) k = Math.round(n * chance); // large stacks: expected value, keeps it fast
    else for (let i = 0; i < n; i++) if (rng() < chance) k++;
    if (k) back[id] = k;
  }
  return back;
}

// Classic plunder: up to 50% of each resource, filled metal → crystal → deut in thirds/halves.
export function plunder(available, capacity) {
  const max = available.map((v) => Math.floor(v / 2));
  const take = [0, 0, 0];
  let cap = capacity;
  const grab = (i, lim) => { const v = Math.max(0, Math.min(max[i] - take[i], lim, cap)); take[i] += v; cap -= v; };
  grab(0, Math.floor(capacity / 3));
  grab(1, Math.floor(cap / 2));
  grab(2, cap);
  grab(0, Math.floor(cap / 2));
  grab(1, cap);
  grab(0, cap);
  return take;
}

export const moonChance = (debris) => Math.min(20, Math.floor((debris[0] + debris[1]) / 100000));
