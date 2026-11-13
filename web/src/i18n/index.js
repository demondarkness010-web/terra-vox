// Words in three languages: English, Hindi, Spanish.
//
//   t('key', { year: 2003 })   the current language's string, {name}s filled in
//   tn('key', n, vars)         plural: looks up key_one / key_other by n
//   num(x, digits)             a number written the local way (1,887 / 1.887)
//   setLang('hi')              switch; every onLang() listener re-renders
//
// Strings live in en.json, hi.json and es.json beside this file. A key
// missing from hi or es falls back to English, so a half-translated build
// still reads. Hindi and Spanish are machine-translated (README says so);
// the field guide and mapping desk behind More stay in English and carry
// lang="en" so a screen reader pronounces them right.
//
// Static HTML is translated by data-i18n="key" (text) and
// data-i18n-attr="aria-label:key;title:key" (attributes).

import en from './en.json';
import hi from './hi.json';
import es from './es.json';

export const LANGS = {
  en: { name: 'English', strings: en, locale: 'en-US' },
  hi: { name: 'हिन्दी', strings: hi, locale: 'hi-IN' },
  es: { name: 'Español', strings: es, locale: 'es-ES' },
};

let current = 'en';
const listeners = new Set();

export function lang() { return current; }
export function locale() { return LANGS[current].locale; }

export function t(key, vars = {}) {
  const s = LANGS[current].strings[key] ?? en[key];
  if (s === undefined) {
    if (import.meta.env?.DEV) console.warn(`i18n: missing key ${key}`);
    return key;
  }
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
}

const rules = {};
export function tn(key, n, vars = {}) {
  rules[current] ??= new Intl.PluralRules(LANGS[current].locale);
  const form = rules[current].select(n) === 'one' ? 'one' : 'other';
  return t(`${key}_${form}`, { n: num(n), ...vars });
}

/** 1887 -> "1,887" (en), "1.887" (es), "1,887" (hi). */
export function num(x, digits = 0) {
  return Number(x).toLocaleString(LANGS[current].locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: Math.abs(x) >= 1000 });
}

export function setLang(code) {
  if (!LANGS[code] || code === current) return false;
  current = code;
  document.documentElement.lang = code;
  applyStatic();
  listeners.forEach((fn) => fn(code));
  return true;
}

export function onLang(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Fill every data-i18n / data-i18n-attr element under root. */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr.trim(), t(key.trim()));
    });
  });
}

/** Browser language on first visit: hi or es if the browser prefers it, else en. */
export function preferredLang() {
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = String(l).slice(0, 2).toLowerCase();
    if (LANGS[code]) return code;
  }
  return 'en';
}
