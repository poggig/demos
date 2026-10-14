// App controller: menu → lobby → game. Orders are planned against a live preview of the
// player's own empire; "End turn" submits them and the engine resolves when everyone is done.
import { applyOrder, playerPlanets, preview, unitInfo } from '../engine/game.js';
import * as F from '../engine/formulas.js';
import { SHIPS } from '../engine/data.js';
import { t, errText, getLang, setLang } from '../i18n.js';
import { LocalGame } from '../net/local.js';
import { onlineConfig, saveOnlineConfig, myGames, createOnline, joinOnline, OnlineGame } from '../net/online.js';
import * as V from './views.js';

const { esc, fmt, short } = V;
const $app = document.getElementById('app');

const ctx = {
  screen: 'menu',      // menu | pass | game | lobby
  adapter: null,
  orders: [],
  view: 'overview',
  planetId: null,
  gal: { g: 1, s: 1 },
  qty: {},
  fleetDraft: null,
  menu: { names: ['', ''], settings: { ...F.DEFAULT_SETTINGS }, online: null, code: '', myName: '', gameName: '' },
  toast: null,
};

const VIEWS = ['overview', 'buildings', 'research', 'yard', 'defence', 'fleet', 'galaxy', 'reports', 'empire'];
const NAV_ICON = { overview: '◉', buildings: '⌂', research: '⚗', yard: '⚓', defence: '⛨', fleet: '➤', galaxy: '✦', reports: '✉', empire: '♛' };

// URL: ?join=CODE pre-fills the join box; ?game=ID opens an online game.
const params = new URLSearchParams(location.search);
if (params.get('join')) ctx.menu.code = params.get('join').toUpperCase();
try { ctx.menu.myName = localStorage.getItem('starfall.name') || ''; } catch {}

function toast(msg, kind = 'info') {
  ctx.toast = { msg, kind, at: Date.now() };
  renderToast();
  setTimeout(() => { if (ctx.toast && Date.now() - ctx.toast.at >= 2900) { ctx.toast = null; renderToast(); } }, 3000);
}
function renderToast() {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = ctx.toast ? `show ${ctx.toast.kind}` : '';
  el.textContent = ctx.toast ? ctx.toast.msg : '';
}

// ------------------------------------------------------------------ derived

function derive() {
  const a = ctx.adapter;
  const pid = a.me;
  const { state: pv, errors } = preview(a.state, pid, ctx.orders);
  // Drop orders that no longer apply (e.g. after removing an earlier one).
  if (errors.some(Boolean)) {
    ctx.orders = ctx.orders.filter((_, i) => !errors[i]);
    a.saveDraft(ctx.orders);
    return derive();
  }
  const mine = playerPlanets(pv, pid);
  if (!ctx.planetId || !pv.planets[ctx.planetId] || pv.planets[ctx.planetId].owner !== pid) ctx.planetId = mine[0]?.id;
  const planet = pv.planets[ctx.planetId];
  if (!ctx.fleetDraft) ctx.fleetDraft = { ships: {}, to: { g: planet.g, s: planet.s, p: planet.p, kind: 'planet' }, mission: 'attack', speed: 100, cargo: [0, 0, 0] };
  return { pv, pid, planet, qty: ctx.qty, fleetDraft: ctx.fleetDraft, gal: ctx.gal };
}

function addOrder(o) {
  const a = ctx.adapter;
  const { state } = preview(a.state, a.me, ctx.orders);
  const e = applyOrder(state, a.me, o);
  if (e) { toast(errText(e), 'bad'); return false; }
  ctx.orders = [...ctx.orders, o];
  a.saveDraft(ctx.orders);
  render();
  return true;
}

// ------------------------------------------------------------------ render

function render() {
  if (ctx.screen === 'menu') return renderMenu();
  if (ctx.screen === 'lobby') return renderLobby();
  if (ctx.screen === 'pass') return renderPass();
  renderGame();
}

function langToggle() {
  return `<div class="lang"><button class="mini ${getLang() === 'it' ? 'on' : ''}" data-act="lang" data-id="it">IT</button><button class="mini ${getLang() === 'en' ? 'on' : ''}" data-act="lang" data-id="en">EN</button></div>`;
}

function settingsForm(s) {
  const row = (key, label, opts) => `<label>${label}<select data-set="${key}">${opts.map((v) => `<option ${s[key] === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
  return `<details class="settings"><summary>${t('settings')}</summary>
    ${row('speed', t('speedSetting'), [1, 2, 3, 4, 5, 6, 8])}
    ${row('turnHours', t('turnHours'), [2, 4, 6, 8, 12, 24])}
    ${row('fleetSecondsPerTurn', t('fleetSec'), [300, 600, 900, 1800, 3600])}
    ${row('galaxies', t('galaxy'), [1, 2, 3, 4, 5])}
    ${row('systems', 'Systems', [10, 20, 30, 50, 100, 200])}
    ${row('deadlineHours', t('deadline'), [0, 12, 24, 48, 72])}
  </details>`;
}

function renderMenu() {
  const m = ctx.menu;
  const games = LocalGame.list();
  const cfg = onlineConfig();
  $app.innerHTML = `
  <div class="menu">
    ${langToggle()}
    <h1 class="logo">STARFALL</h1>
    <p class="tag">${getLang() === 'it' ? 'Strategia spaziale a turni, tra amici.' : 'Turn-based space strategy, among friends.'}</p>

    ${games.length ? `<div class="panel"><h3>${t('continueGame')}</h3>${games.map((g) => `
      <div class="row"><button data-act="openLocal" data-id="${g.id}">${esc(g.name)}</button>
      <span class="muted">${t('turn')} ${g.turn} · ${g.players.map(esc).join(', ')}</span>
      <button class="mini danger" data-act="delLocal" data-id="${g.id}">✕</button></div>`).join('')}</div>` : ''}

    <div class="panel">
      <h3>${t('onlineGame')}</h3>
      ${cfg.ok ? `
        <label>${t('yourName')} <input data-m="myName" value="${esc(m.myName)}" maxlength="20"></label>
        <div class="row"><input data-m="code" placeholder="${t('code')}" value="${esc(m.code)}" maxlength="6" class="code"><button data-act="joinOnline">${t('join')}</button></div>
        <div class="row"><input data-m="gameName" placeholder="${t('name')}" value="${esc(m.gameName)}" maxlength="40"><button data-act="createOnline">${t('create')}</button></div>
        ${settingsForm(m.settings)}
        <div id="mygames">${m.online ? m.online.map((g) => `<div class="row"><button data-act="openOnline" data-id="${g.id}">${esc(g.name)}</button><span class="muted">${g.status === 'lobby' ? t('lobby') : `${t('turn')} ${g.turn}`} · ${g.code}</span></div>`).join('') : `<span class="muted">…</span>`}</div>
        <details><summary>${t('supabaseSetup')}</summary>${cfgForm(cfg)}</details>`
      : `<p class="muted">${t('notConfigured')}</p>${cfgForm(cfg)}`}
    </div>

    <div class="panel">
      <h3>${t('localGame')}</h3>
      ${m.names.map((n, i) => `<div class="row"><input data-name="${i}" value="${esc(n)}" placeholder="${t('name')} ${i + 1}" maxlength="20">${m.names.length > 1 ? `<button class="mini" data-act="rmName" data-id="${i}">✕</button>` : ''}</div>`).join('')}
      ${m.names.length < 8 ? `<button class="mini" data-act="addName">+ ${t('addPlayer')}</button>` : ''}
      ${settingsForm(m.settings)}
      <button class="primary" data-act="newLocal">${t('start')}</button>
    </div>
    <p class="muted small foot">${getLang() === 'it' ? 'Ispirato ai classici giochi di strategia spaziale via browser. Nomi e grafica originali.' : 'Inspired by classic browser space-strategy games. Original names and art.'}</p>
  </div>`;
  if (cfg.ok && !m.online && !m.loadingOnline) {
    m.loadingOnline = true;
    myGames().then((g) => { m.online = g; m.loadingOnline = false; if (ctx.screen === 'menu') renderMenu(); })
      .catch((e) => { m.online = []; m.loadingOnline = false; toast(e.message, 'bad'); });
  }
}

function cfgForm(cfg) {
  return `<label>${t('supabaseUrl')}<input data-cfg="url" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co"></label>
    <label>${t('supabaseKey')}<input data-cfg="key" value="${esc(cfg.key)}" placeholder="eyJ…"></label>
    <button class="mini" data-act="saveCfg">${t('saveCfg')}</button>`;
}

function renderLobby() {
  const a = ctx.adapter;
  const link = `${location.origin}${location.pathname}?join=${a.game.code}`;
  $app.innerHTML = `<div class="menu">${langToggle()}
    <h1 class="logo small">STARFALL</h1>
    <div class="panel"><h3>${t('lobby')} — ${esc(a.game.name)}</h3>
      <p>${t('code')}: <b class="code">${a.game.code}</b></p>
      <p>${t('inviteLink')}: <input readonly value="${esc(link)}" class="link"> <button class="mini" data-act="copy" data-id="${esc(link)}">${t('copy')}</button></p>
      <h4>${t('players')}</h4>
      ${a.members.map((m) => `<div>• ${esc(m.name)}${m.user_id === a.game.host ? ` (${t('host')})` : ''}${m.user_id === a.uid ? ` — ${t('you')}` : ''}</div>`).join('')}
      ${a.isHost ? `<button class="primary" data-act="startOnline">${t('startGame')}</button>` : `<p class="muted">${t('waitingStart')}…</p>`}
    </div>
    <button class="mini" data-act="leave">${t('leave')}</button></div>`;
}

function renderPass() {
  const a = ctx.adapter;
  const p = a.state.players[a.me];
  $app.innerHTML = `<div class="menu pass">
    <h1 class="logo small">STARFALL</h1>
    ${a.lastResolved && a.lastResolved.turn === a.state.turn - 1 && a.me === Object.keys(a.state.players)[0] ? `<p class="ok">${t('turnResolved', { n: a.lastResolved.turn })}</p>` : ''}
    <p>${t('turn')} ${a.state.turn}</p>
    <p class="big">${t('passTo')} <b style="color:${p.color}">${esc(p.name)}</b></p>
    <button class="primary" data-act="ready">${t('imReady', { name: esc(p.name) })}</button>
    <button class="mini" data-act="leave">${t('leave')}</button>
  </div>`;
}

function renderGame() {
  const d = derive();
  const { pv, pid, planet } = d;
  const pr = pv.players[pid];
  const a = ctx.adapter;
  const st = a.status();
  const caps = F.caps(planet);
  const prod = F.production(planet, pr.tech);
  const k = pv.settings.turnHours * pv.settings.speed;
  const others = Object.values(pv.players).filter((p) => p.id !== pid);
  const waiting = others.filter((p) => !st.submitted[p.id]);
  const iSubmitted = !!st.submitted[pid];
  const pls = playerPlanets(pv, pid);
  const repCount = pv.reports.filter((r) => r.to.includes(pid) && r.turn === pv.turn - 1).length;

  let body;
  switch (ctx.view) {
    case 'buildings': body = V.buildings(d); break;
    case 'research': body = V.research(d); break;
    case 'yard': body = V.units(d, 'ships'); break;
    case 'defence': body = V.units(d, 'defence'); break;
    case 'fleet': body = V.fleet(d); break;
    case 'galaxy': body = V.galaxy(d); break;
    case 'reports': body = V.reports(d); break;
    case 'empire': body = V.empire(d); break;
    default: body = V.overview(d);
  }

  const ordersHtml = ctx.orders.length ? ctx.orders.map((o, i) => `<li>${orderLabel(o, pv)} <button class="mini" data-act="rmOrder" data-id="${i}" title="${t('delete')}">✕</button></li>`).join('') : `<li class="muted">${t('none')}</li>`;

  $app.innerHTML = `
  <header class="top">
    <div class="brand"><span class="logo tiny">STARFALL</span><span class="turn">${t('turn')} <b>${pv.turn}</b></span>
      <span class="who"><span class="dot" style="background:${pr.color}"></span>${esc(pr.name)}</span></div>
    <select class="planetSel" data-act-change="planet">${pls.map((p) => `<option value="${p.id}" ${p.id === planet.id ? 'selected' : ''}>${p.isMoon ? '🌑 ' : ''}${esc(p.name)} [${p.g}:${p.s}:${p.p}]</option>`).join('')}</select>
    <div class="res">
      ${['metal', 'crystal', 'deut'].map((r, i) => `<div class="rb r${i} ${planet.res[i] >= caps[i] ? 'full' : ''}" title="${t(r)}: ${fmt(planet.res[i])} / ${fmt(caps[i])} (+${fmt(prod[r] * k)}${t('perTurn')})"><small>${t(r)}</small><b>${short(planet.res[i])}</b><i>+${short(prod[r] * k)}</i></div>`).join('')}
      <div class="rb ${prod.energyProd < prod.energyUse ? 'bad' : ''}" title="${t('energy')}"><small>${t('energy')}</small><b>${fmt(prod.energyProd - prod.energyUse)}</b><i>${fmt(prod.energyProd)}</i></div>
    </div>
    <div class="aps">
      <span class="ap" title="${t('apBuild')}">⌂ ${apFmt(planet.ap.build)}</span>
      <span class="ap" title="${t('apShip')}">⚓ ${apFmt(planet.ap.ship)}</span>
      <span class="ap" title="${t('apResearch')}">⚗ ${apFmt(pr.ap.research)}</span>
    </div>
    <div class="endturn">
      ${a.mode === 'online' && waiting.length ? `<small class="muted">${t('waiting')}: ${waiting.map((p) => esc(p.name)).join(', ')}</small>` : ''}
      ${a.mode === 'online' && st.deadline ? `<small class="muted">${t('deadlineIn')}: ${new Date(st.deadline).toLocaleString()}</small>` : ''}
      <button class="primary" data-act="endTurn">${iSubmitted ? `✓ ${t('submitted')}` : t('endTurn')}</button>
    </div>
  </header>
  <nav class="tabs">${VIEWS.map((v) => `<button data-act="view" data-id="${v}" class="${ctx.view === v ? 'on' : ''}"><span>${NAV_ICON[v]}</span>${t(v)}${v === 'reports' && repCount ? ` <em>${repCount}</em>` : ''}</button>`).join('')}</nav>
  <main>${body}</main>
  <aside class="orders"><details ${ctx.orders.length ? 'open' : ''}><summary>${t('pendingOrders')} (${ctx.orders.length})</summary><ol>${ordersHtml}</ol>
    ${ctx.orders.length ? `<button class="mini" data-act="undo">${t('undo')}</button>` : ''}</details>
    <button class="mini" data-act="leave">${t('leave')}</button></aside>`;
}

const apFmt = (v) => (Math.round(v * 10) / 10).toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-US');

function orderLabel(o, pv) {
  const pl = o.planet ? pv.planets[o.planet] : null;
  const where = pl ? ` <small class="muted">${esc(pl.name)}</small>` : '';
  switch (o.type) {
    case 'build': return `⌂ ${esc(t(o.id))}${where}`;
    case 'research': return `⚗ ${esc(t(o.id))}`;
    case 'units': return `⚓ ${fmt(o.count)} ${esc(t(o.id))}${where}`;
    case 'cancelBuild': return `✕ ${t('buildings')}${where}`;
    case 'cancelResearch': return `✕ ${t('research')}`;
    case 'pct': return `% ${esc(t(o.id))} ${o.value}%`;
    case 'rename': return `✎ ${esc(o.name)}`;
    case 'fleet': return `➤ ${t(o.mission)} [${o.to.g}:${o.to.s}:${o.to.p}] · ${Object.entries(o.ships).map(([id, n]) => `${fmt(n)} ${esc(t(id))}`).join(', ')}`;
    case 'recall': return `↩ ${t('recall')}`;
    default: return o.type;
  }
}

// ------------------------------------------------------------------ actions

async function openAdapter(a) {
  if (ctx.adapter) ctx.adapter.close();
  ctx.adapter = a;
  ctx.orders = [...a.draft];
  ctx.planetId = null;
  ctx.fleetDraft = null;
  ctx.view = 'overview';
  const home = playerPlanets(a.state || { planets: {} }, a.me)[0];
  if (home) ctx.gal = { g: home.g, s: home.s };
  a.subscribe(onRemoteChange);
}

let lastTurnSeen = null;
function onRemoteChange() {
  const a = ctx.adapter;
  if (!a) return;
  if (a.mode === 'online' && a.lobby) { ctx.screen = 'lobby'; return render(); }
  if (ctx.screen === 'lobby' && !a.lobby) { openGameScreen(); return; }
  if (lastTurnSeen !== null && a.state.turn !== lastTurnSeen) {
    ctx.orders = [...a.draft];
    ctx.fleetDraft = null;
    toast(t('turnResolved', { n: a.state.turn - 1 }), 'ok');
  }
  lastTurnSeen = a.state.turn;
  if (ctx.screen === 'game') render();
}

function openGameScreen() {
  const a = ctx.adapter;
  lastTurnSeen = a.state.turn;
  ctx.orders = [...a.draft];
  ctx.screen = a.mode === 'local' && a.hotseat ? 'pass' : 'game';
  const home = playerPlanets(a.state, a.me)[0];
  if (home) ctx.gal = { g: home.g, s: home.s };
  render();
}

const ACTIONS = {
  lang: (el) => { setLang(el.dataset.id); document.documentElement.lang = getLang(); render(); },
  view: (el) => { ctx.view = el.dataset.id; render(); window.scrollTo(0, 0); },
  addName: () => { ctx.menu.names.push(''); render(); },
  rmName: (el) => { ctx.menu.names.splice(+el.dataset.id, 1); render(); },
  newLocal: () => {
    const names = ctx.menu.names.map((n, i) => n.trim() || `${getLang() === 'it' ? 'Giocatore' : 'Player'} ${i + 1}`);
    const a = LocalGame.create({ names, settings: ctx.menu.settings });
    openAdapter(a);
    openGameScreen();
  },
  openLocal: (el) => { const a = LocalGame.load(el.dataset.id); if (!a) return; openAdapter(a); openGameScreen(); },
  delLocal: (el) => { if (confirm('Delete?')) { LocalGame.remove(el.dataset.id); render(); } },
  saveCfg: () => {
    const url = document.querySelector('[data-cfg=url]').value, key = document.querySelector('[data-cfg=key]').value;
    saveOnlineConfig(url, key); ctx.menu.online = null; render();
  },
  createOnline: async () => {
    const m = ctx.menu;
    if (!m.myName.trim()) return toast(t('yourName'), 'bad');
    try {
      const id = await createOnline(m.gameName.trim() || `${m.myName}'s galaxy`, m.myName.trim(), m.settings);
      await openOnline(id);
    } catch (e) { toast(e.message, 'bad'); }
  },
  joinOnline: async () => {
    const m = ctx.menu;
    if (!m.myName.trim() || !m.code.trim()) return toast(`${t('yourName')} / ${t('code')}`, 'bad');
    try { await openOnline(await joinOnline(m.code.trim(), m.myName.trim())); } catch (e) { toast(e.message, 'bad'); }
  },
  openOnline: async (el) => { try { await openOnline(el.dataset.id); } catch (e) { toast(e.message, 'bad'); } },
  startOnline: async () => { try { await ctx.adapter.startGame(); } catch (e) { toast(e.message, 'bad'); } },
  copy: (el) => { navigator.clipboard?.writeText(el.dataset.id).then(() => toast(t('copied'), 'ok')); },
  leave: () => {
    if (ctx.adapter) ctx.adapter.close();
    ctx.adapter = null; ctx.screen = 'menu'; ctx.menu.online = null;
    history.replaceState(null, '', location.pathname);
    render();
  },
  ready: () => { ctx.screen = 'game'; ctx.orders = [...ctx.adapter.draft]; ctx.planetId = null; ctx.fleetDraft = null; ctx.view = 'overview'; render(); },
  endTurn: async (el) => {
    const a = ctx.adapter;
    el.disabled = true;
    try {
      const before = a.state.turn;
      const { resolved } = await a.submit(ctx.orders);
      if (a.mode === 'local') {
        ctx.orders = [...a.draft];
        ctx.fleetDraft = null;
        if (a.hotseat) { ctx.screen = 'pass'; render(); return; }
        if (resolved) { toast(t('turnResolved', { n: before }), 'ok'); ctx.view = ctx.view === 'reports' ? 'reports' : ctx.view; }
      }
      render();
    } catch (e) { toast(e.message, 'bad'); el.disabled = false; }
  },
  build: (el) => addOrder({ type: 'build', planet: ctx.planetId, id: el.dataset.id }),
  research: (el) => addOrder({ type: 'research', planet: ctx.planetId, id: el.dataset.id }),
  units: (el) => { if (addOrder({ type: 'units', planet: ctx.planetId, id: el.dataset.id, count: ctx.qty[el.dataset.id] || 1 })) { ctx.qty[el.dataset.id] = 1; render(); } },
  qtyMax: (el) => {
    const { pv, pid, planet } = derive();
    ctx.qty[el.dataset.id] = Math.max(1, unitInfo(pv, pid, planet.id, el.dataset.id).max); render();
  },
  cancelBuild: () => addOrder({ type: 'cancelBuild', planet: ctx.planetId }),
  cancelResearch: () => addOrder({ type: 'cancelResearch' }),
  rename: () => { const n = prompt(t('rename'), derive().planet.name); if (n) addOrder({ type: 'rename', planet: ctx.planetId, name: n }); },
  recall: (el) => addOrder({ type: 'recall', fleet: el.dataset.id }),
  rmOrder: (el) => { ctx.orders.splice(+el.dataset.id, 1); ctx.adapter.saveDraft(ctx.orders); render(); },
  undo: () => { ctx.orders.pop(); ctx.adapter.saveDraft(ctx.orders); render(); },
  selPlanet: (el) => { ctx.planetId = el.dataset.id; ctx.view = 'overview'; render(); },
  gal: (el) => {
    const s = ctx.adapter.state.settings, d = el.dataset.d;
    if (d === 'g-') ctx.gal.g = ctx.gal.g > 1 ? ctx.gal.g - 1 : s.galaxies;
    if (d === 'g+') ctx.gal.g = ctx.gal.g < s.galaxies ? ctx.gal.g + 1 : 1;
    if (d === 's-') ctx.gal.s = ctx.gal.s > 1 ? ctx.gal.s - 1 : s.systems;
    if (d === 's+') ctx.gal.s = ctx.gal.s < s.systems ? ctx.gal.s + 1 : 1;
    render();
  },
  goFleet: (el) => {
    const fd = ctx.fleetDraft;
    fd.to = { g: ctx.gal.g, s: ctx.gal.s, p: +el.dataset.p, kind: el.dataset.k || 'planet' };
    fd.mission = el.dataset.m;
    const pl = derive().planet;
    if (fd.mission === 'colonize') fd.ships = pl.units.colonyShip ? { colonyShip: 1 } : {};
    if (fd.mission === 'recycle') fd.ships = pl.units.recycler ? { recycler: pl.units.recycler } : {};
    ctx.view = 'fleet'; render();
  },
  attackFrom: (el) => {
    ctx.fleetDraft.to = { g: +el.dataset.g, s: +el.dataset.s, p: +el.dataset.p, kind: 'planet' };
    ctx.fleetDraft.mission = 'attack'; ctx.view = 'fleet'; render();
  },
  spy: (el) => {
    const pl = derive().planet;
    const n = Math.min(pl.units.probe || 0, ctx.spyProbes || 1);
    if (!n) return toast(errText('noShips'), 'bad');
    if (addOrder({ type: 'fleet', from: ctx.planetId, to: { g: ctx.gal.g, s: ctx.gal.s, p: +el.dataset.p, kind: 'planet' }, mission: 'espionage', ships: { probe: n }, speed: 100, cargo: [0, 0, 0] }))
      toast(`👁 ${t('espionage')} → [${ctx.gal.g}:${ctx.gal.s}:${el.dataset.p}]`, 'ok');
  },
  shipAll: (el) => { ctx.fleetDraft.ships[el.dataset.id] = derive().planet.units[el.dataset.id] || 0; render(); },
  shipsAll: () => { const pl = derive().planet; for (const id of Object.keys(SHIPS)) if (!SHIPS[id].stationary && pl.units[id]) ctx.fleetDraft.ships[id] = pl.units[id]; render(); },
  shipsNone: () => { ctx.fleetDraft.ships = {}; render(); },
  cargoMax: () => {
    const { pv, pid, planet } = derive();
    const fd = ctx.fleetDraft;
    const cap = F.cargoCapacity(fd.ships);
    const avail = [...planet.res.map(Math.floor)];
    // Reserve fuel before filling: compute with empty cargo.
    const plan = fd.ships && Object.keys(fd.ships).length ? Math.ceil(fuelFor(pv, pid, planet)) : 0;
    avail[2] = Math.max(0, avail[2] - plan);
    let left = cap; const c = [0, 0, 0];
    for (let i = 0; i < 3; i++) { c[i] = Math.min(avail[i], left); left -= c[i]; }
    fd.cargo = c; render();
  },
  sendFleet: () => {
    const fd = ctx.fleetDraft;
    if (addOrder({ type: 'fleet', from: ctx.planetId, ...JSON.parse(JSON.stringify(fd)) })) {
      ctx.fleetDraft = { ...fd, ships: {}, cargo: [0, 0, 0] };
      toast(`➤ ${t(fd.mission)}`, 'ok');
      render();
    }
  },
};

function fuelFor(pv, pid, planet) {
  const fd = ctx.fleetDraft;
  const ids = Object.keys(fd.ships).filter((id) => fd.ships[id] > 0);
  if (!ids.length) return 0;
  const tech = pv.players[pid].tech;
  const slowest = Math.min(...ids.map((id) => F.shipSpeed(id, tech)));
  const dist = F.distance(planet, fd.to);
  const sec = F.flightSeconds(dist, slowest, fd.speed, pv.settings);
  return F.fuelUse(fd.ships, dist, sec, tech, pv.settings);
}

async function openOnline(id) {
  const a = await OnlineGame.open(id);
  await openAdapter(a);
  a.start();
  history.replaceState(null, '', `${location.pathname}?game=${id}`);
  if (a.lobby) { ctx.screen = 'lobby'; render(); } else openGameScreen();
}

// ------------------------------------------------------------------ events

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT') return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});

$app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.actChange === 'planet') { ctx.planetId = el.value; ctx.fleetDraft = null; render(); return; }
  if (el.dataset.act === 'pct') { addOrder({ type: 'pct', planet: ctx.planetId, id: el.dataset.id, value: +el.value }); return; }
  if (el.dataset.set) { ctx.menu.settings[el.dataset.set] = +el.value; return; }
  if (el.dataset.mission) { ctx.fleetDraft.mission = el.dataset.mission; render(); return; }
  if ('speed' in el.dataset) { ctx.fleetDraft.speed = +el.value; render(); return; }
  if (el.dataset.to === 'kind') { ctx.fleetDraft.to.kind = el.value; render(); return; }
  if ('galS' in el.dataset) { ctx.gal.s = Math.max(1, Math.min(ctx.adapter.state.settings.systems, +el.value || 1)); render(); return; }
  if (el.dataset.ship || el.dataset.cargo !== undefined || el.dataset.to || el.dataset.qty) render();
});

$app.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.name !== undefined) ctx.menu.names[+el.dataset.name] = el.value;
  else if (el.dataset.m) { ctx.menu[el.dataset.m] = el.value; if (el.dataset.m === 'myName') try { localStorage.setItem('starfall.name', el.value); } catch {} }
  else if (el.dataset.qty) ctx.qty[el.dataset.qty] = Math.max(1, Math.floor(+el.value || 1));
  else if (el.dataset.ship) ctx.fleetDraft.ships[el.dataset.ship] = Math.max(0, Math.floor(+el.value || 0));
  else if (el.dataset.cargo !== undefined) ctx.fleetDraft.cargo[+el.dataset.cargo] = Math.max(0, Math.floor(+el.value || 0));
  else if (el.dataset.to && el.dataset.to !== 'kind') ctx.fleetDraft.to[el.dataset.to] = Math.floor(+el.value || 1);
});

// ------------------------------------------------------------------ boot

document.documentElement.lang = getLang();
(async () => {
  const gid = params.get('game');
  if (gid && onlineConfig().ok) {
    try { await openOnline(gid); return; } catch (e) { toast(e.message, 'bad'); }
  }
  render();
})();

// Debug/testing hook.
window.__starfall = ctx;
