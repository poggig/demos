// Gate Shooter — boot, layout, state machine and the fixed-timestep loop.
import { CONFIG } from './config.js';
import { THEME } from './theme.js';
import { parseSeed, randomSeed, hashSeed } from './rng.js';
import { World } from './world.js';
import { generateLevel, levelSignature } from './generator.js';
import { carryOverStart } from './crowd.js';
import { statsFromUpgrades, buyUpgrade } from './economy.js';
import { loadSave, writeSave } from './storage.js';
import { detectLang, setLang, getLang } from './i18n.js';
import { AudioEngine } from './audio.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { metres } from './util.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const FIXED_SEED = parseSeed(params.get('seed'));
const DEBUG = params.get('debug') === '1';

// ── persistent state ─────────────────────────────────────────────────────────
const save = loadSave();
let saveDirty = false, lastSaveAt = 0;
function markDirty() { saveDirty = true; }
function flushSave(force) {
  const now = performance.now();
  if (!saveDirty || (!force && now - lastSaveAt < 1000)) return;
  writeSave(save); saveDirty = false; lastSaveAt = now;
}
setLang(params.get('lang') || save.settings.lang || detectLang());

// ── subsystems ───────────────────────────────────────────────────────────────
const audio = new AudioEngine();
audio.musicOn = save.settings.music;
audio.sfxOn = save.settings.sfx;
const frame = $('frame'), canvas = $('cv'), uiRoot = $('ui');
const renderer = new Renderer(canvas);
const ui = new UI();
let scale = 1;
const input = new Input(frame, () => scale, () => togglePause());

// ── game state ───────────────────────────────────────────────────────────────
let state = 'menu';          // menu | play | pause | level | dedication | shop | over
let world = null;            // the world being played (kept for the end screens' backdrop)
let demo = null;             // attract-mode world behind the menu
let run = null;              // { mode, seed, level, score, survivors, dedicationShown, … }
let shopFrom = 'menu';
let pausedByRotate = false;
let prepared = null;         // level 1 of the next campaign, generated while the menu idles

/** Generate levels off the critical path (menu idle / level-complete screen). */
function prepareFirstLevel() {
  if (prepared || state !== 'menu') return;
  const seed = FIXED_SEED ?? randomSeed();
  prepared = { seed, def: generateLevel(1, seed) };
}
function prepareNextLevel() {
  if (state === 'play' || state === 'pause') return; // fired late: never hitch mid-game
  if (run && run.mode === 'campaign' && !run.nextDef) run.nextDef = generateLevel(run.level + 1, run.seed);
}

function newDemo() {
  demo = new World({ mode: 'endless', seed: randomSeed(), start: 14, ai: true });
  demo.time = 0;
}

// ── layout: fixed 540×960 logical, letterboxed, crisp at devicePixelRatio (cap 2) ──
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / CONFIG.view.w, vh / CONFIG.view.h);
  const w = Math.max(1, Math.floor(CONFIG.view.w * s)), h = Math.max(1, Math.floor(CONFIG.view.h * s));
  scale = w / CONFIG.view.w;
  const dpr = Math.min(CONFIG.view.dprCap, window.devicePixelRatio || 1);
  frame.style.width = w + 'px';
  frame.style.height = h + 'px';
  frame.style.left = Math.floor((vw - w) / 2) + 'px';
  frame.style.top = Math.floor((vh - h) / 2) + 'px';
  uiRoot.style.transform = 'scale(' + scale + ')';
  renderer.resize(scale, dpr);
  ui.paintIcons(scale * dpr);
  checkRotate();
}

function isLandscapePhone() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return coarse && window.innerWidth > window.innerHeight && window.innerHeight < 600;
}
function checkRotate() {
  const rot = isLandscapePhone();
  $('rotate').classList.toggle('hidden', !rot);
  if (rot && state === 'play') { pause(); pausedByRotate = true; }
}

// ── flow ─────────────────────────────────────────────────────────────────────
function upgrades() { return statsFromUpgrades(save.upgrades); }

function goMenu() {
  state = 'menu';
  world = null; run = null;
  input.setActive(false);
  ui.setHud(false);
  renderer.reset();
  if (!demo) newDemo();
  ui.menu(save);
  audio.duck(false);
  audio.playMusic('menu');
  flushSave(true);
  setTimeout(prepareFirstLevel, 250);
}

function startCampaign() {
  const p = prepared;
  prepared = null;
  run = { mode: 'campaign', seed: p ? p.seed : FIXED_SEED ?? randomSeed(), level: 1, score: 0, survivors: 0, coins: 0, weapon: 0, dedicationShown: false };
  if (p) run.nextDef = p.def;
  startLevel(upgrades().start);
}

function startLevel(startSoldiers) {
  const up = upgrades();
  const def = run.nextDef && run.nextDef.level === run.level ? run.nextDef : generateLevel(run.level, run.seed);
  run.nextDef = null;
  run.def = def;
  run.signature = levelSignature(def);
  if (run.level > save.records.campaign.bestLevel) { save.records.campaign.bestLevel = run.level; markDirty(); }
  // the weapon is kept for the whole run; fire-rate / damage gates only last for the level
  world = new World({ mode: 'campaign', def, start: startSoldiers, weapon: run.weapon, rateMult: up.rateMult, damageMult: up.damageMult });
  enterPlay();
}

function startEndless() {
  const up = upgrades();
  run = { mode: 'endless', seed: FIXED_SEED ?? randomSeed(), level: 1, score: 0 };
  world = new World({ mode: 'endless', seed: run.seed, start: up.start, rateMult: up.rateMult, damageMult: up.damageMult });
  run.signature = hashSeed('endless', ...world.items.slice(0, 40).map(it => it.t + it.type + Math.round(it.at) + Math.round(it.x || 0))).toString(16);
  enterPlay();
}

function enterPlay() {
  state = 'play';
  world._banked = 0;
  world._endShown = false;
  renderer.reset();
  input.attach(world);
  input.setActive(true);
  ui.show(null);
  ui.setHud(true);
  audio.duck(false);
  audio.playMusic('game');
  if (run && run.mode === 'campaign') renderer.levelIntro(world);
  acc = 0;
  last = performance.now();
}

function bankCoins() {
  if (!world) return;
  const d = world.coins - (world._banked || 0);
  if (d > 0) { save.coins += d; world._banked = world.coins; markDirty(); }
}

function onWon() {
  bankCoins();
  run.score += world.score;
  run.survivors = world.soldiers;
  run.coins += world.coins;
  run.weapon = world.stats.weapon;
  const rec = save.records.campaign;
  if (run.score > rec.bestScore) rec.bestScore = run.score;
  markDirty(); flushSave(true);
  state = 'level';
  input.setActive(false);
  ui.setHud(false);
  audio.levelUp();
  audio.playMusic('menu');
  ui.levelComplete({
    level: run.level, survivors: run.survivors,
    nextStart: carryOverStart(run.survivors, upgrades().start),
    coins: world.coins, score: run.score, weapon: run.weapon,
  });
  setTimeout(prepareNextLevel, 120);
}

function onLevelContinue() {
  const D = THEME.dedication;
  if (D.afterLevel > 0 && run.level === D.afterLevel && !run.dedicationShown) {
    run.dedicationShown = true;
    state = 'dedication';
    ui.dedication();
    return;
  }
  openShop('between');
}

function openShop(from) {
  shopFrom = from;
  state = 'shop';
  if (from === 'menu' && !demo) newDemo();
  ui.shop(save, from, run ? run.level + 1 : 1);
}

function nextLevel() {
  run.level++;
  startLevel(carryOverStart(run.survivors, upgrades().start));
}

function onLost() {
  bankCoins();
  let score, record, newRecord = false;
  if (run.mode === 'campaign') {
    score = run.score + world.score;
    const rec = save.records.campaign;
    if (score > rec.bestScore) { rec.bestScore = score; newRecord = score > 0; }
    record = rec.bestScore;
  } else {
    score = world.score;
    const rec = save.records.endless;
    if (score > rec.bestScore) { rec.bestScore = score; newRecord = score > 0; }
    rec.bestDistance = Math.max(rec.bestDistance, metres(world.distance));
    record = rec.bestScore;
  }
  markDirty(); flushSave(true);
  state = 'over';
  input.setActive(false);
  ui.setHud(false);
  audio.gameOver();
  audio.playMusic(null);
  ui.gameOver({ mode: run.mode, score, record, newRecord, level: run.level, distance: metres(world.distance),
    coins: run.mode === 'campaign' ? run.coins + world.coins : world.coins });
}

function restart() {
  if (run && run.mode === 'endless') startEndless(); else startCampaign();
}

function pause() {
  if (state !== 'play' || !world || world.status !== 'running') return;
  state = 'pause';
  input.setActive(false);
  ui.show('pause');
  audio.duck(true);
  bankCoins(); flushSave(true);
}
function resume() {
  if (state !== 'pause') return;
  if (isLandscapePhone()) return;
  pausedByRotate = false;
  state = 'play';
  ui.show(null);
  input.setActive(true);
  audio.duck(false);
  acc = 0; last = performance.now();
}
function togglePause() { if (state === 'play') pause(); else if (state === 'pause') resume(); }

// ── events → fx + audio ──────────────────────────────────────────────────────
function handleEvents(w, withAudio) {
  for (let i = 0; i < w.nEvents; i++) {
    const e = w.events[i];
    renderer.onEvent(e, w);
    if (!withAudio) continue;
    switch (e.type) {
      case 'shot': audio.shot(e.a); break;
      case 'zhit': case 'bosshit': audio.hit(); break;
      case 'zdie': audio.zdie(e.b >= 25); break;
      case 'contact': audio.contact(); break;
      case 'crash': audio.contact(); audio.explosion(true); break;
      case 'vdie': audio.explosion(true); break;
      case 'explode': case 'bomb': audio.explosion(e.type === 'bomb'); break;
      case 'vehicle': audio.horn(); break;
      case 'acidhit': audio.contact(); audio.splat(); break;
      case 'spit': audio.acid(); break;
      case 'ally': audio.pickup(); if (e.s === 'tank') audio.cannon(); break;
      case 'jets': audio.jets(); break;
      case 'heli': audio.heli(); break;
      case 'heliShot': audio.shot(3); break;
      case 'tankShot': audio.cannon(); break;
      case 'telegraph': audio.warn(); break;
      case 'charge': case 'summon': audio.bossRoar(); break;
      case 'shield': audio.clang(); break;
      case 'split': audio.splat(); break;
      case 'throw': audio.whoosh(); break;
      case 'boulder': audio.explosion(true); break;
      case 'armor': audio.clang(); break;
      case 'gate': if (e.b > 0) audio.gateGood(); else audio.gateBad(); break;
      case 'gatestep': audio.gateStep(); break;
      case 'weapon': audio.weapon(e.a); break;
      case 'sameWeapon': audio.pickup(); break;
      case 'boss': audio.bossRoar(); audio.playMusic('boss'); break;
      case 'stomp': audio.stomp(); break;
      case 'bossdie': audio.bossDie(); break;
    }
  }
  w.clearEvents();
}

// ── main loop: fixed 60 Hz steps on requestAnimationFrame ────────────────────
let last = performance.now(), acc = 0, timeScale = 1;
let fpsT = 0, fpsN = 0, fpsEl = null;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.25) dt = 0.25;
  const step = CONFIG.step;

  if (state === 'play' && world) {
    input.update(dt);
    acc += dt * timeScale;
    const maxSteps = CONFIG.maxFrameSteps * Math.max(1, timeScale);
    let n = 0;
    while (acc >= step && n < maxSteps) { world.step(step); acc -= step; n++; }
    if (n >= maxSteps) acc = 0;
    handleEvents(world, true);
    audio.heartbeat(dt * timeScale, world.bossTension);
    bankCoins();
    flushSave(false);
    if (world.status === 'won' && world.endTime > 1.6 && !world._endShown) { world._endShown = true; onWon(); }
    else if (world.status === 'lost' && world.endTime > 1.3 && !world._endShown) { world._endShown = true; onLost(); }
  } else if (world && (state === 'level' || state === 'over' || state === 'dedication' || (state === 'shop' && shopFrom === 'between'))) {
    world.step(Math.min(dt, 0.05));      // the finished world keeps settling behind the panel
    handleEvents(world, false);
  } else if (state === 'menu' || (state === 'shop' && shopFrom === 'menu')) {
    if (!demo || demo.status !== 'running' || demo.time > 75) newDemo();
    acc += dt;
    let n = 0;
    while (acc >= step && n < CONFIG.maxFrameSteps) { demo.step(step); acc -= step; n++; }
    if (n >= CONFIG.maxFrameSteps) acc = 0;
    handleEvents(demo, false);
  }

  const shownWorld = state === 'menu' || (state === 'shop' && shopFrom === 'menu') ? demo : world;
  if (state !== 'pause') renderer.updateFx(dt, shownWorld);
  if (renderer.coinsArrived > 0) { if (state === 'play') audio.coin(); renderer.coinsArrived = 0; }
  renderer.draw(shownWorld);
  if ((state === 'play' || state === 'pause') && world && run) ui.hud(world, run, save);

  if (fpsEl) {
    fpsT += dt; fpsN++;
    if (fpsT >= 0.5) { fpsEl.textContent = Math.round(fpsN / fpsT) + ' fps'; fpsT = 0; fpsN = 0; }
  }
}

// ── wiring ───────────────────────────────────────────────────────────────────
function click(id, fn) {
  $(id).addEventListener('click', e => { e.preventDefault(); audio.unlock(); audio.click(); fn(e); });
}
click('btnCampaign', startCampaign);
click('btnEndless', startEndless);
click('btnShopMenu', () => openShop('menu'));
click('btnPause', () => pause());
click('btnResume', resume);
click('btnPauseRestart', () => { bankCoins(); restart(); });
click('btnPauseMenu', () => { bankCoins(); goMenu(); });
click('btnLevelContinue', onLevelContinue);
click('btnDedContinue', () => openShop('between'));
click('btnShopNext', nextLevel);
click('btnShopBack', goMenu);
click('btnRestart', restart);
click('btnOverMenu', goMenu);
for (const id of ['buyStart', 'buyDamage', 'buyRate']) {
  $(id).addEventListener('click', e => {
    e.preventDefault();
    audio.unlock();
    if (buyUpgrade(save, e.currentTarget.dataset.up)) { audio.buy(); markDirty(); flushSave(true); }
    else audio.deny();
    ui.shop(save, shopFrom, run ? run.level + 1 : 1);
  });
}
function setLanguage(l) {
  setLang(l);
  save.settings.lang = l; markDirty(); flushSave(true);
  ui.applyTexts();
  ui.setToggles(audio.musicOn, audio.sfxOn);
  if (state === 'menu') ui.menu(save);
  else if (state === 'shop') ui.shop(save, shopFrom, run ? run.level + 1 : 1);
}
click('btnLangIt', () => setLanguage('it'));
click('btnLangEn', () => setLanguage('en'));
for (const el of document.querySelectorAll('[data-toggle]')) {
  el.addEventListener('click', e => {
    e.preventDefault();
    audio.unlock();
    if (el.dataset.toggle === 'music') { audio.setMusic(!audio.musicOn); save.settings.music = audio.musicOn; }
    else { audio.setSfx(!audio.sfxOn); save.settings.sfx = audio.sfxOn; audio.click(); }
    markDirty(); flushSave(true);
    ui.setToggles(audio.musicOn, audio.sfxOn);
  });
}

// audio unlocks on the first gesture (browsers require it)
const unlock = () => { if (!audio.ready) audio.unlock(); };
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);
window.addEventListener('touchend', unlock, true);

// auto-pause when the tab is hidden or the window loses focus
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); bankCoins(); flushSave(true); audio.suspend(); }
  else audio.resume();
});
window.addEventListener('blur', () => pause());
window.addEventListener('pagehide', () => { bankCoins(); flushSave(true); });
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 120));

// ── QA / debug surface ───────────────────────────────────────────────────────
window.GS = {
  version: CONFIG.version,
  get state() { return state; },
  get world() { return world; },
  get demo() { return demo; },
  get run() { return run; },
  get save() { return JSON.parse(JSON.stringify(save)); },
  get lang() { return getLang(); },
  get music() { return audio.musicOn; },
  get sfx() { return audio.sfxOn; },
  get audioState() { return audio.ctx ? audio.ctx.state : 'locked'; },
  signature() { return run ? run.signature : null; },
};
if (DEBUG) {
  window.GS.debug = {
    win() { if (world && !world.endless && world.status === 'running') { world.debugSkipToBoss(); if (!world.bosses.length) world.spawnBoss(); for (const b of world.bosses.slice()) world.damageBoss(b, b.hp + 1); } },
    lose() { if (world && world.status === 'running') world.stats.soldiers = 0; },
    toBoss() { if (world) world.debugSkipToBoss(); },
    killAll() { if (world) world.debugKillAll(); },
    setSoldiers(n) { if (world) world.stats.soldiers = Math.max(0, Math.floor(n)); },
    addCoins(n) { save.coins += Math.floor(n); markDirty(); flushSave(true); if (state === 'shop') ui.shop(save, shopFrom, run ? run.level + 1 : 1); if (state === 'menu') ui.menu(save); },
    speed(x) { timeScale = Math.max(0.1, Math.min(8, Number(x) || 1)); },
    level(n) { startCampaign(); run.level = Math.max(1, Math.floor(n)); startLevel(upgrades().start); },
    weapon(i) { if (world) world.stats.weapon = Math.max(0, Math.min(CONFIG.weapons.length - 1, i | 0)); },
    airstrike() { if (world) world.triggerAirstrike(); },
    heli() { if (world) { world.heliT = CONFIG.bonuses.heli.duration; world.heliCool = 0.3; world.emit('heli', world.crowdX, CONFIG.crowd.y); } },
    tank() { if (world) { world.tankT = CONFIG.allies.tank.duration; world.tankCool = 0.3; } },
    vehicle(type = 'bus', x = 270) { if (world) world.spawnVehicle(type, x, world.hpNow * CONFIG.vehicles[type].hpMult); },
    ally(type = 'tank', x = 270) { if (world) { const a = CONFIG.allies[type]; world.allies.push({ type, x, y: 250, w: a.w, h: a.h, alive: true }); } },
    crate(w = 7, x = 270) { if (world) { const a = CONFIG.allies.crate; world.allies.push({ type: 'crate', x, y: 250, w: a.w, h: a.h, alive: true, weapon: w }); } },
    zombie(type = 'walker', x = 270, y = 200) { if (world) world.spawnZombie(type, x, y, world.hpNow * CONFIG.zombieTypes[type].hpMult); },
  };
  fpsEl = document.createElement('div');
  fpsEl.id = 'fps';
  frame.appendChild(fpsEl);
}

// ── boot ─────────────────────────────────────────────────────────────────────
ui.applyTexts();
ui.setToggles(audio.musicOn, audio.sfxOn);
layout();
goMenu();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
