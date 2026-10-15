import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/engine/formulas.js';
import { simulateBattle, plunder, debrisFrom, moonChance } from '../src/engine/combat.js';
import { makeRng } from '../src/engine/rng.js';
import { createGame, applyOrder, resolveTurn, buildInfo, playerPlanets, fleetPlan, score } from '../src/engine/game.js';

const S = { ...F.DEFAULT_SETTINGS, speed: 1 };

test('costs follow base · factor^(L-1)', () => {
  assert.deepEqual(F.levelCost('metalMine', 1), [60, 15, 0]);
  assert.deepEqual(F.levelCost('metalMine', 10), [2306, 576, 0]);
  assert.deepEqual(F.levelCost('crystalMine', 5), [314, 157, 0]);
  assert.deepEqual(F.levelCost('robotics', 3), [1600, 480, 800]);
  assert.deepEqual(F.levelCost('astrophysics', 2), [7000, 14000, 7000]);
});

test('production formulas', () => {
  const pl = { buildings: { metalMine: 10, crystalMine: 10, deutSynth: 10, solarPlant: 20 }, units: {}, tmax: 40 };
  const p = F.production(pl, {});
  assert.equal(Math.round(p.metal), Math.round(30 * 10 * 1.1 ** 10 + 30));
  assert.equal(Math.round(p.crystal), Math.round(20 * 10 * 1.1 ** 10 + 15));
  assert.equal(Math.round(p.deut), Math.round(10 * 10 * 1.1 ** 10 * (1.28 - 0.08)));
  assert.equal(p.factor, 1);
  // Energy shortage scales mines down.
  const low = F.production({ ...pl, buildings: { ...pl.buildings, solarPlant: 1 } }, {});
  assert.ok(low.factor < 0.1 && low.metal < p.metal);
});

test('storage and fields', () => {
  assert.equal(F.storageCap(0), 10000);
  assert.equal(F.storageCap(1), 20000);
  assert.equal(F.storageCap(2), 40000);
  assert.equal(F.storageCap(3), 75000);
});

test('build time → AP, robotics and nanite make levels cheaper', () => {
  const cost = F.levelCost('metalMine', 20);
  const h0 = F.buildHours(cost, {}, S);
  const h10 = F.buildHours(cost, { robotics: 10 }, S);
  assert.ok(Math.abs(h0 / h10 - 11) < 1e-9);
  assert.equal(F.hoursToAp(0.01, S), 1);
  assert.equal(F.hoursToAp(h0, S), Math.ceil(h0 / 0.5));
  assert.equal(F.buildHours(cost, { robotics: 10, nanite: 1 }, S) * 2, h10);
});

test('fleet distance, duration, fuel', () => {
  assert.equal(F.distance({ g: 1, s: 1, p: 1 }, { g: 3, s: 1, p: 1 }), 40000);
  assert.equal(F.distance({ g: 1, s: 1, p: 1 }, { g: 1, s: 11, p: 1 }), 3650);
  assert.equal(F.distance({ g: 1, s: 1, p: 1 }, { g: 1, s: 1, p: 4 }), 1015);
  // 10 + 350·sqrt(10·1015/12500)
  assert.equal(F.flightSeconds(1015, 12500, 100, S), Math.round(10 + 350 * Math.sqrt(10 * 1015 / 12500)));
  assert.equal(F.shipSpeed('lightFighter', { combustion: 10 }), 25000);
  assert.equal(F.shipSpeed('smallCargo', { impulse: 5 }), 20000);
  const sec = F.flightSeconds(3650, 12500, 100, S);
  assert.ok(F.fuelUse({ lightFighter: 10 }, 3650, sec, {}, S) > 0);
});

test('combat is deterministic with a seed and follows obvious outcomes', () => {
  const a = { units: { battleship: 50 }, tech: {} };
  const d = { units: { rocketLauncher: 20 }, tech: {} };
  const r1 = simulateBattle(a, d, makeRng(7));
  const r2 = simulateBattle(a, d, makeRng(7));
  assert.deepEqual(r1, r2);
  assert.equal(r1.winner, 'attacker');
  assert.ok(r1.rounds.length <= 3); // random targeting can leave a launcher untouched in round 1
  // Probe shots (0.01) are under 1% of a dome's shield, so they bounce off.
  const dome = simulateBattle({ units: { probe: 100 }, tech: {} }, { units: { largeDome: 1 }, tech: {} }, makeRng(1));
  assert.deepEqual(dome.defenderLost, {});
  // Deathstar eats probes thanks to rapid fire.
  const ds = simulateBattle({ units: { deathstar: 1 }, tech: {} }, { units: { probe: 500 }, tech: {} }, makeRng(3));
  assert.equal(ds.winner, 'attacker');
});

test('plunder, debris and moon chance', () => {
  assert.deepEqual(plunder([100000, 100000, 100000], 1e9), [50000, 50000, 50000]);
  const p = plunder([90000, 30000, 30000], 30000);
  assert.equal(p[0] + p[1] + p[2], 30000);
  assert.deepEqual(debrisFrom({ lightFighter: 10, rocketLauncher: 5 }, 0.3), [9000, 3000]);
  assert.equal(moonChance([1_500_000, 600_000]), 20);
  assert.equal(moonChance([150_000, 0]), 1);
});

function twoPlayers() {
  return createGame({ seed: 42, settings: { speed: 1 }, players: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }] });
}

test('instant builds spend resources and AP; big ones carry over turns', () => {
  const st = twoPlayers();
  const home = playerPlanets(st, 'a')[0];
  assert.equal(applyOrder(st, 'a', { type: 'build', planet: home.id, id: 'metalMine' }), null);
  assert.equal(home.buildings.metalMine, 1);
  assert.equal(home.ap.build, 11);
  // Give a lot of resources and queue an expensive level.
  home.res = [1e7, 1e7, 1e7];
  home.buildings.metalMine = 19;
  const info = buildInfo(st, 'a', home.id, 'metalMine');
  assert.ok(info.ap > 12);
  assert.equal(applyOrder(st, 'a', { type: 'build', planet: home.id, id: 'metalMine' }), null);
  assert.equal(home.buildings.metalMine, 19);
  assert.equal(home.ap.build, 0);
  let s2 = st;
  for (let t = 0; t < 20 && playerPlanets(s2, 'a')[0].buildings.metalMine === 19; t++) s2 = resolveTurn(s2, {}).state;
  assert.equal(playerPlanets(s2, 'a')[0].buildings.metalMine, 20);
});

test('turn resolution is deterministic and produces resources', () => {
  const st = twoPlayers();
  const r1 = resolveTurn(st, {}).state, r2 = resolveTurn(st, {}).state;
  assert.equal(JSON.stringify(r1), JSON.stringify(r2));
  assert.equal(r1.turn, 2);
  const h = playerPlanets(r1, 'a')[0];
  assert.ok(Math.abs(h.res[0] - (500 + 30 * 6)) < 1e-6);
});

test('attack mission: battle, plunder, return', () => {
  const st = twoPlayers();
  const a = playerPlanets(st, 'a')[0], b = playerPlanets(st, 'b')[0];
  a.units.lightFighter = 200;
  a.units.largeCargo = 10;
  a.res[2] = 1e6;
  b.res = [400000, 200000, 100000];
  b.units.rocketLauncher = 5;
  const o = { type: 'fleet', from: a.id, to: { g: b.g, s: b.s, p: b.p }, mission: 'attack', ships: { lightFighter: 200, largeCargo: 10 }, speed: 100 };
  assert.equal(fleetPlan(st, 'a', o).error, null);
  let s = st;
  s = resolveTurn(s, { a: [o] }).state;
  for (let i = 0; i < 20 && Object.keys(s.fleets).length; i++) s = resolveTurn(s, {}).state;
  const combat = s.reports.find((r) => r.type === 'combat');
  assert.ok(combat, 'combat report');
  assert.equal(combat.data.winner, 'attacker');
  assert.ok(combat.data.loot[0] > 0);
  const a2 = playerPlanets(s, 'a')[0];
  assert.ok(a2.units.largeCargo === 10);
  assert.ok(score(s, 'a').military > 0);
});

test('colonize creates a planet with astrophysics', () => {
  const st = twoPlayers();
  const a = playerPlanets(st, 'a')[0];
  st.players.a.tech.astrophysics = 1;
  a.units.colonyShip = 1;
  a.res[2] = 1e5;
  const to = { g: a.g, s: a.s, p: a.p === 15 ? 14 : 15 };
  let s = resolveTurn(st, { a: [{ type: 'fleet', from: a.id, to, mission: 'colonize', ships: { colonyShip: 1 }, cargo: [100, 0, 0] }] }).state;
  for (let i = 0; i < 10 && Object.keys(s.fleets).length; i++) s = resolveTurn(s, {}).state;
  assert.equal(playerPlanets(s, 'a').length, 2);
});
