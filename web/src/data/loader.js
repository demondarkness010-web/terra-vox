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
