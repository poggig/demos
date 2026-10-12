// IT + EN from THEME.text — detected from the browser, switchable, persisted by main.js.
import { THEME } from './theme.js';
import { bossKind, bossElite } from './levelgen.js';

export const LANGS = ['it', 'en'];
let lang = 'en';

export function detectLang(nav = globalThis.navigator) {
  const list = (nav && (nav.languages && nav.languages.length ? nav.languages : [nav.language])) || [];
  for (const l of list) {
    const c = String(l || '').slice(0, 2).toLowerCase();
    if (LANGS.includes(c)) return c;
  }
  return 'en';
}

export function setLang(l) { lang = LANGS.includes(l) ? l : 'en'; return lang; }
export function getLang() { return lang; }

/** t('levelComplete', {n: 3}) → "Level 3 complete!" */
export function t(key, vars) {
  let s = (THEME.text[lang] && THEME.text[lang][key]) ?? THEME.text.en[key] ?? key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

/** A theme value that is either a plain string or { it, en }. */
export function pick(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return v[lang] ?? v.en ?? '';
}

const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
/** Name of the boss of a level: its archetype's THEME name, + " II", " III"… for elite cycles. */
export function bossName(level) {
  const name = pick(THEME.names.bosses[bossKind(level)]);
  const e = bossElite(level);
  return name ? name + (ROMAN[e] ?? ' ' + (e + 1)) : '';
}
export function zombieName(type) { return pick(THEME.names.zombies[type]); }
