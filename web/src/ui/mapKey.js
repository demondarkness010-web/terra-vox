// The map key: what the colours on the frame mean, in real units. Side A keys
// are NASA's own GIBS colormaps, drawn as one block per colormap step (the
// colours are data, so they come from the file, not from the design tokens) (scripts/fetch_reference.py writes
// data/legends.json); side B frames carry NASA's key inside the picture, so
// the key says where to look. The whole key is one labelled image for screen
// readers; the tick labels are drawn text.

import { legends } from '../data/loader.js';
import { t } from '../i18n/index.js';

export function createMapKey(root) {
  function setTrack(track) {
    root.replaceChildren();
    const key = legends?.[track.parent];
    if (track.side === 'b') {
      root.className = 'map-key is-text';
      root.removeAttribute('role');
      root.removeAttribute('aria-label');
      const p = document.createElement('p');
      p.textContent = t(`mapkey.b.${track.parent}`);
      root.append(p);
      return;
    }
    if (!key) { root.hidden = true; return; }
    root.hidden = false;
    if (key.kind === 'marker') {
      root.className = 'map-key is-marker';
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', t('mapkey.marker', { title: t('legend.wildfires') }));
      root.innerHTML = '<span class="key-dot" aria-hidden="true"></span><span class="key-text" aria-hidden="true"></span>';
      root.querySelector('.key-dot').style.background = key.color;
      root.querySelector('.key-text').textContent = t('mapkey.markerShort', { title: t('legend.wildfires') });
      return;
    }
    root.className = 'map-key is-gradient';
    root.setAttribute('role', 'img');
    const first = key.ticks[0]?.label;
    const last = key.ticks[key.ticks.length - 1]?.label;
    const title = t(`legend.${track.parent}`);
    root.setAttribute('aria-label', t('mapkey.gradient', { title, units: key.units, first, last }));
    const titleEl = document.createElement('p');
    titleEl.className = 'key-title';
    titleEl.setAttribute('aria-hidden', 'true');
    titleEl.textContent = `${title} (${key.units})`;
    const bar = document.createElement('div');
    bar.className = 'key-bar';
    bar.setAttribute('aria-hidden', 'true');
    bar.append(...key.stops.map((s) => {
      const step = document.createElement('i');
      step.style.background = s.color;
      return step;
    }));
    const ticks = document.createElement('div');
    ticks.className = 'key-ticks';
    ticks.setAttribute('aria-hidden', 'true');
    key.ticks.forEach((t) => {
      const s = document.createElement('span');
      s.style.left = `${t.at * 100}%`;
      s.textContent = t.label;
      ticks.append(s);
    });
    root.append(titleEl, bar, ticks);
  }
  return { setTrack };
}
