// Canvas renderer: road, gates, zombies, boss, bullets, the crowd, particles and banners.
// Reads World state (never mutates it). Pools for particles/floaters: no allocation per frame.
import { CONFIG } from './config.js';
import { THEME } from './theme.js';
import { bakeSprites, drawIcon, roundRect } from './art.js';
import { FORMATION, crowdRadius, drawnCount } from './crowd.js';
import { gateTone, gateLabel, isSoldierGate } from './gates.js';
import { lanesFor } from './levelgen.js';
import { t, bossName, zombieName } from './i18n.js';
import { fmtNum } from './util.js';

const C = CONFIG, P = THEME.palette;
const W = C.view.w, H = C.view.h;
const RL = C.road.left, RR = C.road.right, RW = RR - RL;
const CY = C.crowd.y;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const TONE = { good: P.gateGood, bad: P.gateBad, neutral: P.gateNeutral };
const WEAPON_IDS = C.weapons.map(w => w.id);
const SOLDIER_ORDER = FORMATION.map((p, i) => i).sort((a, b) => FORMATION[a].y - FORMATION[b].y);
const COIN_TARGET = { x: 492, y: 40 }; // logical position of the HUD coin counter
const HUD_BAND = 118; // logical px: bottom of the DOM HUD

function hash(i) {
  let h = Math.imul(i ^ 0x5bd1e995, 0x2c1b3c6d);
  h ^= h >>> 15; h = Math.imul(h, 0x297a2d39); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d', { alpha: false });
    this.k = 0;
    this.S = null;
    this.font = '';
    // particles
    this.parts = [];
    for (let i = 0; i < C.fx.maxParticles; i++) this.parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '#fff', kind: 0, rot: 0, vr: 0, sx: 0, sy: 0 });
    this.nP = 0;
    this.floaters = [];
    for (let i = 0; i < C.fx.maxFloaters; i++) this.floaters.push({ x: 0, y: 0, text: '', color: '#fff', life: 0, max: 1, size: 30 });
    this.nF = 0;
    this.banner = { text: '', sub: '', life: 0, max: 1, color: '#fff' };
    this.shakeT = 0; this.shakeMag = 0;
    this.dmgFlash = 0;
    this.pop = 0; this.popGood = true; this.lastSoldiers = -1;
    this.coinsArrived = 0;
    this.zsort = new Array(C.maxZombies).fill(null);
    this.time = 0;
  }

  /** scale = CSS px per logical px; dpr = devicePixelRatio (capped). */
  resize(scale, dpr) {
    const k = scale * dpr;
    this.cv.width = Math.round(W * k);
    this.cv.height = Math.round(H * k);
    if (Math.abs(k - this.k) > 0.01 || !this.S) this.S = bakeSprites(k);
    this.k = k;
    this.font = '';
  }

  reset() {
    this.nP = 0; this.nF = 0; this.banner.life = 0; this.shakeT = 0; this.dmgFlash = 0;
    this.pop = 0; this.lastSoldiers = -1;
  }

  // ── fx spawning ────────────────────────────────────────────────────────────
  part(kind, x, y, vx, vy, life, size, color) {
    if (this.nP >= this.parts.length) return null;
    const p = this.parts[this.nP++];
    p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life;
    p.size = size; p.color = color; p.rot = Math.random() * 6.28; p.vr = (Math.random() - 0.5) * 12;
    p.sx = x; p.sy = y;
    return p;
  }
  burst(x, y, n, color, speed, size, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = speed * (0.4 + Math.random() * 0.8);
      this.part(0, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), color);
    }
  }
  confetti(x, y, n, colors, speed) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, s = speed * (0.5 + Math.random() * 0.7);
      this.part(2, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.9 + Math.random() * 0.6, 5 + Math.random() * 4, colors[i % colors.length]);
    }
  }
  ring(x, y, r, color, life = 0.35) { this.part(1, x, y, 0, 0, life, r, color); }
  coinFly(x, y) { this.part(3, x, y, (Math.random() - 0.5) * 200, -120 - Math.random() * 120, 0.75 + Math.random() * 0.2, 1, P.coin); }
  floater(x, y, text, color, size = 30) {
    if (this.nF >= this.floaters.length) return;
    const f = this.floaters[this.nF++];
    f.x = x; f.y = y; f.text = text; f.color = color; f.life = 1.1; f.max = 1.1; f.size = size;
  }
  showBanner(text, sub, color, life = 2) { const b = this.banner; b.text = text; b.sub = sub || ''; b.color = color; b.life = life; b.max = life; }
  shake(mag, time) { this.shakeMag = Math.max(this.shakeMag * (this.shakeT > 0 ? 1 : 0), mag); this.shakeT = Math.max(this.shakeT, time); }

  /** Visual reaction to a world event (audio is routed by main.js). */
  onEvent(e, world) {
    switch (e.type) {
      case 'zhit':
        if (Math.random() < 0.35) this.part(4, e.x, e.y, (Math.random() - 0.5) * 160, -60 - Math.random() * 100, 0.18, 3, P.bulletCore);
        break;
      case 'zdie': {
        const big = e.b >= 25;
        this.burst(e.x, e.y, big ? 16 : 9, P.blood, big ? 260 : 190, big ? 7 : 5, 0.5);
        this.burst(e.x, e.y, 4, P.zombieSkinDark, 150, 4, 0.4);
        this.ring(e.x, e.y, e.b * 1.6 || 30, 'rgba(255,255,255,0.8)');
        for (let i = 0; i < Math.min(5, e.a); i++) this.coinFly(e.x, e.y);
        break;
      }
      case 'boom':
        this.ring(e.x, e.y, e.a, 'rgba(255,170,60,0.9)', 0.3);
        this.burst(e.x, e.y, 10, P.rocket, 260, 6, 0.35);
        break;
      case 'contact': {
        const n = Math.min(14, 4 + e.a);
        this.burst(e.x, e.y + 10, n, P.soldier, 220, 5, 0.5);
        this.burst(e.x, e.y, 6, P.blood, 180, 5, 0.4);
        this.floater(world.crowdX + (Math.random() - 0.5) * 40, CY - crowdRadius(world.soldiers) * 0.7 - 60, '−' + fmtNum(e.a), P.uiBad, 30);
        this.dmgFlash = Math.min(1, this.dmgFlash + 0.45);
        break;
      }
      case 'gate': {
        const good = e.b > 0;
        const col = good ? P.gateGood : P.gateBad;
        this.confetti(e.x, e.y, good ? 22 : 12, good ? [P.gateGood, P.gateRare, '#ffffff', P.soldier] : [P.gateBad, '#ffffff', '#7a1d1d'], good ? 420 : 300);
        this.ring(e.x, e.y, 70, good ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,90,0.9)', 0.4);
        if (e.s === 'add' || e.s === 'mult') {
          const d = e.a;
          this.floater(e.x, e.y - 40, (d >= 0 ? '+' : '−') + fmtNum(Math.abs(d)), col, 40);
        } else {
          const label = e.s === 'rate' ? t('gateRate') : e.s === 'damage' ? t('gateDamage') : t('gateWeapon');
          this.floater(e.x, e.y - 40, label + '!', P.gateRare, 30);
        }
        break;
      }
      case 'gatestep':
        this.part(4, e.x + (Math.random() - 0.5) * 60, e.y + 30, 0, -120, 0.3, 4, '#ffffff');
        if (e.b) this.ring(e.x, e.y, 60, 'rgba(255,255,255,0.9)', 0.3);
        break;
      case 'weapon':
        this.showBanner(t('newWeapon'), t(WEAPON_IDS[e.a]), P.gateRare, 1.8);
        this.confetti(e.x, e.y - 40, 26, [P.gateRare, '#ffffff', P.soldier], 460);
        break;
      case 'boss':
        this.showBanner(t('bossIncoming'), bossName(world.levelInt), P.uiBad, 2.4);
        this.shake(C.fx.shakeBoss, 0.6);
        break;
      case 'stomp':
        this.shake(C.fx.shakeStomp, 0.18);
        this.ring(e.x, e.y + 70, 90, 'rgba(120,90,60,0.55)', 0.4);
        break;
      case 'bosshit':
        if (Math.random() < 0.3) this.part(4, e.x, e.y, (Math.random() - 0.5) * 220, -80 - Math.random() * 120, 0.2, 3, P.bulletCore);
        break;
      case 'bossdie':
        this.burst(e.x, e.y, 40, P.blood, 420, 9, 0.9);
        this.confetti(e.x, e.y, 50, [P.gateGood, P.gateRare, '#ffffff', P.soldier, P.uiBad], 620);
        this.ring(e.x, e.y, 200, 'rgba(255,255,255,0.95)', 0.6);
        for (let i = 0; i < Math.min(14, e.a); i++) this.coinFly(e.x + (Math.random() - 0.5) * 80, e.y);
        this.shake(C.fx.shakeBoss * 1.4, 0.7);
        break;
      case 'lost':
        this.burst(e.x, e.y, 24, P.soldier, 300, 6, 0.8);
        this.dmgFlash = 1;
        break;
    }
  }

  // ── per-frame update of fx ─────────────────────────────────────────────────
  updateFx(dt) {
    this.time += dt;
    for (let i = 0; i < this.nP;) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { if (p.kind === 3) this.coinsArrived++; this.killPart(i); continue; }
      if (p.kind === 3) {
        const u = 1 - p.life / p.max;
        if (u > 0.3) { // home in on the HUD coin counter
          const e = (u - 0.3) / 0.7, k = e * e;
          p.x += (COIN_TARGET.x - p.x) * Math.min(1, k * 0.5 + dt * 6);
          p.y += (COIN_TARGET.y - p.y) * Math.min(1, k * 0.5 + dt * 6);
        } else { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
      } else if (p.kind === 2) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt; p.vx *= Math.pow(0.2, dt); p.rot += p.vr * dt;
      } else if (p.kind !== 1) {
        p.x += p.vx * dt; p.y += p.vy * dt; const d = Math.pow(0.05, dt); p.vx *= d; p.vy *= d;
      }
      i++;
    }
    for (let i = 0; i < this.nF;) {
      const f = this.floaters[i];
      f.life -= dt; f.y -= 70 * dt;
      if (f.life <= 0) { const last = --this.nF; this.floaters[i] = this.floaters[last]; this.floaters[last] = f; continue; }
      i++;
    }
    if (this.banner.life > 0) this.banner.life -= dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.dmgFlash > 0) this.dmgFlash = Math.max(0, this.dmgFlash - dt * 2.2);
    if (this.pop > 0) this.pop = Math.max(0, this.pop - dt * 3.5);
  }
  killPart(i) { const last = --this.nP; const t = this.parts[i]; this.parts[i] = this.parts[last]; this.parts[last] = t; }

  // ── text helpers ───────────────────────────────────────────────────────────
  setFont(size, weight = 900) {
    const f = weight + ' ' + size + 'px ' + FONT;
    if (f !== this.font) { this.c.font = f; this.font = f; }
  }
  text(s, x, y, size, fill, outline = P.outline, lw = 0, align = 'center') {
    const c = this.c;
    this.setFont(size);
    c.textAlign = align; c.textBaseline = 'middle';
    if (lw > 0 || outline) { c.lineWidth = lw || Math.max(3, size * 0.16); c.strokeStyle = outline; c.lineJoin = 'round'; c.strokeText(s, x, y); }
    c.fillStyle = fill; c.fillText(s, x, y);
  }

  // ── frame ──────────────────────────────────────────────────────────────────
  draw(world) {
    const c = this.c, k = this.k;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.globalAlpha = 1;
    let sx = 0, sy = 0;
    if (this.shakeT > 0) {
      const m = this.shakeMag * Math.min(1, this.shakeT * 4);
      sx = (Math.random() - 0.5) * 2 * m; sy = (Math.random() - 0.5) * 2 * m;
      c.translate(sx, sy);
    }
    this.drawRoad(world);
    if (world) {
      for (const r of world.rows) this.drawRow(r, world);
      this.drawShadows(world);
      this.drawZombiesAndBoss(world);
      this.drawBullets(world);
      this.drawCrowd(world);
      this.drawZombieLabels(world);
      this.drawCrowdNumber(world);
    }
    this.drawParticles();
    c.setTransform(k, 0, 0, k, 0, 0);
    if (world && world.boss) this.drawBossBar(world);
    this.drawBanner();
    if (this.dmgFlash > 0) {
      if (!this.vignette) {
        this.vignette = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
        this.vignette.addColorStop(0, 'rgba(239,68,68,0)');
        this.vignette.addColorStop(1, 'rgba(239,68,68,0.5)');
      }
      c.globalAlpha = this.dmgFlash; c.fillStyle = this.vignette; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
    }
  }

  drawRoad(world) {
    const c = this.c;
    const dist = world ? world.distance : this.time * C.track.scrollSpeed;
    c.fillStyle = P.grass; c.fillRect(-20, -20, W + 40, H + 40);
    // grass bands
    c.fillStyle = P.grassAlt;
    let off = dist % 160;
    for (let y = off - 160; y < H + 20; y += 160) c.fillRect(-20, y, W + 40, 80);
    // decorations (anchored to the track)
    const tile = 150, first = Math.floor((dist + CY - H - 80) / tile), last = Math.ceil((dist + CY + 120) / tile);
    for (let i = first; i <= last; i++) {
      const y = CY - (i * tile - dist);
      for (let side = 0; side < 2; side++) {
        const h = hash(i * 2 + side);
        if (h < 0.35) continue;
        const x = side ? RR + 22 + hash(i * 7 + side) * 20 : RL - 22 - hash(i * 7 + side) * 20;
        if (h < 0.8) this.bush(x, y, 10 + hash(i * 3 + side) * 6);
        else this.rock(x, y);
      }
    }
    // road
    c.fillStyle = P.roadEdge; c.fillRect(RL - 10, -20, RW + 20, H + 40);
    c.fillStyle = P.road; c.fillRect(RL - 4, -20, RW + 8, H + 40);
    c.fillStyle = P.roadAlt;
    off = dist % 140;
    for (let y = off - 140; y < H + 20; y += 140) c.fillRect(RL - 4, y, RW + 8, 56);
    // curbs
    off = dist % 56;
    for (let y = off - 56; y < H + 20; y += 56) {
      c.fillStyle = P.curbA; c.fillRect(RL - 16, y, 10, 28); c.fillRect(RR + 6, y, 10, 28);
      c.fillStyle = P.curbB; c.fillRect(RL - 16, y + 28, 10, 28); c.fillRect(RR + 6, y + 28, 10, 28);
    }
    c.lineWidth = 2; c.strokeStyle = P.outline; c.globalAlpha = 0.35;
    c.beginPath(); c.moveTo(RL - 16, -20); c.lineTo(RL - 16, H + 20); c.moveTo(RR + 16, -20); c.lineTo(RR + 16, H + 20); c.stroke();
    c.globalAlpha = 1;
    // lane dashes
    const lanes = this.currentLanes(world);
    c.fillStyle = P.laneLine;
    off = dist % 90;
    c.globalAlpha = 0.85;
    for (let l = 1; l < lanes; l++) {
      const x = RL + (RW * l) / lanes;
      for (let y = off - 90; y < H + 20; y += 90) c.fillRect(x - 3, y, 6, 46);
    }
    c.globalAlpha = 1;
  }
  currentLanes(world) {
    if (!world) return 2;
    let best = null;
    for (const r of world.rows) if (!r.crossed && (!best || r.y > best.y)) best = r;
    if (best) return best.lanes;
    return world.endless ? lanesFor(world.levelInt) : world.def.lanes;
  }
  bush(x, y, r) {
    const c = this.c;
    c.lineWidth = 2.5; c.strokeStyle = P.outline;
    c.fillStyle = P.bushDark;
    c.beginPath(); c.arc(x - r * 0.7, y + 2, r * 0.8, 0, 6.283); c.arc(x + r * 0.7, y + 3, r * 0.75, 0, 6.283); c.fill();
    c.beginPath(); c.arc(x - r * 0.7, y + 2, r * 0.8, 0, 6.283); c.stroke();
    c.beginPath(); c.arc(x + r * 0.7, y + 3, r * 0.75, 0, 6.283); c.stroke();
    c.fillStyle = P.bush; c.beginPath(); c.arc(x, y - 3, r, 0, 6.283); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.45, r * 0.3, 0, 6.283); c.fill();
  }
  rock(x, y) {
    const c = this.c;
    c.fillStyle = P.rock; c.lineWidth = 2.5; c.strokeStyle = P.outline;
    c.beginPath(); c.ellipse(x, y, 13, 9, 0, 0, 6.283); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x - 4, y - 3, 4, 2.5, 0, 0, 6.283); c.fill();
  }

  drawRow(r, world) {
    const c = this.c, GH = C.gates.h, pad = C.gates.pad;
    const alpha = 1 - r.fade;
    if (alpha <= 0.01) return;
    const top = r.y - GH / 2;
    c.globalAlpha = alpha;
    for (let i = 0; i < r.lanes; i++) {
      const g = r.gates[i];
      const x = RL + i * r.laneW + pad, w = r.laneW - pad * 2;
      const tone = gateTone(g), col = TONE[tone];
      const rare = !isSoldierGate(g);
      const chosen = r.crossed && r.chosen === i;
      let a = alpha;
      if (r.crossed) a = chosen ? alpha * (1 - r.fade) : alpha * 0.5;
      c.globalAlpha = a;
      // panel
      roundRect(c, x, top, w, GH, 16);
      c.globalAlpha = a * 0.5; c.fillStyle = col; c.fill();
      c.globalAlpha = a;
      c.lineWidth = 9; c.strokeStyle = P.outline; c.stroke();
      c.lineWidth = 5; c.strokeStyle = rare ? P.gateRare : col; c.stroke();
      if (r.flash[i] > 0) { c.globalAlpha = a * r.flash[i] * 0.4; c.fillStyle = '#ffffff'; c.fill(); c.globalAlpha = a; }
      // header cap
      roundRect(c, x - 2, top - 10, w + 4, 20, 9);
      c.fillStyle = rare ? P.gateRare : col; c.fill(); c.lineWidth = 3; c.strokeStyle = P.outline; c.stroke();
      const cx = x + w / 2, cy = r.y + 6;
      if (rare) {
        const cap = g.kind === 'rate' ? t('gateRate') : g.kind === 'damage' ? t('gateDamage') : t('gateWeapon');
        this.text(cap, cx, top, 13, P.outline, null, 0);
        let icon = g.kind, lbl;
        if (g.kind === 'weapon') {
          const next = world.stats.weapon + 1;
          if (next < WEAPON_IDS.length) { icon = WEAPON_IDS[next]; lbl = t(icon); }
          else { icon = 'damage'; lbl = '×' + C.gates.rare.weaponMaxedDamage; }
        } else lbl = gateLabel(g);
        drawIcon(c, icon, cx, cy - 16, icon === 'rate' || icon === 'damage' ? 1.25 : 1.55, '#ffffff');
        this.text(lbl, cx, cy + 26, lbl.length > 6 ? 21 : 26, P.gateText, P.outline, 6);
      } else {
        if (g._lk !== (g.kind === 'add' ? g.value : g.idx)) { g._lk = g.kind === 'add' ? g.value : g.idx; g._lbl = gateLabel(g); }
        const size = g._lbl.length > 4 ? (g._lbl.length > 5 ? 32 : 38) : 46;
        this.text(g._lbl, cx, cy, size, P.gateText, P.outline, 8);
        // progress toward the next improvement (shooting the gate)
        const need = g.kind === 'add' ? C.gateHitsPerStep : C.multHitsPerStep;
        const maxed = g.kind === 'add' ? g.value >= g.cap : g.idx >= C.multLadder.length - 1;
        if (!maxed && g.progress > 0) {
          const pw = (w - 28) * Math.min(1, g.progress / need);
          c.fillStyle = 'rgba(29,35,53,0.45)'; roundRect(c, x + 14, top + GH - 15, w - 28, 7, 3.5); c.fill();
          c.fillStyle = '#ffffff'; roundRect(c, x + 14, top + GH - 15, Math.max(7, pw), 7, 3.5); c.fill();
        }
      }
    }
    // posts
    c.globalAlpha = alpha;
    for (let i = 0; i <= r.lanes; i++) {
      const x = RL + i * r.laneW;
      roundRect(c, x - 6, top - 16, 12, GH + 30, 6);
      c.fillStyle = '#5b6478'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = P.outline; c.stroke();
    }
    c.globalAlpha = 1;
  }

  drawShadows(world) {
    const c = this.c;
    c.fillStyle = 'rgba(29,35,53,0.18)';
    c.beginPath();
    for (let j = 0; j < world.nZ; j++) {
      const z = world.zombies[j];
      if (!z.alive) continue;
      c.moveTo(z.x + z.r, z.y + z.r * 0.9);
      c.ellipse(z.x, z.y + z.r * 0.9, z.r, z.r * 0.35, 0, 0, 6.283);
    }
    const n = drawnCount(world.soldiers);
    for (let i = 0; i < n; i++) {
      const f = FORMATION[i], x = world.crowdX + f.x, y = CY + f.y + 14;
      c.moveTo(x + 10, y); c.ellipse(x, y, 10, 4, 0, 0, 6.283);
    }
    if (world.boss) { const b = world.boss; c.moveTo(b.x + 80, b.y + 80); c.ellipse(b.x, b.y + 80, 80, 22, 0, 0, 6.283); }
    c.fill();
  }

  drawZombiesAndBoss(world) {
    const c = this.c, zs = this.zsort, S = this.S;
    let n = 0;
    for (let j = 0; j < world.nZ; j++) if (world.zombies[j].alive) zs[n++] = world.zombies[j];
    for (let i = 1; i < n; i++) { // insertion sort by y (nearly sorted frame to frame)
      const z = zs[i]; let j = i - 1;
      while (j >= 0 && zs[j].y > z.y) { zs[j + 1] = zs[j]; j--; }
      zs[j + 1] = z;
    }
    const boss = world.boss;
    let bossDrawn = !boss;
    const tm = this.time;
    for (let i = 0; i < n; i++) {
      const z = zs[i];
      if (!bossDrawn && z.y > boss.y) { this.drawBoss(boss, tm); bossDrawn = true; }
      const spr = S.zombie[z.type];
      const fr = ((tm * (z.t.speed > 60 ? 9 : 5) + z.phase) | 0) & 1;
      const s = fr ? spr.frames[1] : spr.frames[0];
      const bob = Math.sin(tm * 10 + z.phase) * 1.5;
      c.drawImage(s.cv, z.x - s.w / 2, z.y - s.h / 2 + bob, s.w, s.h);
      if (z.flash > 0.05) { c.globalAlpha = z.flash; c.drawImage(spr.flash.cv, z.x - s.w / 2, z.y - s.h / 2 + bob, s.w, s.h); c.globalAlpha = 1; }
    }
    if (!bossDrawn) this.drawBoss(boss, tm);
    for (let i = 0; i < n; i++) zs[i] = null;
  }

  drawBoss(b, tm) {
    const c = this.c, S = this.S.boss;
    const fr = ((tm * 3) | 0) & 1;
    const s = S.frames[fr];
    const sc = 1 + Math.sin(b.phase * 5.4) * 0.02;
    const w = s.w * sc, h = s.h * sc;
    c.drawImage(s.cv, b.x - w / 2, b.y - h / 2, w, h);
    if (b.flash > 0.05) { c.globalAlpha = b.flash * 0.45; c.drawImage(S.flash.cv, b.x - w / 2, b.y - h / 2, w, h); c.globalAlpha = 1; }
  }

  drawBullets(world) {
    const c = this.c, bs = world.bullets;
    c.lineCap = 'round';
    c.beginPath();
    let any = false;
    for (let i = 0; i < world.nB; i++) {
      const b = bs[i];
      if (b.w === 3) continue;
      c.moveTo(b.x, b.y); c.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016); any = true;
    }
    if (any) {
      c.lineWidth = 7; c.strokeStyle = 'rgba(255,200,40,0.35)'; c.stroke();
      c.lineWidth = 4; c.strokeStyle = P.bullet; c.stroke();
      c.lineWidth = 1.6; c.strokeStyle = P.bulletCore; c.stroke();
    }
    for (let i = 0; i < world.nB; i++) {
      const b = bs[i];
      if (b.w !== 3) continue;
      c.fillStyle = 'rgba(255,170,60,0.5)';
      c.beginPath(); c.arc(b.x, b.y + 14, 7 + Math.random() * 3, 0, 6.283); c.fill();
      c.fillStyle = P.rocket; c.strokeStyle = P.outline; c.lineWidth = 2;
      roundRect(c, b.x - 5, b.y - 12, 10, 22, 5); c.fill(); c.stroke();
    }
    c.lineCap = 'butt';
  }

  drawCrowd(world) {
    const c = this.c, S = this.S.soldier, n = drawnCount(world.soldiers), tm = this.time;
    if (n <= 0) return;
    for (let k = 0; k < SOLDIER_ORDER.length; k++) {
      const i = SOLDIER_ORDER[k];
      if (i >= n) continue;
      const f = FORMATION[i];
      const fr = ((tm * 9 + i * 0.37) | 0) & 1;
      const s = S[fr];
      const bob = Math.sin(tm * 18 + i * 1.7) * 1.3;
      c.drawImage(s.cv, world.crowdX + f.x - s.w / 2, CY + f.y - s.h / 2 + bob, s.w, s.h);
    }
  }

  drawZombieLabels(world) {
    const c = this.c;
    this.setFont(15);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let j = 0; j < world.nZ; j++) {
      const z = world.zombies[j];
      if (!z.alive) continue;
      const hp = Math.ceil(z.hp);
      if (hp !== z._hpShown) { z._hpShown = hp; z._hpStr = fmtNum(hp); }
      const w = 10 + z._hpStr.length * 9, y = z.y - z.r - 24;
      const la = Math.min(1, Math.max(0, (y - 25 - HUD_BAND) / 24)); // fade in once clear of the HUD
      if (la <= 0) continue;
      c.globalAlpha = la;
      c.fillStyle = P.hpPill; roundRect(c, z.x - w / 2, y - 9, w, 18, 9); c.fill();
      c.fillStyle = P.hpText; c.fillText(z._hpStr, z.x, y + 1);
      const name = zombieName(z.type);
      if (name) { this.text(name, z.x, y - 17, 12, '#ffffff', P.outline, 3); this.setFont(15); c.textAlign = 'center'; }
      c.globalAlpha = 1;
    }
  }

  drawCrowdNumber(world) {
    const s = world.soldiers;
    if (s !== this.lastSoldiers) {
      if (this.lastSoldiers >= 0) { this.pop = 1; this.popGood = s > this.lastSoldiers; }
      this.lastSoldiers = s;
      this._soldiersStr = fmtNum(s);
    }
    if (s <= 0) return;
    const c = this.c;
    const R = crowdRadius(s);
    const x = world.crowdX, y = CY - R * C.crowd.squash - 34;
    const sc = 1 + C.fx.popScale * Math.sin(this.pop * Math.PI) * (this.pop > 0 ? 1 : 0);
    const str = this._soldiersStr;
    const size = 30 * sc;
    const w = (20 + str.length * 19) * sc, h = 44 * sc;
    c.fillStyle = this.pop > 0.3 ? (this.popGood ? P.uiGood : P.uiBad) : P.crowdBubble;
    roundRect(c, x - w / 2, y - h / 2, w, h, h / 2); c.fill();
    c.lineWidth = 3.5; c.strokeStyle = P.outline; c.stroke();
    c.beginPath(); c.moveTo(x - 8, y + h / 2 - 1); c.lineTo(x, y + h / 2 + 9); c.lineTo(x + 8, y + h / 2 - 1); c.closePath();
    c.fill(); c.stroke();
    this.text(str, x, y + 1, size, '#ffffff', P.outline, 5);
  }

  drawParticles() {
    const c = this.c, ps = this.parts, coin = this.S.coin;
    for (let i = 0; i < this.nP; i++) {
      const p = ps[i], a = Math.max(0, Math.min(1, p.life / p.max * 1.6));
      c.globalAlpha = a;
      if (p.kind === 0) {
        c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, 6.283); c.fill();
      } else if (p.kind === 1) {
        const u = 1 - p.life / p.max;
        c.globalAlpha = a * 0.8; c.strokeStyle = p.color; c.lineWidth = 6 * (1 - u) + 1;
        c.beginPath(); c.arc(p.x, p.y, p.size * (0.3 + 0.7 * u), 0, 6.283); c.stroke();
      } else if (p.kind === 2) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color; c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); c.restore();
      } else if (p.kind === 3) {
        c.globalAlpha = 1; c.drawImage(coin.cv, p.x - 9, p.y - 9, 18, 18);
      } else {
        c.strokeStyle = p.color; c.lineWidth = p.size * 0.7; c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); c.stroke(); c.lineCap = 'butt';
      }
    }
    c.globalAlpha = 1;
    for (let i = 0; i < this.nF; i++) {
      const f = this.floaters[i];
      c.globalAlpha = Math.min(1, f.life / f.max * 2);
      const pop = 1 + Math.max(0, (f.life - f.max + 0.15) / 0.15) * 0.4;
      this.text(f.text, f.x, f.y, f.size * pop, f.color, P.outline, 6);
    }
    c.globalAlpha = 1;
  }

  drawBossBar(world) {
    const b = world.boss, c = this.c;
    if (!b) return;
    const a = Math.min(1, Math.max(0, (b.y - C.boss.enterY) / 10)); // hidden during the entrance
    if (a <= 0) return;
    c.globalAlpha = a;
    const x = 64, y = 150, w = W - 128, h = 24;
    this.text(bossName(world.levelInt), W / 2, y - 18, 20, '#ffffff', P.outline, 6);
    c.fillStyle = P.bossBarBg; roundRect(c, x, y, w, h, 12); c.fill();
    const f = Math.max(0, b.hp / b.maxHp);
    if (f > 0) { c.fillStyle = P.bossBar; roundRect(c, x, y, Math.max(h, w * f), h, 12); c.fill(); }
    c.lineWidth = 3.5; c.strokeStyle = P.outline; roundRect(c, x, y, w, h, 12); c.stroke();
    if (b._hpShown !== Math.ceil(b.hp)) { b._hpShown = Math.ceil(b.hp); b._hpStr = fmtNum(b._hpShown); }
    this.text(b._hpStr, W / 2, y + h / 2 + 1, 16, '#ffffff', P.outline, 4);
    c.globalAlpha = 1;
  }

  drawBanner() {
    const b = this.banner;
    if (b.life <= 0) return;
    const c = this.c;
    const u = 1 - b.life / b.max;
    const sc = u < 0.12 ? 0.6 + (u / 0.12) * 0.5 : u < 0.2 ? 1.1 - ((u - 0.12) / 0.08) * 0.1 : 1;
    c.globalAlpha = Math.min(1, b.life * 2.5);
    c.save(); c.translate(W / 2, 380); c.scale(sc, sc);
    this.text(b.text, 0, 0, 50, b.color, P.outline, 10);
    if (b.sub) this.text(b.sub, 0, 52, 28, '#ffffff', P.outline, 7);
    c.restore();
    c.globalAlpha = 1;
  }
}
