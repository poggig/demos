// The game world — pure simulation (no DOM, no canvas). Fixed-step `step(dt)`; the renderer and
// the audio read its state + its event queue. The Node winnability simulator runs this same code.
import { CONFIG } from './config.js';
import { Rng, hashSeed } from './rng.js';
import { makeAddGate, makeMultGate, makeRareGate, applyGate, hitGate, gateTone, powerAfter } from './gates.js';
import { contactKills, planVolley, bulletsPerTickCap, crowdRadius, drawnCount, FORMATION } from './crowd.js';
import { buildEndlessChunk, eqLevel } from './levelgen.js';
import { coinScale } from './economy.js';

const C = CONFIG;
const ROAD_L = C.road.left, ROAD_R = C.road.right, ROAD_W = ROAD_R - ROAD_L;
const CROWD_Y = C.crowd.y;
const LEAD = CROWD_Y - C.track.spawnY;         // track distance between spawn line and crowd
const GATE_H = C.gates.h;
const MAX_EVENTS = 256;

function liveGate(spec) {
  if (spec.kind === 'add') return makeAddGate(spec.value, spec.cap);
  if (spec.kind === 'mult') return makeMultGate(spec.idx);
  return makeRareGate(spec.kind);
}

export class World {
  /**
   * opt: { mode: 'campaign'|'endless', def (campaign level def), seed (endless run seed),
   *        start, rateMult, damageMult, ai (sim autopilot), gateUpgrades (default true),
   *        quiet (no events — simulator) }
   */
  constructor(opt) {
    this.mode = opt.mode || 'campaign';
    this.endless = this.mode === 'endless';
    this.def = opt.def || null;
    this.seed = this.endless ? (opt.seed >>> 0) : this.def.seed;
    this.level = this.endless ? 1 : this.def.level;
    this.ai = !!opt.ai;
    this.quiet = !!opt.quiet;
    this.gateUpgrades = opt.gateUpgrades !== false;
    this.rng = new Rng(hashSeed('combat', this.mode, this.level, this.seed));

    this.stats = {
      soldiers: Math.max(1, Math.floor(opt.start ?? C.crowd.startSoldiers)),
      rateMult: opt.rateMult ?? 1,
      damageMult: opt.damageMult ?? 1,
      weapon: 0,
    };
    this.peakSoldiers = this.stats.soldiers;
    this.crowdX = (ROAD_L + ROAD_R) / 2;
    this.targetX = this.crowdX;

    this.time = 0;
    this.distance = 0;
    this.baseSpeed = C.track.scrollSpeed;
    this.scroll = this.baseSpeed;
    this.status = 'running';          // running | won | lost
    this.endTime = 0;
    this.killScore = 0;
    this.coins = 0;
    this.coinAcc = 0;
    this.kills = 0;
    this.contacts = 0;

    // spawn list
    if (this.endless) {
      this.items = [];
      this.chunkIndex = 0;
      this.chunkEnd = 0;
      this.feedEndless();
    } else {
      this.items = this.def.items;
    }
    this.itemIdx = 0;

    // pools
    const nb = C.maxBullets + 8;
    this.bullets = new Array(nb);
    for (let i = 0; i < nb; i++) this.bullets[i] = { x: 0, y: 0, vx: 0, vy: 0, dmg: 0, hits: 0, r: 0, splash: 0, splashF: 0, gateHits: 1, w: 0 };
    this.nB = 0;
    this.zombies = new Array(C.maxZombies);
    for (let i = 0; i < C.maxZombies; i++) this.zombies[i] = { x: 0, y: 0, hp: 0, maxHp: 0, hpBase: 0, type: 'walker', t: null, r: 0, alive: false, phase: 0, flash: 0, _hpShown: -1, _hpStr: '' };
    this.nZ = 0;
    this.rows = [];                   // live gate rows (≤ 4 at a time)
    this.boss = null;
    this.bossPhase = false;
    this.bossStartY = 0;
    this.bossProgress = 0;

    this.fireAcc = 0;
    this.tickAcc = 0;
    this._vol = { count: 0, damage: 0, hits: 0 };

    this.events = new Array(MAX_EVENTS);
    for (let i = 0; i < MAX_EVENTS; i++) this.events[i] = { type: '', x: 0, y: 0, a: 0, b: 0, s: '' };
    this.nEvents = 0;
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  emit(type, x, y, a, b, s) {
    if (this.quiet || this.nEvents >= MAX_EVENTS) return;
    const e = this.events[this.nEvents++];
    e.type = type; e.x = x || 0; e.y = y || 0; e.a = a || 0; e.b = b || 0; e.s = s || '';
  }
  /** Cosmetic, high-frequency events: dropped first so major ones (gate, won, lost…) always fit. */
  emitMinor(type, x, y, a) {
    if (this.quiet || this.nEvents >= MAX_EVENTS - 64) return;
    const e = this.events[this.nEvents++];
    e.type = type; e.x = x; e.y = y; e.a = a || 0; e.b = 0; e.s = '';
  }
  clearEvents() { this.nEvents = 0; }

  get soldiers() { return this.stats.soldiers; }
  get crowdR() { return crowdRadius(this.stats.soldiers); }
  get score() {
    return this.endless ? Math.floor(this.distance / C.endless.pxPerPoint) + this.killScore : this.killScore;
  }
  get levelInt() { return Math.floor(this.level); }
  setTargetX(x) { this.targetX = x; }

  feedEndless() {
    const ch = buildEndlessChunk(this.chunkIndex++, this.chunkEnd, this.seed);
    this.items = this.items.slice(this.itemIdx || 0).concat(ch.items);
    this.itemIdx = 0;
    this.chunkEnd = ch.end;
  }

  spawnItem(it) {
    const y = CROWD_Y - (it.at - this.distance);
    if (it.t === 'z') this.spawnZombie(it.type, it.x, y, it.hp);
    else if (it.t === 'g') {
      const gates = it.gates.map(liveGate);
      const flash = new Array(gates.length).fill(0);
      this.rows.push({ y, lanes: it.lanes, laneW: ROAD_W / it.lanes, gates, flash, crossed: false, chosen: -1, fade: 0 });
      this.emit('row', ROAD_L + ROAD_W / 2, y, it.lanes);
    }
  }

  spawnZombie(type, x, y, hp) {
    if (this.nZ >= this.zombies.length) return null;
    const t = C.zombieTypes[type];
    const z = this.zombies[this.nZ++];
    z.type = type; z.t = t; z.x = x; z.y = y; z.hp = hp; z.maxHp = hp; z.hpBase = hp / t.hpMult;
    z.r = t.r; z.alive = true; z.phase = this.rng.next() * 6.283; z.flash = 0; z._hpShown = -1;
    return z;
  }

  spawnBoss() {
    const hp = this.def.boss.hp;
    this.boss = { x: (ROAD_L + ROAD_R) / 2, y: C.track.spawnY - C.boss.r, hp, maxHp: hp, r: C.boss.r, stompT: 0, flash: 0, phase: 0 };
    this.bossStartY = C.boss.enterY;           // progress is measured over the slow walk
    this.bossPhase = true;
    this.emit('boss', this.boss.x, this.boss.y);
  }

  laneOf(x, lanes) {
    const i = Math.floor(((x - ROAD_L) / ROAD_W) * lanes);
    return i < 0 ? 0 : i >= lanes ? lanes - 1 : i;
  }

  // ── main step ──────────────────────────────────────────────────────────────
  step(dt) {
    if (this.status !== 'running') { this.stepAfterEnd(dt); return; }
    this.time += dt;

    // scrolling (brakes to a stop for the boss; endless speeds up)
    if (this.bossPhase) {
      this.scroll = Math.max(0, this.scroll - (this.baseSpeed * dt) / C.track.bossBrake);
    } else if (this.endless) {
      this.level = eqLevel(this.distance);
      this.scroll = this.baseSpeed * Math.min(C.endless.maxSpeedMult, 1 + C.endless.speedUpPerLevel * (this.level - 1));
    }
    this.distance += this.scroll * dt;

    // spawning
    if (this.endless && this.distance + LEAD + 600 >= this.chunkEnd) this.feedEndless();
    const items = this.items;
    while (this.itemIdx < items.length && items[this.itemIdx].at <= this.distance + LEAD) this.spawnItem(items[this.itemIdx++]);
    if (!this.endless && !this.bossPhase && this.itemIdx >= items.length && this.distance >= this.def.length) this.spawnBoss();

    // crowd movement
    if (this.ai) this.autopilot();
    const pad = C.crowd.edgePad;
    if (this.targetX < ROAD_L + pad) this.targetX = ROAD_L + pad;
    if (this.targetX > ROAD_R - pad) this.targetX = ROAD_R - pad;
    this.crowdX += (this.targetX - this.crowdX) * (1 - Math.exp(-dt * C.input.smoothing));

    this.fire(dt);
    this.updateBullets(dt);
    this.updateZombies(dt);
    this.updateRows(dt);
    if (this.boss) this.updateBoss(dt);

    if (this.stats.soldiers > this.peakSoldiers) this.peakSoldiers = this.stats.soldiers;
    if (this.stats.soldiers <= 0 && this.status === 'running') {
      this.stats.soldiers = 0;
      this.status = 'lost';
      this.emit('lost', this.crowdX, CROWD_Y);
    }
  }

  stepAfterEnd(dt) {
    this.endTime += dt;
    // bullets fly out, survivors shuffle on; no more contacts or firing
    for (let i = 0; i < this.nB;) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -40) this.removeBullet(i); else i++;
    }
    for (let i = 0; i < this.nZ;) {
      const z = this.zombies[i];
      if (!z.alive) { this.removeZombie(i); continue; }
      z.y += z.t.speed * 0.5 * dt;
      if (z.y > C.track.despawnY) this.removeZombie(i); else i++;
    }
    for (const r of this.rows) r.fade = Math.min(1, r.fade + dt * 2);
  }

  // ── reasonable-path autopilot (simulator) ──────────────────────────────────
  autopilot() {
    let row = null;
    for (const r of this.rows) if (!r.crossed && (!row || r.y > row.y)) row = r;
    if (!row) return;
    let best = 0, bestP = -1;
    for (let i = 0; i < row.gates.length; i++) {
      const p = powerAfter(this.stats, row.gates[i]);
      if (p > bestP) { bestP = p; best = i; }
    }
    this.targetX = ROAD_L + row.laneW * (best + 0.5);
  }

  // ── shooting ───────────────────────────────────────────────────────────────
  fire(dt) {
    const s = this.stats;
    if (s.soldiers <= 0) return;
    const w = C.weapons[s.weapon];
    this.fireAcc += ((s.soldiers * w.pellets * s.rateMult) / w.interval) * dt;
    this.tickAcc += dt;
    if (this.tickAcc < C.fireTick) return;
    this.tickAcc -= C.fireTick;
    if (this.tickAcc > C.fireTick) this.tickAcc = 0;
    const raw = Math.floor(this.fireAcc);
    if (raw <= 0) return;
    this.fireAcc -= raw;
    const rawDmg = C.baseDamage * w.damage * s.damageMult;
    const v = planVolley(raw, rawDmg, bulletsPerTickCap(w), this.bullets.length - this.nB, this._vol);
    const drawn = Math.max(1, drawnCount(s.soldiers));
    const rng = this.rng;
    for (let k = 0; k < v.count; k++) {
      const b = this.bullets[this.nB++];
      const f = FORMATION[Math.floor(rng.next() * drawn)];
      const a = (rng.next() * 2 - 1) * w.spread;
      b.x = this.crowdX + f.x + (rng.next() * 6 - 3);
      b.y = CROWD_Y + f.y - 14;
      b.vx = Math.sin(a) * w.speed;
      b.vy = -Math.cos(a) * w.speed;
      b.dmg = v.damage; b.hits = v.hits; b.r = w.radius; b.w = s.weapon;
      b.splash = w.splash || 0; b.splashF = w.splashFactor || 0; b.gateHits = w.gateHits || 1;
    }
    if (v.count > 0) this.emitMinor('shot', this.crowdX, CROWD_Y, s.weapon);
  }

  removeBullet(i) {
    const last = --this.nB;
    if (i !== last) { const t = this.bullets[i]; this.bullets[i] = this.bullets[last]; this.bullets[last] = t; }
  }
  removeZombie(i) {
    const last = --this.nZ;
    if (i !== last) { const t = this.zombies[i]; this.zombies[i] = this.zombies[last]; this.zombies[last] = t; }
    this.zombies[last].alive = false;
  }

  updateBullets(dt) {
    for (let i = 0; i < this.nB;) {
      const b = this.bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      let dead = b.y < -40 || b.x < ROAD_L - 40 || b.x > ROAD_R + 40;
      if (!dead) dead = this.bulletVsZombies(b);
      if (!dead) dead = this.bulletVsRows(b);
      if (!dead && this.boss) dead = this.bulletVsBoss(b);
      if (dead) this.removeBullet(i); else i++;
    }
  }

  bulletVsZombies(b) {
    const zs = this.zombies;
    for (let j = 0; j < this.nZ; j++) {
      const z = zs[j];
      if (!z.alive) continue;
      const dx = z.x - b.x, dy = z.y - b.y, rr = z.r + b.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      const dmg = b.dmg;
      if (b.splash > 0) this.splash(b.x, b.y, b.splash, dmg * b.splashF, z);
      if (dmg >= z.hp) {
        // overkill pierces on with the leftover damage (keeps merged bullets DPS-honest)
        const left = dmg - z.hp;
        this.killZombie(z);
        if (b.splash > 0 || left <= 1e-6) return true;
        b.hits *= left / dmg; b.dmg = left;
      } else {
        z.hp -= dmg; z.flash = 1;
        this.emitMinor('zhit', b.x, b.y, b.w);
        return true;
      }
    }
    return false;
  }

  splash(x, y, radius, dmg, except) {
    const zs = this.zombies, r2 = radius * radius;
    this.emitMinor('boom', x, y, radius);
    for (let j = 0; j < this.nZ; j++) {
      const z = zs[j];
      if (!z.alive || z === except) continue;
      const dx = z.x - x, dy = z.y - y;
      if (dx * dx + dy * dy > r2) continue;
      if (dmg >= z.hp) this.killZombie(z); else { z.hp -= dmg; z.flash = 1; }
    }
    if (this.boss) {
      const dx = this.boss.x - x, dy = this.boss.y - y, rr = radius + this.boss.r;
      if (dx * dx + dy * dy <= rr * rr) this.damageBoss(dmg);
    }
  }

  bulletVsRows(b) {
    for (let k = 0; k < this.rows.length; k++) {
      const r = this.rows[k];
      if (r.crossed || b.y > r.y + GATE_H / 2 || b.y < r.y - GATE_H / 2) continue;
      const rel = b.x - ROAD_L;
      if (rel < 0 || rel > ROAD_W) continue;
      const lane = Math.min(r.lanes - 1, Math.floor(rel / r.laneW));
      const inLane = rel - lane * r.laneW;
      if (inLane < C.gates.pad || inLane > r.laneW - C.gates.pad) return false; // passes between panels
      const g = r.gates[lane];
      r.flash[lane] = 1;
      if (this.gateUpgrades) {
        const before = gateTone(g);
        const steps = hitGate(g, b.gateHits); // one hit per bullet: repair speed is capped by the bullet cap
        if (steps > 0) this.emit('gatestep', ROAD_L + r.laneW * (lane + 0.5), r.y, steps, gateTone(g) !== before ? 1 : 0);
      }
      return true;
    }
    return false;
  }

  bulletVsBoss(b) {
    const bo = this.boss;
    const dx = bo.x - b.x, dy = (bo.y - b.y) * 1.15, rr = bo.r + b.r;
    if (dx * dx + dy * dy > rr * rr) return false;
    if (b.splash > 0) this.splash(b.x, b.y, b.splash, b.dmg * b.splashF, null);
    this.damageBoss(b.dmg);
    this.emitMinor('bosshit', b.x, b.y, b.w);
    return true;
  }

  damageBoss(dmg) {
    const bo = this.boss;
    if (!bo || bo.hp <= 0 || this.status !== 'running') return;
    bo.hp -= dmg;
    if (bo.flash <= 0.05) bo.flash = 1; // pulse, not a permanent white-out under constant fire
    if (bo.hp <= 0) {
      bo.hp = 0;
      this.bossProgress = Math.max(0, (bo.y - this.bossStartY) / Math.max(1, CROWD_Y - this.crowdR * C.crowd.squash - bo.r * 0.75 - this.bossStartY));
      const lv = this.levelInt;
      this.killScore += C.boss.score * lv + C.levelClearBonus * lv;
      this.addCoins(C.boss.coins * coinScale(lv));
      this.emit('bossdie', bo.x, bo.y, Math.round(C.boss.coins * coinScale(lv)));
      for (let j = 0; j < this.nZ; j++) if (this.zombies[j].alive) { this.zombies[j].alive = false; this.emit('zdie', this.zombies[j].x, this.zombies[j].y, 0, 0, this.zombies[j].type); }
      this.status = 'won';
      this.boss = null;                    // it explodes (renderer burst on 'bossdie')
      this.emit('won', bo.x, bo.y);
    }
  }

  addCoins(n) {
    this.coinAcc += n;
    const whole = Math.floor(this.coinAcc + 1e-9);
    if (whole > 0) { this.coinAcc -= whole; this.coins += whole; }
    return whole;
  }

  killZombie(z) {
    if (!z.alive) return;
    z.alive = false;
    const t = z.t, lv = this.levelInt;
    this.kills++;
    this.killScore += t.score * Math.max(1, lv);
    const got = this.addCoins(t.coins * coinScale(lv));
    this.emit('zdie', z.x, z.y, got, z.r, z.type);
    if (t.splitInto) {
      const mt = C.zombieTypes[t.splitInto];
      for (let k = 0; k < t.splitCount; k++) {
        const off = (k - (t.splitCount - 1) / 2) * mt.r * 2.2;
        const m = this.spawnZombie(t.splitInto, Math.max(ROAD_L + mt.r, Math.min(ROAD_R - mt.r, z.x + off)), z.y + 4, z.hpBase * mt.hpMult);
        if (m) m.flash = 1;
      }
    }
  }

  // ── zombies ────────────────────────────────────────────────────────────────
  updateZombies(dt) {
    const s = this.stats;
    const R = crowdRadius(s.soldiers);
    const top = CROWD_Y - R * C.crowd.squash;
    const bottom = CROWD_Y + R * C.crowd.squash;
    const cx = this.crowdX;
    for (let i = 0; i < this.nZ;) {
      const z = this.zombies[i];
      if (!z.alive) { this.removeZombie(i); continue; }
      const t = z.t;
      z.y += (this.scroll + t.speed) * dt;
      if (z.flash > 0) z.flash = Math.max(0, z.flash - dt * 6);
      if (z.y > C.homingFromY && z.y < bottom) {
        const dx = cx - z.x, m = t.home * dt;
        z.x += dx > m ? m : dx < -m ? -m : dx;
      }
      // contact with the crowd
      if (s.soldiers > 0 && z.y + z.r * 0.6 >= top && z.y - z.r * 0.6 <= bottom && Math.abs(z.x - cx) <= R + z.r * 0.7) {
        const k = Math.min(s.soldiers, contactKills(z.hp, t.weight));
        s.soldiers -= k;
        this.contacts++;
        z.alive = false;
        this.emit('contact', z.x, z.y, k, z.r, z.type);
        this.removeZombie(i);
        continue;
      }
      if (z.y > C.track.despawnY) { this.removeZombie(i); continue; }
      i++;
    }
  }

  // ── gate rows ──────────────────────────────────────────────────────────────
  updateRows(dt) {
    for (let k = 0; k < this.rows.length;) {
      const r = this.rows[k];
      r.y += this.scroll * dt;
      for (let i = 0; i < r.flash.length; i++) if (r.flash[i] > 0) r.flash[i] = Math.max(0, r.flash[i] - dt * 8);
      if (!r.crossed && r.y >= CROWD_Y - 18) {
        const lane = this.laneOf(this.crowdX, r.lanes);
        const g = r.gates[lane];
        r.crossed = true; r.chosen = lane;
        const prevWeapon = this.stats.weapon;
        const res = applyGate(this.stats, g);
        this.emit('gate', ROAD_L + r.laneW * (lane + 0.5), r.y, res.after - res.before, gateTone(g) === 'bad' ? -1 : 1, g.kind);
        if (this.stats.weapon !== prevWeapon) this.emit('weapon', this.crowdX, CROWD_Y, this.stats.weapon);
      }
      if (r.crossed) r.fade = Math.min(1, r.fade + dt * 3);
      if (r.y - GATE_H > C.track.despawnY) this.rows.splice(k, 1); else k++;
    }
  }

  // ── boss ───────────────────────────────────────────────────────────────────
  updateBoss(dt) {
    const bo = this.boss, s = this.stats;
    bo.phase += dt;
    if (bo.flash > 0) bo.flash = Math.max(0, bo.flash - dt * 6);
    bo.y += (bo.y < C.boss.enterY ? C.boss.enterSpeed : this.scroll + C.boss.speed) * dt;
    const dx = this.crowdX - bo.x, m = C.boss.home * dt;
    bo.x += dx > m ? m : dx < -m ? -m : dx;
    bo.stompT += dt;
    if (bo.stompT >= C.boss.stompEvery) { bo.stompT -= C.boss.stompEvery; this.emit('stomp', bo.x, bo.y); }
    const R = crowdRadius(s.soldiers);
    if (s.soldiers > 0 && bo.y + bo.r * 0.75 >= CROWD_Y - R * C.crowd.squash) {
      this.emit('contact', this.crowdX, CROWD_Y, s.soldiers, bo.r, 'boss');
      s.soldiers = 0;
    }
  }

  // ── debug / QA helpers (wired to window.GS.debug only with ?debug=1) ───────
  debugKillAll() { for (let j = 0; j < this.nZ; j++) if (this.zombies[j].alive) this.killZombie(this.zombies[j]); }
  debugSkipToBoss() {
    if (this.endless) return;
    for (let j = 0; j < this.nZ; j++) this.zombies[j].alive = false;
    this.rows.length = 0;
    this.itemIdx = this.items.length;
    this.distance = Math.max(this.distance, this.def.length);
  }
}
