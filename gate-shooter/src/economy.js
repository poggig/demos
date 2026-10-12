// Economy — pure: shop costs, upgrade effects, coin scaling.
import { CONFIG } from './config.js';

export const UPGRADES = ['start', 'damage', 'rate'];

export function emptyUpgrades() { return { start: 0, damage: 0, rate: 0 }; }

/** Cost of buying the NEXT level of an upgrade currently at `level` (exponential). */
export function upgradeCost(kind, level) {
  const u = CONFIG.shop[kind];
  if (!u) throw new Error('unknown upgrade ' + kind);
  if (level >= u.max) return Infinity;
  return Math.round(u.baseCost * Math.pow(u.growth, level));
}

export function isMaxed(kind, level) { return level >= CONFIG.shop[kind].max; }

/** Try to buy one level; mutates `save` ({coins, upgrades}). Returns true on success. */
export function buyUpgrade(save, kind) {
  const lvl = save.upgrades[kind] || 0;
  const cost = upgradeCost(kind, lvl);
  if (!Number.isFinite(cost) || save.coins < cost) return false;
  save.coins -= cost;
  save.upgrades[kind] = lvl + 1;
  return true;
}

/** Player stats granted by the shop (apply to both modes). */
export function statsFromUpgrades(upg) {
  const u = upg || emptyUpgrades();
  return {
    start: CONFIG.crowd.startSoldiers + (u.start || 0) * CONFIG.shop.start.perLevel,
    damageMult: 1 + (u.damage || 0) * CONFIG.shop.damage.perLevel,
    rateMult: 1 + (u.rate || 0) * CONFIG.shop.rate.perLevel,
  };
}

/** Coin multiplier for kills on a (equivalent) level. */
export function coinScale(level) {
  return 1 + CONFIG.coinScalePerLevel * Math.max(0, level - 1);
}
