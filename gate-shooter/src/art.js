// Procedural cartoon art: soldiers, zombies, 8 bosses, vehicles, helicopter, jet, coin and icons
// are drawn with shapes (no images, no emoji) and baked ONCE into offscreen canvases at device
// resolution. Colours come from THEME.palette.
import { THEME } from './theme.js';

const P = THEME.palette;
const OUT = P.outline;
const TAU = Math.PI * 2;

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
function circle(c, x, y, r, fill, lw) { c.beginPath(); c.arc(x, y, r, 0, TAU); shape(c, fill, lw); }
function ellipse(c, x, y, rx, ry, fill, lw) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); shape(c, fill, lw); }
function limb(c, x, y, w, h, fill, ang = 0) {
  c.save(); c.translate(x, y); c.rotate(ang); rr(c, -w / 2, 0, w, h, w / 2); shape(c, fill); c.restore();
}
function poly(c, pts) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); c.fill(); c.stroke();
}
function polyShape(c, pts, fill, lw = 2.5) { c.fillStyle = fill; c.lineWidth = lw; c.strokeStyle = OUT; poly(c, pts); }
function dot(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); }

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
  dot(c, -2.5, -15, 2, 'rgba(255,255,255,0.35)');
}

// ── zombies (facing the camera, walking down) ───────────────────────────────
function zombieFace(c, x, y, r, eye = P.zombieEye, angry = true) {
  circle(c, x - r * 0.38, y - r * 0.05, r * 0.26, '#ffffff', 1.8);
  circle(c, x + r * 0.38, y - r * 0.05, r * 0.26, '#ffffff', 1.8);
  dot(c, x - r * 0.36, y + r * 0.02, r * 0.12, eye);
  dot(c, x + r * 0.36, y + r * 0.02, r * 0.12, eye);
  if (angry) {
    c.lineWidth = 2.2; c.strokeStyle = OUT;
    c.beginPath(); c.moveTo(x - r * 0.62, y - r * 0.38); c.lineTo(x - r * 0.15, y - r * 0.2); c.stroke();
    c.beginPath(); c.moveTo(x + r * 0.62, y - r * 0.38); c.lineTo(x + r * 0.15, y - r * 0.2); c.stroke();
  }
  c.beginPath();                                       // jagged mouth
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

function drawWalker(c, f) {
  const sw = f ? 1.5 : -1.5;
  limb(c, -5, 8 + sw, 6, 11, '#4b4f6b');
  limb(c, 5, 8 - sw, 6, 11, '#4b4f6b');
  torn(c, -11, -6, 22, 16, P.walkerShirt);
  limb(c, -12, -3, 6, 15, P.zombieSkin, 0.35 + sw * 0.08);       // arms reaching forward
  limb(c, 12, -3, 6, 15, P.zombieSkin, -0.35 - sw * 0.08);
  circle(c, 0, -15, 11, P.zombieSkin);
  dot(c, -4, -19, 2.5, P.zombieSkinDark);
  zombieFace(c, 0, -14, 11);
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
  c.beginPath(); c.moveTo(-4, -22); c.lineTo(0, -27); c.lineTo(2, -22); c.lineTo(6, -25); c.lineTo(5, -20);
  c.fillStyle = P.zombieSkinDark; c.fill();
}
function drawBrute(c, f, armored = true) {
  const sw = f ? 1.5 : -1.5;
  limb(c, -9, 12 + sw, 10, 13, '#3c3f55');
  limb(c, 9, 12 - sw, 10, 13, '#3c3f55');
  rr(c, -20, -12, 40, 28, 10); shape(c, P.walkerShirt);
  if (armored) {
    rr(c, -15, -9, 30, 20, 6); shape(c, P.bruteArmor);               // chest plate
    c.lineWidth = 2; c.strokeStyle = OUT; c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 11); c.stroke();
    for (const [x, y] of [[-10, -4], [10, -4], [-10, 6], [10, 6]]) dot(c, x, y, 1.6, OUT);
  } else {                                                            // armour broken: scars
    c.lineWidth = 2; c.strokeStyle = P.zombieSkinDark;
    c.beginPath(); c.moveTo(-12, -6); c.lineTo(8, 8); c.moveTo(4, -8); c.lineTo(12, 2); c.stroke();
  }
  limb(c, -22, -8, 10, 22, P.zombieSkin, 0.25 + sw * 0.05);
  limb(c, 22, -8, 10, 22, P.zombieSkin, -0.25 - sw * 0.05);
  if (armored) { circle(c, -21, -9, 8, P.bruteArmor); circle(c, 21, -9, 8, P.bruteArmor); }
  circle(c, 0, -20, 12, P.zombieSkin);
  zombieFace(c, 0, -18, 12);
  if (armored) { c.beginPath(); c.arc(0, -22, 13, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); shape(c, P.bruteArmor); }
}
function drawSplitter(c, f) {
  const sw = f ? 1.5 : -1.5;
  limb(c, -7, 10 + sw, 7, 10, '#4b4f6b');
  limb(c, 7, 10 - sw, 7, 10, '#4b4f6b');
  ellipse(c, 0, 0, 20, 17, P.splitterBody);
  for (const [x, y, r] of [[-8, -5, 4], [7, 4, 5], [-2, 8, 3], [10, -7, 3]]) dot(c, x, y, r, 'rgba(255,255,255,0.28)');
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
function drawExploder(c, f) {                          // bloated, glowing cracks, fuse light
  const sw = f ? 1.5 : -1.5;
  limb(c, -7, 10 + sw, 7, 10, '#4b4f6b');
  limb(c, 7, 10 - sw, 7, 10, '#4b4f6b');
  ellipse(c, 0, 1, 19, 17, P.exploderBody);
  c.lineWidth = 2.4; c.strokeStyle = f ? P.exploderGlow : '#ffd27a';
  c.beginPath(); c.moveTo(-12, -4); c.lineTo(-5, 2); c.lineTo(-9, 9); c.moveTo(6, -8); c.lineTo(11, 0); c.lineTo(5, 6); c.stroke();
  limb(c, -18, -3, 6, 11, P.zombieSkin, 0.5);
  limb(c, 18, -3, 6, 11, P.zombieSkin, -0.5);
  circle(c, 0, -18, 8, P.zombieSkin);
  zombieFace(c, 0, -17, 8);
  c.lineWidth = 2; c.strokeStyle = OUT; c.beginPath(); c.moveTo(0, -26); c.quadraticCurveTo(4, -30, 3, -33); c.stroke();
  circle(c, 3, -34, 3, f ? '#ff3b3b' : P.exploderGlow, 1.6);
}
function drawSpitter(c, f) {                           // hunched, long neck, acid sac
  const sw = f ? 1.5 : -1.5;
  limb(c, -5, 8 + sw, 5, 11, '#3f435c');
  limb(c, 5, 8 - sw, 5, 11, '#3f435c');
  ellipse(c, 0, 0, 13, 12, P.spitterBody);
  circle(c, 0, -8, 11, P.acid, 2.4);                   // the acid sac on its back
  dot(c, -3, -11, 3, 'rgba(255,255,255,0.5)');
  limb(c, -13, -1, 5, 12, P.zombieSkin, 0.45);
  limb(c, 13, -1, 5, 12, P.zombieSkin, -0.45);
  rr(c, -3, -22, 6, 12, 3); shape(c, P.zombieSkin, 2);
  circle(c, 0, -24, 8, P.zombieSkin);
  zombieFace(c, 0, -25, 8);
  ellipse(c, 0, -19, 4, 3.4, '#3a5f1a', 1.6);          // open mouth
  dot(c, 0, -16, f ? 2.5 : 1.6, P.acid);
}
function drawShaman(c, f) {                            // hood, bone necklace, glowing staff
  const sw = f ? 1.2 : -1.2;
  polyShape(c, [-13, 14, -9, -8, 9, -8, 13, 14], P.shamanRobe);
  limb(c, -5, 13 + sw, 5, 7, '#3f435c');
  limb(c, 5, 13 - sw, 5, 7, '#3f435c');
  for (let i = -2; i <= 2; i++) dot(c, i * 4, -5 + Math.abs(i) * 1.5, 2, '#efe8d8');
  limb(c, 14, -2, 3.4, 26, '#7a5a3a', -0.05);          // staff
  circle(c, 15, -6, 5.5, P.shamanGlow, 2);
  dot(c, 13.5, -8, 1.8, 'rgba(255,255,255,0.8)');
  limb(c, -12, -4, 5, 12, P.zombieSkin, 0.4);
  circle(c, 0, -15, 9, P.zombieSkin);
  zombieFace(c, 0, -14, 9, P.shamanGlow);
  c.beginPath(); c.arc(0, -16, 11, Math.PI * 0.9, Math.PI * 2.1); c.lineTo(9, -10); c.lineTo(-9, -10); c.closePath(); shape(c, P.shamanRobe);
}

// ── bosses (one archetype per level) ─────────────────────────────────────────
function drawKing(c, f) {
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
  for (const sx of [-1, 1]) polyShape(c, [sx * 40, -32, sx * 52, -48, sx * 54, -28], '#e8e8f0');
  circle(c, 0, -40, 25, P.bossSkin, 3.5);
  zombieFace(c, 0, -37, 25, '#ffea00');
  polyShape(c, [-20, -58, -20, -74, -10, -64, 0, -78, 10, -64, 20, -74, 20, -58], P.bossCrown, 3);
  circle(c, 0, -66, 3, P.zombieEye, 1.5);
}
function drawButcher(c, f) {
  const sw = f ? 2.5 : -2.5;
  limb(c, -20, 30 + sw, 20, 24, '#3c3f55');
  limb(c, 20, 30 - sw, 20, 24, '#3c3f55');
  ellipse(c, 0, 4, 50, 42, P.butcherSkin, 3.5);                   // huge belly
  polyShape(c, [-34, -16, 34, -16, 40, 40, -40, 40], P.apron, 3); // apron
  for (const [x, y, r] of [[-14, 6, 7], [12, 18, 9], [20, -4, 5], [-6, 28, 5]]) dot(c, x, y, r, P.gore);
  limb(c, -50, -14, 20, 40, P.butcherSkin, 0.35);                 // left arm
  circle(c, -62, 22, 12, P.butcherSkin, 3);
  limb(c, 50, -14, 20, 36, P.butcherSkin, -0.6 - sw * 0.03);      // right arm raises the cleaver
  rr(c, 60, -58, 30, 34, 4); shape(c, '#c9d1dc', 3);              // cleaver blade
  dot(c, 82, -50, 3, OUT);
  rr(c, 64, -26, 8, 22, 3); shape(c, '#7a4f2a', 2.5);             // handle
  circle(c, 0, -42, 24, P.butcherSkin, 3.5);                      // bald head
  dot(c, -9, -52, 4, 'rgba(255,255,255,0.35)');
  zombieFace(c, 0, -40, 24, '#ffea00');
  rr(c, -18, -70, 36, 14, 6); shape(c, '#ffffff', 2.5);           // little chef's cap
}
function drawAcidMother(c, f) {
  const sw = f ? 2 : -2;
  limb(c, -26, 26 + sw, 16, 28, '#3f435c', 0.2);
  limb(c, 26, 26 - sw, 16, 28, '#3f435c', -0.2);
  ellipse(c, 0, 6, 46, 36, P.spitterBody, 3.5);                   // hunched body
  for (const [x, y, r] of [[-28, -18, 18], [6, -26, 22], [32, -10, 15]]) {   // toxic sacs
    circle(c, x, y, r, P.acid, 3);
    dot(c, x - r * 0.35, y - r * 0.35, r * 0.28, 'rgba(255,255,255,0.55)');
  }
  limb(c, -46, -4, 16, 40, P.zombieSkin, 0.5 + sw * 0.03);
  limb(c, 46, -4, 16, 40, P.zombieSkin, -0.5 - sw * 0.03);
  rr(c, -9, -50, 18, 34, 9); shape(c, P.zombieSkin, 3);           // long neck
  circle(c, 0, -56, 20, P.zombieSkin, 3.5);
  zombieFace(c, 0, -60, 20, '#ffea00');
  ellipse(c, 0, -45, 11, 9, '#2e4a12', 2.5);                      // gaping mouth
  dot(c, -4, -40, f ? 4 : 3, P.acid);
  dot(c, 5, -37, f ? 3 : 4, P.acid);
}
function drawTankBoss(c, f) {
  const sw = f ? 2 : -2;
  limb(c, -24, 30 + sw, 24, 26, '#4a5160');
  limb(c, 24, 30 - sw, 24, 26, '#4a5160');
  rr(c, -54, -34, 108, 76, 14); shape(c, P.tankArmor, 3.5);       // armoured hull
  rr(c, -42, -24, 84, 30, 8); shape(c, '#a5aec0', 3);
  for (let x = -46; x <= 46; x += 23) for (const y of [-28, 34]) dot(c, x, y, 2.6, OUT);   // rivets
  rr(c, -76, -22, 30, 54, 10); shape(c, P.tankArmor, 3);          // gauntlets
  rr(c, 46, -22, 30, 54, 10); shape(c, P.tankArmor, 3);
  circle(c, -61, 40 + sw, 15, '#6f7889', 3);
  circle(c, 61, 40 - sw, 15, '#6f7889', 3);
  rr(c, -24, -74, 48, 42, 12); shape(c, '#6f7889', 3.5);          // helmet
  rr(c, -18, -60, 36, 10, 4); shape(c, '#1d2335', 2.5);           // visor slit
  rr(c, -14, -58, 28, 6, 3); c.fillStyle = f ? P.visor : '#ff8a8a'; c.fill();
}
function drawBlob(c, f) {
  const wob = f ? 3 : -3;
  c.beginPath(); c.ellipse(0, 6, 64 + wob, 58 - wob, 0, 0, TAU); shape(c, P.blobBody, 3.5);
  for (const [x, y, r] of [[-30, -20, 9], [26, -30, 7], [34, 18, 11], [-22, 30, 6]]) dot(c, x, y, r, 'rgba(255,255,255,0.22)');
  for (const [x, y, r] of [[-22, -12, 12], [12, -22, 15], [36, -4, 9], [-38, 10, 8], [4, 8, 10]]) {     // many eyes
    circle(c, x, y, r, '#ffffff', 2.4);
    dot(c, x + r * 0.15, y + r * 0.15, r * 0.45, P.zombieEye);
  }
  c.beginPath(); c.moveTo(-26, 34); c.quadraticCurveTo(0, 50 + wob, 26, 34); c.lineWidth = 3.5; c.strokeStyle = OUT; c.stroke();
  for (const x of [-16, -6, 4, 14]) polyShape(c, [x, 38, x + 5, 38, x + 2.5, 45], '#ffffff', 1.6);
  for (const [x, y] of [[-50, 44], [44, 50], [-8, 62]]) ellipse(c, x, y + (f ? 2 : 0), 6, 9, P.blobBody, 2.4);  // drips
}
function drawNecro(c, f) {
  const sw = f ? 1.5 : -1.5;
  polyShape(c, [-46, 60, -30, -20, 30, -20, 46, 60], P.necroRobe, 3.5);      // robe
  polyShape(c, [-46, 60, -36, 50, -26, 60, -16, 50, -6, 60, 4, 50, 14, 60, 24, 50, 34, 60, 46, 60, 46, 64, -46, 64], P.necroRobe, 2.5);
  limb(c, 46, -40, 7, 104, '#5a4030', 0.02);                       // staff
  circle(c, 47, -44, 13, P.necroGlow, 3);
  dot(c, 43, -48, 4, 'rgba(255,255,255,0.8)');
  limb(c, -38, -14, 14, 38, P.necroRobe, 0.4 + sw * 0.03);
  circle(c, -49, 20, 8, P.bone, 2.4);
  limb(c, 36, -14, 14, 30, P.necroRobe, -0.35);
  c.beginPath(); c.arc(0, -36, 31, Math.PI * 0.8, Math.PI * 2.2); c.lineTo(24, -8); c.lineTo(-24, -8); c.closePath(); shape(c, P.necroRobe, 3.5); // hood (behind)
  c.beginPath(); c.arc(0, -34, 24, 0, TAU); c.fillStyle = '#1d2335'; c.fill();                 // its dark inside
  circle(c, 0, -32, 19, P.bone, 3);                                // skull
  dot(c, -7, -35, 5.5, '#1d2335'); dot(c, 7, -35, 5.5, '#1d2335');
  dot(c, -7, -35, f ? 3 : 2.2, P.necroGlow); dot(c, 7, -35, f ? 2.2 : 3, P.necroGlow);
  polyShape(c, [-2, -27, 2, -27, 0, -23], '#1d2335', 1);           // nose
  for (let i = -2; i <= 2; i++) { rr(c, i * 4.5 - 1.8, -21, 3.6, 5, 1); shape(c, P.bone, 1.3); }   // teeth
}
function drawGiant(c, f) {
  const sw = f ? 2.5 : -2.5;
  limb(c, -24, 32 + sw, 24, 26, '#3c3f55');
  limb(c, 24, 32 - sw, 24, 26, '#3c3f55');
  rr(c, -50, -30, 100, 70, 26); shape(c, P.giantSkin, 3.5);       // torso
  rr(c, -36, 16, 72, 20, 8); shape(c, '#6b5a45', 3);              // loincloth
  limb(c, -40, -20, 22, 46, P.giantSkin, Math.PI - 0.35);          // arms up holding the boulder
  limb(c, 40, -20, 22, 46, P.giantSkin, Math.PI + 0.35);
  circle(c, 0, -30, 14, P.giantSkin, 3);                          // tiny head
  zombieFace(c, 0, -30, 14, '#ffea00');
  c.beginPath(); c.ellipse(0, -72, 40, 26, 0, 0, TAU); shape(c, P.boulder, 3.5);       // boulder
  for (const [x, y, r] of [[-14, -78, 6], [12, -66, 8], [22, -80, 4]]) dot(c, x, y, r, 'rgba(0,0,0,0.18)');
}
function drawHound(c, f) {
  const sw = f ? 4 : -4;
  for (const [x, y, d] of [[-40, 18, 1], [40, 18, -1], [-28, 40, -1], [28, 40, 1]]) limb(c, x, y + d * sw, 14, 22, P.houndBody, d * 0.3);
  ellipse(c, 0, 8, 58, 34, P.houndBody, 3.5);                     // low, wide body
  for (let i = -3; i <= 3; i++) polyShape(c, [i * 13 - 6, -20, i * 13, -40 - (i % 2 ? 0 : 6), i * 13 + 6, -20], P.houndSpikes, 2.2);
  ellipse(c, 0, -2, 30, 26, P.houndBody, 3);                      // head
  rr(c, -24, 6, 48, 22, 10); shape(c, '#4a3526', 3);              // jaws
  for (let i = 0; i < 6; i++) polyShape(c, [-20 + i * 8, 8, -16 + i * 8, 8, -18 + i * 8, 16], '#ffffff', 1.4);
  dot(c, -12, -8, 6, '#ffea00'); dot(c, 12, -8, 6, '#ffea00');
  dot(c, -12, -8, 3, P.zombieEye); dot(c, 12, -8, 3, P.zombieEye);
}
const BOSS_DRAW = { king: drawKing, butcher: drawButcher, acid: drawAcidMother, tank: drawTankBoss, blob: drawBlob, necro: drawNecro, giant: drawGiant, hound: drawHound };

// ── vehicles & support (top-down) ────────────────────────────────────────────
function drawBus(c, f) {                               // drives DOWN: front (windscreen) at the bottom
  rr(c, -33, -66, 66, 132, 10); shape(c, P.busBody, 3);
  rr(c, -27, 44, 54, 16, 4); shape(c, P.busWindow, 2.4);        // cracked windscreen
  c.lineWidth = 1.6; c.strokeStyle = '#d7e3ec'; c.beginPath(); c.moveTo(-8, 46); c.lineTo(0, 52); c.lineTo(-4, 58); c.moveTo(0, 52); c.lineTo(10, 49); c.stroke();
  for (let i = 0; i < 4; i++) {                                   // windows with zombie passengers
    rr(c, -27, -52 + i * 22, 54, 16, 3); shape(c, P.busWindow, 2);
    dot(c, -12 + (i % 2) * 20, -44 + i * 22, 5, P.zombieSkin);
  }
  rr(c, -30, -64, 60, 8, 3); shape(c, '#d79a00', 2);
  dot(c, -24, 63, 4, f ? '#ff3b3b' : '#ffe066'); dot(c, 24, 63, 4, f ? '#ffe066' : '#ff3b3b');
  for (const [x, y, r] of [[18, -10, 6], [-20, 20, 5], [8, 30, 4]]) dot(c, x, y, r, 'rgba(120,60,20,0.35)');   // rust
}
function drawCar(c, f) {
  rr(c, -23, -39, 46, 78, 12); shape(c, P.carBody, 3);
  rr(c, -18, 8, 36, 16, 5); shape(c, P.busWindow, 2.2);          // windscreen (front, bottom)
  rr(c, -17, -24, 34, 26, 6); shape(c, '#b33a3a', 2.2);           // roof
  dot(c, -6, 15, 5, P.zombieSkin);                                // zombie driver
  dot(c, -16, 36, 3.5, f ? '#fff6b0' : '#ffe066'); dot(c, 16, 36, 3.5, f ? '#fff6b0' : '#ffe066');
  for (const [x, y, r] of [[12, -32, 5], [-14, 28, 4]]) dot(c, x, y, r, 'rgba(60,20,10,0.3)');
}
function drawAllyTank(c) {                             // ours: faces UP
  rr(c, -29, -36, 12, 74, 5); shape(c, '#3d4a2c', 2.4);          // tracks
  rr(c, 17, -36, 12, 74, 5); shape(c, '#3d4a2c', 2.4);
  for (let y = -30; y <= 30; y += 10) { dot(c, -23, y, 2, '#6d7a55'); dot(c, 23, y, 2, '#6d7a55'); }
  rr(c, -20, -30, 40, 62, 8); shape(c, P.allyTank, 3);            // hull
  rr(c, -4, -52, 8, 34, 3); shape(c, '#4d6331', 2.4);             // barrel
  circle(c, 0, 2, 15, '#6f8f4a', 3);                              // turret
  c.fillStyle = '#ffffff';                                        // star
  c.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7, a = (i / 10) * TAU - Math.PI / 2; c.lineTo(Math.cos(a) * r, 2 + Math.sin(a) * r); }
  c.closePath(); c.fill();
}
function drawAllyTruck(c) {
  rr(c, -24, -40, 48, 30, 8); shape(c, P.allyTruck, 3);           // cab (front, top)
  rr(c, -18, -38, 36, 10, 3); shape(c, P.busWindow, 2);
  rr(c, -26, -12, 52, 54, 6); shape(c, P.allyCanvas, 3);          // covered cargo
  for (let y = -4; y < 40; y += 12) { c.lineWidth = 2; c.strokeStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.moveTo(-24, y); c.lineTo(24, y); c.stroke(); }
  rr(c, -11, 6, 22, 22, 6); shape(c, '#ffffff', 2.4);             // big "+"
  c.fillStyle = P.uiGood; c.fillRect(-2.5, 9, 5, 16); c.fillRect(-8, 14.5, 16, 5);
}
function drawHeli(c) {                                 // body only; the rotor spins at draw time
  rr(c, -4, 14, 8, 44, 3); shape(c, P.heliBody, 2.4);             // tail boom
  rr(c, -14, 52, 28, 6, 3); shape(c, P.heliBody, 2.2);            // tail fin
  ellipse(c, 0, 0, 18, 26, P.heliBody, 3);                        // cabin
  ellipse(c, 0, -12, 11, 10, '#bfe3ff', 2.4);                     // canopy
  dot(c, -4, -15, 3, 'rgba(255,255,255,0.7)');
  rr(c, -24, -4, 8, 22, 3); shape(c, '#3a4a2a', 2.2);             // gun pods
  rr(c, 16, -4, 8, 22, 3); shape(c, '#3a4a2a', 2.2);
}
function drawJet(c) {                                  // flies DOWN the screen
  polyShape(c, [0, 34, 8, 14, 34, -2, 34, -10, 8, -6, 6, -26, 14, -34, -14, -34, -6, -26, -8, -6, -34, -10, -34, -2, -8, 14], P.jet, 2.6);
  ellipse(c, 0, 10, 4, 9, '#bfe3ff', 1.8);
}
function drawCoin(c) {
  circle(c, 0, 0, 8, P.coin, 2.2);
  c.beginPath(); c.arc(0, 0, 4.6, 0, TAU); c.lineWidth = 2; c.strokeStyle = P.coinDark; c.stroke();
  dot(c, -2.5, -2.5, 1.8, 'rgba(255,255,255,0.7)');
}

/** Side-view chicken facing right (the egg launcher). flap 0/1 = wing down/up. */
function drawChicken(c, flap, s = 1) {
  c.save(); c.scale(s, s);
  c.lineWidth = 2.6; c.strokeStyle = OUT;
  c.strokeStyle = P.chickenBeak; c.lineWidth = 3;                                     // legs
  c.beginPath(); c.moveTo(-3, 12); c.lineTo(-4, 21); c.moveTo(4, 12); c.lineTo(5, 21); c.stroke();
  c.strokeStyle = OUT; c.lineWidth = 2.6;
  polyShape(c, [-22, -6, -14, -12, -12, 2], P.chickenTail);                           // tail
  ellipse(c, -2, 4, 16, 12, P.chickenBody);                                           // body
  circle(c, 12, -10, 8.5, P.chickenBody);                                             // head
  polyShape(c, [9, -18, 11, -23, 13, -18.5, 15.5, -22.5, 16.5, -17], P.chickenComb);   // comb
  polyShape(c, [19, -12, 27, -9, 19, -6], P.chickenBeak);                              // beak
  c.beginPath(); c.ellipse(19, -3, 2.4, 3.6, 0, 0, TAU); shape(c, P.chickenComb, 2);   // wattle
  dot(c, 14, -12, 2.3, OUT); dot(c, 14.7, -12.8, 0.8, '#ffffff');                     // eye
  c.save(); c.translate(-3, 2); c.rotate(flap ? -0.75 : 0.15);                        // wing
  c.beginPath(); c.ellipse(-4, 0, 10, 6.5, 0, 0, TAU); shape(c, P.chickenWing); c.restore();
  c.restore();
}
/** Wooden weapon crate (the weapon icon floats above it at draw time). */
function drawCrate(c) {
  rr(c, -23, -21, 46, 42, 6); shape(c, P.crate, 3);
  c.strokeStyle = P.crateDark; c.lineWidth = 4;
  c.beginPath(); c.moveTo(-17, -15); c.lineTo(17, 15); c.moveTo(17, -15); c.lineTo(-17, 15); c.stroke();
  rr(c, -23, -21, 46, 42, 6); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
  rr(c, -9, -6, 18, 12, 3); shape(c, P.gateRare, 2.5);
  c.fillStyle = OUT; c.font = '900 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, 0.5);
}

// ── icons (gates + HUD) — drawn directly with paths ─────────────────────────
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
  } else if (k === 'minigun') {
    rr(c, -16, -7, 16, 14, 3); c.fill(); c.stroke();                   // motor block
    for (const y of [-4.5, 0, 4.5]) { rr(c, 0, y - 1.6, 19, 3.2, 1.2); c.fill(); c.stroke(); } // 3 barrels
    rr(c, 14, -7, 4, 14, 1.5); c.fillStyle = light; c.fill(); c.stroke();
    c.fillStyle = body; poly(c, [-12, 6, -7, 6, -9, 13, -14, 13]);     // grip
    rr(c, -13, 7, 9, 5, 1.5); c.fillStyle = P.coin; c.fill(); c.stroke(); // ammo belt
  } else if (k === 'laser') {
    rr(c, -15, -6, 24, 11, 5); c.fill(); c.stroke();                   // sleek body
    rr(c, 7, -3.5, 11, 6, 3); c.fillStyle = P.laser; c.fill(); c.stroke(); // emitter
    c.fillStyle = light; rr(c, -9, -3.5, 12, 3, 1.5); c.fill();
    c.fillStyle = P.laser; for (const x of [-11, -6, -1]) { rr(c, x, 1, 3, 2.5, 1); c.fill(); }
    c.fillStyle = body; poly(c, [-6, 5, -1, 5, -3, 12, -8, 12]);       // grip
  } else if (k === 'water') {                                          // clown squirt gun
    c.fillStyle = P.clownA; rr(c, -15, -5, 23, 10, 5); c.fill(); c.stroke();          // candy body
    c.fillStyle = P.clownB; rr(c, 7, -3, 11, 5, 2.5); c.fill(); c.stroke();           // nozzle
    c.fillStyle = P.water; c.beginPath(); c.arc(-5, -10, 6.5, 0, TAU); c.fill(); c.stroke(); // water tank
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(-7, -12, 2.2, 0, TAU); c.fill();
    c.fillStyle = P.clownC; poly(c, [-11, 4, -5, 4, -7, 13, -13, 13]);                // grip
    c.fillStyle = P.clownB; for (const [x, y] of [[-11, -1], [-4, 1.5], [2, -1.5]]) { c.beginPath(); c.arc(x, y, 1.7, 0, TAU); c.fill(); }
    c.fillStyle = P.water; for (const [x, y, r] of [[21, -2, 2], [25, -4, 1.4], [25, 0.5, 1.2]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  } else if (k === 'chicken') {                                        // a chicken (it shoots eggs)
    drawChicken(c, 0, 0.62);
  } else if (k === 'flamer') {                                         // flamethrower
    c.fillStyle = P.flameTank; rr(c, -17, -9, 9, 17, 4); c.fill(); c.stroke();         // fuel tank
    c.fillStyle = body; rr(c, -9, -4, 18, 8, 2.5); c.fill(); c.stroke();               // body
    rr(c, 8, -2.5, 8, 5, 1.5); c.fill(); c.stroke();                                   // nozzle
    poly(c, [-5, 3, -1, 3, -3, 11, -7, 11]);                                           // grip
    c.fillStyle = P.flame; c.beginPath(); c.moveTo(16, -4); c.quadraticCurveTo(26, -6, 24, 0); c.quadraticCurveTo(26, 6, 16, 4); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = P.flameCore; c.beginPath(); c.ellipse(19, 0, 3, 2, 0, 0, TAU); c.fill();
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
export const WEAPON_ICON_KINDS = ['rifle', 'smg', 'shotgun', 'minigun', 'rocket', 'laser', 'water', 'chicken', 'flamer'];
export function drawIcon(c, kind, x, y, s, color = '#ffffff') {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.strokeStyle = OUT; c.lineWidth = 2.6;
  c.fillStyle = color;
  if (kind === 'weapon' || WEAPON_ICON_KINDS.includes(kind)) {
    drawGun(c, kind === 'weapon' ? 'smg' : kind);
  } else if (kind === 'rate') {                         // three stacked chevrons
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.moveTo(-10, 6 - i * 8 + 4); c.lineTo(0, -4 - i * 8 + 4); c.lineTo(10, 6 - i * 8 + 4);
      c.lineWidth = 7; c.strokeStyle = OUT; c.stroke();
      c.lineWidth = 3.6; c.strokeStyle = color; c.stroke();
    }
  } else if (kind === 'damage') {                       // impact star
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 6 : 14, a = (i / 16) * TAU - Math.PI / 2;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fill(); c.stroke();
  } else if (kind === 'airstrike') {                    // jet + falling bomb
    c.save(); c.scale(0.5, 0.5); c.translate(-6, -8); drawJet(c); c.restore();
    c.save(); c.translate(10, 8); c.rotate(-0.3);
    rr(c, -3.5, -7, 7, 13, 3.5); shape(c, '#454c60', 2); polyShape(c, [-4, -7, 4, -7, 0, -12], '#454c60', 2); c.restore();
  } else if (kind === 'heli') {
    c.save(); c.scale(0.55, 0.55); c.translate(0, -8); drawHeli(c);
    c.lineWidth = 4; c.strokeStyle = OUT; c.beginPath(); c.moveTo(-36, -2); c.lineTo(36, -2); c.moveTo(0, -38); c.lineTo(0, 34); c.stroke();
    c.restore();
  } else if (kind === 'tank') {
    c.save(); c.scale(0.42, 0.42); drawAllyTank(c); c.restore();
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
    brute: [72, 76, (c, f) => drawBrute(c, f, true)],
    bruteBroken: [72, 76, (c, f) => drawBrute(c, f, false)],
    splitter: [56, 60, drawSplitter],
    mini: [30, 30, drawMini],
    exploder: [52, 76, drawExploder],
    spitter: [46, 64, drawSpitter],
    shaman: [52, 60, drawShaman],
    bus: [72, 138, drawBus],
    car: [52, 84, drawCar],
  };
  S.zombie = {};
  for (const key in Z) {
    const [w, h, fn] = Z[key];
    const frames = [bake(w, h, k, c => fn(c, 0)), bake(w, h, k, c => fn(c, 1))];
    S.zombie[key] = { frames, flash: flashOf(frames[0], k) };
  }
  S.boss = {};
  for (const kind in BOSS_DRAW) {
    const fn = BOSS_DRAW[kind];
    const frames = [bake(200, 204, k, c => fn(c, 0)), bake(200, 204, k, c => fn(c, 1))];
    S.boss[kind] = { frames, flash: flashOf(frames[0], k) };
  }
  S.allyTank = bake(64, 110, k, drawAllyTank);
  S.allyTruck = bake(60, 92, k, drawAllyTruck);
  S.heli = bake(56, 124, k, drawHeli);
  S.jet = bake(76, 76, k, drawJet);
  S.coin = bake(20, 20, k, drawCoin);
  S.chicken = [bake(64, 56, k, c => drawChicken(c, 0)), bake(64, 56, k, c => drawChicken(c, 1))];
  S.crate = bake(54, 50, k, drawCrate);
  return S;
}
