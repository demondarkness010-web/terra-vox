// How far to trust a Duet, said out loud.
//
//   referenceFrames(theme, a, b)   the NOAA record for the same two years,
//                                  as frames the same mapping can play
//   referenceLine(theme, a, b)     "NOAA ground stations: 1,777 → 1,921 ppb,
//                                  the same direction."
//   confidence(theme)              'high' | 'medium' | 'low', by rule:
//       high    yearly averages AND the record agrees with an independent
//               NOAA reference at r >= 0.9 (scripts/build_annual.py measures r)
//       medium  yearly averages, no independent reference
//       low     a single window per year, or a known issue (Terra's orbit
//               drift, the OMI row anomaly)
//   changeClass(theme, a, b)       'clear' | 'small' | 'none' (+ direction):
//       the gap between the two years against the record's own year-to-year
//       noise (standard deviation of its year-on-year steps). Clear: at least
//       3x that noise; small: at least 1x; otherwise no clear change.
//   sameMonths(theme, frame, months)  a frame averaged over only those months
//                                  (the current year is partial, so its Duet
//                                  partner is compared over the same months)
//
// The rules are written out in docs/mapping-explainer.md.

import { reference } from './loader.js';
import { t, num } from '../i18n/index.js';

export const REFERENCE_R = 0.9;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

// NOAA series per theme, in the theme's own units (sea level mm -> cm).
const NOAA = {
  greenhouse_gases: () => reference?.greenhouse_gases && {
    annual: reference.greenhouse_gases.series.map((p) => ({ year: p.year, value: p.value })),
    monthly: reference.greenhouse_gases.monthly ?? [],
    key: 'ref.noaa.ch4',
  },
  sea_level: () => reference?.sea_level && {
    annual: reference.sea_level.series.filter((p) => !p.partial).map((p) => ({ year: p.year, value: p.value / 10 })),
    monthly: [],
    key: 'ref.noaa.sea',
  },
};

function noaaValue(src, year, months) {
  if (months?.length && months.length < 12) {
    const vals = src.monthly.filter((p) => p.year === year && months.includes(p.month)).map((p) => p.value);
    return vals.length ? { value: mean(vals), months: src.monthly.filter((p) => p.year === year && months.includes(p.month)).map((p) => p.month) } : null;
  }
  const p = src.annual.find((q) => q.year === year);
  return p ? { value: p.value } : null;
}

/** NOAA values for the Duet's two years, or null where the theme has no independent record. */
export function referenceValues(theme, a, b) {
  if (theme.side !== 'a' || !NOAA[theme.parent]) return null;
  const src = NOAA[theme.parent]();
  if (!src) return null;
  const months = b.window?.kind === 'partial' ? b.window.months : null;
  let va = noaaValue(src, a.year, months);
  let vb = noaaValue(src, b.year, months);
  if (months && vb?.months && vb.months.length < months.length) va = noaaValue(src, a.year, vb.months);  // NOAA lags a few months
  if (!va || !vb) return null;
  return { key: src.key, a: va.value, b: vb.value, months: vb.months ?? null };
}

/** One spoken/captioned line, or null. */
export function referenceLine(theme, a, b, satDirection) {
  const r = referenceValues(theme, a, b);
  if (!r) return null;
  const unit = theme.parent === 'sea_level' ? ' cm' : ' ppb';
  const d = theme.parent === 'sea_level' ? 1 : 0;
  const dir = Math.sign(r.b - r.a);
  const agree = dir === satDirection ? t('ref.same') : t('ref.opposite');
  return t(r.key, { from: `${num(r.a, d)}${unit}`, to: `${num(r.b, d)}${unit}`, agree });
}

/** The NOAA values as frames: the reference voice plays them through the same mapping. */
export function referenceFrames(theme, a, b) {
  const r = referenceValues(theme, a, b);
  if (!r) return null;
  const [lo, hi] = theme.sound.range;
  const v01 = (v) => clamp01((v - lo) / (hi - lo));
  const first = v01(r.a);
  // Density is fixed (two notes a bar): NOAA has no "share of the map".
  const frame = (year, value, index) => ({
    theme: theme.parent, year, index, physical: { value },
    value01: v01(value), activeShare01: 1 / 7, fromFirst01: Math.abs(v01(value) - first),
  });
  return [frame(a.year, r.a, 0), frame(b.year, r.b, 1)];
}

export function confidence(theme) {
  if (theme.side === 'b') return 'low';                       // one NASA sequence, one window
  const yearly = Boolean(theme.averaging);
  if (!yearly || (theme.knownIssues ?? []).length) return 'low';
  return (theme.referenceCheck?.r ?? 0) >= REFERENCE_R ? 'high' : 'medium';
}

/** Year-on-year noise of a track's value01, then where the gap a -> b sits against it. */
export function changeClass(theme, a, b) {
  const v = theme.frames.map((f) => f.value01);
  const steps = v.slice(1).map((x, i) => x - v[i]);
  const m = mean(steps);
  const noise = Math.sqrt(mean(steps.map((s) => (s - m) ** 2))) || 0.01;
  const gap = b.value01 - a.value01;
  const k = Math.abs(gap) / noise;
  const kind = k >= 3 && Math.abs(gap) >= 0.05 ? 'clear' : k >= 1 ? 'small' : 'none';
  return { kind, direction: Math.sign(gap), ratio: k };
}

/** "Clear rise, high confidence." */
export function trustSentence(theme, a, b) {
  const c = changeClass(theme, a, b);
  const conf = confidence(theme);
  const change = c.kind === 'none' ? t('class.none') : t(`class.${c.kind}.${c.direction >= 0 ? 'up' : 'down'}`);
  return { change, confidence: t(`conf.${conf}`), sentence: t('trust.sentence', { change, confidence: t(`conf.${conf}`) }), level: conf, kind: c.kind };
}

/** A frame averaged over only `months` (1-12), from its stored monthly values. */
export function sameMonths(theme, frame, months) {
  const mv = frame.monthly;
  if (!mv || !months?.length) return frame;
  const vals = months.map((m) => mv[m - 1]).filter((x) => x !== null && x !== undefined);
  const shares = months.map((m) => frame.monthlyShare?.[m - 1]).filter((x) => x !== null && x !== undefined);
  if (!vals.length) return frame;
  const [lo, hi] = theme.sound.range;
  const value = mean(vals);
  const out = Object.create(Object.getPrototypeOf(frame), Object.getOwnPropertyDescriptors(frame));
  out.physical = { ...frame.physical, value: Math.round(value * 10) / 10 };
  out.value01 = clamp01((value - lo) / (hi - lo));
  if (shares.length) {
    out.share = mean(shares);
    out.activeShare01 = clamp01(out.share / (theme.sound.shareMax ?? 100));
  }
  out.sameMonths = months;
  return out;
}
