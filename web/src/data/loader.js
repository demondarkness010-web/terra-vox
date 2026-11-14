// Loads the precomputed NASA data: data/themes.json plus one feature JSON and
// one display image per frame. Everything is bundled at build time, so the app
// works offline and never depends on a live NASA request during a demo.
//
// Each theme is a record with two sides:
//   side A  the calibrated year-by-year record built from NASA GIBS layers,
//           each year an average over many windows (scripts/build_annual.py)
//   side B  frames of the theme's NASA Earth Information Center visualization
//           (data/eic.json, scripts/fetch_eic.py)
// Both sides are "tracks" with the same shape, so the player, Duet, captions
// and readout treat them alike.
//
// Air Quality follows one region at a time (data/reference.json): the global
// yearly mean barely moves, while regions move in opposite directions (North
// China falling, northern India rising). Each region is its own side A track.
//
// Names, labels and units are getters that read the current language
// (i18n/index.js), so a language switch needs no reload.

import themesMeta from '../../../data/themes.json';
import { t, num, locale } from '../i18n/index.js';

const featureFiles = import.meta.glob('../../../data/features/*/*.json', { eager: true, import: 'default' });
const displayImages = import.meta.glob('../../../data/display/*/*.jpg', { eager: true, query: '?url', import: 'default' });
const thumbnails = import.meta.glob('../../../assets/thumbnails/*.jpg', { eager: true, query: '?url', import: 'default' });
// Spark positions (data/points, ~340 KB) are only drawn by the 3D globe, so globeGL.js loads them in its own
// lazily loaded file instead of every visitor downloading them before the page can start.
// Optional data files: the app still runs if a script has not been run yet.
const optional = import.meta.glob(['../../../data/eic.json', '../../../data/reference.json', '../../../data/legends.json', '../../../data/context.json', '../../../data/fire_check.json'], { eager: true, import: 'default' });
const eicImages = import.meta.glob('../../../data/eic/*/*.jpg', { eager: true, query: '?url', import: 'default' });

const file = (name) => optional[`../../../data/${name}.json`] ?? null;
export const reference = file('reference');
export const legends = file('legends');
export const context = file('context');
// Terra against Aqua, the drift cross-check (scripts/check_fire_drift.py).
export const fireCheck = file('fire_check');
const eicMeta = file('eic');

let cache = null;
let sideB = null;
let airRegion = null;
const regionTracks = new Map();

// ------------------------------------------------------------ words that follow the language

// Theme names and listening hints come from the language files, not themes.json.
function localizeTrack(track) {
  Object.defineProperties(track, {
    name: { get: () => t(`theme.${track.parent}.name`), enumerable: true, configurable: true },
    signature: { get: () => t(`theme.${track.id}.signature`), enumerable: true, configurable: true },
  });
  if (track.physical && !track.region) {
    const physical = { ...track.physical };
    Object.defineProperty(physical, 'label', { get: () => t(`physlabel.${track.id}`), enumerable: true });
    track.physical = physical;
  }
  return track;
}

const fmtCache = new Map();
const fmtDate = (d, opts) => {
  const loc = locale();
  const key = loc + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(loc, opts); fmtCache.set(key, f); }
  return f.format(d);
};
const monthName = (m) => fmtDate(new Date(Date.UTC(2001, m - 1, 15)), { month: 'long', timeZone: 'UTC' });
const signedNum = (v, d) => `${v >= 0 ? '+' : '−'}${num(Math.abs(v), d)}`;

// A frame's label, short and big date in the current language.
function labelsFor(f) {
  if (f.window) {                                   // side A: one year's average
    const m = f.window.months ?? [];
    const range = m.length ? { from: monthName(m[0]), to: monthName(m[m.length - 1]), count: m.length } : {};
    return { label: t(`frame.${f.window.kind}`, { year: f.year, ...range }), short: String(f.year), big: String(f.year) };
  }
  if (f.side !== 'b') return { label: f.label0, short: String(f.year), big: String(f.year) };
  if (!f.date) {                                    // the porthole: labelled by its water level
    const s = signedNum(f.physical.value, 1);
    return { label: t('eic.seaLabel', { v: s }), short: `${s} cm`, big: s };
  }
  if (f.date.includes('T')) {                       // TEMPO: hourly, Eastern time
    const d = new Date(f.date);
    const tz = { timeZone: 'America/New_York' };
    const time = fmtDate(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...tz });
    return { label: `${fmtDate(d, { dateStyle: 'long', ...tz })}, ${time} EDT`, short: `${fmtDate(d, { month: 'short', day: 'numeric', ...tz })} ${time}`, big: time };
  }
  const d = new Date(`${f.date}T12:00:00Z`);
  const utc = { timeZone: 'UTC' };
  if (f.theme === 'greenhouse_gases_eic') {         // one model year: the day is what changes
    return { label: fmtDate(d, { dateStyle: 'long', ...utc }), short: fmtDate(d, { month: 'short', day: 'numeric', ...utc }), big: fmtDate(d, { month: 'short', day: '2-digit', ...utc }) };
  }
  return { label: fmtDate(d, { dateStyle: 'long', ...utc }), short: fmtDate(d, { dateStyle: 'medium', ...utc }), big: fmtDate(d, { month: 'short', day: '2-digit', ...utc }) };
}

function localizeFrame(f) {
  Object.defineProperties(f, {
    label: { get: () => labelsFor(f).label, enumerable: true, configurable: true },
    short: { get: () => labelsFor(f).short, enumerable: true, configurable: true },
    big: { get: () => labelsFor(f).big, enumerable: true, configurable: true },
  });
  return f;
}

// Region names as they read alone and inside a sentence ("over northern India").
function localizeRegion(region) {
  Object.defineProperties(region, {
    short: { get: () => t(`region.${region.id}.short`), enumerable: true, configurable: true },
    over: { get: () => t(`region.${region.id}.over`), enumerable: true, configurable: true },
  });
  return region;
}

// Copy a frame's plain data, leaving its language getters behind.
const plain = ({ label, short, big, ...rest }) => rest;

// ------------------------------------------------------------ tracks

/** The four themes (side A), each with its frames in date order (oldest first). */
export function loadThemes() {
  if (cache) return cache;
  cache = themesMeta.themes.map((meta) => {
    const frames = meta.frames.map((date) => {
      const features = featureFiles[`../../../data/features/${meta.id}/${date}.json`];
      if (!features) throw new Error(`Missing features for ${meta.id} ${date}; run scripts/extract_features.py`);
      const { label, ...rest } = features;
      return localizeFrame({
        ...rest,
        label0: label,
        side: 'a',
        imageUrl: displayImages[`../../../data/display/${meta.id}/${date}.jpg`],
      });
    });
    const { name, signature, ...rest } = meta;
    return localizeTrack({
      ...rest,
      side: 'a',
      parent: meta.id,
      frames,
      rangeLabel: meta.yearRange.map(String),
      step: 'year',
      thumbnailUrl: thumbnails[`../../../assets/thumbnails/${meta.id}.jpg`] ?? frames[frames.length - 1].imageUrl,
    });
  }).map((track) => (track.sound?.regions ? regionTrack(track, track.sound.defaultRegion) : track));
  return cache;
}

// The same frames, but every number (value, share, the sound inputs) taken
// from one region, so the words, the sound and the readout follow it together.
function regionTrack(base, id) {
  const key = `${base.id}:${id}`;
  if (regionTracks.has(key)) return regionTracks.get(key);
  const { name, range, rangeLabel, ...found } = base.sound.regions.find((r) => r.id === id);
  const region = localizeRegion({ ...found });
  const { name: _n, signature: _s, physical, ...rest } = base;
  if (range) rest.sound = { ...rest.sound, range, rangeLabel };
  const regionPhysical = { units: physical.units };
  Object.defineProperty(regionPhysical, 'label', { get: () => t('aq.label', { over: region.over }), enumerable: true });
  const track = localizeTrack({
    ...rest,
    region,
    physical: regionPhysical,
    frames: base.frames.map((f) => localizeFrame({ ...plain(f), ...f.regions[id], physical: { ...f.physical, value: f.regions[id].value } })),
  });
  regionTracks.set(key, track);
  if (!airRegion) airRegion = id;
  return track;
}

/** Regions Air Quality can follow: [{ id, short, over }]. */
export function airRegions() {
  const aq = themesMeta.themes.find((th) => th.id === 'air_quality');
  return (aq?.sound?.regions ?? []).map(({ name, ...r }) => localizeRegion({ ...r }));
}

/** Follow another Air Quality region; returns its track. */
export function setAirRegion(id) {
  loadThemes();
  airRegion = id;
  return trackFor('air_quality', 'a');
}

/** Side B tracks keyed by theme id (empty until scripts/fetch_eic.py has run). */
export function loadSideB() {
  if (sideB) return sideB;
  sideB = {};
  for (const tr of eicMeta?.tracks ?? []) {
    const parent = loadThemes().find((th) => th.id === tr.theme);
    if (!parent) continue;
    const frames = tr.frames.map(({ label, short, big, ...f }) => localizeFrame({
      ...f,
      label0: label,
      side: 'b',
      imageUrl: eicImages[`../../../${f.image}`],
      signal: { kind: 'none', points: [] },
    }));
    const { signature, ...rest } = tr;
    const track = localizeTrack({
      ...rest,
      side: 'b',
      parent: parent.id,
      frames,
      yearRange: [frames[0].year ?? null, frames[frames.length - 1].year ?? null],
      step: 'frame',
      thumbnailUrl: parent.thumbnailUrl,
    });
    Object.defineProperty(track, 'rangeLabel', { get: () => [frames[0].short, frames[frames.length - 1].short], enumerable: true });
    sideB[tr.theme] = track;
  }
  return sideB;
}

/** Any track by id: a theme id (side A) or a side B id like "wildfires_eic". */
export function getTheme(id) {
  return loadThemes().find((th) => th.id === id) ?? Object.values(loadSideB()).find((th) => th.id === id);
}

/** The track for a theme and side; side B falls back to A if it is missing. */
export function trackFor(themeId, side) {
  const a = loadThemes().find((th) => th.id === themeId);
  if (side === 'b' && loadSideB()[themeId]) return loadSideB()[themeId];
  return a?.region && airRegion ? regionTrack(a, airRegion) : a;
}

export const oldestFrame = (theme) => theme.frames[0];
export const newestFrame = (theme) => theme.frames[theme.frames.length - 1];

/** The frame for a year on a side A track, clamped to the record: { frame, clamped }. */
export function frameForYear(theme, year) {
  const first = oldestFrame(theme);
  const last = newestFrame(theme);
  if (!Number.isFinite(year)) return { frame: null, clamped: false };
  if (year <= first.year) return { frame: first, clamped: year < first.year };
  if (year >= last.year) return { frame: last, clamped: year > last.year };
  // Records with gaps: the nearest year present.
  const frame = theme.frames.reduce((best, f) => (Math.abs(f.year - year) < Math.abs(best.year - year) ? f : best), first);
  return { frame, clamped: frame.year !== year };
}

/** "23 years apart", "3 days apart", ... for two frames of a track. */
export function spanBetween(theme, a = oldestFrame(theme), b = newestFrame(theme)) {
  if (theme.side === 'a') return t(b.year - a.year === 1 ? 'span.years_one' : 'span.years_other', { n: num(b.year - a.year) });
  if (!a.date || !b.date) return t('span.frames', { n: num(theme.frames.length) });
  const days = Math.round((new Date(b.date) - new Date(a.date)) / 86400000);
  if (days < 2) return t('span.hours', { n: num(Math.round((new Date(b.date) - new Date(a.date)) / 3600000)) });
  if (days < 60) return t('span.days', { n: num(days) });
  const months = Math.round(days / 30.44);
  return months < 24 ? t('span.months', { n: num(months) }) : t('span.years_other', { n: num(Math.round(days / 365.25)) });
}

// ------------------------------------------------------------ real units

// What counts as "active" per track: its share drives notes per bar. Where
// the share IS the headline number (wildfires, all of side B), it is not
// repeated.
const HAS_SHARE = new Set(['sea_level', 'air_quality', 'greenhouse_gases']);

/** e.g. { label: "ocean at least 10 cm above the mean", percent: 24.8 }, or null. */
export function activeShare(frame) {
  if (!HAS_SHARE.has(frame.theme)) return null;
  // the real share: a region's own, else the frame's (activeShare01 is that
  // share on the track's sound range, which may top out at 50 %)
  return { label: t(`active.${frame.theme}`), percent: frame.share ?? frame.raw.pixelDensity * 100 };
}

/** A percentage the way captions write it: "4.2%" under 10, "33%" above. */
export const pct = (x) => `${num(x, x < 10 ? 1 : 0)}%`;

const signed = (v, d) => signedNum(v, d);
const SCI15 = '×10¹⁵ molec/cm²';

const PHYSICAL = {
  wildfires: {
    short: (v) => t('phys.fire.short', { v: num(v) }),
    spoken: (v) => t('phys.fire.spoken', { v: num(v) }),
    delta: (d) => t('phys.fire.short', { v: signed(d, 0) }),
  },
  sea_level: {
    short: (v) => `${signed(v, 1)} cm`,
    spoken: (v) => t(v >= 0 ? 'phys.sea.spokenAbove' : 'phys.sea.spokenBelow', { v: num(Math.abs(v), 1) }),
    delta: (d) => `${signed(d, 1)} cm`,
  },
  air_quality: {
    short: (v) => `${num(v, 2)} ${SCI15}`,
    spoken: (v) => t('phys.no2.spoken', { v: num(v, 2) }),
    delta: (d) => `${signed(d, 2)} ×10¹⁵`,
  },
  greenhouse_gases: {
    short: (v) => `${num(Math.round(v))} ppb`,
    spoken: (v) => t('phys.ch4.spoken', { v: num(Math.round(v)) }),
    delta: (d) => `${signed(Math.round(d), 0)} ppb`,
  },
  wildfires_eic: {
    short: (v) => t('phys.fireEic.short', { v: num(v, 2) }),
    spoken: (v) => t('phys.fireEic.spoken', { v: num(v, 2) }),
    delta: (d) => t('phys.points', { v: signed(d, 2) }),
  },
  sea_level_eic: {
    short: (v) => t('phys.seaEic.short', { v: signed(v, 1) }),
    spoken: (v) => t(v >= 0 ? 'phys.seaEic.spokenAbove' : 'phys.seaEic.spokenBelow', { v: num(Math.abs(v), 1) }),
    delta: (d) => `${signed(d, 1)} cm`,
  },
  air_quality_eic: {
    short: (v) => `${num(v, 2)} ${SCI15}`,
    spoken: (v) => t('phys.no2Eic.spoken', { v: num(v, 2) }),
    delta: (d) => `${signed(d, 2)} ×10¹⁵`,
  },
  greenhouse_gases_eic: {
    short: (v) => t('phys.ch4Eic.short', { v: num(v, 1) }),
    spoken: (v) => t('phys.ch4Eic.spoken', { v: num(v, 1) }),
    delta: (d) => t('phys.points', { v: signed(d, 1) }),
  },
};

/** The frame's headline physical value, e.g. "1,887 ppb" or "+5.3 cm". */
export function physicalShort(frame) {
  return PHYSICAL[frame.theme].short(frame.physical.value);
}

/** The same value as a sentence fragment for speech and captions. */
export function physicalSpoken(frame) {
  return PHYSICAL[frame.theme].spoken(frame.physical.value);
}

export function physicalDelta(a, b) {
  return PHYSICAL[a.theme].delta(b.physical.value - a.physical.value);
}

/** Format a bare value in a theme's units (used for the NOAA reference line). */
export function physicalValue(themeId, v) {
  return PHYSICAL[themeId].short(v);
}
