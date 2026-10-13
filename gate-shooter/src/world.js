// The game world — pure simulation (no DOM, no canvas). Fixed-step `step(dt)`; the renderer and
// the audio read its state + its event queue. The Node winnability simulator runs this same code.
import { CONFIG } from './config.js';
import { Rng, hashSeed } from './rng.js';
import { resolveGateSpec, applyGate, hitGate, gateTone, powerAfter, isBonusGate } from './gates.js';
import { contactKills, planVolley, bulletsPerTickCap, crowdRadius, drawnCount, FORMATION } from './crowd.js';
import { buildEndlessChunk, eqLevel, zombieHpBase, gateScale } from './levelgen.js';
import { coinScale } from './economy.js';

const C = CONFIG;
const ROAD_L = C.road.left, ROAD_R = C.road.right, ROAD_W = ROAD_R - ROAD_L;
const ROAD_MID = (ROAD_L + ROAD_R) / 2;
const CROWD_Y = C.crowd.y;
const LEAD = CROWD_Y - C.track.spawnY;         // track distance between spawn line and crowd
const GATE_H = C.gates.h;
const MAX_EVENTS = 320;
const TAU = Math.PI * 2;

export class World {
  /**
   * opt: { mode: 'campaign'|'endless', def (campaign level def), seed (endless run seed),
   *        start, weapon, rateMult, damageMult,
   *        ai (autopilot), aiMistake (0..1: chance to pick a random gate), aiDodge (default true),
   *        aiStyle ('best' | 'worst': takes the weakest gate, never hunts or dodges | 'static': never moves),
   *        gateUpgrades (default true), quiet (no events — simulator) }
   */
  constructor(opt) {
    this.mode = opt.mode || 'campaign';
    this.endless = this.mode === 'endless';
    this.def = opt.def || null;
    this.seed = this.endless ? (opt.seed >>> 0) : this.def.seed;
    this.level = this.endless ? 1 : this.def.level;
    this.ai = !!opt.ai;
    this.aiMistake = opt.aiMistake || 0;
    this.aiStyle = opt.aiStyle || 'best';
    this.aiDodge = opt.aiDodge !== false && this.aiStyle === 'best';
    this.aiRng = new Rng(hashSeed('ai', this.mode, this.level, this.seed, opt.aiSeed || 0));
    this.quiet = !!opt.quiet;
    this.gateUpgrades = opt.gateUpgrades !== false;
    this.rng = new Rng(hashSeed('combat', this.mode, this.level, this.seed));

    this.stats = {
      soldiers: Math.max(1, Math.floor(opt.start ?? C.crowd.startSoldiers)),
      rateMult: opt.rateMult ?? 1,
      damageMult: opt.damageMult ?? 1,
      weapon: Math.max(0, Math.min(C.weapons.length - 1, opt.weapon || 0)),
    };
    this.peakSoldiers = this.stats.soldiers;
    this.crowdX = ROAD_MID;
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
    this.hpNow = zombieHpBase(this.level, this.endless);

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
    for (let i = 0; i < nb; i++) this.bullets[i] = { x: 0, y: 0, vx: 0, vy: 0, dmg: 0, hits: 0, r: 0, splash: 0, splashF: 0, gateHits: 1, w: 0, pierce: false, h1: null, h2: null };
    this.nB = 0;
    this.zombies = new Array(C.maxZombies);
    for (let i = 0; i < C.maxZombies; i++) this.zombies[i] = this.blankZombie();
    this.nZ = 0;
    this.shots = new Array(C.maxEnemyShots);
    for (let i = 0; i < C.maxEnemyShots; i++) this.shots[i] = { kind: 'acid', x: 0, y: 0, vx: 0, vy: 0, dmg: 0, frac: 0, min: 1, r: 0, t: 0, tMax: 1, alive: false };
    this.nS = 0;
    this.rows = [];                   // live gate rows (≤ 4 at a time)
    this.allies = [];                 // allied pickups on the road
    this.bosses = [];
    this.bossPhase = false;
    this.bossStartY = 0;
    this.bossProgress = 0;
    this.bossMaxTotal = 0;
    this.bossDamage = 0;              // total damage dealt to bosses (generator calibration)
    this.bossArriveT = -1;            // time the boss finished its entrance

    // support (bonus gates / allied pickups)
    this.heliT = 0; this.heliCool = 0;
    this.tankT = 0; this.tankCool = 0;
    this.strikeQ = []; this.strikeT = 0;

    this.fireAcc = 0;
    this.tickAcc = 0;
    this._vol = { count: 0, damage: 0, hits: 0 };

    this.events = new Array(MAX_EVENTS);
    for (let i = 0; i < MAX_EVENTS; i++) this.events[i] = { type: '', x: 0, y: 0, a: 0, b: 0, s: '' };
    this.nEvents = 0;
  }

  blankZombie() {
    return { x: 0, y: 0, hp: 0, maxHp: 0, hpBase: 0, type: 'walker', t: null, r: 0, alive: false, phase: 0, flash: 0,
      veh: false, w: 0, h: 0, warn: 0, swerved: false, tx: 0, state: 0, timer: 0, cool: 0, holdY: 0, armored: false,
      _hpShown: -1, _hpStr: '' };
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  emit(type, x, y, a, b, s) {
    if (this.quiet || this.nEvents >= MAX_EVENTS) return;
    const e = this.events[this.nEvents++];
    e.type = type; e.x = x || 0; e.y = y || 0; e.a = a || 0; e.b = b || 0; e.s = s || '';
  }
  /** Cosmetic, high-frequency events: dropped first so major ones (gate, won, lost…) always fit. */
  emitMinor(type, x, y, a, b) {
    if (this.quiet || this.nEvents >= MAX_EVENTS - 80) return;
    const e = this.events[this.nEvents++];
    e.type = type; e.x = x; e.y = y; e.a = a || 0; e.b = b || 0; e.s = '';
  }
  clearEvents() { this.nEvents = 0; }

  get soldiers() { return this.stats.soldiers; }
  get crowdR() { return crowdRadius(this.stats.soldiers); }
  get boss() { return this.bosses.length ? this.bosses[0] : null; }
  get bossHpTotal() { let s = 0; for (const b of this.bosses) s += Math.max(0, b.hp); return s; }
  /** How far the most advanced boss has walked toward the crowd (0 at the end of its entrance, 1 = contact). */
  bossWalk() {
    let p = 0;
    for (const bo of this.bosses) {
      const contactY = CROWD_Y - this.crowdR * C.crowd.squash - bo.r * 0.75;
      p = Math.max(p, (bo.y - this.bossStartY) / Math.max(1, contactY - this.bossStartY));
    }
    return p;
  }
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
      const scale = gateScale(this.level, this.endless);
      const n = this.stats.soldiers;
      const gates = it.gates.map(spec => resolveGateSpec(spec, n, scale));
      const flash = new Array(gates.length).fill(0);
      this.rows.push({ y, lanes: it.lanes, laneW: ROAD_W / it.lanes, gates, flash, crossed: false, chosen: -1, fade: 0 });
      this.emit('row', ROAD_MID, y, it.lanes);
    } else if (it.t === 'v') this.spawnVehicle(it.type, it.x, it.hp);
    else if (it.t === 'a') {
      const a = C.allies[it.type];
      this.allies.push({ type: it.type, x: it.x, y, w: a.w, h: a.h, alive: true });
    }
  }

  spawnZombie(type, x, y, hp) {
    if (this.nZ >= this.zombies.length) return null;
    const t = C.zombieTypes[type];
    const z = this.zombies[this.nZ++];
    z.type = type; z.t = t; z.x = x; z.y = y; z.hp = hp; z.maxHp = hp; z.hpBase = hp / t.hpMult;
    z.r = t.r; z.alive = true; z.phase = this.rng.next() * TAU; z.flash = 0; z._hpShown = -1;
    z.veh = false; z.w = 0; z.h = 0; z.warn = 0; z.swerved = false; z.state = 0; z.timer = 0; z.cool = 0;
    z.armored = !!t.armor;
    const H = t.spit || t.heal;
    z.holdY = H ? (Array.isArray(H.holdY) ? H.holdY[0] + this.rng.next() * (H.holdY[1] - H.holdY[0]) : H.holdY) : 0;
    return z;
  }

  spawnVehicle(type, x, hp) {
    if (this.nZ >= this.zombies.length) return null;
    const t = C.vehicles[type];
    const z = this.zombies[this.nZ++];
    z.type = type; z.t = t; z.x = x; z.y = C.track.spawnY - t.h / 2; z.hp = hp; z.maxHp = hp; z.hpBase = hp / t.hpMult;
    z.r = t.w / 2; z.alive = true; z.phase = 0; z.flash = 0; z._hpShown = -1;
    z.veh = true; z.w = t.w; z.h = t.h; z.warn = t.warn; z.swerved = false; z.tx = x; z.state = 0; z.armored = false;
    this.emit('vehicle', x, 0, t.warn, 0, type);
    return z;
  }

  spawnBoss() {
    const d = this.def.boss, B = C.boss;
    const bo = this.makeBoss(d.kind || 'king', d.elite || 0, ROAD_MID, C.track.spawnY - B.r, d.hp, 1);
    this.bosses = [bo];
    this.bossMaxTotal = d.hp;
    this.bossStartY = B.enterY;               // progress is measured over the slow walk
    this.bossPhase = true;
    this.emit('boss', bo.x, bo.y, 0, 0, bo.kind);
  }
  makeBoss(kind, elite, x, y, hp, scale) {
    const S = C.boss[kind] || {};
    return { kind, elite, x, y, cx: x, offX: 0, hp, maxHp: hp, r: C.boss.r * scale, scale, stompT: 0, flash: 0, phase: 0,
      cool: Math.min(C.boss.firstSpecial, (S.every || 3) * 0.25), burst: 0, burstT: 0, state: 'walk', st: 0, shield: 0, split: scale < 1, _hpShown: -1, _hpStr: '' };
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
      this.hpNow = zombieHpBase(this.level, true);
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
    this.updateSupport(dt);
    this.updateZombies(dt);
    this.updateShots(dt);
    this.updateAllies(dt);
    this.updateRows(dt);
    for (let i = 0; i < this.bosses.length; i++) if (this.status === 'running') this.updateBoss(this.bosses[i], dt);

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
      if (!z.veh || z.warn <= 0) z.y += z.t.speed * 0.5 * dt;
      if (z.y > C.track.despawnY) this.removeZombie(i); else i++;
    }
    for (let i = 0; i < this.nS; i++) this.shots[i].alive = false;
    this.nS = 0;
    for (const r of this.rows) r.fade = Math.min(1, r.fade + dt * 2);
  }

  // ── reasonable-path autopilot (simulator; aiMistake makes it a sloppier player: with that
  //    chance it swerves into a random lane in the LAST second before a row — a human slip) ──
  autopilot() {
    if (this.aiStyle === 'static') return;      // a player who never touches the screen
    const worst = this.aiStyle === 'worst';  // a player TRYING to lose
    let row = null;
    for (const r of this.rows) if (!r.crossed && (!row || r.y > row.y)) row = r;
    if (row && row !== this._aiRow) {
      this._aiRow = row;
      let best = 0, bestP = -Infinity;
      for (let i = 0; i < row.gates.length; i++) {
        const p = powerAfter(this.stats, row.gates[i]) * (worst ? -1 : 1);
        if (p > bestP) { bestP = p; best = i; }
      }
      this._aiLane = best;
      this._aiSlip = this.aiMistake > 0 && this.aiRng.next() < this.aiMistake ? Math.floor(this.aiRng.next() * row.gates.length) : -1;
    }
    if (row && this._aiSlip >= 0 && (CROWD_Y - 18 - row.y) / Math.max(1, this.scroll) < 0.9) { this._aiLane = this._aiSlip; this._aiSlip = -1; }
    let tx = row ? ROAD_L + row.laneW * (this._aiLane + 0.5) : this.targetX;
    // never take a gate behind a vehicle that will run the crowd over first: switch lane
    if (row && this.aiDodge) {
      const rowEta = (CROWD_Y - 18 - row.y) / Math.max(1, this.scroll);
      for (let j = 0; j < this.nZ; j++) {
        const z = this.zombies[j];
        if (!z.alive || !z.veh || z.y - z.h / 2 > CROWD_Y + 60 || Math.abs(z.x - tx) > z.w / 2 + 70) continue;
        const eta = z.warn + Math.max(0, CROWD_Y - z.h / 2 - Math.max(z.y, C.track.spawnY)) / (this.scroll + z.t.speed);
        if (eta > rowEta + 0.6) continue;
        let alt = -1, altP = -1;
        for (let i = 0; i < row.gates.length; i++) {
          const lx = ROAD_L + row.laneW * (i + 0.5);
          if (Math.abs(z.x - lx) <= z.w / 2 + 70) continue;
          const p = powerAfter(this.stats, row.gates[i]);
          if (p > altP) { altP = p; alt = i; }
        }
        // switch if the crash would be deadly, or if the other gate is nearly as good
        const crash = contactKills(z.hp / C.vehicles.contactDiv, z.t.weight);
        const deadly = crash >= this.stats.soldiers * 0.6;
        if (alt >= 0 && (deadly || altP >= 0.7 * powerAfter(this.stats, row.gates[this._aiLane]))) { this._aiLane = alt; tx = ROAD_L + row.laneW * (alt + 0.5); }
      }
    }
    if (this.bossPhase && this.bosses.length) tx = this.bosses[0].x;
    else if (!worst && (!row || row.y < CROWD_Y - 330)) {
      // between rows: grab an allied pickup on the way, else go and shoot a planted spitter/shaman …
      let ally = null;
      for (const a of this.allies) if (a.alive && a.y > 120 && a.y < CROWD_Y - 40 && (!ally || a.y > ally.y)) ally = a;
      if (ally) tx = ally.x;
      else {
        // the biggest threat on screen: planted spitters/shamans first, else the zombie that
        // would cost the most soldiers on contact (brutes, exploders…; the nearest one on a tie).
        // A small crowd chases every zombie (each one is a real loss), a big one only the heavy ones.
        let hunt = null, best = 0;
        for (let j = 0; j < this.nZ; j++) {
          const z = this.zombies[j];
          if (!z.alive || z.veh || z.y < 100 || z.y > CROWD_Y - 140) continue;
          const threat = (z.state === 1 ? 1e9 : 0) + contactKills(z.hp, z.t.weight) + z.y / CROWD_Y;
          if (threat > best) { best = threat; hunt = z; }
        }
        if (hunt && best >= Math.min(3, Math.max(1, this.stats.soldiers * 0.1))) tx = hunt.x;
      }
      // … and step out of the lane of an incoming vehicle
      if (this.aiDodge) {
        for (let j = 0; j < this.nZ; j++) {
          const z = this.zombies[j];
          if (!z.alive || !z.veh || z.y - z.h / 2 > CROWD_Y + 60) continue;   // until it is fully past
          if (Math.abs(z.x - tx) < z.w / 2 + 70) tx = z.x < ROAD_MID ? z.x + z.w / 2 + 110 : z.x - z.w / 2 - 110;
        }
      }
    }
    if (this.aiDodge) {
      // … and side-step acid globs about to land, and boulder shadows under the crowd
      const R = crowdRadius(this.stats.soldiers);
      for (let i = 0; i < this.nS; i++) {
        const p = this.shots[i];
        if (p.kind === 'acid') {
          if (p.vy <= 0 || p.y < CROWD_Y - 240) continue;
          const hx = p.x + p.vx * ((CROWD_Y - p.y) / p.vy);
          if (Math.abs(hx - this.crowdX) < R + 14) tx = hx < this.crowdX ? hx + R + 40 : hx - R - 40;
        } else if (p.t < p.tMax * 0.85 && Math.abs(p.x - this.crowdX) < C.boss.giant.radius + R * 0.5) {
          tx = p.x < ROAD_MID ? p.x + C.boss.giant.radius + R : p.x - C.boss.giant.radius - R;
        }
      }
    }
    this.targetX = tx;
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
      b.pierce = !!w.pierce; b.h1 = null; b.h2 = null;
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
      if (!dead && this.bosses.length) dead = this.bulletVsBoss(b);
      if (dead) this.removeBullet(i); else i++;
    }
  }

  static touches(z, x, y, r) {
    if (z.veh) return Math.abs(z.x - x) <= z.w / 2 + r && Math.abs(z.y - y) <= z.h / 2 + r;
    const dx = z.x - x, dy = z.y - y, rr = z.r + r;
    return dx * dx + dy * dy <= rr * rr;
  }

  bulletVsZombies(b) {
    const zs = this.zombies;
    for (let j = 0; j < this.nZ; j++) {
      const z = zs[j];
      if (!z.alive || (z.veh && z.warn > 0) || !World.touches(z, b.x, b.y, b.r)) continue;
      if (b.pierce) {                         // laser: hurts everything in line, once each
        if (z === b.h1 || z === b.h2) continue;
        b.h2 = b.h1; b.h1 = z;
        this.hurtZombie(z, b.dmg);
        this.emitMinor('zhit', b.x, b.y, b.w);
        continue;
      }
      const dmg = b.dmg;
      if (b.splash > 0) this.splash(b.x, b.y, b.splash, dmg * b.splashF, z);
      const left = this.hurtZombie(z, dmg);
      if (left < 0) { this.emitMinor('zhit', b.x, b.y, b.w); return true; }
      // overkill pierces on with the leftover damage (keeps merged bullets DPS-honest)
      if (b.splash > 0 || left <= 1e-6) return true;
      b.hits *= left / dmg; b.dmg = left;
    }
    return false;
  }

  /** Apply damage (armour aware). Returns −1 if the zombie survives, else the leftover damage. */
  hurtZombie(z, dmg) {
    if (!z.alive) return -1;
    const t = z.t;
    let armored = false;
    if (t.armor && z.hp > z.maxHp * t.armorUntil) { dmg *= t.armor; armored = true; }
    if (dmg >= z.hp) {
      const left = armored ? 0 : dmg - z.hp;
      this.killZombie(z);
      return left;
    }
    z.hp -= dmg; z.flash = 1;
    if (z.armored && z.hp <= z.maxHp * t.armorUntil) { z.armored = false; this.emit('armor', z.x, z.y); }
    return -1;
  }

  /** Area damage to zombies (and bosses) — rockets, explosions, bombs, boulders. `except` (a zombie
   *  or a boss) is the target the projectile already hit directly: it takes no splash on top. */
  blast(x, y, radius, dmg, except, bossDmg) {
    const zs = this.zombies, r2 = radius * radius;
    for (let j = 0; j < this.nZ; j++) {
      const z = zs[j];
      if (!z.alive || z === except || (z.veh && z.warn > 0)) continue;
      const dx = z.x - x, dy = z.y - y;
      if (dx * dx + dy * dy > r2 + (z.veh ? z.h * z.h / 4 : 0)) continue;
      this.hurtZombie(z, dmg);
    }
    if (bossDmg > 0) {
      for (let k = this.bosses.length - 1; k >= 0; k--) {   // backwards: a dying boss is spliced out
        const bo = this.bosses[k];
        if (bo === except) continue;
        const dx = bo.x - x, dy = bo.y - y, rr = radius + bo.r;
        if (dx * dx + dy * dy <= rr * rr) this.damageBoss(bo, bossDmg);
      }
    }
  }

  splash(x, y, radius, dmg, except) {
    this.emitMinor('boom', x, y, radius);
    this.blast(x, y, radius, dmg, except, dmg);
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
    for (let k = 0; k < this.bosses.length; k++) {
      const bo = this.bosses[k];
      const dx = bo.x - b.x, dy = (bo.y - b.y) * 1.15, rr = bo.r + b.r;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (b.splash > 0) this.splash(b.x, b.y, b.splash, b.dmg * b.splashF, bo); // the escort / the other blob half
      this.damageBoss(bo, b.dmg);
      this.emitMinor('bosshit', b.x, b.y, b.w);
      return true;
    }
    return false;
  }

  /** pierce: ignores the Ironclad's shield (the air strike's bombs). */
  damageBoss(bo, dmg, pierce = false) {
    if (!bo || bo.hp <= 0 || this.status !== 'running') return;
    if (bo.kind === 'tank' && bo.shield > 0 && !pierce) dmg *= C.boss.tank.reduce;
    this.bossDamage += Math.min(dmg, bo.hp);
    bo.hp -= dmg;
    if (bo.flash <= 0.05) bo.flash = 1; // pulse, not a permanent white-out under constant fire
    if (bo.kind === 'blob' && !bo.split && bo.hp > 0 && bo.hp <= bo.maxHp * C.boss.blob.splitAt) this.splitBlob(bo);
    if (bo.hp > 0) return;
    bo.hp = 0;
    const i = this.bosses.indexOf(bo);
    if (i >= 0) this.bosses.splice(i, 1);
    this.emit('bossdie', bo.x, bo.y, this.bosses.length ? 0 : Math.round(C.boss.coins * coinScale(this.levelInt)), bo.scale);
    if (this.bosses.length) {             // the surviving blob half takes the centre line again (no jump: x is unchanged)
      for (const o of this.bosses) { o.cx += o.offX; o.offX = 0; }
      return;
    }
    this.bossProgress = Math.max(0, (bo.y - this.bossStartY) / Math.max(1, CROWD_Y - this.crowdR * C.crowd.squash - bo.r * 0.75 - this.bossStartY));
    const lv = this.levelInt;
    this.killScore += C.boss.score * lv + C.levelClearBonus * lv;
    this.addCoins(C.boss.coins * coinScale(lv));
    for (let j = 0; j < this.nZ; j++) {
      const z = this.zombies[j];
      if (z.alive) { z.alive = false; if (!z.veh || z.warn <= 0) this.emit('zdie', z.x, z.y, 0, z.r, z.type); }
    }
    this.status = 'won';
    this.emit('won', bo.x, bo.y);
  }

  splitBlob(bo) {
    const half = bo.hp / 2, s = 0.72, off = C.boss.blob.splitOffset;
    const twin = this.makeBoss('blob', bo.elite, bo.cx, bo.y, half, s);
    twin.maxHp = bo.maxHp / 2; twin.cool = bo.cool; twin.offX = off;
    bo.hp = half; bo.maxHp /= 2; bo.scale = s; bo.r = C.boss.r * s; bo.split = true; bo.offX = -off;
    this.bosses.push(twin);
    this.emit('split', bo.cx, bo.y);
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
    if (z.veh) {
      this.emit('vdie', z.x, z.y, got, z.w, z.type);
      this.blast(z.x, z.y, 100, 3 * z.hpBase, z, 0);
      return;
    }
    this.emit('zdie', z.x, z.y, got, z.r, z.type);
    if (t.explode) {
      this.emit('explode', z.x, z.y, t.explode.r);
      this.blast(z.x, z.y, t.explode.r, t.explode.dmgMult * z.hpBase, z, 0);
    }
    if (t.splitInto) {
      const mt = C.zombieTypes[t.splitInto];
      for (let k = 0; k < t.splitCount; k++) {
        const off = (k - (t.splitCount - 1) / 2) * mt.r * 2.2;
        const m = this.spawnZombie(t.splitInto, Math.max(ROAD_L + mt.r, Math.min(ROAD_R - mt.r, z.x + off)), z.y + 4, z.hpBase * mt.hpMult);
        if (m) m.flash = 1;
      }
    }
  }

  // ── zombies & enemy vehicles ───────────────────────────────────────────────
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
      if (z.flash > 0) z.flash = Math.max(0, z.flash - dt * 6);
      if (z.veh) {
        if (z.warn > 0) { z.warn -= dt; i++; continue; }   // waiting off-screen behind its warning sign
        z.y += (this.scroll + t.speed) * dt;
        if (t.swerveY && !z.swerved && z.y >= t.swerveY) { z.swerved = true; z.tx = cx; this.emit('swerve', z.x, z.y); }
        if (z.swerved) { const dx = z.tx - z.x, m = t.swerveSpeed * dt; z.x += dx > m ? m : dx < -m ? -m : dx; }
        if (s.soldiers > 0 && Math.abs(z.x - cx) <= z.w / 2 + R * 0.75 && z.y + z.h / 2 >= top && z.y - z.h / 2 <= bottom) {
          const k = Math.min(s.soldiers, contactKills(z.hp / C.vehicles.contactDiv, t.weight));
          s.soldiers -= k; this.contacts++;
          z.alive = false;
          this.emit('crash', z.x, z.y, k, z.w, z.type);
          this.removeZombie(i);
          continue;
        }
        if (z.y - z.h / 2 > C.track.despawnY) { this.removeZombie(i); continue; }
        i++;
        continue;
      }
      let vy = this.scroll + t.speed;
      const H = t.spit || t.heal;
      if (H) {                                             // spitters and shamans plant themselves
        if (z.state === 0 && z.y >= z.holdY) { z.state = 1; z.timer = H.hold; z.cool = t.spit ? t.spit.every * 0.4 : 0; }
        if (z.state === 1) {
          vy = 0;
          z.timer -= dt;
          if (t.spit) { z.cool -= dt; if (z.cool <= 0) { z.cool += t.spit.every; this.spit(z); } }
          if (t.heal) this.healAround(z, dt);
          if (z.timer <= 0) z.state = 2;
        }
      }
      z.y += vy * dt;
      if (t.zigzag) z.x += Math.cos(this.time * t.zigzag.freq * TAU + z.phase) * t.zigzag.amp * t.zigzag.freq * TAU * dt;
      if (z.state !== 1 && z.y > C.homingFromY && z.y < bottom) {
        const dx = cx - z.x, m = t.home * dt;
        z.x += dx > m ? m : dx < -m ? -m : dx;
      }
      if (z.x < ROAD_L + z.r) z.x = ROAD_L + z.r; else if (z.x > ROAD_R - z.r) z.x = ROAD_R - z.r;
      // contact with the crowd
      if (s.soldiers > 0 && z.y + z.r * 0.6 >= top && z.y - z.r * 0.6 <= bottom && Math.abs(z.x - cx) <= R + z.r * 0.7) {
        const k = Math.min(s.soldiers, contactKills(z.hp, t.weight));
        s.soldiers -= k;
        this.contacts++;
        z.alive = false;
        this.emit('contact', z.x, z.y, k, z.r, z.type);
        if (t.explode) { this.emit('explode', z.x, z.y, t.explode.r); this.blast(z.x, z.y, t.explode.r, t.explode.dmgMult * z.hpBase, z, 0); }
        this.removeZombie(i);
        continue;
      }
      if (z.y > C.track.despawnY) { this.removeZombie(i); continue; }
      i++;
    }
  }

  spit(z) {
    const sp = z.t.spit;
    this.launchAcid(z.x, z.y + z.r * 0.6, this.crowdX, CROWD_Y, sp.speed, sp.dmgMult * z.hpBase);
    this.emitMinor('spit', z.x, z.y);
  }

  /** An aimed acid glob: kills ceil(dmg / hpPerSoldier) soldiers, or — frac > 0 (the boss) — a share
   *  of the crowd, max(min, soldiers × frac), so it stays a threat at every level without one-shotting. */
  launchAcid(x, y, tx, ty, speed, dmg, frac = 0, min = 1) {
    if (this.nS >= this.shots.length) return;
    const dx = tx - x, dy = ty - y, d = Math.max(1, Math.hypot(dx, dy));
    const p = this.shots[this.nS++];
    p.kind = 'acid'; p.x = x; p.y = y; p.vx = (dx / d) * speed; p.vy = (dy / d) * speed; p.dmg = dmg; p.r = 9; p.alive = true;
    p.frac = frac; p.min = min;
  }

  healAround(z, dt) {
    const H = z.t.heal, r2 = H.r * H.r;
    for (let j = 0; j < this.nZ; j++) {
      const o = this.zombies[j];
      if (!o.alive || o === z || o.veh) continue;
      const dx = o.x - z.x, dy = o.y - z.y;
      if (dx * dx + dy * dy <= r2 && o.hp < o.maxHp) o.hp = Math.min(o.maxHp, o.hp + H.perSec * o.maxHp * dt);
    }
    z.cool -= dt;
    if (z.cool <= 0) { z.cool = 0.7; this.emitMinor('heal', z.x, z.y, H.r); }
  }

  // ── enemy projectiles: acid globs (aimed where the crowd WAS — move to dodge) and boulders ──
  updateShots(dt) {
    const s = this.stats;
    const R = crowdRadius(s.soldiers);
    for (let i = 0; i < this.nS;) {
      const p = this.shots[i];
      let done = false;
      if (p.kind === 'acid') {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (s.soldiers > 0 && Math.abs(p.x - this.crowdX) <= R * 0.85 + p.r && Math.abs(p.y - CROWD_Y) <= R * C.crowd.squash + p.r) {
          const k = Math.min(s.soldiers, p.frac > 0 ? Math.max(p.min, Math.round(s.soldiers * p.frac)) : Math.max(1, Math.ceil(p.dmg / C.hpPerSoldier)));
          s.soldiers -= k;
          this.emit('acidhit', p.x, p.y, k);
          done = true;
        } else if (p.y > CROWD_Y + 90 || p.x < ROAD_L - 60 || p.x > ROAD_R + 60) {
          this.emitMinor('acidmiss', p.x, Math.min(p.y, CROWD_Y + 90));
          done = true;
        }
      } else {                                         // boulder: lands after its telegraph
        p.t -= dt;
        if (p.t <= 0) {
          const G = C.boss.giant;
          let k = 0;
          if (s.soldiers > 0 && Math.abs(p.x - this.crowdX) <= G.radius + R * 0.5) {
            k = Math.min(s.soldiers, Math.max(G.killMin, Math.round(s.soldiers * G.killFrac)));
            s.soldiers -= k;
          }
          this.blast(p.x, p.y, G.radius, 4 * this.hpNow, null, 0);
          this.emit('boulder', p.x, p.y, k, G.radius);
          done = true;
        }
      }
      if (done) {
        p.alive = false;
        const last = --this.nS;
        if (i !== last) { this.shots[i] = this.shots[last]; this.shots[last] = p; }
        continue;
      }
      i++;
    }
  }

  // ── allied pickups and support (helicopter, tank, air strike) ─────────────
  updateAllies(dt) {
    const s = this.stats;
    const R = crowdRadius(s.soldiers);
    const top = CROWD_Y - R * C.crowd.squash, bottom = CROWD_Y + R * C.crowd.squash;
    for (let i = 0; i < this.allies.length;) {
      const a = this.allies[i];
      a.y += this.scroll * dt;
      if (a.alive && s.soldiers > 0 && Math.abs(a.x - this.crowdX) <= a.w / 2 + R * 0.6 && a.y + a.h / 2 >= top && a.y - a.h / 2 <= bottom) {
        a.alive = false;
        if (a.type === 'tank') {
          this.tankT = C.allies.tank.duration; this.tankCool = 0.3;
          this.emit('ally', a.x, a.y, 0, 0, 'tank');
        } else {
          const T = C.allies.truck;
          const cap = Math.round(T.capMult * C.gates.addCap * gateScale(this.level, this.endless));
          const add = Math.max(T.min, Math.min(cap, Math.round(s.soldiers * T.rel)));
          s.soldiers = Math.min(C.crowd.maxSoldiers, s.soldiers + add);
          this.emit('ally', a.x, a.y, add, 0, 'truck');
        }
      }
      if (!a.alive || a.y - a.h / 2 > C.track.despawnY) this.allies.splice(i, 1); else i++;
    }
  }

  /** The most urgent target: the enemy closest to the crowd that is on screen, else a boss. */
  pickTarget() {
    let best = null, by = 20;
    for (let j = 0; j < this.nZ; j++) {
      const z = this.zombies[j];
      if (!z.alive || (z.veh && z.warn > 0) || z.y <= by || z.y > CROWD_Y + 20) continue;
      best = z; by = z.y;
    }
    if (best) return best;
    for (const bo of this.bosses) if (bo.y > 40) return bo;
    return null;
  }
  hitTarget(tg, dmg) {
    if (this.bosses.includes(tg)) this.damageBoss(tg, dmg); else this.hurtZombie(tg, dmg);
  }

  triggerAirstrike() {
    const A = C.bonuses.airstrike;
    this.strikeQ.length = 0;
    for (let i = 0; i < A.bombs; i++) {
      this.strikeQ.push({
        t: 0.35 + (i / A.bombs) * A.duration,
        x: ROAD_L + 40 + this.rng.next() * (ROAD_W - 80),
        y: 690 - (i / Math.max(1, A.bombs - 1)) * 560 + (this.rng.next() - 0.5) * 60,
      });
    }
    this.strikeT = 0;
    this.emit('jets', ROAD_MID, 0, A.duration);
    for (const bo of this.bosses.slice()) this.damageBoss(bo, A.bossFrac * bo.maxHp, true);
  }

  updateSupport(dt) {
    if (this.strikeQ.length) {
      const A = C.bonuses.airstrike;
      this.strikeT += dt;
      while (this.strikeQ.length && this.strikeQ[0].t <= this.strikeT) {
        const b = this.strikeQ.shift();
        this.blast(b.x, b.y, A.radius, A.dmgMult * this.hpNow, null, 0);
        this.emit('bomb', b.x, b.y, A.radius);
        if (!this.strikeQ.length) {             // the last bomb: nothing on screen survives the strike
          for (let j = 0; j < this.nZ; j++) {
            const z = this.zombies[j];
            if (z.alive && !(z.veh && z.warn > 0) && z.y > -20 && z.y < CROWD_Y) this.hurtZombie(z, A.dmgMult * this.hpNow);
          }
        }
      }
    }
    if (this.heliT > 0) {
      const H = C.bonuses.heli;
      this.heliT -= dt; this.heliCool -= dt;
      while (this.heliCool <= 0) {
        this.heliCool += H.fireEvery;
        const tg = this.pickTarget();
        if (!tg) { this.heliCool = 0; break; }   // idle: no burst when the next target shows up
        this.hitTarget(tg, H.dmgMult * this.hpNow);
        this.emitMinor('heliShot', this.crowdX + H.offsetX, H.hoverY, tg.x, tg.y);
      }
      if (this.heliT <= 0) { this.heliT = 0; this.emit('heliEnd', this.crowdX, H.hoverY); }
    }
    if (this.tankT > 0) {
      const T = C.allies.tank;
      this.tankT -= dt; this.tankCool -= dt;
      if (this.tankCool <= 0) {
        this.tankCool += T.fireEvery;
        const tg = this.pickTarget();
        if (tg) {
          const dmg = T.dmgMult * this.hpNow;
          this.hitTarget(tg, dmg);
          this.blast(tg.x, tg.y, T.splash, dmg * 0.5, this.bosses.includes(tg) ? null : tg, 0);
          this.emit('tankShot', this.crowdX - 70, CROWD_Y - 20, tg.x, tg.y);
        } else this.tankCool = 0.1;
      }
      if (this.tankT <= 0) { this.tankT = 0; this.emit('tankEnd', this.crowdX - 70, CROWD_Y); }
    }
  }

  // ── gate rows ──────────────────────────────────────────────────────────────
  updateRows(dt) {
    for (let k = 0; k < this.rows.length;) {
      const r = this.rows[k];
      r.y += this.scroll * dt;
      for (let i = 0; i < r.flash.length; i++) if (r.flash[i] > 0) r.flash[i] = Math.max(0, r.flash[i] - dt * 8);
      if (!r.crossed && r.y >= CROWD_Y - 18) {
        // exactly ONE gate per row: the lane under the crowd centre at this instant
        const lane = this.laneOf(this.crowdX, r.lanes);
        const g = r.gates[lane];
        r.crossed = true; r.chosen = lane;
        const prevWeapon = this.stats.weapon;
        const res = applyGate(this.stats, g);
        this.emit('gate', ROAD_L + r.laneW * (lane + 0.5), r.y, res.after - res.before, gateTone(g) === 'bad' ? -1 : 1, g.kind);
        if (this.stats.weapon !== prevWeapon) this.emit('weapon', this.crowdX, CROWD_Y, this.stats.weapon);
        if (isBonusGate(g)) {
          if (g.kind === 'airstrike') this.triggerAirstrike();
          else { this.heliT = C.bonuses.heli.duration; this.heliCool = 0.4; this.emit('heli', this.crowdX, CROWD_Y); }
        }
      }
      if (r.crossed) r.fade = Math.min(1, r.fade + dt * 3);
      if (r.y - GATE_H > C.track.despawnY) this.rows.splice(k, 1); else k++;
    }
  }

  // ── bosses ─────────────────────────────────────────────────────────────────
  updateBoss(bo, dt) {
    const B = C.boss, S = B[bo.kind] || {}, s = this.stats;
    const cd = Math.pow(B.eliteCooldown, bo.elite);
    bo.phase += dt;
    if (bo.flash > 0) bo.flash = Math.max(0, bo.flash - dt * 6);
    // forward motion
    let vy;
    if (bo.kind === 'butcher' && bo.state === 'tele') vy = 0;
    else if (bo.kind === 'butcher' && bo.state === 'charge') vy = S.dist / S.time;
    else if (bo.y < B.enterY) vy = B.enterSpeed;
    else vy = this.scroll + B.speed * (bo.kind === 'hound' ? S.speedMult : 1);
    bo.y += vy * dt;
    // sideways: home on the crowd (the hound zigzags around that line)
    const m = B.home * dt, dx = this.crowdX - bo.cx;
    bo.cx += dx > m ? m : dx < -m ? -m : dx;
    const lim = bo.r * 0.6;
    if (bo.offX) {                       // a split blob half keeps its side of the pair (the pair centre stays on the road)
      const a = Math.abs(bo.offX);
      bo.cx = Math.max(ROAD_L + lim + a, Math.min(ROAD_R - lim - a, bo.cx));
    }
    bo.x = (bo.kind === 'hound' && bo.y >= B.specialFromY ? bo.cx + Math.sin(bo.phase * S.zigFreq * TAU) * S.zigAmp : bo.cx) + bo.offX;
    if (bo.x < ROAD_L + lim) bo.x = ROAD_L + lim; else if (bo.x > ROAD_R - lim) bo.x = ROAD_R - lim;
    // special moves (once on stage)
    if (bo.y >= B.enterY && this.bossArriveT < 0) this.bossArriveT = this.time;
    if (bo.y >= B.specialFromY) {   // specials start once it is in view
      bo.cool -= dt;
      if (bo.kind === 'king' || bo.kind === 'necro') {
        if (bo.cool <= 0) {
          bo.cool += S.every * cd;
          for (let k = 0; k < S.summon; k++) {
            const a = (k / S.summon) * Math.PI + Math.PI;
            const t = C.zombieTypes[S.type];
            this.spawnZombie(S.type, Math.max(ROAD_L + 20, Math.min(ROAD_R - 20, bo.x + Math.cos(a) * bo.r * 1.1)), bo.y + bo.r * 0.4, this.hpNow * t.hpMult);
          }
          this.emit('summon', bo.x, bo.y, S.summon, 0, bo.kind);
        }
      } else if (bo.kind === 'butcher') {
        if (bo.state === 'walk' && bo.cool <= 0) { bo.state = 'tele'; bo.st = S.telegraph; this.emit('telegraph', bo.x, bo.y); }
        else if (bo.state === 'tele') { bo.st -= dt; if (bo.st <= 0) { bo.state = 'charge'; bo.st = S.time; this.emit('charge', bo.x, bo.y); } }
        else if (bo.state === 'charge') { bo.st -= dt; if (bo.st <= 0) { bo.state = 'walk'; bo.cool = S.every * cd; } }
      } else if (bo.kind === 'acid') {
        if (bo.cool <= 0) { bo.cool += S.every * cd; bo.burst = S.globs; bo.burstT = 0; }
        if (bo.burst > 0 && (bo.burstT -= dt) <= 0) {   // a quick STREAM, each glob aimed where the crowd is now
          bo.burst--; bo.burstT += S.gap;
          this.launchAcid(bo.x, bo.y + bo.r * 0.5, this.crowdX, CROWD_Y, S.speed, 0, S.killFrac, S.killMin);
          this.emit('spit', bo.x, bo.y, 1, 1);
        }
      } else if (bo.kind === 'tank') {
        if (bo.shield > 0) { bo.shield -= dt; if (bo.shield <= 0) this.emit('shieldDown', bo.x, bo.y); }
        else if (bo.cool <= 0) { bo.shield = S.shield; bo.cool = S.every * cd + S.shield; this.emit('shield', bo.x, bo.y); }
      } else if (bo.kind === 'giant') {
        if (bo.cool <= 0 && this.nS < this.shots.length) {
          bo.cool += S.every * cd;
          const p = this.shots[this.nS++];
          p.kind = 'boulder'; p.x = this.crowdX; p.y = CROWD_Y; p.t = S.telegraph; p.tMax = S.telegraph; p.r = S.radius; p.alive = true;
          this.emit('throw', bo.x, bo.y, p.x, p.y);
        }
      }
    }
    bo.stompT += dt;
    if (bo.stompT >= B.stompEvery) { bo.stompT -= B.stompEvery; this.emit('stomp', bo.x, bo.y, bo.scale); }
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
    this.allies.length = 0;
    this.itemIdx = this.items.length;
    this.distance = Math.max(this.distance, this.def.length);
  }
}
