// Pure formulas: costs, production, energy, storage, times, Action Points.
import { BUILDINGS, RESEARCH, UNITS, SHIPS, DRIVE_BONUS } from './data.js';

export const DEFAULT_SETTINGS = {
  speed: 4,                 // economy speed (production ×, build time ÷), like universe speed
  fleetSpeed: 1,            // fleet speed multiplier
  turnHours: 6,             // game hours each turn represents
  hoursPerAp: 0.5,          // game hours of queue work one AP buys
  apCapTurns: 2,            // unused AP carries over up to this many turns' worth
  fleetSecondsPerTurn: 600, // flight seconds that fit in one turn
  galaxies: 3,
  systems: 50,
  debrisRatio: 0.3,
  defenceRebuild: 0.7,
  deadlineHours: 24,        // 0 = no deadline
};

export const apPerTurn = (s) => s.turnHours / s.hoursPerAp;
export const apCap = (s) => apPerTurn(s) * s.apCapTurns;

// Cost of reaching `level` (the level being built), as [m, c, d].
export function levelCost(id, level) {
  const def = BUILDINGS[id] || RESEARCH[id];
  const f = Math.pow(def.factor, level - 1);
  return def.cost.map((v) => Math.floor(v * f));
}

// Energy needed for buildings/research that require stored energy (terraformer, graviton).
export function levelEnergy(id, level) {
  const def = BUILDINGS[id] || RESEARCH[id];
  if (!def.energyCost) return 0;
  return id === 'graviton' ? def.energyCost * Math.pow(3, level - 1) : def.energyCost * Math.pow(2, level - 1);
}

export const unitCost = (id, n = 1) => UNITS[id].cost.map((v) => v * n);

export function buildHours(cost, b, s) {
  return (cost[0] + cost[1]) / (2500 * (1 + (b.robotics || 0)) * Math.pow(2, b.nanite || 0)) / s.speed;
}

export function researchHours(cost, labLevel, s) {
  return (cost[0] + cost[1]) / (1000 * (1 + labLevel)) / s.speed;
}

export function unitHours(id, b, s) {
  const c = UNITS[id].cost;
  return (c[0] + c[1]) / (2500 * (1 + (b.shipyard || 0)) * Math.pow(2, b.nanite || 0)) / s.speed;
}

// Whole AP for a building level / research level (minimum 1).
export const hoursToAp = (h, s) => Math.max(1, Math.ceil(h / s.hoursPerAp - 1e-9));
// Fractional AP for ships (batches are paid continuously).
export const unitAp = (id, b, s) => unitHours(id, b, s) / s.hoursPerAp;

export function storageCap(level) {
  return 5000 * Math.floor(2.5 * Math.exp((20 * level) / 33));
}

export const satEnergy = (tmax) => Math.max(0, Math.floor((tmax + 140) / 6));

// Hourly production / energy breakdown for a planet. `tech` = player research levels.
export function production(planet, tech) {
  const b = planet.buildings;
  const pct = planet.pct || {};
  const p = (id) => (pct[id] ?? 100) / 100;
  const L = (id) => b[id] || 0;
  const g = (lvl) => lvl * Math.pow(1.1, lvl);

  const energyProd =
    20 * g(L('solarPlant')) * p('solarPlant') +
    30 * L('fusionPlant') * Math.pow(1.05 + 0.01 * (tech.energyTech || 0), L('fusionPlant')) * p('fusionPlant') +
    satEnergy(planet.tmax) * (planet.units.solarSat || 0) * p('solarSat');
  const energyUse =
    10 * g(L('metalMine')) * p('metalMine') +
    10 * g(L('crystalMine')) * p('crystalMine') +
    20 * g(L('deutSynth')) * p('deutSynth');
  const factor = energyUse > 0 ? Math.min(1, energyProd / energyUse) : 1;

  const plasma = tech.plasmaTech || 0;
  const metal = (30 * g(L('metalMine')) * p('metalMine') * factor) * (1 + 0.01 * plasma) + 30;
  const crystal = (20 * g(L('crystalMine')) * p('crystalMine') * factor) * (1 + 0.0066 * plasma) + 15;
  const deut = 10 * g(L('deutSynth')) * (1.28 - 0.002 * planet.tmax) * p('deutSynth') * factor * (1 + 0.0033 * plasma)
    - 10 * g(L('fusionPlant')) * p('fusionPlant');

  if (planet.isMoon) return { metal: 0, crystal: 0, deut: 0, energyProd: 0, energyUse: 0, factor: 1 };
  return { metal, crystal, deut, energyProd: Math.floor(energyProd), energyUse: Math.ceil(energyUse), factor };
}

export function caps(planet) {
  const b = planet.buildings;
  return [storageCap(b.metalStore || 0), storageCap(b.crystalStore || 0), storageCap(b.deutStore || 0)];
}

export function maxFields(planet) {
  return planet.fields + 5 * (planet.buildings.terraformer || 0);
}
export function usedFields(planet) {
  return Object.values(planet.buildings).reduce((a, v) => a + v, 0);
}

// Max planets (home + colonies) from Astrophysics.
export const maxPlanets = (tech) => 1 + Math.ceil((tech.astrophysics || 0) / 2);

// --- Fleets ---------------------------------------------------------------

export function shipDrive(id, tech) {
  const d = SHIPS[id];
  let drive = d.drive, speed = d.speed, fuel = d.fuel;
  for (const u of d.upgrades || []) {
    if ((tech[u.tech] || 0) >= u.level) ({ drive, speed, fuel } = u);
  }
  return { drive, speed, fuel };
}

export function shipSpeed(id, tech) {
  const { drive, speed } = shipDrive(id, tech);
  if (!drive) return 0;
  return Math.floor(speed * (1 + DRIVE_BONUS[drive] * (tech[drive] || 0)));
}

export function distance(a, b) {
  if (a.g !== b.g) return 20000 * Math.abs(a.g - b.g);
  if (a.s !== b.s) return 2700 + 95 * Math.abs(a.s - b.s);
  if (a.p !== b.p) return 1000 + 5 * Math.abs(a.p - b.p);
  return 5;
}

// pct: 10..100. Returns flight seconds (one way).
export function flightSeconds(dist, slowest, pct, s) {
  return Math.round((10 + (3500 / (pct / 10)) * Math.sqrt((10 * dist) / slowest)) / s.fleetSpeed);
}

export function flightTurns(seconds, s) {
  return Math.max(1, Math.ceil(seconds / s.fleetSecondsPerTurn));
}

export function fuelUse(ships, dist, seconds, tech, s) {
  let total = 0;
  const dur = seconds * s.fleetSpeed;
  for (const [id, n] of Object.entries(ships)) {
    if (!n) continue;
    const spd = shipSpeed(id, tech);
    const { fuel } = shipDrive(id, tech);
    const sv = (35000 / Math.max(1, dur - 10)) * Math.sqrt((dist * 10) / spd);
    total += fuel * n * (dist / 35000) * Math.pow(sv / 10 + 1, 2);
  }
  return Math.round(total) + 1;
}

export function cargoCapacity(ships) {
  let c = 0;
  for (const [id, n] of Object.entries(ships)) c += (SHIPS[id]?.cargo || 0) * n;
  return c;
}

// --- Requirements ---------------------------------------------------------

export function meetsReq(req, buildings, tech) {
  if (!req) return true;
  for (const [id, lvl] of Object.entries(req)) {
    const have = id in BUILDINGS ? buildings[id] || 0 : tech[id] || 0;
    if (have < lvl) return false;
  }
  return true;
}

// --- Score ----------------------------------------------------------------

const sum3 = (c) => c[0] + c[1] + c[2];
export function levelsValue(id, lvl) {
  let v = 0;
  for (let i = 1; i <= lvl; i++) v += sum3(levelCost(id, i));
  return v;
}
