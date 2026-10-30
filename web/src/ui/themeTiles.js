// The four theme tiles ("album covers"), built as an ARIA radio group:
// Tab reaches the group once, arrow keys move between themes and select them,
// Home/End jump to the ends. Each cover is real NASA EIC imagery.
//
// Selecting with arrows only browses. Activating a tile (click, tap, Enter,
// Space) also starts the soundscape, like dropping the needle on a record;
// Space on the tile that is already selected toggles play/pause.

const NEXT_KEYS = ['ArrowDown', 'ArrowRight'];
const PREV_KEYS = ['ArrowUp', 'ArrowLeft'];

export function createThemeTiles(container, themes, { onSelect, onActivate, labelledBy }) {
  container.replaceChildren();
  const group = document.createElement('div');
  group.className = 'tiles';
  group.setAttribute('role', 'radiogroup');
  if (labelledBy) group.setAttribute('aria-labelledby', labelledBy);

  const tiles = themes.map((theme) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.dataset.theme = theme.id;
    tile.setAttribute('role', 'radio');
    tile.setAttribute('aria-label', theme.name);
    tile.setAttribute('aria-checked', 'false');
    tile.tabIndex = -1;

    const descId = `tile-desc-${theme.id}`;
    tile.setAttribute('aria-describedby', descId);

    // A record sleeve (the NASA cover art) with its record behind it; the
    // selected theme's record slides half out. Decorative: the name and
    // description carry the meaning.
    const sleeve = document.createElement('span');
    sleeve.className = 'sleeve';
    sleeve.setAttribute('aria-hidden', 'true');
    const disc = document.createElement('span');
    disc.className = 'disc';
    const label = document.createElement('img');
    label.className = 'disc-label';
    label.src = theme.thumbnailUrl;
    label.alt = '';
    disc.append(label);
    const art = document.createElement('img');
    art.className = 'tile-art';
    art.src = theme.thumbnailUrl;
    art.alt = '';
    sleeve.append(disc, art);

    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = theme.name;

    const meta = document.createElement('span');
    meta.className = 'tile-meta';
    meta.id = descId;
    meta.textContent = `${theme.yearRange[0]}–${theme.yearRange[1]} · ${theme.signature}`;
    const count = document.createElement('span');
    count.className = 'sr-only';
    count.textContent = `, ${theme.frameCount} frames`;
    meta.append(count);

    const eq = document.createElement('span');
    eq.className = 'tile-eq';
    eq.setAttribute('aria-hidden', 'true');
    eq.innerHTML = '<i></i><i></i><i></i>';

    const text = document.createElement('span');
    text.className = 'tile-text';
    text.append(name, meta);
    tile.append(sleeve, text, eq);
    tile.addEventListener('click', () => {
      select(theme.id, { notify: true });
      onActivate?.(theme.id, { toggle: false });
    });
    return tile;
  });

  group.addEventListener('keydown', (e) => {
    const i = tiles.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();      // handled here, not as a synthetic click
      e.stopPropagation();
      const id = tiles[i].dataset.theme;
      const wasCurrent = id === current;
      select(id, { notify: true });
      onActivate?.(id, { toggle: wasCurrent && e.key === ' ' });
      return;
    }
    let next = null;
    if (NEXT_KEYS.includes(e.key)) next = (i + 1) % tiles.length;
    else if (PREV_KEYS.includes(e.key)) next = (i - 1 + tiles.length) % tiles.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tiles.length - 1;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    select(tiles[next].dataset.theme, { notify: true, focus: true });
  });

  group.append(...tiles);
  container.append(group);

  let current = null;
  function select(id, { notify = false, focus = false } = {}) {
    tiles.forEach((t) => {
      const on = t.dataset.theme === id;
      t.setAttribute('aria-checked', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    if (notify && id !== current) onSelect?.(id);
    current = id;
  }

  function setPlaying(id, playing) {
    tiles.forEach((t) => t.classList.toggle('is-playing', playing && t.dataset.theme === id));
  }

  return { select, setPlaying, get current() { return current; } };
}
