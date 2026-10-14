// Procedural SVG art: every icon is generated from its id, so there are no image assets.
import { BUILDINGS, RESEARCH, SHIPS } from '../engine/data.js';

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = seed;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const GLYPH = {
  metalMine: 'M18 44 L32 18 L46 44 Z M26 44 L32 32 L38 44',
  crystalMine: 'M32 14 L44 30 L32 50 L20 30 Z M20 30 L44 30',
  deutSynth: 'M24 18 h16 v8 l6 18 a4 4 0 0 1 -4 6 h-20 a4 4 0 0 1 -4 -6 l6 -18 Z',
  solarPlant: 'M32 22 a10 10 0 1 0 0.1 0 M32 12 v4 M32 48 v4 M12 32 h4 M48 32 h4 M18 18 l3 3 M43 43 l3 3 M46 18 l-3 3 M21 43 l-3 3',
  fusionPlant: 'M32 20 a12 12 0 1 0 0.1 0 M20 32 h24 M32 20 v24 M24 24 l16 16 M40 24 l-16 16',
  robotics: 'M22 26 h20 v16 h-20 Z M28 20 h8 v6 h-8 Z M26 32 h3 M35 32 h3 M18 30 v8 M46 30 v8',
  nanite: 'M20 20 h8 v8 h-8 Z M36 20 h8 v8 h-8 Z M20 36 h8 v8 h-8 Z M36 36 h8 v8 h-8 Z M28 24 h8 M24 28 v8 M40 28 v8 M28 40 h8',
  shipyard: 'M14 44 h36 M18 44 v-16 h28 v16 M22 28 l10 -10 l10 10',
  metalStore: 'M20 18 h24 v28 h-24 Z M20 26 h24 M20 34 h24',
  crystalStore: 'M20 18 h24 v28 h-24 Z M32 22 l6 8 l-6 12 l-6 -12 Z',
  deutStore: 'M22 16 h20 a4 4 0 0 1 4 4 v24 a4 4 0 0 1 -4 4 h-20 a4 4 0 0 1 -4 -4 v-24 a4 4 0 0 1 4 -4 M18 28 h28',
  lab: 'M28 14 h8 M29 14 v12 l-10 18 h26 l-10 -18 v-12 M24 38 h16',
  terraformer: 'M32 14 a18 18 0 1 0 0.1 0 M16 28 q8 6 16 0 t16 0 M18 38 q8 -4 14 0 t14 0',
  allianceDepot: 'M16 30 l16 -12 l16 12 v16 h-32 Z M26 46 v-10 h12 v10',
};

export function icon(id, size = 56) {
  const r = rng(hash(id));
  const hue = Math.floor(r() * 360);
  const c1 = `hsl(${hue} 70% 62%)`, c2 = `hsl(${(hue + 40) % 360} 60% 22%)`;
  const bg = `<defs><radialGradient id="g${id}" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="hsl(${hue} 45% 26%)"/><stop offset="1" stop-color="#070b16"/></radialGradient></defs><rect width="64" height="64" rx="10" fill="url(#g${id})"/>`;
  let body = '';
  if (id in BUILDINGS) {
    body = `<path d="${GLYPH[id] || 'M20 20 h24 v24 h-24 Z'}" fill="none" stroke="${c1}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  } else if (id in RESEARCH) {
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const rot = Math.floor((180 / n) * i + r() * 20);
      body += `<ellipse cx="32" cy="32" rx="${20 - i}" ry="${7 + r() * 3}" fill="none" stroke="${c1}" stroke-width="1.6" opacity="${0.6 + 0.4 * r()}" transform="rotate(${rot} 32 32)"/>`;
    }
    body += `<circle cx="32" cy="32" r="4" fill="${c1}"/>`;
  } else if (id in SHIPS) {
    // Symmetric silhouette from random half-profile points; bigger ships get longer hulls.
    const sz = Math.min(1, 0.45 + Math.log10(SHIPS[id].cost[0] + SHIPS[id].cost[1]) / 14);
    const len = 40 * sz, pts = [];
    const steps = 5 + Math.floor(r() * 3);
    for (let i = 0; i <= steps; i++) {
      const y = 32 - len / 2 + (len * i) / steps;
      const w = i === 0 ? 1 : (4 + r() * 14) * sz * (i === steps ? 0.7 : 1);
      pts.push([32 + w, y]);
    }
    const right = pts.map((p) => p.join(',')).join(' ');
    const left = pts.slice().reverse().map(([x, y]) => `${64 - x},${y}`).join(' ');
    body = `<polygon points="${right} ${left}" fill="${c2}" stroke="${c1}" stroke-width="1.8" stroke-linejoin="round"/>` +
      `<circle cx="32" cy="${32 - len / 6}" r="${2 + sz * 2}" fill="${c1}"/>` +
      `<rect x="${29 - sz * 3}" y="${32 + len / 2 - 1}" width="${6 + sz * 6}" height="3" rx="1.5" fill="hsl(${(hue + 180) % 360} 90% 65%)" opacity=".85"/>`;
  } else {
    // Defence: dome or turret.
    const dome = id.includes('Dome');
    body = dome
      ? `<path d="M12 46 a20 20 0 0 1 40 0 Z" fill="${c2}" stroke="${c1}" stroke-width="2"/><path d="M18 46 a14 14 0 0 1 28 0" fill="none" stroke="${c1}" stroke-width="1" opacity=".6"/>`
      : `<rect x="18" y="38" width="28" height="8" rx="2" fill="${c2}" stroke="${c1}" stroke-width="2"/><circle cx="32" cy="36" r="8" fill="${c2}" stroke="${c1}" stroke-width="2"/><path d="M32 34 L48 ${18 + r() * 8}" stroke="${c1}" stroke-width="${2 + r() * 3}" stroke-linecap="round"/>`;
  }
  return `<svg class="ic" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${bg}${body}</svg>`;
}

export function planetArt(pl, size = 72) {
  const h = hash(pl.id || `${pl.g}:${pl.s}:${pl.p}`);
  const hot = Math.max(0, Math.min(1, (pl.tmax + 130) / 390));
  const hue = Math.round(220 - hot * 200 + (h % 30));
  if (pl.isMoon) {
    return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><defs><radialGradient id="pm${h}" cx="35%" cy="30%"><stop offset="0" stop-color="#ddd"/><stop offset="1" stop-color="#333"/></radialGradient></defs><circle cx="32" cy="32" r="20" fill="url(#pm${h})"/><circle cx="26" cy="28" r="3" fill="#0003"/><circle cx="38" cy="38" r="4" fill="#0003"/></svg>`;
  }
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><defs><radialGradient id="pp${h}" cx="35%" cy="30%"><stop offset="0" stop-color="hsl(${hue} 70% 70%)"/><stop offset=".7" stop-color="hsl(${hue} 55% 35%)"/><stop offset="1" stop-color="hsl(${hue} 60% 12%)"/></radialGradient></defs>` +
    `<circle cx="32" cy="32" r="26" fill="url(#pp${h})"/>` +
    `<path d="M8 ${28 + (h % 6)} q12 -4 24 0 t24 0" stroke="hsl(${hue} 50% 85%)" stroke-opacity=".25" stroke-width="3" fill="none"/>` +
    `<path d="M10 ${38 + (h % 5)} q12 4 22 0 t22 0" stroke="hsl(${hue} 40% 20%)" stroke-opacity=".35" stroke-width="4" fill="none"/></svg>`;
}
