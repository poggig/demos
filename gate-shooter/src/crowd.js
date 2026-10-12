// Crowd logic — pure: contact damage, carry-over, bullet merging, formation geometry.
import { CONFIG } from './config.js';

/** Soldiers killed when a zombie touches the crowd: max(weight, ceil(hpLeft / hpPerSoldier)). */
export function contactKills(hpLeft, weight) {
  return Math.max(weight, Math.ceil(Math.max(0, hpLeft) / CONFIG.hpPerSoldier));
}

/** Starting soldiers of the next campaign level: carryOver × survivors, never below the shop start. */
export function carryOverStart(survivors, shopStart) {
  return Math.max(shopStart, Math.floor(survivors * CONFIG.carryOver));
}

/** Max bullets one fire tick may emit so that at most CONFIG.maxBullets are ever in flight. */
export function bulletsPerTickCap(weapon) {
  const flight = (CONFIG.crowd.y - CONFIG.track.spawnY) / weapon.speed; // s to leave the screen
  const ticksInFlight = Math.max(1, Math.ceil(flight / CONFIG.fireTick));
  return Math.max(1, Math.floor(CONFIG.maxBullets / ticksInFlight));
}

/**
 * Merge `raw` bullets of `rawDamage` each into at most `cap` bullets (and at most `free` pool
 * slots). Total damage and total "hits" are preserved exactly: count × damage === raw × rawDamage.
 * Writes into `out` ({count, damage, hits}) to stay allocation-free in the hot loop.
 */
export function planVolley(raw, rawDamage, cap, free, out) {
  const o = out || { count: 0, damage: 0, hits: 0 };
  const limit = Math.min(cap, free);
  if (raw <= 0 || limit <= 0) { o.count = 0; o.damage = 0; o.hits = 0; return o; }
  const count = Math.min(raw, limit);
  o.count = count;
  o.damage = (raw * rawDamage) / count;
  o.hits = raw / count;
  return o;
}

/** Number of soldiers actually drawn. */
export const drawnCount = soldiers => Math.min(soldiers, CONFIG.maxDrawnSoldiers);

/** Formation radius (x) for a crowd — grows ~sqrt(n) up to maxDrawnSoldiers, then stays full. */
export function crowdRadius(soldiers) {
  const n = Math.max(1, drawnCount(soldiers));
  return CONFIG.crowd.spacing * 0.5 * Math.sqrt(n) + CONFIG.crowd.soldierR;
}

/** Phyllotaxis (sunflower) offsets: the first n are a compact, roughly round formation. */
export const FORMATION = (() => {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < CONFIG.maxDrawnSoldiers; i++) {
    const r = CONFIG.crowd.spacing * 0.5 * Math.sqrt(i + 0.5);
    const a = i * golden - Math.PI / 2;
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) * CONFIG.crowd.squash });
  }
  return pts;
})();
