// Scenery — the road and its surroundings for every place of THEME.scenery: colours, road decals,
// roadside props, sea / lava edges and weather. Pure canvas drawing (the World never sees it).
// Campaign: one place per level; Endless (and the menu demo): the road runs from place to place,
// so the next place scrolls in from the top.
import { CONFIG } from './config.js';
import { THEME } from './theme.js';
import { pick } from './i18n.js';

const C = CONFIG, P0 = THEME.palette;
const W = C.view.w, H = C.view.h;
const RL = C.road.left, RR = C.road.right, RW = RR - RL, CY = C.crowd.y;
const TAU = Math.PI * 2;
const DECAL = { desert: 'cracks', snow: 'drift', city: 'puddle', autumn: 'leaf', graveyard: 'crack', beach: 'planks', volcano: 'lavaCrack' };

/** Every place with its palette already merged (place colours override THEME.palette). */
export const SCENES = THEME.scenery.list.map(s => ({ ...s, decal: s.decal ?? DECAL[s.id] ?? null, P: { ...P0, ...(s.colors || {}) } }));

function hash(i) {
  let h = Math.imul(i ^ 0x5bd1e995, 0x2c1b3c6d);
  h ^= h >>> 15; h = Math.imul(h, 0x297a2d39); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;

/** Index of the place shown: campaign → by level; Endless → by track position (px). */
export function sceneIndex(world, trackPos = 0) {
  const n = SCENES.length;
  if (world && !world.endless) return mod(Math.floor((world.levelInt - 1) / Math.max(1, THEME.scenery.every)), n);
  return mod(Math.floor(Math.max(0, trackPos) / C.endless.sceneEvery), n);
}
/** The place under the crowd right now. */
export function currentScene(world) {
  return SCENES[sceneIndex(world, world ? world.distance : 0)];
}
export function sceneName(world) { return pick(currentScene(world).name); }

/** Road + verges for the visible stretch; in Endless two places may share the screen (seam scrolls down). */
export function drawScenery(c, world, dist, lanes, time) {
  if (world && !world.endless) { drawPlace(c, SCENES[sceneIndex(world)], dist, lanes, time); return; }
  const len = C.endless.sceneEvery;
  const posTop = dist + CY + 40, posBot = Math.max(0, dist + CY - H - 40);
  const kTop = Math.floor(posTop / len), kBot = Math.floor(posBot / len);
  const at = k => SCENES[mod(k, SCENES.length)];
  if (kTop === kBot) { drawPlace(c, at(kTop), dist, lanes, time); return; }
  const yB = CY - (kTop * len - dist);                       // screen y of the border between the two places
  c.save(); c.beginPath(); c.rect(-40, yB, W + 80, H + 80 - yB); c.clip(); drawPlace(c, at(kBot), dist, lanes, time); c.restore();
  c.save(); c.beginPath(); c.rect(-40, -40, W + 80, yB + 40); c.clip(); drawPlace(c, at(kTop), dist, lanes, time); c.restore();
}

function drawPlace(c, s, dist, lanes, time) {
  const Q = s.P;
  c.fillStyle = Q.grass; c.fillRect(-20, -20, W + 40, H + 40);
  c.fillStyle = Q.grassAlt;
  let off = mod(dist, 160);
  for (let y = off - 160; y < H + 20; y += 160) c.fillRect(-20, y, W + 40, 80);
  if (s.side === 'sea') drawSea(c, Q, dist, time);
  if (s.side === 'lava') drawLava(c, Q, dist, time);
  // roadside props, one tile every 150 px of track per side
  const tile = 150, first = Math.floor((dist + CY - H - 80) / tile), last = Math.ceil((dist + CY + 120) / tile);
  for (let i = first; i <= last; i++) {
    const y = CY - (i * tile - dist);
    for (let side = 0; side < 2; side++) {
      if (s.side === 'sea' && side === 0) continue;
      const h = hash(i * 2 + side);
      if (h < 0.3) continue;
      const x = side ? RR + 24 + hash(i * 7 + side) * 18 : RL - 24 - hash(i * 7 + side) * 18;
      prop(c, Q, h < 0.72 ? s.props[0] : s.props[1] || s.props[0], x, y, hash(i * 3 + side), side, time);
    }
  }
  c.fillStyle = Q.roadEdge; c.fillRect(RL - 10, -20, RW + 20, H + 40);
  c.fillStyle = Q.road; c.fillRect(RL - 4, -20, RW + 8, H + 40);
  c.fillStyle = Q.roadAlt;
  off = mod(dist, 140);
  for (let y = off - 140; y < H + 20; y += 140) c.fillRect(RL - 4, y, RW + 8, 56);
  if (s.decal) drawDecals(c, Q, s.decal, dist, time);
  off = mod(dist, 56);
  for (let y = off - 56; y < H + 20; y += 56) {
    c.fillStyle = Q.curbA; c.fillRect(RL - 16, y, 10, 28); c.fillRect(RR + 6, y, 10, 28);
    c.fillStyle = Q.curbB; c.fillRect(RL - 16, y + 28, 10, 28); c.fillRect(RR + 6, y + 28, 10, 28);
  }
  c.lineWidth = 2; c.strokeStyle = Q.outline; c.globalAlpha = 0.35;
  c.beginPath(); c.moveTo(RL - 16, -20); c.lineTo(RL - 16, H + 20); c.moveTo(RR + 16, -20); c.lineTo(RR + 16, H + 20); c.stroke();
  c.globalAlpha = 1;
  c.fillStyle = Q.laneLine;
  off = mod(dist, 90);
  c.globalAlpha = 0.85;
  for (let l = 1; l < lanes; l++) {
    const x = RL + (RW * l) / lanes;
    for (let y = off - 90; y < H + 20; y += 90) c.fillRect(x - 3, y, 6, 46);
  }
  c.globalAlpha = 1;
  if (s.props.includes('lamp')) drawLampLight(c, Q, dist);   // light pools spill onto the road
}

// ── edges ────────────────────────────────────────────────────────────────────
function drawSea(c, Q, dist, time) {
  const x1 = RL - 17;
  c.fillStyle = Q.sea; c.fillRect(-20, -20, x1 + 20, H + 40);
  c.strokeStyle = Q.foam; c.lineWidth = 3; c.lineCap = 'round';
  const off = mod(dist * 0.6 + time * 30, 70);
  for (let y = off - 70; y < H + 20; y += 70) {
    c.globalAlpha = 0.7;
    c.beginPath(); c.moveTo(2, y); c.quadraticCurveTo(10, y - 6, 18, y); c.quadraticCurveTo(24, y + 5, x1 - 2, y - 2); c.stroke();
  }
  c.globalAlpha = 1; c.lineCap = 'butt';
  c.fillStyle = Q.foam; c.fillRect(x1 - 4, -20, 4, H + 40);   // surf line against the curb
}
function drawLava(c, Q, dist, time) {
  const glow = 0.75 + 0.25 * Math.sin(time * 5);
  for (const [x0, x1] of [[-20, RL - 26], [RR + 26, W + 20]]) {
    c.fillStyle = Q.lava; c.fillRect(x0, -20, x1 - x0, H + 40);
    c.globalAlpha = 0.55 * glow; c.fillStyle = Q.lavaGlow;
    const off = mod(dist + time * 40, 60);
    for (let y = off - 60; y < H + 20; y += 60) { c.beginPath(); c.ellipse((x0 + x1) / 2, y, (x1 - x0) * 0.35, 9, 0, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  }
}
function drawLampLight(c, Q, dist) {
  const tile = 150, first = Math.floor((dist + CY - H - 80) / tile), last = Math.ceil((dist + CY + 120) / tile);
  c.globalCompositeOperation = 'lighter';
  for (let i = first; i <= last; i++) {
    const y = CY - (i * tile - dist);
    for (let side = 0; side < 2; side++) {
      const h = hash(i * 2 + side);
      if (h < 0.3 || h >= 0.72) continue;                     // only tiles holding a lamp
      const x = side ? RR - 26 : RL + 26;
      const g = c.createRadialGradient(x, y, 4, x, y, 90);
      g.addColorStop(0, 'rgba(255,214,110,0.32)'); g.addColorStop(1, 'rgba(255,214,110,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, 90, 60, 0, 0, TAU); c.fill();
    }
  }
  c.globalCompositeOperation = 'source-over';
}

// ── road decals (sparse, scroll with the road) ───────────────────────────────
function drawDecals(c, Q, kind, dist, time) {
  const tile = 120, first = Math.floor((dist + CY - H - 60) / tile), last = Math.ceil((dist + CY + 60) / tile);
  for (let i = first; i <= last; i++) {
    const h = hash(i * 13 + 5);
    if (kind !== 'planks' && h < 0.45) continue;
    const y = CY - (i * tile - dist), x = RL + 30 + hash(i * 17 + 1) * (RW - 60);
    c.save(); c.translate(x, y);
    if (kind === 'cracks' || kind === 'crack') {
      c.strokeStyle = 'rgba(40,30,25,0.35)'; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(-26, -6); c.lineTo(-8, 2); c.lineTo(4, -4); c.lineTo(22, 6); c.moveTo(-8, 2); c.lineTo(-4, 14); c.stroke();
    } else if (kind === 'drift') {
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.beginPath(); c.ellipse(0, 0, 34 + h * 20, 10, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(18, -4, 16, 7, 0, 0, TAU); c.fill();
    } else if (kind === 'puddle') {
      c.fillStyle = 'rgba(120,170,255,0.18)';
      c.beginPath(); c.ellipse(0, 0, 30 + h * 18, 12, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,79,163,0.35)'; c.lineWidth = 2;                 // neon reflection
      c.beginPath(); c.moveTo(-14, -2); c.lineTo(10, -2); c.stroke();
    } else if (kind === 'leaf') {
      for (let k = 0; k < 3; k++) {
        c.fillStyle = k % 2 ? Q.leaves : Q.leavesDark;
        c.beginPath(); c.ellipse(k * 14 - 14, (k % 2) * 8, 6, 3.5, k * 1.3, 0, TAU); c.fill();
      }
    } else if (kind === 'planks') {                                           // boardwalk: plank joints across the road
      c.restore();
      c.strokeStyle = 'rgba(80,55,30,0.35)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(RL - 4, y); c.lineTo(RR + 4, y); c.moveTo(RL - 4, y + 60); c.lineTo(RR + 4, y + 60); c.stroke();
      continue;
    } else if (kind === 'lavaCrack') {
      const g = 0.6 + 0.4 * Math.sin(time * 6 + i);
      c.strokeStyle = Q.lava; c.lineWidth = 4; c.globalAlpha = 0.8 * g;
      c.beginPath(); c.moveTo(-24, -4); c.lineTo(-6, 3); c.lineTo(6, -5); c.lineTo(24, 4); c.stroke();
      c.strokeStyle = Q.lavaGlow; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-24, -4); c.lineTo(-6, 3); c.lineTo(6, -5); c.lineTo(24, 4); c.stroke();
      c.globalAlpha = 1;
    }
    c.restore();
  }
}

// ── roadside props ───────────────────────────────────────────────────────────
function outline(c, Q, lw = 2.5) { c.lineWidth = lw; c.strokeStyle = Q.outline; c.stroke(); }
function prop(c, Q, kind, x, y, v, side, time) {
  switch (kind) {
    case 'bush': {
      const r = 10 + v * 6;
      c.fillStyle = Q.bushDark;
      c.beginPath(); c.arc(x - r * 0.7, y + 2, r * 0.8, 0, TAU); outlineFill(c, Q);
      c.beginPath(); c.arc(x + r * 0.7, y + 3, r * 0.75, 0, TAU); outlineFill(c, Q);
      c.fillStyle = Q.bush; c.beginPath(); c.arc(x, y - 3, r, 0, TAU); outlineFill(c, Q);
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.45, r * 0.3, 0, TAU); c.fill();
      break;
    }
    case 'rock':
      c.fillStyle = Q.rock; c.beginPath(); c.ellipse(x, y, 13, 9, 0, 0, TAU); outlineFill(c, Q);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x - 4, y - 3, 4, 2.5, 0, 0, TAU); c.fill();
      break;
    case 'tree': {                                            // seen from above: a big round crown
      const r = 17 + v * 6;
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x + 5, y + 7, r, r * 0.8, 0, 0, TAU); c.fill();
      c.fillStyle = Q.leavesDark; c.beginPath(); c.arc(x, y, r, 0, TAU); outlineFill(c, Q);
      c.fillStyle = Q.leaves; c.beginPath(); c.arc(x - r * 0.2, y - r * 0.2, r * 0.72, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.arc(x - r * 0.4, y - r * 0.45, r * 0.25, 0, TAU); c.fill();
      break;
    }
    case 'pine': {
      const r = 16 + v * 5;
      c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.ellipse(x + 4, y + 8, r, r * 0.6, 0, 0, TAU); c.fill();
      for (let k = 0; k < 3; k++) {
        const rr = r * (1 - k * 0.28), yy = y - k * 7;
        c.fillStyle = Q.leavesDark; star(c, x, yy, rr, rr * 0.55, 7); outlineFill(c, Q, 2);
        c.fillStyle = Q.snow; star(c, x, yy - 2, rr * 0.55, rr * 0.3, 7); c.fill();
      }
      break;
    }
    case 'snowman':
      c.fillStyle = Q.snow; c.beginPath(); c.arc(x, y + 5, 11, 0, TAU); outlineFill(c, Q);
      c.beginPath(); c.arc(x, y - 9, 8, 0, TAU); outlineFill(c, Q);
      c.fillStyle = '#ff8a1f'; c.beginPath(); c.moveTo(x + 2, y - 9); c.lineTo(x + 10, y - 7); c.lineTo(x + 2, y - 6); c.fill();
      c.fillStyle = Q.outline; c.beginPath(); c.arc(x - 3, y - 11, 1.4, 0, TAU); c.arc(x + 3, y - 11, 1.4, 0, TAU); c.fill();
      break;
    case 'cactus':
      c.fillStyle = Q.cactus;
      roundRect(c, x - 6, y - 20, 12, 36, 6); outlineFill(c, Q);
      roundRect(c, x - 16, y - 10, 9, 16, 4.5); outlineFill(c, Q);
      roundRect(c, x + 7, y - 14, 9, 14, 4.5); outlineFill(c, Q);
      c.strokeStyle = Q.cactusDark; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y - 16); c.lineTo(x, y + 12); c.stroke();
      break;
    case 'skull':
      c.fillStyle = Q.bone; c.beginPath(); c.arc(x, y - 2, 8, 0, TAU); outlineFill(c, Q, 2);
      roundRect(c, x - 5, y + 3, 10, 6, 2); outlineFill(c, Q, 2);
      c.fillStyle = Q.outline; c.beginPath(); c.arc(x - 3, y - 2, 2.2, 0, TAU); c.arc(x + 3, y - 2, 2.2, 0, TAU); c.fill();
      break;
    case 'lamp': {
      const px = side ? x - 8 : x + 8;
      c.fillStyle = Q.lamp; roundRect(c, px - 3, y - 26, 6, 40, 3); outlineFill(c, Q, 2);
      c.fillStyle = Q.lampLight; c.beginPath(); c.arc(px, y - 27, 6, 0, TAU); outlineFill(c, Q, 2);
      c.globalAlpha = 0.3 + 0.08 * Math.sin(time * 3 + v * 9); c.beginPath(); c.arc(px, y - 27, 14, 0, TAU); c.fill(); c.globalAlpha = 1;
      break;
    }
    case 'building': {                                        // the edge of a block, windows lit at random
      const bx = side ? x - 6 : x - 44, w = 50, h = 64 + v * 40;
      c.fillStyle = Q.building; roundRect(c, bx, y - h / 2, w, h, 4); outlineFill(c, Q);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) {
        if (hash(Math.floor(v * 1e6) + r * 3 + k) < 0.45) continue;
        c.fillStyle = Q.windowLit; c.fillRect(bx + 10 + k * 18, y - h / 2 + 10 + r * 16, 10, 9);
      }
      break;
    }
    case 'tomb':
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(x + 3, y + 12, 12, 5, 0, 0, TAU); c.fill();
      c.fillStyle = Q.tomb; c.beginPath(); c.moveTo(x - 10, y + 12); c.lineTo(x - 10, y - 6); c.arc(x, y - 6, 10, Math.PI, 0); c.lineTo(x + 10, y + 12); c.closePath(); outlineFill(c, Q);
      c.strokeStyle = Q.tombDark; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x, y + 4); c.moveTo(x - 5, y - 4); c.lineTo(x + 5, y - 4); c.stroke();
      break;
    case 'deadTree':
      c.strokeStyle = Q.outline; c.lineWidth = 7; c.lineCap = 'round'; branches(c, x, y, v); c.stroke();
      c.strokeStyle = Q.trunk; c.lineWidth = 4; branches(c, x, y, v); c.stroke(); c.lineCap = 'butt';
      break;
    case 'palm': {
      c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.ellipse(x + 6, y + 8, 18, 9, 0, 0, TAU); c.fill();
      c.fillStyle = Q.palm;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + v * 3 + Math.sin(time * 1.5 + v * 7) * 0.06;
        c.beginPath(); c.ellipse(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 13, 4.5, a, 0, TAU); outlineFill(c, Q, 2);
      }
      c.fillStyle = Q.trunk; c.beginPath(); c.arc(x, y, 5, 0, TAU); outlineFill(c, Q, 2);
      break;
    }
    case 'umbrella': {
      const r = 15;
      for (let k = 0; k < 8; k++) {
        c.fillStyle = k % 2 ? Q.umbrellaA : Q.umbrellaB;
        c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, (k / 8) * TAU, ((k + 1) / 8) * TAU); c.closePath(); c.fill();
      }
      c.beginPath(); c.arc(x, y, r, 0, TAU); outline(c, Q);
      c.fillStyle = Q.outline; c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fill();
      break;
    }
    case 'lavaRock': {
      c.fillStyle = Q.basalt; c.beginPath(); c.ellipse(x, y, 15, 11, 0, 0, TAU); outlineFill(c, Q);
      const g = 0.55 + 0.45 * Math.sin(time * 4 + v * 10);
      c.strokeStyle = Q.lava; c.lineWidth = 2.5; c.globalAlpha = g;
      c.beginPath(); c.moveTo(x - 8, y - 2); c.lineTo(x - 1, y + 3); c.lineTo(x + 7, y - 3); c.stroke(); c.globalAlpha = 1;
      break;
    }
    default: break;
  }
}
function outlineFill(c, Q, lw = 2.5) { c.fill(); outline(c, Q, lw); }
function roundRect(c, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k); c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k); c.arcTo(x, y, x + w, y, k); c.closePath();
}
function star(c, x, y, r1, r2, n) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = (i / (n * 2)) * TAU - Math.PI / 2; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}
function branches(c, x, y, v) {
  c.beginPath();
  c.moveTo(x, y + 14); c.lineTo(x, y - 4);
  c.moveTo(x, y + 2); c.lineTo(x - 11, y - 10); c.lineTo(x - 15, y - 18);
  c.moveTo(x, y - 4); c.lineTo(x + 9, y - 15 - v * 4);
  c.moveTo(x - 11, y - 10); c.lineTo(x - 5, y - 19);
}

// ── weather ──────────────────────────────────────────────────────────────────
const COUNTS = { snow: 64, rain: 56, leaves: 24, sand: 40, embers: 42, wisps: 14, none: 0 };
export class Weather {
  constructor() {
    this.p = Array.from({ length: 64 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, s: 1, ph: 0 }));
    this.type = 'none'; this.n = 0;
  }
  spawn(p, anywhere) {
    const t = this.type;
    p.x = Math.random() * (W + 60) - 30;
    p.y = anywhere ? Math.random() * H : (t === 'embers' ? H + 10 : t === 'sand' ? Math.random() * H : -10);
    if (t === 'sand' && !anywhere) p.x = -20;
    p.ph = Math.random() * TAU; p.s = 0.6 + Math.random() * 0.8;
    if (t === 'snow') { p.vx = 0; p.vy = 45 + Math.random() * 50; }
    else if (t === 'rain') { p.vx = -70; p.vy = 720 + Math.random() * 200; }
    else if (t === 'leaves') { p.vx = 20; p.vy = 70 + Math.random() * 50; }
    else if (t === 'sand') { p.vx = 260 + Math.random() * 180; p.vy = 25 + Math.random() * 25; }
    else if (t === 'embers') { p.vx = 0; p.vy = -(40 + Math.random() * 60); }
    else { p.vx = 0; p.vy = 0; }
  }
  update(dt, type, scroll) {
    if (type !== this.type) { this.type = type; this.n = COUNTS[type] || 0; for (let i = 0; i < this.n; i++) this.spawn(this.p[i], true); }
    const t = this.type, fall = scroll * 0.25;
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i];
      p.ph += dt;
      if (t === 'wisps') { p.x += Math.cos(p.ph * 0.7 + i) * 18 * dt; p.y += (Math.sin(p.ph * 0.5 + i * 2) * 14 + fall) * dt; }
      else {
        p.x += (p.vx + (t === 'snow' ? Math.sin(p.ph * 1.6 + i) * 22 : t === 'leaves' ? Math.sin(p.ph * 2.2 + i) * 60 : 0)) * dt;
        p.y += (p.vy + (t === 'embers' ? 0 : fall)) * dt;
      }
      if (p.y > H + 20 || p.y < -30 || p.x > W + 40 || p.x < -40) this.spawn(p, t === 'wisps');
    }
  }
  draw(c) {
    const t = this.type;
    if (!this.n) return;
    if (t === 'rain') {
      c.strokeStyle = 'rgba(190,215,255,0.45)'; c.lineWidth = 1.6; c.beginPath();
      for (let i = 0; i < this.n; i++) { const p = this.p[i]; c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); }
      c.stroke(); return;
    }
    if (t === 'sand') {
      c.strokeStyle = 'rgba(255,236,190,0.5)'; c.lineWidth = 1.4; c.beginPath();
      for (let i = 0; i < this.n; i++) { const p = this.p[i]; c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); }
      c.stroke(); return;
    }
    for (let i = 0; i < this.n; i++) {
      const p = this.p[i];
      if (t === 'snow') { c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(p.x, p.y, 1.6 + p.s * 1.6, 0, TAU); c.fill(); }
      else if (t === 'leaves') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.ph * 3 + i);
        c.fillStyle = i % 3 ? '#e8662a' : '#ffb020'; c.beginPath(); c.ellipse(0, 0, 6 * p.s, 3.2 * p.s, 0, 0, TAU); c.fill(); c.restore();
      } else if (t === 'embers') {
        c.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(p.ph * 6 + i));
        c.fillStyle = i % 2 ? '#ffb020' : '#ff6a1f'; c.beginPath(); c.arc(p.x, p.y, 1.5 + p.s * 1.4, 0, TAU); c.fill(); c.globalAlpha = 1;
      } else if (t === 'wisps') {
        c.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(p.ph * 1.3 + i));
        c.fillStyle = '#c8f7c5'; c.beginPath(); c.arc(p.x, p.y, 6 * p.s, 0, TAU); c.fill();
        c.globalAlpha = 0.8; c.beginPath(); c.arc(p.x, p.y, 2, 0, TAU); c.fill(); c.globalAlpha = 1;
      }
    }
  }
}
