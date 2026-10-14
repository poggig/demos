// Online adapter on Supabase. The engine runs on every client; the database only stores
// state, private per-player orders, and enforces turn locking (see supabase/schema.sql).
import { createGame, resolveTurn } from '../engine/game.js';
import * as CFG from '../../config.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
let clientPromise = null;

export function onlineConfig() {
  let url = CFG.SUPABASE_URL, key = CFG.SUPABASE_ANON_KEY;
  try {
    url = localStorage.getItem('starfall.sbUrl') || url;
    key = localStorage.getItem('starfall.sbKey') || key;
  } catch {}
  return { url, key, ok: !!(url && key) };
}

export function saveOnlineConfig(url, key) {
  try {
    localStorage.setItem('starfall.sbUrl', url.trim());
    localStorage.setItem('starfall.sbKey', key.trim());
  } catch {}
  clientPromise = null;
}

async function client() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { url, key, ok } = onlineConfig();
      if (!ok) throw new Error('not configured');
      const { createClient } = await import(SDK);
      const sb = createClient(url, key);
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) throw error;
      }
      return sb;
    })();
    clientPromise.catch(() => { clientPromise = null; });
  }
  return clientPromise;
}

const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

export async function myGames() {
  const sb = await client();
  const { data: u } = await sb.auth.getUser();
  const rows = must(await sb.from('members').select('game_id, player_id, name, games(id, code, name, status, turn, updated_at)').eq('user_id', u.user.id));
  return rows.filter((r) => r.games).map((r) => ({ ...r.games, me: r.player_id, myName: r.name }))
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function createOnline(name, playerName, settings) {
  const sb = await client();
  return must(await sb.rpc('create_game', { p_name: name, p_settings: settings, p_player: playerName }));
}

export async function joinOnline(code, playerName) {
  const sb = await client();
  return must(await sb.rpc('join_game', { p_code: code, p_player: playerName }));
}

export class OnlineGame {
  static async open(gameId) {
    const g = new OnlineGame(await client(), gameId);
    await g.refresh(true);
    return g;
  }

  constructor(sb, id) {
    this.mode = 'online';
    this.sb = sb;
    this.gameId = id;
    this.listeners = new Set();
    this.st = { submitted: {}, locked: false, deadline: null };
    this.draftOrders = [];
    this.timer = null;
    this.saveTimer = null;
    this.lastResolved = null;
    this.busy = false;
  }

  get id() { return this.gameId; }
  get state() { return this.game.state; }
  get me() { return this.member.player_id; }
  get draft() { return this.draftOrders; }
  get isHost() { return this.game.host === this.uid; }
  get lobby() { return this.game.status === 'lobby'; }
  status() { return this.st; }

  async refresh(first = false) {
    const sb = this.sb;
    if (!this.uid) this.uid = (await sb.auth.getUser()).data.user.id;
    const game = must(await sb.from('games').select('*').eq('id', this.gameId).single());
    const members = must(await sb.from('members').select('player_id, name, user_id').eq('game_id', this.gameId).order('player_id'));
    const turnChanged = !this.game || this.game.turn !== game.turn;
    if (this.game && turnChanged && this.game.status === 'running') this.lastResolved = { turn: this.game.turn };
    this.game = game;
    this.members = members;
    this.member = members.find((m) => m.user_id === this.uid);
    if (game.status === 'running') {
      if (turnChanged || first) {
        const mine = must(await sb.from('orders').select('orders, submitted').eq('game_id', this.gameId).eq('turn', game.turn).eq('player_id', this.me).maybeSingle());
        this.draftOrders = mine ? mine.orders : [];
      }
      const s = must(await sb.rpc('turn_status', { p_game: this.gameId }));
      this.st = { submitted: Object.fromEntries((s.submitted || []).map((p) => [p, true])), locked: s.locked, deadline: s.deadline };
      if (s.locked) await this.tryResolve();
    }
    if (!first) this.emit();
  }

  start(pollMs = 6000) {
    this.stop();
    this.timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.refresh().catch((e) => console.warn(e));
    }, pollMs);
  }
  stop() { clearInterval(this.timer); this.timer = null; }

  async startGame() {
    const players = this.members.map((m) => ({ id: m.player_id, name: m.name }));
    const state = createGame({ seed: Number(this.game.seed), settings: this.game.settings, players });
    must(await this.sb.rpc('start_game', { p_game: this.gameId, p_state: state }));
    await this.refresh();
  }

  saveDraft(orders) {
    this.draftOrders = orders;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.push(false).catch((e) => console.warn(e)), 800);
  }

  async push(submitted) {
    const row = { game_id: this.gameId, turn: this.game.turn, player_id: this.me, orders: this.draftOrders, submitted, updated_at: new Date().toISOString() };
    must(await this.sb.from('orders').upsert(row));
  }

  async submit(orders) {
    clearTimeout(this.saveTimer);
    this.draftOrders = orders;
    await this.push(true);
    this.st.submitted[this.me] = true;
    await this.refresh();
    return { resolved: !!this.lastResolved && this.lastResolved.turn === this.game.turn - 1 };
  }

  // Once the turn is locked, any client may resolve it; the first commit wins and
  // every client computes the identical state from the same orders.
  async tryResolve() {
    if (this.busy) return;
    this.busy = true;
    try {
      const turn = this.game.turn;
      try {
        const rows = must(await this.sb.rpc('locked_orders', { p_game: this.gameId, p_turn: turn }));
        const byPlayer = Object.fromEntries(rows.map((r) => [r.player_id, r.orders]));
        const { state } = resolveTurn(this.game.state, byPlayer);
        must(await this.sb.rpc('commit_turn', { p_game: this.gameId, p_turn: turn, p_state: state }));
      } catch (e) {
        // Another player's client resolved this turn first: that is fine, just reload.
        console.info('resolve skipped:', e.message);
      }
      this.busy = false;
      await this.refresh();
    } finally {
      this.busy = false;
    }
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }
  close() { this.stop(); this.listeners.clear(); }
}
