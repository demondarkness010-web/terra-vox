// Loads the precomputed NASA data: data/themes.json plus one feature JSON and
// one display image per frame. Everything is bundled at build time, so the app
// works offline and never depends on a live NASA request during a demo.

import themesMeta from '../../../data/themes.json';

const featureFiles = import.meta.glob('../../../data/features/*/*.json', { eager: true, import: 'default' });
const displayImages = import.meta.glob('../../../data/display/*/*.jpg', { eager: true, query: '?url', import: 'default' });
const thumbnails = import.meta.glob('../../../assets/thumbnails/*.jpg', { eager: true, query: '?url', import: 'default' });

let cache = null;

/** All four themes, each with its frames in date order (oldest first). */
export function loadThemes() {
  if (cache) return cache;
  cache = themesMeta.themes.map((meta) => {
    const frames = meta.frames.map((date) => {
      const features = featureFiles[`../../../data/features/${meta.id}/${date}.json`];
      if (!features) throw new Error(`Missing features for ${meta.id} ${date}; run scripts/extract_features.py`);
      return {
        ...features,
        themeName: meta.name,
        imageUrl: displayImages[`../../../data/display/${meta.id}/${date}.jpg`],
      };
    });
    return {
      ...meta,
      frames,
      thumbnailUrl: thumbnails[`../../../assets/thumbnails/${meta.id}.jpg`] ?? frames[frames.length - 1].imageUrl,
    };
  });
  return cache;
}

export function getTheme(id) {
  return loadThemes().find((t) => t.id === id);
}

export const oldestFrame = (theme) => theme.frames[0];
export const newestFrame = (theme) => theme.frames[theme.frames.length - 1];

// ------------------------------------------------------------ real units

// What counts as an "active" pixel per theme (drives notes per bar). For
// wildfires the active share IS the headline number, so it is not repeated.
const ACTIVE = {
  wildfires: null,
  sea_level: 'ocean at least 10 cm above the mean',
  air_quality: 'observed air above 5 ×10¹⁵ molec/cm² of NO₂',
  greenhouse_gases: 'air holding at least 1,900 ppb of methane',
};

/** e.g. { label: "ocean at least 10 cm above the mean", percent: 24.8 }, or null. */
export function activeShare(frame) {
  const label = ACTIVE[frame.theme];
  return label ? { label, percent: frame.raw.pixelDensity * 100 } : null;
}

const PHYSICAL = {
  wildfires: {
    short: (v) => `${v.toFixed(1)}% of the map`,
    spoken: (v) => `fire detections cover ${v.toFixed(1)} percent of the map`,
    delta: (d) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} points`,
  },
  sea_level: {
    short: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} cm`,
    spoken: (v) => `the average sea surface sits ${Math.abs(v).toFixed(1)} centimetres ${v >= 0 ? 'above' : 'below'} the 1993–2012 mean`,
    delta: (d) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} cm`,
  },
  air_quality: {
    short: (v) => `${v.toFixed(2)} ×10¹⁵ molec/cm²`,
    spoken: (v) => `average nitrogen dioxide is ${v.toFixed(2)} times ten to the fifteen molecules per square centimetre`,
    delta: (d) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} ×10¹⁵`,
  },
  greenhouse_gases: {
    short: (v) => `${Math.round(v).toLocaleString('en-US')} ppb`,
    spoken: (v) => `average methane is ${Math.round(v).toLocaleString('en-US')} parts per billion`,
    delta: (d) => `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))} ppb`,
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
