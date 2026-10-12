// DOM screens + HUD (inside the scaled 540×960 #ui layer). Text from THEME via i18n.
import { CONFIG } from './config.js';
import { THEME } from './theme.js';
import { t, pick, getLang } from './i18n.js';
import { drawIcon } from './art.js';
import { fmtNum, metres } from './util.js';
import { upgradeCost, isMaxed, statsFromUpgrades, UPGRADES } from './economy.js';

const $ = id => document.getElementById(id);
const SCREENS = { menu: 'scrMenu', pause: 'scrPause', level: 'scrLevel', dedication: 'scrDedication', shop: 'scrShop', over: 'scrOver' };
const WEAPON_IDS = CONFIG.weapons.map(w => w.id);
const UP_IDS = { start: 'Start', damage: 'Damage', rate: 'Rate' };
const mult = v => '×' + (Math.round(v * 100) / 100);

export class UI {
  constructor() {
    this.k = 1;
    this.current = null;
    this.hudCache = Object.create(null);
    this.applyPalette();
  }

  applyPalette() {
    const P = THEME.palette, root = document.documentElement.style;
    for (const key of ['frame', 'outline', 'ui', 'uiText', 'uiPrimary', 'uiPrimaryText', 'uiSecondary', 'uiSecondaryText', 'uiGood', 'uiBad', 'uiShade', 'coin', 'gateRare']) {
      if (P[key]) root.setProperty('--' + key, P[key]);
    }
    $('frame').style.background = P.grass;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', P.frame);
  }

  applyTexts() {
    document.documentElement.lang = getLang();
    document.title = t('title').replace(/\s+/g, ' ');
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
    const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    document.querySelector('.howto').textContent = t(fine ? 'howToPointer' : 'howTo');
    this.hudCache = Object.create(null);
    const it = getLang() === 'it';
    $('btnLangIt').classList.toggle('on', it);
    $('btnLangEn').classList.toggle('on', !it);
  }

  /** (Re)paint every drawn icon at device resolution. k = device px per logical px. */
  paintIcons(k) {
    this.k = k;
    for (const cv of document.querySelectorAll('canvas[data-icon]')) this.paintIcon(cv, cv.dataset.icon);
  }
  paintIcon(cv, kind) {
    cv.dataset.icon = kind;
    const size = parseFloat(getComputedStyle(cv).width) || 30;
    const px = Math.max(8, Math.round(size * this.k));
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, px, px);
    c.setTransform(px / size, 0, 0, px / size, 0, 0);
    const col = kind === 'soldier' ? THEME.palette.soldier : kind === 'rate' || kind === 'damage' ? THEME.palette.gateRare : '#ffffff';
    drawIcon(c, kind, size / 2, size / 2, (size / 36) * (kind === 'coin' ? 1.9 : 1), kind === 'rifle' || kind === 'smg' || kind === 'shotgun' || kind === 'rocket' ? '#5b6478' : col);
  }

  show(name) {
    for (const key in SCREENS) $(SCREENS[key]).classList.toggle('hidden', key !== name);
    this.current = name;
  }
  setHud(on) { $('hud').classList.toggle('hidden', !on); if (on) this.hudCache = Object.create(null); }

  setToggles(music, sfx) {
    for (const el of document.querySelectorAll('[data-toggle]')) {
      const on = el.dataset.toggle === 'music' ? music : sfx;
      el.classList.toggle('off', !on);
      el.querySelector('b').textContent = on ? t('on') : t('off');
    }
  }

  menu(save) {
    $('menuCoins').textContent = fmtNum(save.coins);
    const r = save.records;
    $('recLevel').textContent = r.campaign.bestLevel;
    $('recCScore').textContent = fmtNum(r.campaign.bestScore);
    $('recEScore').textContent = fmtNum(r.endless.bestScore);
    $('recEDist').textContent = fmtNum(r.endless.bestDistance) + ' m';
    this.show('menu');
  }

  setText(id, v) {
    if (this.hudCache[id] === v) return;
    this.hudCache[id] = v;
    $(id).textContent = v;
  }
  setVisible(id, on) {
    const key = id + ':vis';
    if (this.hudCache[key] === on) return;
    this.hudCache[key] = on;
    $(id).classList.toggle('hidden', !on);
  }

  hud(world, run, save) {
    this.setText('hudMode', t(run.mode));       // the mode, always visible: CAMPAIGN / ENDLESS
    if (run.mode === 'campaign') {
      this.setText('hudModeLbl', t('level'));
      this.setText('hudModeVal', String(run.level));
      this.setText('hudScore', fmtNum(run.score + world.score));
    } else {
      this.setText('hudModeLbl', '');
      this.setText('hudModeVal', fmtNum(metres(world.distance)) + ' m');
      this.setText('hudScore', fmtNum(world.score));
    }
    this.setText('hudCoins', fmtNum(save.coins));
    this.setText('hudSoldiers', fmtNum(world.soldiers));
    const wid = WEAPON_IDS[world.stats.weapon];
    if (this.hudCache.weaponIcon !== wid) { this.hudCache.weaponIcon = wid; this.paintIcon($('hudWeaponIcon'), wid); }
    this.setText('hudWeapon', t(wid));
    const r = world.stats.rateMult, d = world.stats.damageMult;
    this.setVisible('hudRateChip', Math.abs(r - 1) > 0.001);
    this.setVisible('hudDamageChip', Math.abs(d - 1) > 0.001);
    this.setText('hudRate', mult(r));
    this.setText('hudDamage', mult(d));
    this.fitHudRow();
  }

  /** Drop the chip labels when the top row would overflow (rects share the scaled #ui layer). */
  fitHudRow() {
    const row = this.hudRow || (this.hudRow = document.querySelector('.hud-row'));
    const key = $('hudModeVal').textContent.length + '|' + $('hudScore').textContent.length + '|' + $('hudCoins').textContent.length + '|' + getLang();
    if (this.hudCache.fitKey === key) return;
    this.hudCache.fitKey = key;
    row.classList.remove('tight');
    if (row.lastElementChild.getBoundingClientRect().right > row.getBoundingClientRect().right + 0.5) row.classList.add('tight');
  }

  levelComplete(d) {
    $('lcTitle').textContent = t('levelComplete', { n: d.level });
    $('lcSurvivors').textContent = fmtNum(d.survivors);
    $('lcNextLbl').textContent = t('nextStart', { n: d.level + 1 });
    $('lcNext').textContent = fmtNum(d.nextStart);
    $('lcWeapon').textContent = t(WEAPON_IDS[d.weapon]);
    this.paintIcon($('lcWeaponIcon'), WEAPON_IDS[d.weapon]);
    $('lcCoins').textContent = fmtNum(d.coins);
    $('lcScore').textContent = fmtNum(d.score);
    this.show('level');
  }

  dedication() {
    const D = THEME.dedication;
    $('dedTitle').textContent = pick(D.title);
    $('dedBody').textContent = pick(D.body);
    $('dedSig').textContent = pick(D.signature);
    this.show('dedication');
  }

  shop(save, from, nextLevel) {
    $('shopCoins').textContent = fmtNum(save.coins);
    const now = statsFromUpgrades(save.upgrades);
    for (const kind of UPGRADES) {
      const id = UP_IDS[kind], lvl = save.upgrades[kind] || 0;
      const next = statsFromUpgrades({ ...save.upgrades, [kind]: lvl + 1 });
      const maxed = isMaxed(kind, lvl);
      $('lv' + id).textContent = t('lvl', { n: lvl });
      const r2 = v => Math.round(v * 100) / 100;
      const key = kind === 'start' ? 'start' : kind === 'damage' ? 'damageMult' : 'rateMult';
      const cur = kind === 'start' ? now.start : r2(now[key]);
      const nxt = kind === 'start' ? String(next.start) : mult(next[key]);
      const desc = t('up' + id + 'Desc', { x: cur });
      $('desc' + id).textContent = maxed ? desc : desc + '  →  ' + nxt;
      const btn = $('buy' + id);
      const cost = upgradeCost(kind, lvl);
      btn.disabled = maxed || save.coins < cost;
      btn.innerHTML = '';
      if (maxed) btn.textContent = t('maxed');
      else {
        const cv = document.createElement('canvas');
        cv.style.width = cv.style.height = '24px';
        btn.appendChild(cv);
        btn.appendChild(document.createTextNode(fmtNum(cost)));
        this.paintIcon(cv, 'coin');
      }
    }
    const between = from === 'between';
    $('btnShopNext').classList.toggle('hidden', !between);
    $('btnShopBack').classList.toggle('hidden', between);
    if (between) $('btnShopNext').textContent = t('nextLevel', { n: nextLevel });
    this.show('shop');
  }

  gameOver(d) {
    $('overScore').textContent = fmtNum(d.score);
    $('overRecord').textContent = fmtNum(d.record);
    $('overNewRec').classList.toggle('hidden', !d.newRecord);
    if (d.mode === 'campaign') { $('overReachLbl').textContent = t('levelReached'); $('overReach').textContent = String(d.level); }
    else { $('overReachLbl').textContent = t('distance'); $('overReach').textContent = fmtNum(d.distance) + ' m'; }
    $('overCoins').textContent = fmtNum(d.coins);
    this.show('over');
  }
}
