// Persistent save (coins, upgrades, records, settings). localStorage is ALWAYS wrapped in
// try/catch: in a private window / blocked storage the game simply runs without saving.
import { THEME } from './theme.js';
import { emptyUpgrades } from './economy.js';

const KEY = () => `${THEME.id}:save:v1`;

export function defaultSave() {
  return {
    coins: 0,
    upgrades: emptyUpgrades(),
    records: {
      campaign: { bestLevel: 0, bestScore: 0 },
      endless: { bestScore: 0, bestDistance: 0 },
    },
    settings: { lang: null, music: true, sfx: true },
  };
}

function merge(base, data) {
  if (!data || typeof data !== 'object') return base;
  for (const k of Object.keys(base)) {
    const v = data[k];
    if (v === undefined || v === null) continue;
    if (typeof base[k] === 'object' && base[k] !== null) merge(base[k], v);
    else if (typeof v === typeof base[k] || base[k] === null) base[k] = v;
  }
  return base;
}

export function loadSave() {
  const s = defaultSave();
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(KEY());
    if (raw) merge(s, JSON.parse(raw));
  } catch { /* no storage: defaults */ }
  if (!Number.isFinite(s.coins) || s.coins < 0) s.coins = 0;
  return s;
}

export function writeSave(save) {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(KEY(), JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
