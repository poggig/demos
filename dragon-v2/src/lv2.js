// ═══════════════════════════════════════════════════════════════════════════
// CHRONICLES OF AZURERUNE v2 — LEVEL 2 "Kingfisher Festival"
// Source of truth: the original game_v3/index.html, class Lv2 (2613-3019) + the shared
// Hero/Companion/Enem/DarkZone code (1094-1803). Digest: tools/digest/L2.md.
// Party: Kote, Minerva, Elber, Nick (Nesta absent → Digit4 = Nick, the fox stays hidden).
// Music: 'underwater' for the WHOLE level (the original never switches it). No scrolls.
//   A1 River Ambush      — underwater: swim, 4 darkmantles, darkness, "ESCAPE: Ns" 90 s
//   A2 Festival          — Vogler village walk: Mayor + Ispin, gate at x > 1600
//   A3 Fishing           — its own screen: a VERTICAL bar, centred 60/40/20 % zone, Space
//   A4 Shadow on the Road — Draconian Kapak (hops) + 6 Draconian Scouts → level3
//
// NUANCES (L2.md §6) → how this file reproduces them
//  N1  neutral buoyancy      L2_swimHero wraps the hero's engine _swimControl: after the
//                            engine's attack/skill/ranged handling it re-integrates the
//                            ORIGINAL model — drag ×0.88/f on both axes BEFORE input,
//                            hold ↑/W/Space → vy = max(vy−0.7, −5), ↓/S → min(vy+0.7, 5),
//                            ←/→ set ±spd and release stops dead; released = hover at
//                            that depth (no sink: enterSwim sinkV 0). The mv() quirk is
//                            kept: vy exactly 0 off a solid tile → +0.6 (≈5 px settle,
//                            e.g. after bumping the ceiling).
//  N2  floating frames       every swimmer's st = 'jump' (vy<0) / 'fall' — no walk/idle
//                            clip (procAnim's jump/fall lean); companions bob ±10 px with
//                            the original sine (Date.now()/700 + phase, 0.25 px/f).
//                            (Original companions kept run/idle frames — applied to all
//                            swimmers per the brief: that was half the "grounded" look.)
//  N3  Space swims up        Space is read as ↑ in the swim (also the touch ▲ jump button);
//                            no jump/double-jump underwater. K is the original's one-frame
//                            7 px dash nudge (0.6 s CD, 0.15 s i-frames).
//  N4  darkmantle swimming   L2_darkmantleBeh (_bossBeh): no gravity, no tile collision
//                            (checkCollision.none); vy = sin(now/800+off)·1 + sign(hero
//                            top − own top)·0.5 px/f, clamped ±2 → ghosts through rock
//                            vertically; sideways it is stopped by rock with the original
//                            blockedH probe (leading edge, rows y+6 / y+h−2, solUp). A hit
//                            (engine chargeOnHit: 1.5 s at spd×1.8 toward the nearest
//                            hero, static/patrol → chase for good) makes it FALL under
//                            gravity (0.6/f², max 10) through walls and land on the first
//                            solid row its feet reach, then float again.
//  N5  darkness              each hero's hurt() is wrapped: the first LANDED hit of each
//                            darkmantle (hp really dropped; patrol/chase/static — not while
//                            it charges) → this.darkZone(hit-time centre) (320 px, 15 s,
//                            world-anchored, stacking). Max 4 = one per darkmantle.
//  N6  ESCAPE countdown      startCountdown(90): "ESCAPE: Ns", blue/orange<45/red<20, no
//                            refill, ticks only while the act is live (frozen in dialogue).
//  N7  swap re-snaps         NOT reproduced (GAMESPEC deliberate fix: the engine never snaps).
//  N8  companions stuck      companions keep their depth (no vertical follow, only the bob),
//                            follow horizontally with the original offsets 50+55·i and
//                            0.85/0.35·spd ×0.88 drag, and rocks block them sideways.
//  N9  underwater dressing   35 bubbles (world x, screen y, r 1-4, 12-30 px/s), the 22 %
//                            navy tint over the actors, no garden props; the drawn
//                            underwater backdrop already carries the caustic shafts. Coral /
//                            weed props on the seabed only (the drawn world art standard).
//                            The ceiling row (kept for collision) is painted as a CAVE ROOF
//                            (L2_caveRoof: rock mass to the top of the view, jagged lit
//                            underside, stalactites, kelp; visual review #9) — at the
//                            bottom-of-screen layout it otherwise read as a floating slab.
//                            Bubbles therefore rise only through the water band.
//  N10 empty east floor      the full 300×18 map; all rocks/foes in the first ~1950 px.
//  N11 castle tiles          deliberate fix (GAMESPEC): underwater A1, garden A2-A4.
//  N12 music                 'underwater' all level (A2-A4 included).
//  N13 forgiving fishing     L2_FISH_HALF 0.3/0.2/0.1 centred zone, marker 2 units/s
//                            bouncing with the one-step overshoot, starts at 0 going down,
//                            not reset between rounds, frozen in dialogue; Space ONLY; a
//                            blocking "Fish N Caught!" / "Missed! Try again." after EVERY
//                            press, unlimited tries, "Fish: n/3" updates at once, the zone
//                            narrows only when the caught line closes. HUD hidden, no tiles,
//                            party bodies or NPCs. LOOK (visual review #2, deliberate): the
//                            original's flat bar over a blank screen + 20 random flickering
//                            "ripple" squares is replaced by a drawn pond scene — garden
//                            backdrop at the last camera x, pond with calm highlight lines and
//                            reflected string-lights, the controlled hero on the bank with a
//                            rod and line, a bobbing float with deterministic rings (one per
//                            0.8 s), the bar in a wooden frame with a fish marker, parchment
//                            plates, and a fish-jump arc + splash (FX.burst) on each catch.
//  N14 Kapak                 ai 'chase' (no phase 2) + L2_kapakBeh: always walks at
//                            spd×1.8 = 1.26 px/f toward the controlled hero (the boss
//                            branch has no aggro range), hops vy −9 every 2.0-3.5 s while
//                            grounded (first after 2.0 s, never during its hit-charge,
//                            excluded from the universal hop), contact cooldown 1.2 s; the
//                            hop/chase SURVIVE hits (GAMESPEC fix of "any hit → chase").
//                            Copper multiply tint #b87333 @0.6 (= 0xd4ab85). Win: +20
//                            acid-green #00dd44 at its body + 25 #00aa44 at screen centre.
//  N15 spawn quirks          the x=3000 scout spawned 16 px inside the right hill and dm1
//                            inside the x50-52 rock → deliberate fix: both stand ON the
//                            surface (hill top orig y 208 / rock top orig y 192).
//  N16 no scrolls; stale     allowScrolls=false (no R, no counter). The stale "Enemies: 0/4"
//      counter               in the village is NOT reproduced (cosmetic bug: A2/A3 show no
//                            enemy counter).
//  N17 NPC sprites + gate    the Mayor wears Bakaris's drawing, Ispin wears Minerva's
//                            (both hero-sized, facing right, as drawn by R.drawHero); gate
//                            at hero left-edge x > 1600 (centre 1610), not the comment's 800.
//  N18 deferred celebration  A1's win shake (0.5 s / 4 px) is re-queued in bAct2 so it lands
//                            when the A2 intro closes, as in the original.
//  N19 HP per act            every act re-creates the party from G.heroHPs (the HP at the
//                            end of L1) — the engine's applyStats does exactly that.
//  N20 Nesta absent          PARTY4; original x offsets +0/+30/+60/+120 (Nick +120) and
//                            each hero's original snapped feet (A1: Minerva/Elber on the
//                            x5-9 rock, Kote/Nick on the sea floor).
//  Also: the original's village update never reads X → X is swallowed in A2.
//
// DELIBERATE FIXES (GAMESPEC policy 2)
//  F1  countdown at 0: the original zeroed every hero and soft-locked (no game over) →
//      scenes-base updateCountdown kills the party → the engine's game over + "retry act".
//  F2  swapping no longer re-snaps heroes/darkmantles to the sea floor (engine swap).
//  F3  proper themes (underwater / garden) instead of castle tiles everywhere.
//  F4  the x=3000 scout and dm1 spawn standing on the surface, not embedded (N15).
//  F5  Kapak specials persist after it is hit (N14).
//  F6  the A4 win shake: the original queued it and lost it when Lv3 replaced the scene
//      under the win line → it plays with the win line here (visible, same 0.5 s / 4 px).
//  F7  the Space that CLOSES a fishing dialogue is not also a cast: fishing ignores Space
//      for the 2 frames after any dialogue closes (the engine's keyboard queue would
//      otherwise turn every "Missed!" close into a new miss — an endless loop).
//  F8  no stale "Enemies: 0/4" in the village (N16).
// LOCAL WORKAROUND for a shared-code defect found while verifying (reported to the lead —
// FIXED in scenes-base by the lead — the local override was removed):
//  W1  scenes-base _tickDark never calls rt.render() (Phaser 4 render textures only commit
//      queued fill/erase on render()) → dark zones drew NOTHING; and Phaser 4's
//      erase(key, x, y) CENTRES the stamp, so its "− 320" offset would put the hole
//      320 px up-left of the hit point.
//  Kept from the contract: the countdown text sits above the darkness (scenes-base), so
//  it stays readable inside a pool of black (the original's darkness covered it).
// String keys: all existing (dlg_lv2_*, speaker_*, hint_lv2_act*, ui_fish_*, enemy/npc
// names). "Fish N Caught!" is dlg_lv2_update_01 with {n} filled at show time.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const L2_FISH_HALF = [0.3, 0.2, 0.1];     // sweet-zone half width per round (60/40/20 % of the bar)
const L2_KAPAK_TINT = 0xd4ab85;           // copper #b87333 multiply @60 %: per channel 0.4 + 0.6·copper
const L2_NAVY = 0x001e6e;                 // the deep-water tint rgba(0,30,110,0.22)
// Fishing screen layout (screen px). The bar is the original's 40×200 at (740,140).
const L2_BAR = { x: CW - 60, y: (CH - 200) / 2, w: 40, h: 200 };
const L2_POND = { water: 336, bobX: 432, tipX: 214, tipY: 228 };   // waterline, float x, rod tip
const L2_LANTERN = [0xffb84a, 0x6ad0ff, 0xff6a6a, 0x8aff8a];         // the festival string-light colours
const L2_ROOF = { dark: 0x06203a, rock: 0x0a2c44, lit: 0x2a6a8a, kelp: 0x1e5a3a };

// ── ORIGINAL MAPS (original coords; buildOrig shifts the rows) ──────────────
// buildUnderwaterArena (index.html:928-939): ceiling row 0, floor rows H-2..H-1, side
// walls, 8 two-row rock outcrops on/near the sea floor.
function L2_underwater(tm, W, H) {
  for (let x = 0; x < W; x++) tm.set(x, 0, 1);
  for (let x = 0; x < W; x++) { tm.set(x, H - 1, 1); tm.set(x, H - 2, 1); }
  for (let y = 0; y < H; y++) { tm.set(0, y, 1); tm.set(W - 1, y, 1); }
  [[5, H - 4, 5], [18, H - 5, 4], [34, H - 4, 6], [50, H - 6, 3], [66, H - 4, 5], [84, H - 5, 4], [100, H - 4, 5], [118, H - 5, 4]].forEach(([px, py, pw]) => {
    for (let i = 0; i < pw; i++) { tm.set(px + i, py, 1); tm.set(px + i, py + 1, 1); }
  });
}
// buildGardenPath (index.html:851-872): 3-row ground, two 2-step hills, three one-way
// platforms at row H-8 and the high banner platform at H-13.
function L2_garden(tm, W, H) {
  for (let x = 0; x < W; x++) { tm.set(x, H - 3, 1); tm.set(x, H - 2, 1); tm.set(x, H - 1, 1); }
  for (let x = 18; x < 30; x++) { tm.set(x, H - 4, 1); tm.set(x, H - 3, 1); }
  for (let x = 20; x < 28; x++) tm.set(x, H - 5, 1);
  const rh = Math.floor(W * 0.6);
  for (let x = rh; x < rh + 12; x++) { tm.set(x, H - 4, 1); tm.set(x, H - 3, 1); }
  for (let x = rh + 2; x < rh + 10; x++) tm.set(x, H - 5, 1);
  const lp = Math.floor(W * 0.15);
  for (let i = 0; i < 7; i++) tm.set(lp + i, H - 8, 3);
  const mid = Math.floor(W / 2);
  for (let i = -5; i < 5; i++) tm.set(mid + i, H - 8, 3);
  const rp = Math.floor(W * 0.72);
  for (let i = 0; i < 7; i++) tm.set(rp + i, H - 8, 3);
  for (let i = -3; i < 4; i++) tm.set(mid + i, H - 13, 3);
}

// Seabed props only (props() would also stand coral on top of the ceiling row): the
// same seeded LCG, scanning from below the ceiling for a surface with 4 free rows.
function L2_seabedProps(sc, seed) {
  const list = (WORLD_PROPS.underwater || []).map(p => 'prop_underwater_' + p).filter(k => sc.textures.exists(k));
  const tm = sc.tm; if (!list.length || !tm) return;
  let s = (seed * 9301 + 49297) % 233280; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const top = sc._dy + 5;
  for (let x = 3; x < tm.w - 3; x += 7 + Math.floor(R() * 7)) {
    let y = -1;
    for (let yy = top; yy < tm.h; yy++) if (tm.solUp(x, yy) && !tm.sol(x, yy - 1) && !tm.sol(x, yy - 2) && !tm.sol(x, yy - 3) && !tm.sol(x, yy - 4)) { y = yy; break; }
    if (y < 0) continue;
    sc.add.image(x * T + 8, y * T + 1, list[Math.floor(R() * list.length)]).setOrigin(0.5, 1).setScale(2).setDepth(-6);
  }
}

// A1 cave roof (visual review #9): the original box's ceiling row is kept for collision, but
// at the bottom-of-screen layout it read as a slab floating mid-screen with open water
// above. Paint the rock mass from the top of the view down to the ceiling's underside:
// angular rock chunks lit along their LOWER edges (the light comes up from the water,
// brighter toward the underside), a jagged lit underside, sparse stalactites + drips and a
// few hanging kelp strands. Baked ONCE (seeded) into a seamless 960 px texture and shown
// as a TileSprite across the 4800 px world — a static image instead of hundreds of
// Graphics paths re-drawn every frame (phone cost). Depth −1: over the ceiling tiles (−2,
// hides their sandy top lip), under every actor (0+). Returns the underside world y.
function L2_caveRoof(sc) {
  const tm = sc.tm; if (!tm) return 0;
  const roof = sc.oy(16), TW = 960, TH = roof + 40, C = L2_ROOF, key = '__l2roof_' + roof;
  if (!sc.textures.exists(key)) {
    let s = 4242; const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const g = sc.make.graphics({ add: false });
    const wrap = (x, w, fn) => { fn(x); if (x - w < 0) fn(x + TW); if (x + w > TW) fn(x - TW); };   // seamless tile
    g.fillStyle(C.dark, 1).fillRect(0, 0, TW, roof);
    const tones = [0x072442, C.rock, 0x0c3150, 0x082846], ROWS = 5, rh0 = roof / ROWS;
    for (let row = 0; row < ROWS; row++) {                              // angular chunks, row by row
      const lit = 0.1 + 0.5 * (row / (ROWS - 1));
      for (let x = (row % 2) * 18; x < TW; x += 30 + Math.floor(R() * 28)) {
        const cx = x + R() * 8, cy = row * rh0 + 4 + R() * (rh0 - 4), rw = 20 + R() * 26, rh = 12 + R() * 14, tone = tones[Math.floor(R() * tones.length)];
        const pts = []; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + R() * 0.5, f = 0.75 + R() * 0.35; pts.push([Math.cos(a) * rw / 2 * f, Math.sin(a) * rh / 2 * f]); }
        wrap(cx, rw, ox => {
          g.fillStyle(tone, 1); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(ox + p[0], cy + p[1]) : g.moveTo(ox + p[0], cy + p[1]))); g.closePath(); g.fillPath();
          g.lineStyle(1, C.lit, lit); g.beginPath();
          for (let i = 0; i < 6; i++) { const p = pts[i], q = pts[(i + 1) % 6]; if (p[1] > 0 && q[1] > 0) { g.moveTo(ox + p[0], cy + p[1]); g.lineTo(ox + q[0], cy + q[1]); } }
          g.strokePath();
          g.lineStyle(1, 0x041628, 0.8); g.beginPath();
          for (let i = 0; i < 6; i++) { const p = pts[i], q = pts[(i + 1) % 6]; if (p[1] < 0 && q[1] < 0) { g.moveTo(ox + p[0], cy + p[1]); g.lineTo(ox + q[0], cy + q[1]); } }
          g.strokePath();
        });
      }
    }
    const jag = []; for (let x = 0; x < TW; x += 14 + Math.floor(R() * 20)) jag.push([x, roof + 1 + Math.floor(R() * 7)]);
    jag.push([TW, jag[0][1]]);                                          // closes on the start height → seamless
    g.fillStyle(C.rock, 1); g.beginPath(); g.moveTo(0, roof - 8);
    g.lineTo(TW, roof - 8); for (let i = jag.length - 1; i >= 0; i--) g.lineTo(jag[i][0], jag[i][1]);
    g.closePath(); g.fillPath();
    g.lineStyle(2, C.lit, 0.9); g.beginPath(); g.moveTo(jag[0][0], jag[0][1] - 1);   // the lit underside
    jag.forEach(p => g.lineTo(p[0], p[1] - 1)); g.strokePath();
    for (let x = 50 + Math.floor(R() * 60); x < TW - 30; x += 130 + Math.floor(R() * 170)) {   // stalactites
      const w = 8 + Math.floor(R() * 10), h = 10 + Math.floor(R() * 20), top = roof + 2, tip = x + (R() - 0.5) * 3;
      g.fillStyle(C.rock, 1).fillTriangle(x - w / 2, top, x + w / 2, top, tip, top + h);
      g.lineStyle(1, C.lit, 0.85).lineBetween(x - w / 2 + 1, top + 1, tip - 0.5, top + h - 2);
      if (R() < 0.45) g.fillStyle(C.lit, 0.85).fillRect(tip - 1, top + h + 3, 2, 2);
    }
    for (let x = 30 + Math.floor(R() * 60); x < TW - 20; x += 200 + Math.floor(R() * 220)) {    // hanging kelp
      const len = 16 + Math.floor(R() * 20);
      g.lineStyle(2, C.kelp, 0.95); g.beginPath(); g.moveTo(x, roof + 3);
      for (let k = 1; k <= 6; k++) g.lineTo(x + Math.sin(k * 1.3 + x) * 3, roof + 3 + len * k / 6);
      g.strokePath();
    }
    g.generateTexture(key, TW, TH); g.destroy();
  }
  sc.add.tileSprite(0, 0, tm.w * T, TH, key).setOrigin(0, 0).setDepth(-1);
  return roof;
}
// A parchment plate (fishing counter / prompt), centred on (cx, cy).
function L2_plate(g, cx, cy, w, h) {
  const x = cx - w / 2, y = cy - h / 2;
  g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 2, y + 3, w, h, 6);
  g.fillStyle(0xe8d5a4, 1).fillRoundedRect(x, y, w, h, 6);
  g.fillStyle(0xd3b97f, 1).fillRect(x + 4, y + h - 6, w - 8, 3);
  g.lineStyle(2, 0x7a5426, 1).strokeRoundedRect(x, y, w, h, 6);
  g.lineStyle(1, 0xfaf0d6, 0.7).strokeRoundedRect(x + 3, y + 3, w - 6, h - 6, 4);
}

// Put a hero's feet at world y `feet` (centre x `cx`), `lift` px above it.
function L2_place(h, cx, feet, lift) { h.body.reset(cx, feet - h.displayHeight * (1 - h.originY) - (lift || 0)); h.body.setVelocity(0, 0); }
// The original's onSolid: the tile row under the feet, probed at x+4 / x+w-4.
function L2_onSolid(tm, b) {
  if (!tm) return true;
  const r = Math.floor((b.bottom + 0.5) / T), c1 = Math.floor((b.x + 4) / T), c2 = Math.floor((b.right - 4) / T);
  return tm.sol(c1, r) || tm.sol(c2, r);
}

// ── A1: the controlled swimmer (index.html:1172-1194). Wraps the engine's _swimControl
// (which keeps Z/J attack, Q skill, ranged fire, the attack/skill timers and the tint),
// then re-integrates the original buoyancy model on top. Velocities in px/frame.
function L2_swimHero(h) {
  const base = h._swimControl;
  h._swimControl = function (dt) {
    const b = this.body, k = dt * FPS;
    let vx = b.velocity.x / FPS, vy = b.velocity.y / FPS;      // after the last physics step (a blocked axis is 0)
    const free = this.st !== 'attack' && this.st !== 'skill';
    base.call(this, dt);
    const drag = Math.pow(0.88, k); vx *= drag; vy *= drag;     // water drag BEFORE input (the original's order)
    if (free) {
      if (I.down('ArrowLeft') || I.down('KeyA')) vx = -this.spd;
      else if (I.down('ArrowRight') || I.down('KeyD')) vx = this.spd;
      else vx = 0;                                               // the controlled hero stops dead on release
      if (I.down('ArrowUp') || I.down('KeyW') || I.down('Space')) vy = Math.max(vy - 0.7 * k, -5);
      if (I.down('ArrowDown') || I.down('KeyS')) vy = Math.min(vy + 0.7 * k, 5);
      if (I.pr('KeyK') && this.dashCD <= 0) { this.dashCD = 0.6; vx = (this.rt ? 1 : -1) * 7; this.inv = Math.max(this.inv, 0.15); }
    }
    if (vy === 0 && !L2_onSolid(this.scene && this.scene.tm, b)) vy = 0.6;   // mv(): vy exactly 0 off a tile → one GR
    b.setVelocity(vx * FPS, vy * FPS);
    if (this.st !== 'attack' && this.st !== 'skill') this.st = vy < 0 ? 'jump' : 'fall';
  };
}
// ── A1: a benched swimmer (Companion.update index.html:1422-1490 + the Lv2 bob 2885-2887).
// Installed as the Companion's _move: horizontal follow with the original offsets, ×0.88
// drag, NO depth change, ±10 px sine bob (period ≈4.4 s).
function L2_floatFollow(dt, active) {
  const h = this.hero, b = h.body;
  if (!b || !active || !active.on) return;
  const drag = Math.pow(0.88, dt * FPS);
  const off = 50 + (h._compIdx || 0) * 55;
  const dx = (active.x - off * (active.rt ? 1 : -1)) - h.x, dist = Math.abs(active.x - h.x);
  let vx = 0;
  if (dist > 60 + off) { vx = Math.sign(dx) * h.spd * 0.85; h.rt = dx > 0; }
  else if (dist > 25) vx = Math.sign(dx) * h.spd * 0.35;
  vx *= drag;
  const bob = Math.sin(Date.now() / 700 + (h._floatPhase || 0)) * 0.25;
  b.setVelocity(vx * FPS, bob * FPS);
  h.setFlipX(!h.rt);
  h.st = bob < 0 ? 'jump' : 'fall';
}
// ── A1: darkmantle (_bossBeh, runs after the engine's archetype + charge velocity).
function L2_darkmantleBeh(dt, hero) {
  const sc = this.scene, b = this.body, tm = sc && sc.tm; if (!b || !tm) return;
  const k = dt * FPS;
  this._hopT = 99;                                     // gnd is never true underwater → no universal hop
  let vx = b.velocity.x / FPS;
  if (this._chargeT > 0) {
    // the charge branch (index.html:1502-1529): gravity, NO wall check, lands on solid
    this._vyf = Math.min((this._vyf || 0) + 0.6 * k, 10);
    const r = Math.floor(b.bottom / T), c1 = Math.floor((b.x + 4) / T), c2 = Math.floor((b.right - 4) / T);
    if (this._vyf > 0 && (tm.sol(c1, r) || tm.sol(c2, r))) { this.y += r * T - b.bottom; this._vyf = 0; }
    b.setVelocity(vx * FPS, this._vyf * FPS);
    return;
  }
  // floating (index.html:1680-1692): bob ±1 px/f + 0.5 px/f toward the controlled hero's depth
  let vy = Math.sin(sc.time.now / 800 + (this._floatOff || 0));
  if (hero && hero.on && hero.body) vy += Math.sign(hero.body.y - b.y) * 0.5;
  vy = Math.max(-2, Math.min(2, vy));
  if (vx !== 0) {                                      // blockedH: rock stops it sideways
    const nx = b.x + vx * k, tx = vx > 0 ? Math.floor((nx + b.width - 2) / T) : Math.floor((nx + 2) / T);
    const r1 = Math.floor((b.y + 6) / T), r2 = Math.floor((b.bottom - 2) / T);
    if (tm.solUp(tx, r1) || tm.solUp(tx, r2)) vx = 0;
  }
  this._vyf = vy;
  b.setVelocity(vx * FPS, vy * FPS);
}
// ── A4: the Draconian Kapak's boss branch (index.html:1542-1545, 1584-1592).
function L2_kapakBeh(dt, hero) {
  this._hopT = 99;                                     // it has its own _jumpTimer → no universal hop
  this._L2x = this.x; this._L2y = this.y;
  if (!(this._jFlashT > 0)) this.setTint(L2_KAPAK_TINT);   // juice's hit flash clears tints
  if (this.akt > (this._L2akt == null ? 0 : this._L2akt) + 0.5) this.akt += 0.2;   // boss contact cooldown 1.2 s
  this._L2akt = this.akt;
  if (this._chargeT > 0 || !hero || !hero.on) return;  // the hit-charge has no hop (it returns early)
  this.ai = 'chase';                                   // the boss branch never decays into patrol
  const dd = hero.x > this.x ? 1 : -1;
  this.body.setVelocityX(this.spd * FPS * 1.8 * dd); this.rt = dd > 0; this.setFlipX(!this.rt);
  this._jumpTimer -= dt;
  if (this._jumpTimer <= 0 && (this.body.blocked.down || this.body.touching.down)) {
    this._jumpTimer = 2.0 + Math.random() * 1.5;
    this.body.setVelocityY(-9 * FPS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
class Level2 extends DragonScene {
  constructor() { super('level2'); this.musicTheme = 'underwater'; this.allowScrolls = false; }

  enter() { this.bAct1(); }

  beginAct(n) {
    super.beginAct(n);
    this.events.off('postupdate', this._fishAnim, this);
    this._L2water = false; this._fish = null; this._fishFxG = null; this._fishBarG = null; this._bubbles = null; this._bubG = null;
    this._L2npcs = null; this._L2kapak = null; this._L2roof = 0;
  }
  // Benched swimmers get the original float-follow (companions are rebuilt on every swap).
  rebuildCompanions() {
    super.rebuildCompanions();
    if (this._L2water) this.companions.forEach(c => { c._move = L2_floatFollow; });
  }
  // createHeroes(x, …): offsets +0/+30/+60/+120 (the gap is Nesta's), each hero on the
  // surface the original snapped it to (feetOrig[i]).
  _L2party(x, feetOrig, lift) {
    this.party(x, feetOrig[0], PARTY4);
    [0, 30, 60, 120].forEach((o, i) => { const h = this.heroes[i]; if (h) L2_place(h, x + o + 10, this.oy(feetOrig[i]), lift); });
  }
  // The first LANDED blow of each darkmantle (not during its charge) opens a dark zone.
  _L2hurtHook(h) {
    const base = h.hurt;
    h.hurt = (n, srcX) => {
      const hp0 = h.hp;
      base.call(h, n, srcX);
      if (!(h.hp < hp0) || srcX == null || this.act !== 1) return;
      const e = this.enemies.find(x => x.on && x.customType === 'darkmantle' && x.x === srcX);
      if (e && !e._darkUsed && !(e._chargeT > 0)) { e._darkUsed = true; this.darkZone(e.body.center.x, e.body.center.y); }
    };
  }
  // Celebration burst at WORLD (x, y) (the original's P.emit of `count` particles in one colour).
  _L2burst(x, y, color, count) { if (typeof FX !== 'undefined') FX.burst(this, x, y, { count, tint: [color], speedMax: 200 }); }

  // ── ACT 1 — RIVER AMBUSH (index.html:2653-2685) ─────────────────────────
  bAct1(retry) {
    this.beginAct(1);
    this.dress('underwater');
    this.buildOrig(300, 18, L2_underwater);
    L2_seabedProps(this, 1);
    this._L2roof = L2_caveRoof(this);        // the ceiling row painted as a cave roof (collision unchanged)
    // Kote (x40) + Nick (x160) on the sea floor (orig feet 256); Minerva (x70) + Elber
    // (x100) on top of the x5-9 rock (orig feet 224) — flush: there is no gravity to settle.
    this._L2party(40, [256, 224, 224, 256], 0);
    this.enterSwim({ thrust: 5, drag: 0.88, sinkV: 0, maxV: 5 });
    this._L2water = true;
    this.heroes.forEach(h => { h._floatPhase = Math.random() * 6.28; L2_swimHero(h); this._L2hurtHook(h); });
    this.rebuildCompanions();
    this.familiars();
    const dm = (x, feet, hp, dmg, ai) => {
      const e = this.foe({ type: 'darkmantle', x: x + 10, feet: this.oy(feet), w: 20, h: 24, hp, dmg, ai, spd: 0.9, nameKey: 'enemy_name_darkmantle' });
      e.body.setAllowGravity(false); e.body.checkCollision.none = true;   // swims: no gravity, ghosts through rock vertically
      e._floatOff = Math.random() * 6.28; e._darkUsed = false; e._vyf = 0; e._bossBeh = L2_darkmantleBeh;
      return e;
    };
    this.enemiesIn([
      dm(800, 192, 140, 17, 'chase'),     // deliberate fix: on top of the x50-52 rock, not inside it
      dm(1000, 256, 140, 17, 'patrol'),
      dm(1300, 256, 150, 20, 'chase'),
      dm(1760, 256, 140, 17, 'static'),
    ]);
    // dressing: 35 rising bubbles + the deep-water tint (drawn over the actors, under the dark)
    // (bubbles rise through the water band only — they vanish under the cave roof)
    this._bubbles = Array.from({ length: 35 }, () => ({ x: Math.random() * 4800, y: this._L2roof + 10 + Math.random() * (CH - this._L2roof - 10), r: 1 + Math.random() * 3, spd: 12 + Math.random() * 18 }));
    this._bubG = this.add.graphics().setScrollFactor(0).setDepth(11);
    this.add.rectangle(0, 0, CW, CH, L2_NAVY, 0.22).setOrigin(0, 0).setScrollFactor(0).setDepth(12);
    this._drawBubbles();
    this.startCountdown(90); this.updateCountdown(0);
    this.setHint('hint_lv2_act1');
    if (retry) { this.live = true; return; }
    this.say([d('speaker_narrator', 'dlg_lv2_act1_01'), d('speaker_narrator', 'dlg_lv2_act1_02'), d('speaker_tutorial', 'dlg_lv2_act1_03')], () => { this.live = true; });
  }
  _drawBubbles() {
    const g = this._bubG; if (!g) return;
    const cx = this.cameras.main.scrollX; g.clear();
    for (const b of this._bubbles) {
      const sx = b.x - cx; if (sx < -10 || sx > CW + 10) continue;
      g.lineStyle(1, 0x96dcff, 0.65).strokeCircle(sx, b.y, b.r);
      g.fillStyle(0xdcf0ff, 0.36).fillCircle(sx - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.35);
    }
  }

  // ── ACT 2 — THE FESTIVAL (index.html:2687-2709, 2845-2861) ──────────────
  bAct2(retry) {
    this.beginAct(2);
    this.dress('garden');
    this.buildOrig(300, 18, L2_garden);
    this.props(2, { avoid: [800, 1000] });
    this._L2party(50, [240, 240, 240, 240], 2);
    this.familiars();
    const feet = this.oy(240);
    this._L2npcs = [
      { x: 800, feet, nameKey: 'npc_name_mayor', lines: [d('speaker_mayor', 'dlg_lv2_act2_01')], sprite: { key: 'atlas_enemy_bakaris', frame: 'enemy_bakaris_idle_0', scale: 0.95 } },
      { x: 1000, feet, nameKey: 'npc_name_ispin', lines: [d('speaker_ispin', 'dlg_lv2_act2_02')], sprite: { key: 'atlas_hero_minerva', frame: 'hero_minerva_idle_0', scale: 1 } },
    ];
    this.setHint('hint_lv2_act2');
    if (retry) { this.live = true; return; }
    this.winShake(0.5, 4);   // A1's act-win shake, deferred: it lands when this intro closes (nuance 18)
    this.say([d('speaker_narrator', 'dlg_lv2_act2_03'), d('speaker_mayor', 'dlg_lv2_act2_04'), d('speaker_ispin', 'dlg_lv2_act2_05')], () => { this.live = true; });
  }

  // ── ACT 3 — FISHING (index.html:2711-2719, 2813-2834, 2944-2967) ────────
  // Its own screen (no tiles, no party bodies, no NPCs, HUD hidden). The RULES are the
  // original's (_fishStep); the LOOK is a drawn pond scene (visual review #2): the garden
  // backdrop at the last camera x, a pond, the controlled hero on the bank with a rod, a
  // line to a bobbing float with expanding rings, the bar in a wooden frame with a fish
  // marker, parchment plates, and a fish-jump + splash on each catch. Everything is screen
  // space (scroll factor 0); the ambient layer runs on 'postupdate' so the float and rings
  // keep moving under a dialogue while the MARKER (step-driven) stays frozen, as in the original.
  bAct3(retry) {
    const camX = this.cameras.main.scrollX;
    const lead = this.heroes[this.ai]; if (lead) this._L2angler = lead.customType;
    this.beginAct(3);
    this.dress('garden');
    this.buildOrig(300, 18, () => {});      // the garden backdrop only — no tiles
    this.cameras.main.stopFollow(); this.cameras.main.setScroll(camX, 0);
    UI.hideHud();
    this._fish = { round: 0, caught: 0, marker: 0, dir: 1, skip: 0, t: 0 };
    this._fishScene();
    this.events.on('postupdate', this._fishAnim, this);
    this._fishAnim();
    this.setHint('hint_lv2_act3');
    if (retry) { this.live = true; this._fish.skip = 2; return; }
    this.say([d('speaker_narrator', 'dlg_lv2_act3_01'), d('speaker_narrator', 'dlg_lv2_act3_02')], () => { this.live = true; this._fish.skip = 2; });
  }
  _fishStep(dt) {
    const f = this._fish;
    f.marker += f.dir * 2 * dt;
    if (f.marker > 1) f.dir = -1;
    if (f.marker < 0) f.dir = 1;
    if (f.skip > 0) f.skip--;
    else if (I.pr('Space')) {
      if (Math.abs(f.marker - 0.5) < L2_FISH_HALF[f.round]) {
        f.caught++;
        this._fishTxt.setText(Lang.t('ui_fish_counter').replace('{n}', f.caught));
        this._fishCatchFx();
        this.say([d('speaker_narrator', Lang.t('dlg_lv2_update_01').replace('{n}', f.caught))], () => {
          f.round++; f.skip = 2;
          if (f.round >= 3) this.bAct4();
        });
      } else this.say([d('speaker_narrator', 'dlg_lv2_update_02')], () => { f.skip = 2; });
    }
  }
  // The static pieces: pond, bank, angler + rod, the wooden bar frame, the two plates.
  _fishScene() {
    const P = L2_POND, B = L2_BAR, add = this.add;
    const w = add.graphics().setScrollFactor(0).setDepth(5);
    w.fillGradientStyle(0x3b4a72, 0x3b4a72, 0x0a1220, 0x0a1220, 1).fillRect(0, P.water, CW, CH - P.water);   // dusk-lit water, darker below
    w.fillStyle(0x0e2016, 1).fillRect(0, P.water - 3, CW, 4);                          // the far reed line
    w.fillStyle(0x8a9ac8, 0.35).fillRect(0, P.water + 1, CW, 1);                       // the surface sheen
    // the bank: earth sloping into the water, a grass lip with tufts, a few stones
    const b = add.graphics().setScrollFactor(0).setDepth(6);
    b.fillStyle(0x2b1d12, 1); b.beginPath(); b.moveTo(0, 322); b.lineTo(150, 322); b.lineTo(186, 334); b.lineTo(214, 352); b.lineTo(232, CH); b.lineTo(0, CH); b.closePath(); b.fillPath();
    b.fillStyle(0x1e140c, 1); b.beginPath(); b.moveTo(160, 330); b.lineTo(214, 352); b.lineTo(232, CH); b.lineTo(170, CH); b.closePath(); b.fillPath();
    b.fillStyle(0x3d6a2e, 1).fillRect(0, 316, 152, 7); b.fillTriangle(150, 316, 150, 323, 188, 334);
    b.fillStyle(0x5a8a3a, 1).fillRect(0, 316, 150, 2);
    for (let x = 6; x < 150; x += 13) b.fillStyle(0x4e7c36, 1).fillTriangle(x, 317, x + 3, 308 + (x * 7) % 6, x + 6, 317);
    b.fillStyle(0x4a4a52, 1).fillEllipse(190, 346, 16, 8).fillEllipse(205, 360, 12, 6);
    b.fillStyle(0x6a6a74, 1).fillEllipse(188, 344, 8, 3);
    // the angler: the controlled hero's idle frame, facing the water
    const type = this._L2angler || 'kote';
    this._fishHero = add.image(112, 318, Art.ensureHero(this, type, 20, 36), Art.heroFrame(this, type)).setOrigin(0.5, 1).setScrollFactor(0).setDepth(7).setFlipX(false);
    const rod = add.graphics().setScrollFactor(0).setDepth(8);
    rod.lineStyle(3, 0x4a2e14, 1).lineBetween(120, 292, L2_POND.tipX, L2_POND.tipY);
    rod.lineStyle(1, 0x9a7040, 1).lineBetween(120, 291, L2_POND.tipX, L2_POND.tipY - 1);
    rod.fillStyle(0x2a1a0c, 1).fillCircle(124, 289, 3);                               // the reel
    this._fishFxG = add.graphics().setScrollFactor(0).setDepth(8.5);                    // water lines, reflections, rings, line, float
    // the bar: a wooden frame with a lighter bevel, rounded corners, a gold-trimmed well
    const f = add.graphics().setScrollFactor(0).setDepth(20);
    f.fillStyle(0x000000, 0.35).fillRoundedRect(B.x - 12, B.y - 10, B.w + 28, B.h + 28, 10);
    f.fillStyle(0x5a3818, 1).fillRoundedRect(B.x - 14, B.y - 14, B.w + 28, B.h + 28, 10);
    for (let i = 0; i < 6; i++) f.lineStyle(1, 0x4a2c12, 0.9).lineBetween(B.x - 10 + (i % 3) * 3, B.y - 8 + i * 37, B.x - 10 + (i % 3) * 3, B.y + 14 + i * 37);
    for (let i = 0; i < 6; i++) f.lineStyle(1, 0x4a2c12, 0.9).lineBetween(B.x + B.w + 5 + (i % 3) * 3, B.y + 6 + i * 35, B.x + B.w + 5 + (i % 3) * 3, B.y + 26 + i * 35);
    f.lineStyle(2, 0x9a6a36, 1).strokeRoundedRect(B.x - 12, B.y - 12, B.w + 24, B.h + 24, 8);
    f.lineStyle(1, 0x2a180a, 1).strokeRoundedRect(B.x - 14, B.y - 14, B.w + 28, B.h + 28, 10);
    f.fillStyle(0x0c1a24, 1).fillRoundedRect(B.x, B.y, B.w, B.h, 4);
    f.lineStyle(1, 0xc8a84e, 1).strokeRoundedRect(B.x - 1, B.y - 1, B.w + 2, B.h + 2, 5);
    this._fishBarG = add.graphics().setScrollFactor(0).setDepth(21);                    // zone + fish marker
    // parchment plates for the counter and the prompt
    const st = { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#3a2410' };
    this._fishTxt = add.text(CW / 2, 30, Lang.t('ui_fish_counter').replace('{n}', 0), st).setOrigin(0.5).setScrollFactor(0).setDepth(23);
    this._fishPress = add.text(CW / 2, CH - 34, Lang.t('ui_fish_press'), st).setOrigin(0.5).setScrollFactor(0).setDepth(23);
    const pl = add.graphics().setScrollFactor(0).setDepth(22);
    for (const t of [this._fishTxt, this._fishPress]) L2_plate(pl, t.x, t.y, t.width + 32, t.height + 14);
  }
  // Ambient + bar redraw (every frame, dialogue or not; reads the step-driven marker).
  _fishAnim(time, delta) {
    const f = this._fish, g = this._fishFxG;
    if (this.act !== 3 || !f || !g || !g.active) return;
    f.t += Math.min(0.05, (delta || 0) / 1000);
    const t = f.t, P = L2_POND, bx = P.bobX;
    g.clear();
    for (let i = 0; i < 7; i++) {                                  // calm highlight lines, drifting slowly
      const y = P.water + 12 + i * 17 + i * i, a = 0.24 - i * 0.025, len = 50 + (i * 53) % 80;
      const x = ((i * 157 + t * (5 + i * 1.5)) % (CW + 240)) - 120;
      g.lineStyle(1, 0xaebce4, a).lineBetween(x, y, x + len, y).lineBetween(x + len + 90, y + 3, x + len * 1.6 + 90, y + 3);
    }
    for (let i = 0; i < 9; i++) {                                  // the string-lights, reflected
      const lx = 34 + i * 88 + Math.sin(t * 0.9 + i * 1.7) * 3, ly = P.water + 10 + (i % 3) * 7, c = L2_LANTERN[i % 4];
      g.fillStyle(c, 0.3).fillRect(lx, ly, 10, 2); g.fillStyle(c, 0.15).fillRect(lx + 2, ly + 5, 6, 2);
    }
    for (let k = 0; k < 3; k++) {                                  // rings: a new one every 0.8 s, each lives 2.4 s
      const age = (t % 0.8) + k * 0.8, r = 6 + age * 17;
      g.lineStyle(1, 0xdce8ff, Math.max(0, 0.6 * (1 - age / 2.4))).strokeEllipse(bx, P.water + 3, r * 2, r * 0.55);
    }
    const by = P.water + 1 + Math.sin(t * 2.2) * 1.6;               // the float bobs gently
    g.lineStyle(1, 0xe8e6d8, 0.85); g.beginPath(); g.moveTo(P.tipX, P.tipY);
    for (let s = 1; s <= 18; s++) { const u = s / 18; g.lineTo(P.tipX + (bx - P.tipX) * u, P.tipY + (by - 7 - P.tipY) * u + Math.sin(u * Math.PI) * 16); }
    g.strokePath();
    g.lineStyle(1, 0x2a1a0c, 1).lineBetween(bx, by - 9, bx, by - 5);
    g.fillStyle(0xf4f0e8, 1).fillEllipse(bx, by + 1, 9, 6);
    g.fillStyle(0xd23a2a, 1).fillEllipse(bx, by - 2, 9, 6);
    g.fillStyle(0xffffff, 0.8).fillRect(bx - 2, by - 4, 2, 1);
    this._fishBar();
  }
  _fishBar() {
    const f = this._fish, g = this._fishBarG, B = L2_BAR; if (!g || !g.active) return;
    g.clear();
    const sw = L2_FISH_HALF[Math.min(f.round, 2)], zy = B.y + B.h * (0.5 - sw), zh = B.h * sw * 2;
    g.fillStyle(0x3f8f3a, 1).fillRect(B.x + 2, zy, B.w - 4, zh);
    g.fillStyle(0x86d260, 1).fillRect(B.x + 2, zy, B.w - 4, 2).fillRect(B.x + 2, zy + zh - 2, B.w - 4, 2);
    const my = B.y + Math.max(0, Math.min(1, f.marker)) * B.h, cx = B.x + B.w / 2;
    g.fillStyle(0xfff2a0, 1).fillTriangle(B.x - 13, my - 6, B.x - 13, my + 6, B.x - 4, my).fillTriangle(B.x + B.w + 13, my - 6, B.x + B.w + 13, my + 6, B.x + B.w + 4, my);
    g.fillStyle(0xffa22e, 1).fillEllipse(cx + 2, my, 24, 11).fillTriangle(cx - 8, my, cx - 16, my - 6, cx - 16, my + 6);
    g.fillStyle(0xffd98a, 1).fillEllipse(cx + 3, my + 2, 14, 4);
    g.fillStyle(0x1a1208, 1).fillCircle(cx + 9, my - 1, 1.5);
  }
  // A catch: the fish leaps out at the float in a short arc, with a splash going in and out.
  _fishCatchFx() {
    const P = L2_POND, cam = this.cameras.main, wx = cam.scrollX, wy = cam.scrollY;
    const splash = (x, n) => { if (typeof FX !== 'undefined') FX.burst(this, x + wx, P.water + wy, { count: n, tint: [0x9fd4ff, 0xffffff, 0x5a8ac8], speedMax: 170, lifespan: 1100 }); };
    splash(P.bobX, 22);
    const fish = this.add.graphics().setScrollFactor(0).setDepth(9);
    fish.fillStyle(0xb8cce0, 1).fillEllipse(0, 0, 26, 10).fillTriangle(-10, 0, -19, -7, -19, 7);
    fish.fillStyle(0x7890b0, 1).fillEllipse(1, -2, 16, 3);
    fish.fillStyle(0x10141a, 1).fillCircle(8, -1, 1.5);
    fish.setPosition(P.bobX, P.water);
    this.tweens.addCounter({
      from: 0, to: 1, duration: 760,
      onUpdate: tw => { const u = tw.getValue(); fish.setPosition(P.bobX + u * 92, P.water - Math.sin(u * Math.PI) * 80).setAngle(-55 + u * 115); },
      onComplete: () => { splash(P.bobX + 92, 12); fish.destroy(); },
    });
  }

  // ── ACT 4 — SHADOW ON THE ROAD (index.html:2721-2751) ──────────────────
  bAct4(retry) {
    this.beginAct(4);
    this.dress('garden');
    this.buildOrig(300, 18, L2_garden);
    this.props(4);
    UI.showHud();
    this._L2party(50, [240, 240, 240, 240], 2);
    this.familiars();
    const g = this.oy(240);
    const kapak = this.foe({ type: 'draconian_kapak', x: 1000 + 14, feet: g, w: 28, h: 56, hp: 180, dmg: 20, ai: 'chase', spd: 0.7, nameKey: 'enemy_name_draconian_kapak', tint: L2_KAPAK_TINT });
    kapak._jumpTimer = 2.0; kapak._bossBeh = L2_kapakBeh;
    this._L2kapak = kapak;
    const scout = (x, ai, feet) => this.foe({ type: 'draconian', x: x + 12, feet: feet || g, w: 24, h: 36, hp: 120, dmg: 12, ai, spd: 0.7, nameKey: 'enemy_name_draconian_scout' });
    this.enemiesIn([
      kapak,
      scout(1200, 'chase'), scout(1800, 'patrol'), scout(2400, 'chase'),
      scout(3000, 'patrol', this.oy(208)),   // deliberate fix: standing on the right hill, not 16 px inside it
      scout(3600, 'chase'), scout(4200, 'patrol'),
    ]);
    this.setHint('hint_lv2_act4');
    if (retry) { this.live = true; return; }
    this.say([d('speaker_narrator', 'dlg_lv2_act4_01'), d('speaker_narrator', 'dlg_lv2_act4_02'), d('speaker_tutorial', 'dlg_lv2_act4_03')], () => { this.live = true; });
  }

  // ── PER FRAME ────────────────────────────────────────────────────────────
  step(dt) {
    this.updateFamiliars(dt);
    const cam = this.cameras.main;
    if (this.act === 1) {
      if (this._bubbles) { for (const b of this._bubbles) { b.y -= b.spd * dt; if (b.y < this._L2roof + 6) b.y = CH + Math.random() * 80; } this._drawBubbles(); }
      if (this.live && !this._won) {
        this.updateCountdown(dt);
        if (this.enemiesAllDead() && this.heroes.some(h => h.on)) {
          this._won = true; this.live = false;   // (the 0.5 s / 4 px win shake is queued by bAct2 — nuance 18)
          this._L2burst(cam.scrollX + CW / 2, cam.scrollY + CH / 2, 0xc8a84e, 25);
          this.say([d('speaker_narrator', 'dlg_lv2_update_05')], () => this.bAct2());
        }
      }
    } else if (this.act === 2) {
      if (this._L2npcs) this.talkNPCs(dt, this._L2npcs);
      I._pressed.delete('KeyX');           // the original's village update never reads X
      this.walkGate(dt, 1610, () => this.say([d('speaker_narrator', 'dlg_lv2_update_03'), d('speaker_ispin', 'dlg_lv2_update_04')], () => this.bAct3()));
    } else if (this.act === 3) {
      if (this.live && this._fish) this._fishStep(dt);
    } else if (this.act === 4) {
      if (this.live && !this._won && this.enemiesAllDead()) {
        this._won = true; this.live = false;
        cam.shake(500, 4 / 1600);          // deliberate fix F6: the original's A4 shake was lost under the win line
        this._L2burst(cam.scrollX + CW / 2, cam.scrollY + CH / 2, 0x00aa44, 25);
        const k = this._L2kapak;
        if (k && k._L2x != null) this._L2burst(k._L2x, k._L2y, 0x00dd44, 20);
        this.say([d('speaker_narrator', 'dlg_lv2_update_06')], () => this.nextLevel('level3'));
      }
    }
  }
}

if (typeof window !== 'undefined') window.Level2 = Level2;
