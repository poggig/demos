// Procedural cartoon art: soldiers, zombies, boss, coin and icons are drawn with shapes
// (no images, no emoji) and baked ONCE into offscreen canvases at device resolution.
import { THEME } from './theme.js';

const P = THEME.palette;
const OUT = P.outline;

function rr(c, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}
export { rr as roundRect };

function shape(c, fill, lw = 2.5) {
  c.fillStyle = fill; c.fill();
  c.lineWidth = lw; c.strokeStyle = OUT; c.stroke();
}
function circle(c, x, y, r, fill, lw) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); shape(c, fill, lw); }
function ellipse(c, x, y, rx, ry, fill, lw) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); shape(c, fill, lw); }
function limb(c, x, y, w, h, fill, ang = 0) {
  c.save(); c.translate(x, y); c.rotate(ang); rr(c, -w / 2, 0, w, h, w / 2); shape(c, fill); c.restore();
}

// ── sprite baking ────────────────────────────────────────────────────────────
function bake(w, h, k, draw) {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * k); cv.height = Math.ceil(h * k);
  const c = cv.getContext('2d');
  c.scale(k, k); c.translate(w / 2, h / 2);
  c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c);
  return { cv, w, h };
}
/** White silhouette of a sprite (hit flash). */
function flashOf(s, k) {
  const cv = document.createElement('canvas');
  cv.width = s.cv.width; cv.height = s.cv.height;
  const c = cv.getContext('2d');
  c.drawImage(s.cv, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.fillRect(0, 0, cv.width, cv.height);
  return { cv, w: s.w, h: s.h, k };
}

// ── soldier (seen from behind, running up the road) ─────────────────────────
function drawSoldier(c, f) {
  const step = f ? 1 : -1;
  limb(c, -4, 6 + step, 5, 9, P.soldierHelmet);         // legs
  limb(c, 4, 6 - step, 5, 9, P.soldierHelmet);
  rr(c, -8, -6, 16, 15, 6); shape(c, P.soldier);          // torso
  rr(c, -5, -4, 10, 9, 3); shape(c, P.soldierHelmet, 2);  // backpack
  limb(c, 9, -16, 4, 16, P.gun);                          // rifle pointing up
  circle(c, 9, -2, 3.2, P.soldierSkin, 2);                // hand
  circle(c, 0, -11, 7.2, P.soldierSkin);                  // head
  c.beginPath(); c.arc(0, -12, 7.6, Math.PI * 0.95, Math.PI * 2.05); c.closePath(); shape(c, P.soldierHelmet); // helmet
  c.beginPath(); c.arc(-2.5, -15, 2, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
}

// ── zombies (facing the camera, walking down) ───────────────────────────────
function zombieFace(c, x, y, r, eye = P.zombieEye, angry = true) {
  circle(c, x - r * 0.38, y - r * 0.05, r * 0.26, '#ffffff', 1.8);
  circle(c, x + r * 0.38, y - r * 0.05, r * 0.26, '#ffffff', 1.8);
  c.fillStyle = eye;
  c.beginPath(); c.arc(x - r * 0.36, y + r * 0.02, r * 0.12, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(x + r * 0.36, y + r * 0.02, r * 0.12, 0, Math.PI * 2); c.fill();
  if (angry) {
    c.lineWidth = 2.2; c.strokeStyle = OUT;
    c.beginPath(); c.moveTo(x - r * 0.62, y - r * 0.38); c.lineTo(x - r * 0.15, y - r * 0.2); c.stroke();
    c.beginPath(); c.moveTo(x + r * 0.62, y - r * 0.38); c.lineTo(x + r * 0.15, y - r * 0.2); c.stroke();
  }
  // jagged mouth
  c.beginPath();
  c.moveTo(x - r * 0.4, y + r * 0.45);
  for (let i = 1; i <= 4; i++) c.lineTo(x - r * 0.4 + i * r * 0.2, y + r * (i % 2 ? 0.58 : 0.45));
  c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
}

function torn(c, x, y, w, h, fill) {
  c.beginPath();
  c.moveTo(x + 4, y); c.lineTo(x + w - 4, y);
  c.quadraticCurveTo(x + w, y, x + w, y + 4);
  c.lineTo(x + w, y + h - 3);
  const teeth = 5;
  for (let i = teeth; i >= 0; i--) c.lineTo(x + (w * i) / teeth, y + h + (i % 2 ? 3 : -2));
  c.lineTo(x, y + 4); c.quadraticCurveTo(x, y, x + 4, y);
  c.closePath(); shape(c, fill);
}

function drawWalker(c, f, shirt = P.walkerShirt, skin = P.zombieSkin, s = 1) {
  const sw = f ? 1.5 : -1.5;
  c.save(); c.scale(s, s);
  limb(c, -5, 8 + sw, 6, 11, '#4b4f6b');
  limb(c, 5, 8 - sw, 6, 11, '#4b4f6b');
  torn(c, -11, -6, 22, 16, shirt);
  limb(c, -12, -3, 6, 15, skin, 0.35 + sw * 0.08);       // arms reaching forward
  limb(c, 12, -3, 6, 15, skin, -0.35 - sw * 0.08);
  circle(c, 0, -15, 11, skin);
  c.beginPath(); c.arc(-4, -19, 2.5, 0, Math.PI * 2); c.fillStyle = P.zombieSkinDark; c.fill();
  zombieFace(c, 0, -14, 11);
  c.restore();
}
function drawRunner(c, f) {
  const sw = f ? 2.5 : -2.5;
  limb(c, -4, 7 + sw, 5, 12, '#3f435c', 0.15);
  limb(c, 4, 7 - sw, 5, 12, '#3f435c', -0.15);
  torn(c, -8, -6, 16, 15, P.runnerShirt);
  limb(c, -9, -4, 5, 15, P.zombieSkin, 0.6 + sw * 0.1);
  limb(c, 9, -4, 5, 15, P.zombieSkin, -0.6 - sw * 0.1);
  circle(c, 0, -14, 9, P.zombieSkin);
  zombieFace(c, 0, -13, 9);
  // hair tuft
  c.beginPath(); c.moveTo(-4, -22); c.lineTo(0, -27); c.lineTo(2, -22); c.lineTo(6, -25); c.lineTo(5, -20);
  c.fillStyle = P.zombieSkinDark; c.fill();
}
function drawBrute(c, f) {
  const sw = f ? 1.5 : -1.5;
  limb(c, -9, 12 + sw, 10, 13, '#3c3f55');
  limb(c, 9, 12 - sw, 10, 13, '#3c3f55');
  rr(c, -20, -12, 40, 28, 10); shape(c, P.walkerShirt);
  rr(c, -15, -9, 30, 20, 6); shape(c, P.bruteArmor);                 // chest plate
  c.lineWidth = 2; c.strokeStyle = OUT; c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 11); c.stroke();
  limb(c, -22, -8, 10, 22, P.zombieSkin, 0.25 + sw * 0.05);
  limb(c, 22, -8, 10, 22, P.zombieSkin, -0.25 - sw * 0.05);
  circle(c, -21, -9, 8, P.bruteArmor);                               // shoulder pads
  circle(c, 21, -9, 8, P.bruteArmor);
  circle(c, 0, -20, 12, P.zombieSkin);
  zombieFace(c, 0, -18, 12);
  c.beginPath(); c.arc(0, -22, 13, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); shape(c, P.bruteArmor); // helmet
}
function drawSplitter(c, f) {
  const sw = f ? 1.5 : -1.5;
  limb(c, -7, 10 + sw, 7, 10, '#4b4f6b');
  limb(c, 7, 10 - sw, 7, 10, '#4b4f6b');
  ellipse(c, 0, 0, 20, 17, P.splitterBody);
  c.fillStyle = 'rgba(255,255,255,0.28)';
  for (const [x, y, r] of [[-8, -5, 4], [7, 4, 5], [-2, 8, 3], [10, -7, 3]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
  limb(c, -19, -4, 6, 12, P.zombieSkin, 0.5 + sw * 0.1);
  limb(c, 19, -4, 6, 12, P.zombieSkin, -0.5 - sw * 0.1);
  circle(c, 0, -19, 9, P.zombieSkin);
  zombieFace(c, 0, -18, 9);
}
function drawMini(c, f) {
  const sw = f ? 1.2 : -1.2;
  limb(c, -4, 4 + sw, 4, 7, '#4b4f6b');
  limb(c, 4, 4 - sw, 4, 7, '#4b4f6b');
  ellipse(c, 0, 0, 11, 10, P.splitterBody);
  zombieFace(c, 0, -1, 9);
}
function drawBoss(c, f) {
  const sw = f ? 2.5 : -2.5;
  limb(c, -22, 28 + sw, 20, 26, '#2f2f45');
  limb(c, 22, 28 - sw, 20, 26, '#2f2f45');
  rr(c, -46, -26, 92, 64, 24); shape(c, P.bossArmor, 3.5);
  rr(c, -34, -18, 68, 40, 14); shape(c, P.bossSkin, 3);           // belly
  rr(c, -40, 26, 80, 10, 4); shape(c, '#2f2f45', 3);              // belt
  rr(c, -9, 25, 18, 12, 3); shape(c, P.bossCrown, 3);             // buckle
  limb(c, -50, -18, 22, 44, P.bossSkin, 0.3 + sw * 0.04);
  limb(c, 50, -18, 22, 44, P.bossSkin, -0.3 - sw * 0.04);
  circle(c, -64, 22 + sw, 14, P.bossSkin, 3);                     // fists
  circle(c, 64, 22 - sw, 14, P.bossSkin, 3);
  circle(c, -44, -20, 15, P.bossArmor, 3);                        // shoulder spikes
  circle(c, 44, -20, 15, P.bossArmor, 3);
  for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 40, -32); c.lineTo(sx * 52, -48); c.lineTo(sx * 54, -28); c.closePath(); shape(c, '#e8e8f0', 2.5); }
  circle(c, 0, -40, 25, P.bossSkin, 3.5);
  zombieFace(c, 0, -37, 25, '#ffea00');
  // crown
  c.beginPath(); c.moveTo(-20, -58); c.lineTo(-20, -74); c.lineTo(-10, -64); c.lineTo(0, -78); c.lineTo(10, -64); c.lineTo(20, -74); c.lineTo(20, -58); c.closePath();
  shape(c, P.bossCrown, 3);
  circle(c, 0, -66, 3, P.zombieEye, 1.5);
}
function drawCoin(c) {
  circle(c, 0, 0, 8, P.coin, 2.2);
  c.beginPath(); c.arc(0, 0, 4.6, 0, Math.PI * 2); c.lineWidth = 2; c.strokeStyle = P.coinDark; c.stroke();
  c.beginPath(); c.arc(-2.5, -2.5, 1.8, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fill();
}

// ── icons (gates + HUD) — drawn directly with paths ─────────────────────────
function poly(c, pts) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); c.fill(); c.stroke();
}
/** Side-view gun silhouettes (pointing right), ~36 units wide. */
function drawGun(c, k) {
  const body = '#454c60', light = '#8a93a8';
  c.lineWidth = 2; c.strokeStyle = OUT; c.fillStyle = body;
  if (k === 'rocket') {
    rr(c, -17, -5.5, 27, 11, 3); c.fill(); c.stroke();                // tube
    c.fillStyle = P.rocket; poly(c, [10, -6.5, 18, 0, 10, 6.5]);       // warhead
    c.fillStyle = body; poly(c, [-5, 5, 0, 5, -1, 12, -6, 12]);        // grip
    rr(c, -18, -7, 5, 14, 1.5); c.fill(); c.stroke();                  // rear ring
    c.fillStyle = light; rr(c, -11, -3.5, 16, 2.5, 1); c.fill();
  } else if (k === 'shotgun') {
    poly(c, [-18, -1, -9, -4, -9, 3, -18, 7]);                         // stock
    rr(c, -10, -5, 12, 8, 2); c.fill(); c.stroke();                    // receiver
    rr(c, 1, -5, 18, 4, 1.5); c.fill(); c.stroke();                    // long barrel
    c.fillStyle = light; rr(c, 4, -0.5, 10, 4, 1.5); c.fill(); c.stroke(); // pump
    c.fillStyle = body; poly(c, [-7, 2, -3, 2, -5, 10, -9, 10]);       // grip
  } else if (k === 'smg') {
    poly(c, [-11, -3, -17, -3, -17, 2, -11, 2]);                       // folded stock
    rr(c, -12, -5, 18, 8, 2.5); c.fill(); c.stroke();                  // body
    rr(c, 5, -3.5, 9, 3.5, 1.5); c.fill(); c.stroke();                 // short barrel
    poly(c, [-9, 2, -5, 2, -7, 10, -11, 10]);                          // grip
    rr(c, 0, 2, 4.5, 12, 1.5); c.fill(); c.stroke();                   // long magazine
    c.fillStyle = light; rr(c, -9, -3, 12, 2.2, 1); c.fill();
  } else { // rifle
    poly(c, [-18, -2, -8, -4, -8, 3, -18, 6]);                         // stock
    rr(c, -9, -5, 16, 8, 2); c.fill(); c.stroke();                     // receiver
    rr(c, 6, -3.5, 13, 3.5, 1.5); c.fill(); c.stroke();                // barrel
    poly(c, [-5, 2, -1, 2, -3, 10, -7, 10]);                           // grip
    poly(c, [2, 2, 6, 2, 8, 10, 4, 11]);                               // curved magazine
    rr(c, -2, -8, 7, 3, 1); c.fill(); c.stroke();                      // sight
    c.fillStyle = light; rr(c, -6, -3, 11, 2.2, 1); c.fill();
  }
}
export function drawIcon(c, kind, x, y, s, color = '#ffffff') {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = OUT; c.lineWidth = 2.6;
  c.fillStyle = color;
  if (kind === 'weapon' || kind === 'rifle' || kind === 'smg' || kind === 'shotgun' || kind === 'rocket') {
    drawGun(c, kind === 'weapon' ? 'smg' : kind);
  } else if (kind === 'rate') {
    // three stacked chevrons
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.moveTo(-10, 6 - i * 8 + 4); c.lineTo(0, -4 - i * 8 + 4); c.lineTo(10, 6 - i * 8 + 4);
      c.lineWidth = 7; c.strokeStyle = OUT; c.stroke();
      c.lineWidth = 3.6; c.strokeStyle = color; c.stroke();
    }
  } else if (kind === 'damage') {
    // impact star
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 6 : 14, a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fill(); c.stroke();
  } else if (kind === 'soldier') {
    circle(c, 0, -6, 6, color, 2.4);
    rr(c, -8, 1, 16, 11, 5); shape(c, color, 2.4);
  } else if (kind === 'coin') {
    drawCoin(c);
  }
  c.restore();
}

// ── baking entry point ───────────────────────────────────────────────────────
export function bakeSprites(k) {
  const S = { k };
  S.soldier = [bake(30, 40, k, c => drawSoldier(c, 0)), bake(30, 40, k, c => drawSoldier(c, 1))];
  const Z = {
    walker: [48, 52, drawWalker],
    runner: [40, 48, drawRunner],
    brute: [72, 76, drawBrute],
    splitter: [56, 60, drawSplitter],
    mini: [30, 30, drawMini],
  };
  S.zombie = {};
  for (const key in Z) {
    const [w, h, fn] = Z[key];
    const frames = [bake(w, h, k, c => fn(c, 0)), bake(w, h, k, c => fn(c, 1))];
    S.zombie[key] = { frames, flash: flashOf(frames[0], k) };
  }
  const bossFrames = [bake(170, 180, k, c => drawBoss(c, 0)), bake(170, 180, k, c => drawBoss(c, 1))];
  S.boss = { frames: bossFrames, flash: flashOf(bossFrames[0], k) };
  S.coin = bake(20, 20, k, drawCoin);
  return S;
}
