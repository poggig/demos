// Game screens. Each view returns an HTML string; app.js wires clicks via data-act attributes.
import { BUILDINGS, RESEARCH, SHIPS, DEFENCES, UNITS } from '../engine/data.js';
import * as F from '../engine/formulas.js';
import { buildInfo, researchInfo, unitInfo, playerPlanets, bodyAt, coordKey, fleetPlan, fleetArrivalTurn, score, effectiveLab } from '../engine/game.js';
import { t, desc, errText, getLang } from '../i18n.js';
import { icon, planetArt } from './icons.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.floor(n).toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-US');
export function short(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return Math.floor(n / 1e3) + 'k';
  return fmt(n);
}
const ap1 = (v) => (Math.round(v * 10) / 10).toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-US');
const coordStr = (c) => `[${c.g}:${c.s}:${c.p}]`;
const RES_KEYS = ['metal', 'crystal', 'deut'];

function costHtml(cost, have) {
  return `<div class="cost">${cost.map((v, i) => v ? `<span class="r r${i} ${have && have[i] < v ? 'bad' : ''}">${short(v)} <small>${t(RES_KEYS[i])}</small></span>` : '').join('')}</div>`;
}

function reqHtml(req, pl, tech) {
  if (!req) return '';
  const parts = Object.entries(req).map(([id, lvl]) => {
    const have = id in BUILDINGS ? pl.buildings[id] || 0 : tech[id] || 0;
    return `<span class="${have >= lvl ? 'ok' : 'bad'}">${esc(t(id))} ${lvl}</span>`;
  });
  return `<div class="req">${t('requires')}: ${parts.join(', ')}</div>`;
}

function turnsFor(ap, pool, per) {
  if (ap <= pool + 1e-9) return t('instant');
  return `~${Math.ceil((ap - pool) / per)} ${t('turns')}`;
}

// ------------------------------------------------------------ overview

export function overview(ctx) {
  const { pv, pid, planet: pl } = ctx;
  const pr = pv.players[pid];
  const s = pv.settings;
  const prod = F.production(pl, pr.tech);
  const k = s.turnHours * s.speed;
  const caps = F.caps(pl);
  const per = F.apPerTurn(s);
  const q = (list, poolAp) => list.map((it, i) => `
    <div class="qi"><span>${esc(t(it.id))} ${it.level ? `→ ${it.level}` : `×${fmt(it.count)}`}</span>
      <div class="bar"><i style="width:${it.apTotal ? Math.round(100 * (1 - it.apLeft / it.apTotal)) : Math.round(100 * (it.progress / it.apEach))}%"></i></div>
      <small>${it.apTotal ? `${ap1(it.apTotal - it.apLeft)}/${ap1(it.apTotal)} ${t('ap')}` : `${ap1(it.apEach)} ${t('ap')}/u`}</small>
    </div>`).join('') || `<div class="muted">${t('none')}</div>`;

  const mine = Object.values(pv.fleets).filter((f) => f.owner === pid);
  const incoming = Object.values(pv.fleets).filter((f) => f.owner !== pid && f.state === 'out' &&
    playerPlanets(pv, pid).some((p) => coordKey(p) === coordKey(f.to) && p.isMoon === (f.to.kind === 'moon')));
  const pctIds = ['metalMine', 'crystalMine', 'deutSynth', 'solarPlant', 'fusionPlant', 'solarSat'];

  return `
  <section class="ov">
    <div class="ov-head">
      <div class="pa">${planetArt(pl, 120)}</div>
      <div>
        <h2>${esc(pl.name)} <button class="mini" data-act="rename">✎</button></h2>
        <div class="muted">${coordStr(pl)} · ${t('fields')} ${F.usedFields(pl)}/${F.maxFields(pl)} · ${t('temp')} ${pl.tmax - 40}°C … ${pl.tmax}°C</div>
        <div class="muted">${t('planetsMax')}: ${playerPlanets(pv, pid).filter((p) => !p.isMoon).length}/${F.maxPlanets(pr.tech)}</div>
      </div>
    </div>
    ${incoming.length ? `<div class="alert">⚠ ${incoming.map((f) => `${esc(pv.players[f.owner].name)} → ${coordStr(f.to)} · ${t(f.mission)} · ${t('arrives')} ${fleetArrivalTurn(pv, f)}`).join('<br>')}</div>` : ''}
    <div class="grid2">
      <div class="panel">
        <h3>${t('production')}</h3>
        <table class="tbl">
          <tr><th></th><th>${t('perTurn').slice(1)}</th><th>${t('storage')}</th></tr>
          ${['metal', 'crystal', 'deut'].map((r, i) => `<tr><td class="r${i}">${t(r)}</td><td>${prod[r] >= 0 ? '+' : ''}${fmt(prod[r] * k)}</td><td>${short(pl.res[i])} / ${short(caps[i])}</td></tr>`).join('')}
          <tr><td>${t('energy')}</td><td colspan="2" class="${prod.energyProd < prod.energyUse ? 'bad' : ''}">${fmt(prod.energyProd - prod.energyUse)} (${fmt(prod.energyProd)} / ${fmt(prod.energyUse)})</td></tr>
        </table>
        <details><summary>${t('settingsPct')}</summary>
          <div class="pct">${pctIds.filter((id) => (pl.buildings[id] || pl.units[id])).map((id) => `
            <label>${esc(t(id))}<select data-act="pct" data-id="${id}">${[100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0].map((v) => `<option ${((pl.pct[id] ?? 100) === v) ? 'selected' : ''}>${v}</option>`).join('')}</select>%</label>`).join('') || `<span class="muted">${t('none')}</span>`}
          </div>
        </details>
      </div>
      <div class="panel">
        <h3>${t('queue')}</h3>
        <h4>${t('buildings')} <small class="muted">${ap1(pl.ap.build)} ${t('ap')}</small> ${pl.buildQueue.length ? `<button class="mini" data-act="cancelBuild">${t('cancel')}</button>` : ''}</h4>${q(pl.buildQueue)}
        <h4>${t('research')} <small class="muted">${ap1(pr.ap.research)} ${t('ap')}</small> ${pr.researchQueue.length ? `<button class="mini" data-act="cancelResearch">${t('cancel')}</button>` : ''}</h4>${q(pr.researchQueue)}
        <h4>${t('yard')} <small class="muted">${ap1(pl.ap.ship)} ${t('ap')}</small></h4>${q(pl.shipQueue)}
      </div>
    </div>
    ${mine.length ? `<div class="panel"><h3>${t('fleetsInFlight')}</h3>${fleetList(ctx, mine)}</div>` : ''}
    <div class="panel help"><h3>${t('howTo')}</h3><p>${t('help')}</p><p class="muted">${t('apHelp', { n: per, cap: F.apCap(s) })}</p></div>
  </section>`;
}

function fleetList(ctx, fleets) {
  const { pv } = ctx;
  return `<table class="tbl fl">${fleets.map((f) => `
    <tr><td>${t(f.mission)}</td><td>${coordStr(f.origin)} → ${coordStr(f.to)}${f.to.kind === 'moon' ? ' 🌑' : f.to.kind === 'debris' ? ' ♻' : ''}</td>
    <td>${Object.entries(f.ships).map(([id, n]) => `${fmt(n)} ${esc(t(id))}`).join(', ')}</td>
    <td>${f.state === 'back' ? t('returns') + ', ' : ''}${t('arrives')} ${fleetArrivalTurn(pv, f)}</td>
    <td>${f.state === 'out' && f.departTurn < pv.turn ? `<button class="mini" data-act="recall" data-id="${f.id}">${t('recall')}</button>` : ''}</td></tr>`).join('')}</table>`;
}

// ------------------------------------------------------------ buildings / research

export function buildings(ctx) {
  const { pv, pid, planet: pl } = ctx;
  const pr = pv.players[pid];
  if (pl.isMoon) return `<div class="panel muted">${errText('moonNoBuild')}</div>`;
  const per = F.apPerTurn(pv.settings);
  return `<div class="cards">${Object.keys(BUILDINGS).map((id) => {
    const info = buildInfo(pv, pid, pl.id, id);
    const locked = !F.meetsReq(BUILDINGS[id].req, pl.buildings, pr.tech);
    return card(id, pl.buildings[id] || 0, info, locked, pl, pr, `
      <button data-act="build" data-id="${id}" ${info.error ? 'disabled' : ''} title="${info.error ? esc(errText(info.error)) : ''}">
        ${t('upgrade')} → ${info.level} · ${info.ap} ${t('ap')} <small>(${turnsFor(info.ap, pl.buildQueue.length ? 0 : pl.ap.build, per)})</small></button>`);
  }).join('')}</div>`;
}

export function research(ctx) {
  const { pv, pid, planet: pl } = ctx;
  const pr = pv.players[pid];
  if (pl.isMoon) return `<div class="panel muted">${errText('moonNoBuild')}</div>`;
  const per = F.apPerTurn(pv.settings);
  return `<div class="panel muted small">${esc(t('lab'))} ${t('level')} ${pl.buildings.lab || 0} (${effectiveLab(pv, pid, pl)}) · ${ap1(pr.ap.research)} ${t('apResearch')}</div>
  <div class="cards">${Object.keys(RESEARCH).map((id) => {
    const info = researchInfo(pv, pid, pl.id, id);
    const locked = !F.meetsReq(RESEARCH[id].req, pl.buildings, pr.tech);
    return card(id, pr.tech[id] || 0, info, locked, pl, pr, `
      <button data-act="research" data-id="${id}" ${info.error ? 'disabled' : ''} title="${info.error ? esc(errText(info.error)) : ''}">
        ${t('upgrade')} → ${info.level} · ${info.ap} ${t('ap')} <small>(${turnsFor(info.ap, pr.researchQueue.length ? 0 : pr.ap.research, per)})</small></button>`);
  }).join('')}</div>`;
}

function card(id, level, info, locked, pl, pr, action) {
  const def = BUILDINGS[id] || RESEARCH[id] || UNITS[id];
  return `<div class="card ${locked ? 'locked' : ''}">
    ${icon(id)}
    <div class="cb">
      <h3>${esc(t(id))} <span class="lvl">${level !== null ? (UNITS[id] ? `${fmt(level)}` : `${t('level')} ${level}`) : ''}</span></h3>
      <p class="desc">${esc(desc(id))}</p>
      ${locked ? reqHtml(def.req, pl, pr.tech) : costHtml(info.cost, pl.res)}
      ${info.energy ? `<div class="req">${t('energy')}: ${fmt(info.energy)}</div>` : ''}
      ${locked ? '' : action}
      ${!locked && info.error && info.error !== 'resources' ? `<div class="req bad">${esc(errText(info.error))}</div>` : ''}
    </div></div>`;
}

// ------------------------------------------------------------ shipyard / defence

export function units(ctx, kind) {
  const { pv, pid, planet: pl } = ctx;
  const pr = pv.players[pid];
  if (pl.isMoon) return `<div class="panel muted">${errText('moonNoBuild')}</div>`;
  const list = kind === 'ships' ? SHIPS : DEFENCES;
  return `<div class="panel muted small">${esc(t('shipyard'))} ${t('level')} ${pl.buildings.shipyard || 0} · ${ap1(pl.ap.ship)} ${t('apShip')}</div>
  <div class="cards">${Object.keys(list).map((id) => {
    const info = unitInfo(pv, pid, pl.id, id);
    const locked = !F.meetsReq(UNITS[id].req, pl.buildings, pr.tech);
    const qty = ctx.qty[id] || 1;
    const u = UNITS[id];
    const stats = `<div class="stats">⚔ ${fmt(u.attack)} · 🛡 ${fmt(u.shield)} · ◆ ${fmt((u.cost[0] + u.cost[1]) / 10)}${SHIPS[id] && u.cargo ? ` · 📦 ${short(u.cargo)}` : ''}${SHIPS[id] && u.speed ? ` · ➤ ${short(F.shipSpeed(id, pr.tech))}` : ''}</div>`;
    return card(id, pl.units[id] || 0, info, locked, pl, pr, `${stats}
      <div class="buy"><input type="number" min="1" inputmode="numeric" data-qty="${id}" value="${qty}">
      <button class="mini" data-act="qtyMax" data-id="${id}">${t('max')} ${fmt(info.max)}</button>
      <button data-act="units" data-id="${id}" ${info.error ? 'disabled' : ''}>${t('build')} · ${ap1(info.apEach * qty)} ${t('ap')}</button></div>`);
  }).join('')}</div>`;
}

// ------------------------------------------------------------ fleet

export const MISSIONS = ['attack', 'transport', 'deploy', 'espionage', 'colonize', 'recycle'];

export function fleet(ctx) {
  const { pv, pid, planet: pl } = ctx;
  const fd = ctx.fleetDraft;
  const ships = Object.keys(SHIPS).filter((id) => !SHIPS[id].stationary && (pl.units[id] || 0) > 0);
  const plan = fleetPlan(pv, pid, { type: 'fleet', from: pl.id, ...fd });
  const mine = Object.values(pv.fleets).filter((f) => f.owner === pid);
  return `
  <div class="grid2">
    <div class="panel">
      <h3>${t('ships')} — ${esc(pl.name)} ${coordStr(pl)}</h3>
      ${ships.length ? `<table class="tbl">${ships.map((id) => `<tr><td>${esc(t(id))}</td><td>${fmt(pl.units[id])}</td>
        <td><input type="number" min="0" max="${pl.units[id]}" data-ship="${id}" value="${fd.ships[id] || 0}"></td>
        <td><button class="mini" data-act="shipAll" data-id="${id}">${t('max')}</button></td></tr>`).join('')}</table>
        <button class="mini" data-act="shipsAll">${t('max')} ✱</button> <button class="mini" data-act="shipsNone">0</button>`
        : `<p class="muted">${t('noShips')}</p>`}
    </div>
    <div class="panel">
      <h3>${t('target')}</h3>
      <div class="coords">
        <input type="number" data-to="g" min="1" max="${pv.settings.galaxies}" value="${fd.to.g}">:
        <input type="number" data-to="s" min="1" max="${pv.settings.systems}" value="${fd.to.s}">:
        <input type="number" data-to="p" min="1" max="15" value="${fd.to.p}">
        <select data-to="kind">${['planet', 'moon', 'debris'].map((k) => `<option value="${k}" ${fd.to.kind === k ? 'selected' : ''}>${t(k)}</option>`).join('')}</select>
      </div>
      <div class="missions">${MISSIONS.map((m) => `<label><input type="radio" name="mission" data-mission="${m}" ${fd.mission === m ? 'checked' : ''}> ${t(m)}</label>`).join('')}</div>
      <label>${t('speed')} <select data-speed>${[100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((v) => `<option ${fd.speed === v ? 'selected' : ''}>${v}</option>`).join('')}</select>%</label>
      <h4>${t('cargo')} <small class="muted">${short(plan.capacity || 0)}</small> <button class="mini" data-act="cargoMax">${t('max')}</button></h4>
      <div class="cargo">${[0, 1, 2].map((i) => `<label class="r${i}">${t(RES_KEYS[i])}<input type="number" min="0" data-cargo="${i}" value="${fd.cargo[i] || 0}"></label>`).join('')}</div>
      <table class="tbl small">
        <tr><td>${t('distance')}</td><td>${plan.dist ? fmt(plan.dist) : '–'}</td></tr>
        <tr><td>${t('duration')}</td><td>${plan.seconds ? `${plan.turns} ${t('turns')} <small class="muted">(${fmt(plan.seconds)}s)</small>` : '–'}</td></tr>
        <tr><td>${t('fuel')}</td><td>${plan.fuel ? fmt(plan.fuel) : '–'}</td></tr>
      </table>
      ${plan.error ? `<div class="req bad">${esc(errText(plan.error))}</div>` : ''}
      <button class="primary" data-act="sendFleet" ${plan.error ? 'disabled' : ''}>${t('send')}</button>
    </div>
  </div>
  ${mine.length ? `<div class="panel"><h3>${t('fleetsInFlight')}</h3>${fleetList(ctx, mine)}</div>` : ''}`;
}

// ------------------------------------------------------------ galaxy

export function galaxy(ctx) {
  const { pv, pid } = ctx;
  const { g, s } = ctx.gal;
  const rows = [];
  for (let p = 1; p <= 15; p++) {
    const c = { g, s, p };
    const pl = bodyAt(pv, c, 'planet');
    const moon = pl && pl.moon ? pv.planets[pl.moon] : null;
    const deb = pv.debris[coordKey(c)];
    const owner = pl ? pv.players[pl.owner] : null;
    const own = pl && pl.owner === pid;
    let acts = '';
    if (pl && !own) {
      acts += `<button class="mini" data-act="spy" data-p="${p}" title="${t('espionage')}">👁</button>`;
      acts += `<button class="mini" data-act="goFleet" data-p="${p}" data-m="attack" title="${t('attack')}">⚔</button>`;
      acts += `<button class="mini" data-act="goFleet" data-p="${p}" data-m="transport" title="${t('transport')}">📦</button>`;
    } else if (own) {
      acts += `<button class="mini" data-act="goFleet" data-p="${p}" data-m="transport" title="${t('transport')}">📦</button>`;
      acts += `<button class="mini" data-act="goFleet" data-p="${p}" data-m="deploy" title="${t('deploy')}">⤓</button>`;
    } else {
      acts += `<button class="mini" data-act="goFleet" data-p="${p}" data-m="colonize" title="${t('colonize')}">🏳</button>`;
    }
    if (deb) acts += `<button class="mini" data-act="goFleet" data-p="${p}" data-m="recycle" data-k="debris" title="${t('recycle')}">♻</button>`;
    rows.push(`<tr class="${own ? 'own' : ''}">
      <td>${p}</td>
      <td class="gp">${pl ? planetArt(pl, 28) : ''}</td>
      <td>${pl ? esc(pl.name) : `<span class="muted">${t('empty')}</span>`}</td>
      <td>${moon ? `<span title="${t('moon')}">🌑</span>` : ''}</td>
      <td>${deb ? `<span class="small" title="${t('debris')}">♻ ${short(deb[0])}/${short(deb[1])}</span>` : ''}</td>
      <td>${owner ? `<span class="dot" style="background:${owner.color}"></span>${esc(owner.name)}${own ? ` (${t('you')})` : ''}` : ''}</td>
      <td class="acts">${acts}</td></tr>`);
  }
  return `<div class="panel">
    <div class="galnav">
      <button class="mini" data-act="gal" data-d="g-">◀</button> ${t('galaxy')} <b>${g}</b> <button class="mini" data-act="gal" data-d="g+">▶</button>
      &nbsp; <button class="mini" data-act="gal" data-d="s-">◀</button> <input type="number" data-gal-s min="1" max="${pv.settings.systems}" value="${s}"> / ${pv.settings.systems} <button class="mini" data-act="gal" data-d="s+">▶</button>
    </div>
    <table class="tbl gal"><tr><th>#</th><th></th><th>${t('planet')}</th><th>${t('moon')}</th><th>${t('debris')}</th><th>${t('owner')}</th><th>${t('actions')}</th></tr>${rows.join('')}</table>
  </div>`;
}

// ------------------------------------------------------------ reports

const unitsLine = (u) => Object.entries(u || {}).map(([id, n]) => `${fmt(n)} ${esc(t(id))}`).join(', ') || '–';
const resLine = (r) => r.map((v, i) => v ? `<span class="r${i}">${short(v)} ${t(RES_KEYS[i])}</span>` : '').filter(Boolean).join(' ') || '–';

export function reports(ctx) {
  const { pv, pid } = ctx;
  const mine = pv.reports.filter((r) => r.to.includes(pid)).slice().reverse();
  if (!mine.length) return `<div class="panel muted">${t('noReports')}</div>`;
  const name = (id) => esc(pv.players[id]?.name || '?');
  return mine.map((r) => {
    const d = r.data;
    let title = '', body = '';
    switch (r.type) {
      case 'combat': {
        title = `${t('combatReport')} ${coordStr(d.at)} — ${name(d.attacker)} ⚔ ${name(d.defender)}`;
        const win = d.winner === 'draw' ? t('draw') : name(d.winner === 'attacker' ? d.attacker : d.defender);
        body = `<table class="tbl small">
          <tr><th></th><th>${t('attacker')}: ${name(d.attacker)}</th><th>${t('defender')}: ${name(d.defender)}</th></tr>
          <tr><td>${t('weaponsTech')}/${t('shieldingTech')}/${t('armourTech')}</td><td>${d.attackerTech.weaponsTech}/${d.attackerTech.shieldingTech}/${d.attackerTech.armourTech}</td><td>${d.defenderTech.weaponsTech}/${d.defenderTech.shieldingTech}/${d.defenderTech.armourTech}</td></tr>
          <tr><td>${t('ships')}</td><td>${unitsLine(d.attackerStart)}</td><td>${unitsLine(d.defenderStart)}</td></tr>
          <tr><td>${t('lost')}</td><td class="bad">${unitsLine(d.attackerLost)}</td><td class="bad">${unitsLine(d.defenderLost)}</td></tr>
          <tr><td>${t('rebuilt')}</td><td></td><td>${unitsLine(d.rebuilt)}</td></tr>
        </table>
        <p>${t('winner')}: <b>${win}</b> · ${d.rounds} rounds · ${t('loot')}: ${resLine(d.loot)} · ${t('debris')}: ${resLine(d.debris)} · ${t('moon')} ${d.moonChance}%</p>
        ${d.moon ? `<p class="ok">${t('moonCreated')}</p>` : ''}`;
        break;
      }
      case 'espionage':
        title = `${t('spyReport')} ${coordStr(d.to)} — ${esc(d.planet)} (${name(d.owner)})`;
        body = `<p>${resLine(d.res)}</p>
          ${d.fleet ? `<p><b>${t('fleet')}:</b> ${unitsLine(d.fleet)}</p>` : ''}
          ${d.defence ? `<p><b>${t('defence')}:</b> ${unitsLine(d.defence)}</p>` : ''}
          ${d.buildings ? `<p><b>${t('buildings')}:</b> ${Object.entries(d.buildings).map(([k, v]) => `${esc(t(k))} ${v}`).join(', ')}</p>` : ''}
          ${d.research ? `<p><b>${t('research')}:</b> ${Object.entries(d.research).map(([k, v]) => `${esc(t(k))} ${v}`).join(', ')}</p>` : ''}
          <p class="muted small">counter-espionage ${d.counter}%</p>
          <button class="mini" data-act="attackFrom" data-g="${d.to.g}" data-s="${d.to.s}" data-p="${d.to.p}">⚔ ${t('attack')}</button>`;
        break;
      case 'spotted':
        title = `${t('spotted')} ${coordStr(d.to)} — ${name(d.by)}`;
        body = `<p class="muted">${coordStr(d.from)} · ${d.counter}%</p>`;
        break;
      case 'probesLost':
        title = `${t('probesLost')} ${coordStr(d.to)}`;
        body = `<p>${fmt(d.probes)} ${esc(t('probe'))}</p>`;
        break;
      case 'colonize':
        title = `${d.ok ? t('colonizeOk') : t('colonizeFail')} ${coordStr(d.to)}`;
        body = d.ok ? `<p>${t('fields')}: ${d.fields} · ${t('temp')}: ${d.tmax}°C</p>` : `<p class="muted">${esc(d.reason)}</p>`;
        break;
      case 'recycle':
        title = `${t('recycleReport')} ${coordStr(d.to)}`;
        body = `<p>${resLine(d.got)}</p>`;
        break;
      case 'transport':
        title = `${t('transportReport')} ${coordStr(d.from)} → ${coordStr(d.to)} (${name(d.owner)})`;
        body = `<p>${resLine(d.cargo)}</p>`;
        break;
      case 'deploy':
        title = `${t('deployReport')} ${coordStr(d.to)}`;
        body = `<p>${unitsLine(d.ships)}</p>`;
        break;
      default:
        title = r.type;
    }
    return `<details class="panel rep" ${r.turn === pv.turn - 1 ? 'open' : ''}><summary><span class="muted">${t('turn')} ${r.turn}</span> ${title}</summary>${body}</details>`;
  }).join('');
}

// ------------------------------------------------------------ empire

export function empire(ctx) {
  const { pv, pid } = ctx;
  const board = Object.values(pv.players).map((p) => ({ p, s: score(pv, p.id) })).sort((a, b) => b.s.total - a.s.total);
  const pls = playerPlanets(pv, pid);
  const k = pv.settings.turnHours * pv.settings.speed;
  return `<div class="panel"><h3>${t('score')}</h3><table class="tbl">
    <tr><th>#</th><th>${t('players')}</th><th>${t('score')}</th><th>${t('eco')}</th><th>${t('research')}</th><th>${t('military')}</th><th>${t('planetsMax')}</th></tr>
    ${board.map(({ p, s }, i) => `<tr class="${p.id === pid ? 'own' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</td><td><b>${fmt(s.total)}</b></td><td>${fmt(s.eco)}</td><td>${fmt(s.research)}</td><td>${fmt(s.military)}</td><td>${playerPlanets(pv, p.id).filter((x) => !x.isMoon).length}</td></tr>`).join('')}
  </table></div>
  <div class="panel"><h3>${t('empire')}</h3><div class="scroll"><table class="tbl">
    <tr><th>${t('planet')}</th>${['metal', 'crystal', 'deut'].map((r, i) => `<th class="r${i}">${t(r)}</th>`).join('')}<th>${t('fields')}</th><th>${t('ships')}</th></tr>
    ${pls.map((p) => { const pr = F.production(p, pv.players[pid].tech); return `<tr><td><a href="#" data-act="selPlanet" data-id="${p.id}">${esc(p.name)}</a> ${coordStr(p)}${p.isMoon ? ' 🌑' : ''}</td>
      ${[0, 1, 2].map((i) => `<td>${short(p.res[i])}<br><small class="muted">+${short(pr[RES_KEYS[i]] * k)}</small></td>`).join('')}
      <td>${F.usedFields(p)}/${F.maxFields(p)}</td><td>${fmt(Object.entries(p.units).filter(([id]) => SHIPS[id]).reduce((a, [, n]) => a + n, 0))}</td></tr>`; }).join('')}
  </table></div></div>`;
}
