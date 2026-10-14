// Two simulated players drive OnlineGame against an in-memory stand-in for the Supabase API
// that mirrors supabase/schema.sql (turn locking, private orders, first-commit-wins).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OnlineGame } from '../src/net/online.js';
import { createGame, playerPlanets } from '../src/engine/game.js';

function backend() {
  const db = { games: [], members: [], orders: [] };
  const locked = (g) => g.status === 'running' && db.members.filter((m) => m.game_id === g.id).length ===
    db.orders.filter((o) => o.game_id === g.id && o.turn === g.turn && o.submitted).length;
  const client = (uid) => {
    const from = (table) => {
      const q = { filters: [], table };
      const rows = () => db[table].filter((r) => q.filters.every(([k, v]) => r[k] === v))
        .filter((r) => table !== 'orders' || r.user_id === uid);
      const api = {
        select() { return api; },
        eq(k, v) { q.filters.push([k, v]); return api; },
        order() { return api; },
        single: async () => ({ data: structuredClone(rows()[0]), error: rows()[0] ? null : { message: 'none' } }),
        maybeSingle: async () => ({ data: structuredClone(rows()[0] ?? null), error: null }),
        then: (res) => res({ data: structuredClone(rows()), error: null }),
        upsert: async (row) => {
          const g = db.games.find((x) => x.id === row.game_id);
          if (g.turn !== row.turn || locked(g)) return { data: null, error: { message: 'row-level security' } };
          const i = db.orders.findIndex((o) => o.game_id === row.game_id && o.turn === row.turn && o.player_id === row.player_id);
          const r = { ...structuredClone(row), user_id: uid };
          if (i >= 0) db.orders[i] = r; else db.orders.push(r);
          return { data: null, error: null };
        },
      };
      return api;
    };
    const rpc = async (name, a) => {
      const g = db.games.find((x) => x.id === a.p_game);
      if (name === 'turn_status') return { data: { turn: g.turn, locked: locked(g), deadline: null,
        submitted: db.orders.filter((o) => o.game_id === g.id && o.turn === g.turn && o.submitted).map((o) => o.player_id) }, error: null };
      if (name === 'locked_orders') {
        if (!locked(g) || g.turn !== a.p_turn) return { data: null, error: { message: 'turn not locked' } };
        return { data: db.orders.filter((o) => o.game_id === g.id && o.turn === g.turn).map((o) => ({ player_id: o.player_id, orders: structuredClone(o.orders) })), error: null };
      }
      if (name === 'commit_turn') {
        if (!locked(g) || g.turn !== a.p_turn) return { data: null, error: { message: 'turn not locked' } };
        g.state = JSON.parse(JSON.stringify(a.p_state)); g.turn += 1; db.commits = (db.commits || 0) + 1;
        return { data: true, error: null };
      }
      if (name === 'start_game') { g.status = 'running'; g.state = a.p_state; g.turn = a.p_state.turn; return { data: null, error: null }; }
      throw new Error(name);
    };
    return { from, rpc, auth: { getUser: async () => ({ data: { user: { id: uid } } }) } };
  };
  db.games.push({ id: 'g1', code: 'ABC123', name: 'T', host: 'uA', status: 'lobby', settings: {}, seed: 99, turn: 0, state: null });
  db.members.push({ game_id: 'g1', user_id: 'uA', player_id: 'p1', name: 'Ann' }, { game_id: 'g1', user_id: 'uB', player_id: 'p2', name: 'Bob' });
  return { db, client };
}

test('online flow: start, private drafts, lock on all submitted, single resolve, identical state', async () => {
  const { db, client } = backend();
  const A = new OnlineGame(client('uA'), 'g1'), B = new OnlineGame(client('uB'), 'g1');
  await A.refresh(true); await B.refresh(true);
  assert.ok(A.isHost && A.lobby && !B.isHost);
  await A.startGame();
  await B.refresh();
  assert.equal(A.state.turn, 1);
  assert.equal(B.me, 'p2');

  const homeA = playerPlanets(A.state, 'p1')[0], homeB = playerPlanets(B.state, 'p2')[0];
  await A.submit([{ type: 'build', planet: homeA.id, id: 'metalMine' }]);
  assert.equal(A.state.turn, 1, 'waits for Bob');
  assert.deepEqual(A.status().submitted, { p1: true });
  B.draftOrders = [{ type: 'build', planet: homeB.id, id: 'solarPlant' }];
  await B.push(false);
  assert.equal((await B.submit(B.draftOrders)).resolved, true);
  assert.equal(B.state.turn, 2);
  await A.refresh();
  assert.equal(A.state.turn, 2);
  assert.equal(db.commits, 1);
  assert.equal(A.state.planets[homeA.id].buildings.metalMine, 1);
  assert.equal(A.state.planets[homeB.id].buildings.solarPlant, 1);
  // Matches a local resolution of the same orders.
  assert.deepEqual(A.draft, []);
  const local = createGame({ seed: 99, settings: {}, players: [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bob' }] });
  assert.equal(JSON.stringify(local.planets[homeA.id].g), JSON.stringify(A.state.planets[homeA.id].g));
});
