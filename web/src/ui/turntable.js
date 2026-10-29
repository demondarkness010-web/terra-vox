// The central play area: the current NASA frame on the "turntable", the
// transport buttons and the timeline scrubber. This module is view + input
// only; main.js owns playback state and the audio engine.
//
// The scrubber is a native <input type="range">, so arrow keys, Page Up/Down
// and Home/End work for free and screen readers announce it as a slider.
// aria-valuetext makes them read "Aug 08-15, 2014, frame 14 of 25" instead
// of a bare index.

export function createTurntable(root, { onTogglePlay, onScrub, onStep, onListenMode, listenModes = {}, altFor = defaultAlt }) {
  const $ = (sel) => root.querySelector(sel);
  const stage = $('#stage');
  const img = $('#frame-img');
  const yearBadge = $('#frame-year');
  const caption = $('#frame-caption');
  const recordLabel = $('#record-label');
  const playBtn = $('#play');
  const prevBtn = $('#prev');
  const nextBtn = $('#next');
  const scrubber = $('#scrubber');
  const scrubStart = $('#scrub-start');
  const scrubEnd = $('#scrub-end');
  const themeTitle = root.querySelector('#player-theme') ?? document.getElementById('player-theme');

  let theme = null;

  playBtn.addEventListener('click', () => onTogglePlay?.());
  prevBtn.addEventListener('click', () => onStep?.(-1));
  nextBtn.addEventListener('click', () => onStep?.(1));
  scrubber.addEventListener('input', () => onScrub?.(Number(scrubber.value), { final: false }));
  scrubber.addEventListener('change', () => onScrub?.(Number(scrubber.value), { final: true }));

  function setTheme(next) {
    theme = next;
    themeTitle.textContent = theme.name;
    scrubber.max = String(theme.frames.length - 1);
    scrubber.setAttribute('aria-label', `${theme.name} timeline, ${theme.yearRange[0]} to ${theme.yearRange[1]}`);
    scrubStart.textContent = theme.yearRange[0];
    scrubEnd.textContent = theme.yearRange[1];
    recordLabel.src = theme.thumbnailUrl;
    stage.dataset.theme = theme.id;
  }

  function showFrame(index) {
    if (!theme) return;
    const frame = theme.frames[index];
    if (img.dataset.src !== frame.imageUrl) {
      img.src = frame.imageUrl;
      img.dataset.src = frame.imageUrl;
    }
    img.alt = altFor(frame, theme);
    yearBadge.textContent = frame.year;
    caption.textContent = `${theme.name} · ${frame.label}`;
    scrubber.value = String(index);
    scrubber.setAttribute('aria-valuetext', `${frame.label}, frame ${index + 1} of ${theme.frames.length}`);
  }

  function setPlaying(playing) {
    root.classList.toggle('is-playing', playing);
    const what = stage.dataset.mode === 'duet' ? ' duet' : '';
    playBtn.setAttribute('aria-label', playing ? `Pause${what}` : `Play${what}`);
    playBtn.title = playing ? 'Pause (Space)' : 'Play (Space)';
  }

  // ---------------------------------------------------------- duet view

  const duetPanel = document.getElementById('duet-panel');
  const old = {
    img: $('#duet-old-img'), year: $('#duet-old-year'), cap: $('#duet-old-cap'), meter: $('#duet-old-meter'),
  };
  const neu = {
    img: $('#duet-new-img'), year: $('#duet-new-year'), cap: $('#duet-new-cap'), meter: $('#duet-new-meter'),
  };
  const listen = createSegmented(document.getElementById('listen-modes'), listenModes, (m) => onListenMode?.(m));

  function setDuet(on) {
    stage.dataset.mode = on ? 'duet' : 'single';
    duetPanel.hidden = !on;
    // Duet always compares the two ends of the record, so there is nothing
    // to scrub; say why rather than silently disabling.
    [scrubber, prevBtn, nextBtn].forEach((el) => { el.disabled = on; });
    scrubber.setAttribute('aria-description', on ? 'Unavailable in Duet mode, which always compares the oldest and newest frames.' : '');
  }

  function fillDeck(deck, frame) {
    deck.img.src = frame.imageUrl;
    deck.img.alt = altFor(frame, theme);
    deck.year.textContent = frame.year;
    deck.cap.textContent = frame.label;
  }

  function showDuet(gap) {
    fillDeck(old, gap.oldest);
    fillDeck(neu, gap.newest);
    document.getElementById('gap-years').textContent = `${gap.oldest.year} → ${gap.newest.year} (${gap.years} years)`;
    document.getElementById('gap-sentence').textContent = gap.sentence;
    const p = gap.physical;
    document.getElementById('gap-physical').textContent =
      `${capitalize(p.label)}: ${p.from} → ${p.to} (${p.delta}).`
      + (p.activeLabel ? ` Share of ${p.activeLabel}: ${p.activeFrom} → ${p.activeTo}.` : '');
    const rows = document.getElementById('gap-rows');
    rows.replaceChildren(...gap.items.map((it) => {
      const tr = document.createElement('tr');
      tr.className = it.change === 'same' || it.change === 'about the same' ? 'same' : 'changed';
      [it.aspect, it.from, it.to, it.change].forEach((v, i) => {
        const cell = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) cell.scope = 'row';
        cell.textContent = v;
        tr.append(cell);
      });
      return tr;
    }));
  }

  function setListenMode(mode) {
    listen.select(mode);
  }

  // Meters are decorative (aria-hidden); levels arrive in dB.
  function setMeters({ oldest, newest }) {
    const h = (db) => Math.max(0, Math.min(1, (db + 54) / 48));
    old.meter.style.transform = `scaleY(${h(oldest)})`;
    neu.meter.style.transform = `scaleY(${h(newest)})`;
  }

  return {
    setTheme, showFrame, setPlaying, setDuet, showDuet, setListenMode, setMeters,
    stage, scrubber, playBtn, get theme() { return theme; },
  };
}

// A small ARIA radio group of buttons (roving tabindex, arrow keys).
function createSegmented(container, options, onChange) {
  const buttons = Object.entries(options).map(([value, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.tabIndex = -1;
    b.dataset.value = value;
    b.textContent = label;
    b.addEventListener('click', () => { select(value); onChange(value); });
    return b;
  });
  container.replaceChildren(...buttons);
  container.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (i < 0) return;
    const d = ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const next = buttons[(i + d + buttons.length) % buttons.length];
    select(next.dataset.value);
    next.focus();
    onChange(next.dataset.value);
  });
  function select(value) {
    buttons.forEach((b) => {
      const on = b.dataset.value === value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }
  return { select };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function defaultAlt(frame, theme) {
  return `${theme.name}, ${frame.label}`;
}
