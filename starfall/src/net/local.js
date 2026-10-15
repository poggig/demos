// Local adapter: the whole game lives in this browser (hotseat, or solo testing).
// Same interface as the online adapter, so the UI does not care which one it talks to.
import { createGame, resolveTurn } from '../engine/game.js';

const KEY = 'starfall.local.';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
  keys() { try { return Object.keys(localStorage).filter((k) => k.startsWith(KEY)); } catch { return []; } },
};

export class LocalGame {
  static list() {
    return store.keys().map((k) => store.get(k)).filter(Boolean)
      .map((r) => ({ id: r.id, name: r.name, turn: r.state.turn, players: Object.values(r.state.players).map((p) => p.name), updated: r.updated }))
      .sort((a, b) => b.updated - a.updated);
  }

  static create({ name, names, settings, seed }) {
    const id = Math.random().toString(36).slice(2, 10);
    const players = names.map((n, i) => ({ id: `p${i + 1}`, name: n }));
    const state = createGame({ seed: seed ?? Math.floor(Math.random() * 2 ** 31), settings, players });
    const rec = { id, name: name || names.join(' vs '), state, drafts: {}, submitted: {}, seat: players[0].id, updated: Date.now() };
    store.set(KEY + id, rec);
    return new LocalGame(rec);
  }

  static load(id) {
    const rec = store.get(KEY + id);
    return rec ? new LocalGame(rec) : null;
  }

  static remove(id) { store.del(KEY + id); }

  constructor(rec) {
    this.mode = 'local';
    this.rec = rec;
    this.listeners = new Set();
    this.lastResolved = null;
  }

  get id() { return this.rec.id; }
  get state() { return this.rec.state; }
  get me() { return this.rec.seat; }
  get draft() { return this.rec.drafts[this.me] || []; }
  get hotseat() { return Object.keys(this.state.players).length > 1; }

  status() {
    return { submitted: { ...this.rec.submitted }, deadline: null };
  }

  save() {
    this.rec.updated = Date.now();
    store.set(KEY + this.rec.id, this.rec);
  }

  saveDraft(orders) {
    this.rec.drafts[this.me] = orders;
    this.save();
  }

  // Ends the current seat's turn. When every player has ended, the turn resolves.
  async submit(orders) {
    this.rec.drafts[this.me] = orders;
    this.rec.submitted[this.me] = true;
    const pids = Object.keys(this.state.players);
    const next = pids.find((p) => !this.rec.submitted[p]);
    let resolved = false;
    if (!next) {
      const { state, errors } = resolveTurn(this.state, this.rec.drafts);
      this.lastResolved = { turn: this.state.turn, errors };
      this.rec.state = state;
      this.rec.drafts = {};
      this.rec.submitted = {};
      this.rec.seat = pids[0];
      resolved = true;
    } else {
      this.rec.seat = next;
    }
    this.save();
    this.emit();
    return { resolved };
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }
  close() { this.listeners.clear(); }
}
