// Game state, orders and turn resolution. Everything here is deterministic:
// resolveTurn(state, ordersByPlayer) gives the same result on every client.
import { BUILDINGS, RESEARCH, SHIPS, DEFENCES, UNITS, SLOTS, HOME_FIELDS, START_RESOURCES } from './data.js';
import * as F from './formulas.js';
import { makeRng, mixSeed } from './rng.js';
import { simulateBattle, debrisFrom, rebuildDefences, plunder, moonChance } from './combat.js';

export const COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#e57373', '#ba68c8', '#fff176', '#4db6ac', '#f06292'];

const clone = (o) => JSON.parse(JSON.stringify(o));
export const coordKey = (c) => `${c.g}:${c.s}:${c.p}`;
const nid = (state, prefix) => `${prefix}${state.nextId++}`;

// ---------------------------------------------------------------- creation

export function createGame({ seed = Date.now() % 2147483647, settings = {}, players = [] } = {}) {
  const s = { ...F.DEFAULT_SETTINGS, ...settings };
  const state = {
    version: 1, seed, turn: 1, settings: s, nextId: 1,
    players: {}, planets: {}, fleets: {}, debris: {}, reports: [],
  };
  const rng = makeRng(mixSeed(seed, 'setup'));
  players.forEach((p, i) => addPlayer(state, p, rng, i));
  return state;
}

export function addPlayer(state, { id, name }, rng = makeRng(mixSeed(state.seed, 'join', id)), i = Object.keys(state.players).length) {
  const s = state.settings;
  state.players[id] = {
    id, name, color: COLORS[i % COLORS.length], tech: {},
    ap: { research: F.apPerTurn(s) }, researchQueue: [],
  };
  // Home planet: random free slot in positions 4–12, spread over the galaxies.
  let coords;
  for (let tries = 0; tries < 1000; tries++) {
    coords = { g: 1 + ((i + tries) % s.galaxies), s: rng.range(1, s.systems), p: rng.range(4, 12) };
    if (!bodyAt(state, coords, 'planet')) break;
  }
  const slot = SLOTS[coords.p];
  newPlanet(state, id, coords, { fields: HOME_FIELDS, tmax: Math.round((slot[2] + slot[3]) / 2), name: 'Homeworld', home: true });
  return state.players[id];
}

function newPlanet(state, owner, coords, { fields, tmax, name, isMoon = false, home = false }) {
  const s = state.settings;
  const id = nid(state, isMoon ? 'm' : 'p');
  state.planets[id] = {
    id, owner, name, g: coords.g, s: coords.s, p: coords.p, isMoon, home, fields, tmax,
    res: isMoon ? [0, 0, 0] : home ? [...START_RESOURCES] : [0, 0, 0],
    buildings: {}, units: {}, pct: {},
    ap: { build: F.apPerTurn(s), ship: F.apPerTurn(s) },
    buildQueue: [], shipQueue: [], moon: null,
  };
  return state.planets[id];
}

export function bodyAt(state, c, kind = 'planet') {
  for (const pl of Object.values(state.planets)) {
    if (pl.g === c.g && pl.s === c.s && pl.p === c.p && pl.isMoon === (kind === 'moon')) return pl;
  }
  return null;
}

export const playerPlanets = (state, pid) =>
  Object.values(state.planets).filter((p) => p.owner === pid).sort((a, b) => (a.isMoon - b.isMoon) || a.id.localeCompare(b.id, undefined, { numeric: true }));

// ------------------------------------------------------------ helpers / info

const add3 = (a, b, k = 1) => { a[0] += b[0] * k; a[1] += b[1] * k; a[2] += b[2] * k; };
const has3 = (a, b) => a[0] >= b[0] - 1e-9 && a[1] >= b[1] - 1e-9 && a[2] >= b[2] - 1e-9;

export function effectiveLab(state, pid, planet) {
  const labs = playerPlanets(state, pid).filter((p) => !p.isMoon && p.id !== planet.id)
    .map((p) => p.buildings.lab || 0).sort((a, b) => b - a);
  const net = state.players[pid].tech.researchNet || 0;
  return (planet.buildings.lab || 0) + labs.slice(0, net).reduce((a, v) => a + v, 0);
}

// Everything the UI needs to show for the next level of a building.
export function buildInfo(state, pid, planetId, id) {
  const pl = state.planets[planetId], pr = state.players[pid], s = state.settings;
  const queued = pl.buildQueue.filter((q) => q.id === id).length;
  const level = (pl.buildings[id] || 0) + queued + 1;
  const cost = F.levelCost(id, level);
  const ap = F.hoursToAp(F.buildHours(cost, pl.buildings, s), s);
  const energy = F.levelEnergy(id, level);
  let error = null;
  if (pl.owner !== pid) error = 'notYours';
  else if (pl.isMoon) error = 'moonNoBuild';
  else if (!F.meetsReq(BUILDINGS[id].req, pl.buildings, pr.tech)) error = 'requirements';
  else if (F.usedFields(pl) + pl.buildQueue.length >= F.maxFields(pl)) error = 'noFields';
  else if (!has3(pl.res, cost)) error = 'resources';
  else if (energy && F.production(pl, pr.tech).energyProd < energy) error = 'energy';
  return { id, level, cost, ap, energy, error, instant: !error && pl.buildQueue.length === 0 && pl.ap.build >= ap };
}

export function researchInfo(state, pid, planetId, id) {
  const pl = state.planets[planetId], pr = state.players[pid], s = state.settings;
  const queued = pr.researchQueue.filter((q) => q.id === id).length;
  const level = (pr.tech[id] || 0) + queued + 1;
  const cost = F.levelCost(id, level);
  const lab = effectiveLab(state, pid, pl);
  const ap = id === 'graviton' ? 1 : F.hoursToAp(F.researchHours(cost, lab, s), s);
  const energy = F.levelEnergy(id, level);
  let error = null;
  if (pl.owner !== pid || pl.isMoon) error = 'notYours';
  else if (!(pl.buildings.lab > 0)) error = 'noLab';
  else if (!F.meetsReq(RESEARCH[id].req, pl.buildings, pr.tech)) error = 'requirements';
  else if (!has3(pl.res, cost)) error = 'resources';
  else if (energy && F.production(pl, pr.tech).energyProd < energy) error = 'energy';
  return { id, level, cost, ap, energy, error, instant: !error && pr.researchQueue.length === 0 && pr.ap.research >= ap };
}

export function unitInfo(state, pid, planetId, id) {
  const pl = state.planets[planetId], pr = state.players[pid], s = state.settings;
  const cost = F.unitCost(id);
  const apEach = F.unitAp(id, pl.buildings, s);
  let error = null;
  let max = Infinity;
  for (let i = 0; i < 3; i++) if (cost[i] > 0) max = Math.min(max, Math.floor(pl.res[i] / cost[i]));
  const lim = UNITS[id].max;
  if (lim) max = Math.min(max, lim - (pl.units[id] || 0) - pl.shipQueue.filter((q) => q.id === id).reduce((a, q) => a + q.count, 0));
  if (pl.owner !== pid) error = 'notYours';
  else if (pl.isMoon) error = 'moonNoBuild';
  else if (!(pl.buildings.shipyard > 0)) error = 'noShipyard';
  else if (!F.meetsReq(UNITS[id].req, pl.buildings, pr.tech)) error = 'requirements';
  else if (max <= 0) error = lim && max <= 0 && has3(pl.res, cost) ? 'maxReached' : 'resources';
  return { id, cost, apEach, max: Math.max(0, max), error };
}

// ------------------------------------------------------------------ queues

function runBuildQueue(state, pl) {
  while (pl.buildQueue.length && pl.ap.build > 1e-9) {
    const q = pl.buildQueue[0];
    const take = Math.min(pl.ap.build, q.apLeft);
    pl.ap.build -= take; q.apLeft -= take;
    if (q.apLeft > 1e-9) break;
    pl.buildings[q.id] = (pl.buildings[q.id] || 0) + 1;
    pl.buildQueue.shift();
  }
}

function runResearchQueue(state, pr) {
  while (pr.researchQueue.length && pr.ap.research > 1e-9) {
    const q = pr.researchQueue[0];
    const take = Math.min(pr.ap.research, q.apLeft);
    pr.ap.research -= take; q.apLeft -= take;
    if (q.apLeft > 1e-9) break;
    pr.tech[q.id] = (pr.tech[q.id] || 0) + 1;
    pr.researchQueue.shift();
  }
}

function runShipQueue(state, pl) {
  while (pl.shipQueue.length && pl.ap.ship > 1e-9) {
    const q = pl.shipQueue[0];
    const avail = pl.ap.ship + q.progress;
    const n = Math.min(q.count, Math.floor(avail / q.apEach + 1e-9));
    if (n > 0) {
      pl.units[q.id] = (pl.units[q.id] || 0) + n;
      q.count -= n;
      const used = n * q.apEach - q.progress;
      q.progress = 0;
      pl.ap.ship = Math.max(0, pl.ap.ship - used);
    }
    if (q.count === 0) { pl.shipQueue.shift(); continue; }
    q.progress += pl.ap.ship;
    pl.ap.ship = 0;
  }
}

// ------------------------------------------------------------------ orders

// Applies one order for player `pid`. Returns null on success or an error code.
export function applyOrder(state, pid, o) {
  const pr = state.players[pid];
  if (!pr) return 'noPlayer';
  const pl = o.planet ? state.planets[o.planet] : null;
  if (o.planet && (!pl || pl.owner !== pid)) return 'notYours';
  const s = state.settings;

  switch (o.type) {
    case 'build': {
      if (!BUILDINGS[o.id]) return 'unknown';
      const info = buildInfo(state, pid, pl.id, o.id);
      if (info.error) return info.error;
      add3(pl.res, info.cost, -1);
      pl.buildQueue.push({ id: o.id, level: info.level, apLeft: info.ap, apTotal: info.ap, cost: info.cost });
      runBuildQueue(state, pl);
      return null;
    }
    case 'cancelBuild': {
      // Only the last queued item can be cancelled (keeps levels consistent); full refund.
      const q = pl.buildQueue[pl.buildQueue.length - 1];
      if (!q) return 'empty';
      add3(pl.res, q.cost);
      pl.ap.build = Math.min(F.apCap(s), pl.ap.build + q.apTotal - q.apLeft);
      pl.buildQueue.pop();
      return null;
    }
    case 'research': {
      if (!RESEARCH[o.id]) return 'unknown';
      const info = researchInfo(state, pid, pl.id, o.id);
      if (info.error) return info.error;
      add3(pl.res, info.cost, -1);
      pr.researchQueue.push({ id: o.id, level: info.level, apLeft: info.ap, apTotal: info.ap, cost: info.cost, planet: pl.id });
      runResearchQueue(state, pr);
      return null;
    }
    case 'cancelResearch': {
      const q = pr.researchQueue[pr.researchQueue.length - 1];
      if (!q) return 'empty';
      const from = state.planets[q.planet];
      if (from && from.owner === pid) add3(from.res, q.cost);
      pr.ap.research = Math.min(F.apCap(s), pr.ap.research + q.apTotal - q.apLeft);
      pr.researchQueue.pop();
      return null;
    }
    case 'units': {
      if (!UNITS[o.id]) return 'unknown';
      const n = Math.floor(o.count);
      if (!(n > 0)) return 'badCount';
      const info = unitInfo(state, pid, pl.id, o.id);
      if (info.error) return info.error;
      if (n > info.max) return 'resources';
      add3(pl.res, info.cost, -n);
      pl.shipQueue.push({ id: o.id, count: n, apEach: info.apEach, progress: 0 });
      runShipQueue(state, pl);
      return null;
    }
    case 'pct': {
      const v = Math.round(o.value / 10) * 10;
      if (!(v >= 0 && v <= 100)) return 'badValue';
      pl.pct[o.id] = v;
      return null;
    }
    case 'rename': {
      pl.name = String(o.name || '').slice(0, 20) || pl.name;
      return null;
    }
    case 'fleet':
      return dispatchFleet(state, pid, o);
    case 'recall': {
      const f = state.fleets[o.fleet];
      if (!f || f.owner !== pid || f.state !== 'out') return 'badFleet';
      const t0 = (state.turn - 1) * s.fleetSecondsPerTurn;
      const elapsed = Math.max(0, t0 - f.departAt);
      f.state = 'back';
      f.arriveAt = t0 + Math.max(1, elapsed);
      return null;
    }
    default:
      return 'unknown';
  }
}

export function fleetPlan(state, pid, o) {
  const s = state.settings, pr = state.players[pid];
  const from = state.planets[o.from];
  const ships = Object.fromEntries(Object.entries(o.ships || {}).filter(([, n]) => n > 0).map(([k, n]) => [k, Math.floor(n)]));
  const ids = Object.keys(ships);
  if (!from || from.owner !== pid) return { error: 'notYours' };
  if (!ids.length) return { error: 'noShips' };
  for (const id of ids) {
    if (!SHIPS[id] || SHIPS[id].stationary) return { error: 'badShips' };
    if ((from.units[id] || 0) < ships[id]) return { error: 'notEnoughShips' };
  }
  const to = { g: o.to.g | 0, s: o.to.s | 0, p: o.to.p | 0 };
  if (to.g < 1 || to.g > s.galaxies || to.s < 1 || to.s > s.systems || to.p < 1 || to.p > 15) return { error: 'badTarget' };
  const kind = o.to.kind || 'planet';
  const speed = Math.min(100, Math.max(10, Math.round((o.speed || 100) / 10) * 10));
  const slowest = Math.min(...ids.map((id) => F.shipSpeed(id, pr.tech)));
  const dist = F.distance(from, to);
  const seconds = F.flightSeconds(dist, slowest, speed, s);
  const fuel = F.fuelUse(ships, dist, seconds, pr.tech, s);
  const capacity = F.cargoCapacity(ships);
  const cargo = (o.cargo || [0, 0, 0]).map((v) => Math.max(0, Math.floor(v || 0)));
  const target = kind === 'debris' ? null : bodyAt(state, to, kind);
  let error = null;
  const m = o.mission;
  if (coordKey(from) === coordKey(to) && from.isMoon === (kind === 'moon') && kind !== 'debris') error = 'sameBody';
  else if (m === 'transport' && !target) error = 'noTarget';
  else if (m === 'deploy' && (!target || target.owner !== pid)) error = 'deployOwn';
  else if (m === 'attack' && (!target || target.owner === pid)) error = 'attackTarget';
  else if (m === 'espionage' && (!target || target.owner === pid || ids.some((id) => id !== 'probe'))) error = 'spyTarget';
  else if (m === 'colonize' && (kind !== 'planet' || target || !ships.colonyShip)) error = 'colonizeTarget';
  else if (m === 'recycle' && (kind !== 'debris' || !ships.recycler)) error = 'recycleTarget';
  else if (!['transport', 'deploy', 'attack', 'espionage', 'colonize', 'recycle'].includes(m)) error = 'badMission';
  else if (cargo[0] + cargo[1] + cargo[2] > capacity) error = 'cargoFull';
  else if (!has3(from.res, [cargo[0], cargo[1], cargo[2] + fuel])) error = 'resources';
  return { error, ships, to: { ...to, kind }, speed, dist, seconds, turns: F.flightTurns(seconds, s), fuel, capacity, cargo, mission: m };
}

function dispatchFleet(state, pid, o) {
  const plan = fleetPlan(state, pid, o);
  if (plan.error) return plan.error;
  const from = state.planets[o.from], s = state.settings;
  for (const [id, n] of Object.entries(plan.ships)) from.units[id] -= n;
  add3(from.res, [plan.cargo[0], plan.cargo[1], plan.cargo[2] + plan.fuel], -1);
  const departAt = (state.turn - 1) * s.fleetSecondsPerTurn;
  const id = nid(state, 'f');
  state.fleets[id] = {
    id, owner: pid, from: from.id, origin: { g: from.g, s: from.s, p: from.p, kind: from.isMoon ? 'moon' : 'planet' },
    to: plan.to, mission: plan.mission, ships: plan.ships, cargo: plan.cargo, speed: plan.speed,
    fuel: plan.fuel, oneWay: plan.seconds, departAt, departTurn: state.turn, arriveAt: departAt + plan.seconds, state: 'out',
  };
  return null;
}

export const fleetArrivalTurn = (state, f) => Math.max(1, Math.ceil(f.arriveAt / state.settings.fleetSecondsPerTurn));

// --------------------------------------------------------------- resolution

function report(state, to, type, data) {
  state.reports.push({ id: nid(state, 'r'), turn: state.turn, to, type, data });
}

function produce(state) {
  const s = state.settings;
  for (const pl of Object.values(state.planets)) {
    if (pl.isMoon) continue;
    const pr = state.players[pl.owner];
    const prod = F.production(pl, pr.tech);
    const k = s.turnHours * s.speed;
    const cap = F.caps(pl);
    const amt = [prod.metal * k, prod.crystal * k, prod.deut * k];
    for (let i = 0; i < 3; i++) {
      if (amt[i] >= 0) { if (pl.res[i] < cap[i]) pl.res[i] = Math.min(cap[i], pl.res[i] + amt[i]); }
      else pl.res[i] = Math.max(0, pl.res[i] + amt[i]);
    }
  }
}

function returnFleet(f) {
  f.state = 'back';
  f.arriveAt = f.arriveAt + f.oneWay;
}

function land(state, f) {
  const home = state.planets[f.from] && state.planets[f.from].owner === f.owner
    ? state.planets[f.from]
    : playerPlanets(state, f.owner).find((p) => !p.isMoon);
  delete state.fleets[f.id];
  if (!home) return;
  for (const [id, n] of Object.entries(f.ships)) home.units[id] = (home.units[id] || 0) + n;
  add3(home.res, f.cargo);
}

function arrive(state, f, rng) {
  const s = state.settings;
  const target = f.to.kind === 'debris' ? null : bodyAt(state, f.to, f.to.kind);
  const at = coordKey(f.to);
  switch (f.mission) {
    case 'transport': {
      if (target) {
        add3(target.res, f.cargo);
        report(state, [...new Set([f.owner, target.owner])], 'transport', { fleet: f.id, from: f.origin, to: f.to, owner: f.owner, cargo: f.cargo });
        f.cargo = [0, 0, 0];
      }
      return returnFleet(f);
    }
    case 'deploy': {
      if (target && target.owner === f.owner) {
        for (const [id, n] of Object.entries(f.ships)) target.units[id] = (target.units[id] || 0) + n;
        add3(target.res, [f.cargo[0], f.cargo[1], f.cargo[2] + Math.floor(f.fuel / 2)]);
        report(state, [f.owner], 'deploy', { to: f.to, ships: f.ships, cargo: f.cargo });
        delete state.fleets[f.id];
        return;
      }
      return returnFleet(f);
    }
    case 'colonize': {
      const pr = state.players[f.owner];
      const owned = playerPlanets(state, f.owner).filter((p) => !p.isMoon).length;
      if (!target && owned < F.maxPlanets(pr.tech)) {
        const slot = SLOTS[f.to.p];
        const pl = newPlanet(state, f.owner, f.to, {
          fields: rng.range(slot[0], slot[1]), tmax: rng.range(slot[2], slot[3]), name: 'Colony',
        });
        add3(pl.res, f.cargo);
        f.cargo = [0, 0, 0];
        f.ships.colonyShip -= 1;
        if (!f.ships.colonyShip) delete f.ships.colonyShip;
        report(state, [f.owner], 'colonize', { to: f.to, ok: true, planet: pl.id, fields: pl.fields, tmax: pl.tmax });
      } else {
        report(state, [f.owner], 'colonize', { to: f.to, ok: false, reason: target ? 'occupied' : 'maxPlanets' });
      }
      if (Object.keys(f.ships).length) return returnFleet(f);
      delete state.fleets[f.id];
      return;
    }
    case 'recycle': {
      const d = state.debris[at];
      let got = [0, 0, 0];
      if (d) {
        const cap = Math.max(0, (f.ships.recycler || 0) * SHIPS.recycler.cargo - (f.cargo[0] + f.cargo[1] + f.cargo[2]));
        const tot = d[0] + d[1];
        const k = tot > cap ? cap / tot : 1;
        const m = Math.floor(d[0] * k), c = Math.min(d[1], Math.floor(d[1] * k));
        got = [m, c, 0];
        d[0] -= m; d[1] -= c;
        if (d[0] <= 0 && d[1] <= 0) delete state.debris[at];
        add3(f.cargo, got);
      }
      report(state, [f.owner], 'recycle', { to: f.to, got, left: state.debris[at] || [0, 0] });
      return returnFleet(f);
    }
    case 'espionage':
      return spy(state, f, target, rng);
    case 'attack':
      return attack(state, f, target, rng);
  }
}

function spy(state, f, target, rng) {
  if (!target) return returnFleet(f);
  const atk = state.players[f.owner], def = state.players[target.owner];
  const probes = f.ships.probe || 0;
  const ea = atk.tech.espionageTech || 0, ed = def.tech.espionageTech || 0;
  const level = ea >= ed ? probes + (ea - ed) ** 2 : probes - (ed - ea) ** 2;
  const defShips = Object.entries(target.units).filter(([id]) => SHIPS[id]).reduce((a, [, n]) => a + n, 0);
  const counter = Math.min(100, Math.round(defShips * probes * Math.pow(2, ed - ea) / 4));
  const data = { to: f.to, planet: target.name, owner: target.owner, level, counter, res: target.res.map(Math.floor) };
  if (level >= 2) data.fleet = Object.fromEntries(Object.entries(target.units).filter(([id, n]) => SHIPS[id] && n));
  if (level >= 3) data.defence = Object.fromEntries(Object.entries(target.units).filter(([id, n]) => DEFENCES[id] && n));
  if (level >= 5) data.buildings = { ...target.buildings };
  if (level >= 7) data.research = { ...def.tech };
  report(state, [f.owner], 'espionage', data);
  report(state, [target.owner], 'spotted', { by: f.owner, from: f.origin, to: f.to, counter });
  if (rng.int(100) < counter) {
    // Counter-espionage: the probes are destroyed by the defending fleet.
    const deb = debrisFrom(f.ships, state.settings.debrisRatio);
    addDebris(state, f.to, deb);
    report(state, [f.owner, target.owner], 'probesLost', { to: f.to, probes, debris: deb });
    delete state.fleets[f.id];
    return;
  }
  returnFleet(f);
}

function addDebris(state, c, deb) {
  if (deb[0] + deb[1] <= 0) return;
  const k = coordKey(c);
  const d = state.debris[k] || [0, 0];
  d[0] += deb[0]; d[1] += deb[1];
  state.debris[k] = d;
}

function attack(state, f, target, rng) {
  if (!target || target.owner === f.owner) return returnFleet(f);
  const s = state.settings;
  const atkP = state.players[f.owner], defP = state.players[target.owner];
  const defUnits = Object.fromEntries(Object.entries(target.units).filter(([, n]) => n > 0));
  const b = simulateBattle({ units: f.ships, tech: atkP.tech }, { units: defUnits, tech: defP.tech }, rng);
  const rebuilt = rebuildDefences(b.defenderLost, s.defenceRebuild, rng);
  const newUnits = { ...b.defenderEnd };
  for (const [id, n] of Object.entries(rebuilt)) newUnits[id] = (newUnits[id] || 0) + n;
  target.units = newUnits;
  const debris = [0, 0];
  for (const lost of [b.attackerLost, b.defenderLost]) {
    const d = debrisFrom(lost, s.debrisRatio);
    debris[0] += d[0]; debris[1] += d[1];
  }
  addDebris(state, f.to, debris);
  f.ships = b.attackerEnd;
  let loot = [0, 0, 0];
  if (b.winner === 'attacker') {
    const cap = F.cargoCapacity(f.ships) - (f.cargo[0] + f.cargo[1] + f.cargo[2]);
    loot = plunder(target.res.map(Math.floor), Math.max(0, cap));
    add3(target.res, loot, -1);
    add3(f.cargo, loot);
  }
  let moon = null;
  const chance = moonChance(debris);
  if (!target.isMoon && !target.moon && chance > 0 && rng.int(100) < chance) {
    const m = newPlanet(state, target.owner, target, {
      fields: 1, tmax: target.tmax - rng.range(10, 40), name: 'Moon', isMoon: true,
    });
    m.diameter = Math.floor(Math.pow(rng.range(10, 20) + 3 * chance, 0.5) * 1000);
    target.moon = m.id;
    moon = m.id;
  }
  report(state, [f.owner, target.owner], 'combat', {
    at: f.to, planet: target.name, attacker: f.owner, defender: target.owner,
    winner: b.winner, rounds: b.rounds.length,
    attackerStart: b.attackerStart, defenderStart: b.defenderStart,
    attackerLost: b.attackerLost, defenderLost: b.defenderLost, rebuilt,
    attackerTech: pickTech(atkP.tech), defenderTech: pickTech(defP.tech),
    loot, debris, moonChance: chance, moon,
  });
  if (Object.keys(f.ships).length) return returnFleet(f);
  delete state.fleets[f.id];
}

const pickTech = (t) => ({ weaponsTech: t.weaponsTech || 0, shieldingTech: t.shieldingTech || 0, armourTech: t.armourTech || 0 });

/**
 * Resolve a whole turn. ordersByPlayer: { pid: [order, ...] }.
 * Returns { state, errors } — a new state object; input is not mutated.
 */
export function resolveTurn(input, ordersByPlayer = {}) {
  const state = clone(input);
  const s = state.settings;
  const errors = {};
  for (const pid of Object.keys(state.players).sort()) {
    for (const o of ordersByPlayer[pid] || []) {
      const e = applyOrder(state, pid, o);
      if (e) (errors[pid] ||= []).push({ order: o, error: e });
    }
  }
  const rng = makeRng(mixSeed(state.seed, 'turn', state.turn));

  // 1. Refill AP, then let in-progress work absorb it.
  const per = F.apPerTurn(s), cap = F.apCap(s);
  for (const pr of Object.values(state.players)) {
    pr.ap.research = Math.min(cap, pr.ap.research + per);
    runResearchQueue(state, pr);
  }
  for (const pl of Object.values(state.planets)) {
    pl.ap.build = Math.min(cap, pl.ap.build + per);
    pl.ap.ship = Math.min(cap, pl.ap.ship + per);
    runBuildQueue(state, pl);
    runShipQueue(state, pl);
  }

  // 2. Production.
  produce(state);

  // 3. Fleet events up to the end of this turn, in time order.
  const end = state.turn * s.fleetSecondsPerTurn;
  for (let guard = 0; guard < 100000; guard++) {
    const due = Object.values(state.fleets).filter((f) => f.arriveAt <= end)
      .sort((a, b) => a.arriveAt - b.arriveAt || a.id.localeCompare(b.id, undefined, { numeric: true }));
    if (!due.length) break;
    const f = due[0];
    if (f.state === 'back') land(state, f);
    else arrive(state, f, rng);
  }

  state.turn += 1;
  // Keep the report log bounded.
  if (state.reports.length > 2000) state.reports = state.reports.slice(-2000);
  return { state, errors };
}

// Preview: apply a player's pending orders to a copy, for the planning UI.
export function preview(state, pid, orders) {
  const st = clone(state);
  const errors = [];
  for (const o of orders) {
    const e = applyOrder(st, pid, o);
    errors.push(e);
  }
  return { state: st, errors };
}

// ---------------------------------------------------------------- score

export function score(state, pid) {
  const pr = state.players[pid];
  let eco = 0, research = 0, military = 0;
  for (const pl of playerPlanets(state, pid)) {
    for (const [id, l] of Object.entries(pl.buildings)) eco += F.levelsValue(id, l);
    for (const [id, n] of Object.entries(pl.units)) { const c = UNITS[id].cost; military += (c[0] + c[1] + c[2]) * n; }
  }
  for (const f of Object.values(state.fleets)) if (f.owner === pid)
    for (const [id, n] of Object.entries(f.ships)) { const c = UNITS[id].cost; military += (c[0] + c[1] + c[2]) * n; }
  for (const [id, l] of Object.entries(pr.tech)) research += F.levelsValue(id, l);
  const k = (v) => Math.floor(v / 1000);
  return { total: k(eco + research + military), eco: k(eco), research: k(research), military: k(military) };
}
