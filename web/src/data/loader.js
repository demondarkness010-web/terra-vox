// Loads the precomputed NASA data: data/themes.json plus one feature JSON and
// one display image per frame. Everything is bundled at build time, so the app
// works offline and never depends on a live NASA request during a demo.
//
// Each theme is a record with two sides:
//   side A  the calibrated year-by-year record built from NASA GIBS layers
//   side B  frames of the theme's NASA Earth Information Center visualization
//           (data/eic.json, scripts/fetch_eic.py)
// Both sides are "tracks" with the same shape, so the player, Duet, captions
// and readout treat them alike.
//
// Air Quality follows one region at a time (data/reference.json): the global
// March mean barely moves, while regions move in opposite directions (North
// China falling, northern India rising). Each region is its own side A track.

import themesMeta from '../../../data/themes.json';

const featureFiles = import.meta.glob('../../../data/features/*/*.json', { eager: true, import: 'default' });
const displayImages = import.meta.glob('../../../data/display/*/*.jpg', { eager: true, query: '?url', import: 'default' });
const thumbnails = import.meta.glob('../../../assets/thumbnails/*.jpg', { eager: true, query: '?url', import: 'default' });
// Where each frame's signal is (scripts/extract_points.py): drives the note sparks.
const pointFiles = import.meta.glob('../../../data/points/*.json', { eager: true, import: 'default' });
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

// "over the North China Plain": region names as they read inside a sentence.
const OVER = {
  north_china: 'the North China Plain',
  northern_india: 'northern India',
  eastern_us: 'the eastern United States',
  western_europe: 'western Europe',
};
const REGION_SHORT = {
  north_china: 'North China',
  northern_india: 'Northern India',
  eastern_us: 'Eastern US',
  western_europe: 'Western Europe',
};

/** The four themes (side A), each with its frames in date order (oldest first). */
export function loadThemes() {
  if (cache) return cache;
  cache = themesMeta.themes.map((meta) => {
    const points = pointFiles[`../../../data/points/${meta.id}.json`] ?? {};
    const frames = meta.frames.map((date) => {
      const features = featureFiles[`../../../data/features/${meta.id}/${date}.json`];
      if (!features) throw new Error(`Missing features for ${meta.id} ${date}; run scripts/extract_features.py`);
      return {
        ...features,
        short: String(features.year),
        big: String(features.year),
        themeName: meta.name,
        imageUrl: displayImages[`../../../data/display/${meta.id}/${date}.jpg`],
        signal: points[date] ?? { kind: 'none', points: [] },
      };
    });
    return {
      ...meta,
      side: 'a',
      parent: meta.id,
      frames,
      rangeLabel: meta.yearRange.map(String),
      step: 'year',
      thumbnailUrl: thumbnails[`../../../assets/thumbnails/${meta.id}.jpg`] ?? frames[frames.length - 1].imageUrl,
    };
  }).map((track) => (track.sound?.regions ? regionTrack(track, track.sound.defaultRegion) : track));
  return cache;
}

// The same frames, but every number (value, share, the sound inputs) taken
// from one region, so the words, the sound and the readout follow it together.
function regionTrack(base, id) {
  const key = `${base.id}:${id}`;
  if (regionTracks.has(key)) return regionTracks.get(key);
  const region = { id, short: REGION_SHORT[id] ?? id, over: OVER[id] ?? id, ...base.sound.regions.find((r) => r.id === id) };
  const label = `March mean NO₂ over ${region.over}`;
  const track = {
    ...base,
    region,
    physical: { ...base.physical, label },
    frames: base.frames.map((f) => ({ ...f, ...f.regions[id], physical: { ...f.physical, label, value: f.regions[id].value } })),
  };
  regionTracks.set(key, track);
  if (!airRegion) airRegion = id;
  return track;
}

/** Regions Air Quality can follow: [{ id, name, short, over }]. */
export function airRegions() {
  const aq = themesMeta.themes.find((t) => t.id === 'air_quality');
  return (aq?.sound?.regions ?? []).map((r) => ({ ...r, short: REGION_SHORT[r.id] ?? r.name, over: OVER[r.id] ?? r.name }));
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
  for (const t of eicMeta?.tracks ?? []) {
    const parent = loadThemes().find((th) => th.id === t.theme);
    if (!parent) continue;
    const frames = t.frames.map((f) => ({
      ...f,
      themeName: parent.name,
      imageUrl: eicImages[`../../../${f.image}`],
      signal: { kind: 'none', points: [] },
    }));
    sideB[t.theme] = {
      ...t,
      name: parent.name,
      side: 'b',
      parent: parent.id,
      frames,
      yearRange: [frames[0].year ?? null, frames[frames.length - 1].year ?? null],
      rangeLabel: [frames[0].short, frames[frames.length - 1].short],
      step: 'frame',
      thumbnailUrl: parent.thumbnailUrl,
    };
  }
  return sideB;
}

/** Any track by id: a theme id (side A) or a side B id like "wildfires_eic". */
export function getTheme(id) {
  return loadThemes().find((t) => t.id === id) ?? Object.values(loadSideB()).find((t) => t.id === id);
}

/** The track for a theme and side; side B falls back to A if it is missing. */
export function trackFor(themeId, side) {
  const a = loadThemes().find((t) => t.id === themeId);
  if (side === 'b' && loadSideB()[themeId]) return loadSideB()[themeId];
  return a?.region && airRegion ? regionTrack(a, airRegion) : a;
}

export const oldestFrame = (theme) => theme.frames[0];
export const newestFrame = (theme) => theme.frames[theme.frames.length - 1];

/** "23 years apart", "3 days apart", ... for the two ends of a track. */
export function spanBetween(theme, a = oldestFrame(theme), b = newestFrame(theme)) {
  if (theme.side === 'a') {
    const n = b.year - a.year;
    return `${n} year${n === 1 ? '' : 's'} apart`;
  }
  if (!a.date || !b.date) return `${theme.frames.length} frames of NASA's visualization`;
  const days = Math.round((new Date(b.date) - new Date(a.date)) / 86400000);
  if (days < 2) return `${Math.round((new Date(b.date) - new Date(a.date)) / 3600000)} hours apart`;
  if (days < 60) return `${days} days apart`;
  const months = Math.round(days / 30.44);
  return months < 24 ? `${months} months apart` : `${Math.round(days / 365.25)} years apart`;
}

// ------------------------------------------------------------ real units

// What counts as "active" per track: its share drives notes per bar. Where
// the share IS the headline number (wildfires, all of side B), it is not
// repeated.
const ACTIVE = {
  wildfires: null,
  sea_level: 'ocean at least 10 cm above the mean',
  air_quality: 'observed air above 5 ×10¹⁵ molec/cm² of NO₂',
  greenhouse_gases: 'air holding at least 1,900 ppb of methane',
  wildfires_eic: null,
  sea_level_eic: null,
  air_quality_eic: null,
  greenhouse_gases_eic: null,
};

/** e.g. { label: "ocean at least 10 cm above the mean", percent: 24.8 }, or null. */
export function activeShare(frame) {
  const label = ACTIVE[frame.theme];
  // the real share: a region's own, else the frame's (activeShare01 is that
  // share on the track's sound range, which may top out at 50 %)
  return label ? { label, percent: frame.share ?? frame.raw.pixelDensity * 100 } : null;
}

const signed = (v, d) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
const sci15 = {
  short: (v) => `${v.toFixed(2)} ×10¹⁵ molec/cm²`,
  delta: (d) => `${signed(d, 2)} ×10¹⁵`,
};

const PHYSICAL = {
  wildfires: {
    short: (v) => `${v} fire areas`,
    spoken: (v) => `satellites saw ${v} separate fire areas`,
    delta: (d) => `${signed(d, 0)} fire areas`,
  },
  sea_level: {
    short: (v) => `${signed(v, 1)} cm`,
    spoken: (v) => `the average sea surface sits ${Math.abs(v).toFixed(1)} centimetres ${v >= 0 ? 'above' : 'below'} the 1993–2012 mean`,
    delta: (d) => `${signed(d, 1)} cm`,
  },
  air_quality: {
    ...sci15,
    spoken: (v) => `average nitrogen dioxide is ${v.toFixed(2)} times ten to the fifteen molecules per square centimetre`,
  },
  greenhouse_gases: {
    short: (v) => `${Math.round(v).toLocaleString('en-US')} ppb`,
    spoken: (v) => `average methane is ${Math.round(v).toLocaleString('en-US')} parts per billion`,
    delta: (d) => `${signed(Math.round(d), 0)} ppb`,
  },
  wildfires_eic: {
    short: (v) => `${v.toFixed(2)}% of land`,
    spoken: (v) => `fire pixels cover ${v.toFixed(2)} percent of the land`,
    delta: (d) => `${signed(d, 2)} points`,
  },
  sea_level_eic: {
    short: (v) => `${signed(v, 1)} cm vs 1993`,
    spoken: (v) => `the water stands ${Math.abs(v).toFixed(1)} centimetres ${v >= 0 ? 'above' : 'below'} the 1993 sea level`,
    delta: (d) => `${signed(d, 1)} cm`,
  },
  air_quality_eic: {
    ...sci15,
    spoken: (v) => `nitrogen dioxide in view averages ${v.toFixed(2)} times ten to the fifteen molecules per square centimetre`,
  },
  greenhouse_gases_eic: {
    short: (v) => `${v.toFixed(1)}% of the globe`,
    spoken: (v) => `dense methane haze covers ${v.toFixed(1)} percent of the globe`,
    delta: (d) => `${signed(d, 1)} points`,
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
