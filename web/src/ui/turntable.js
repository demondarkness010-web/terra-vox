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

// ---------------------------------------------------------- visualizer
//
// Decorative only (the canvas is aria-hidden): a live waveform over a faint
// spectrum. In Duet the oldest year draws in blue across the top half and
// the newest in orange across the bottom, so the gap is visible as well as
// audible. Honors prefers-reduced-motion by drawing at a few frames a second.

export function createVisualizer(canvas, getSources) {
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const css = getComputedStyle(document.documentElement);
  const color = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const palette = { accent: color('--accent', '#56b4e9'), old: color('--old', '#56b4e9'), new: color('--new', '#e69f00'), line: 'rgba(150,170,210,0.25)' };
  let last = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function drawWave(values, top, height, stroke) {
    const w = canvas.clientWidth;
    ctx.beginPath();
    for (let i = 0; i < values.length; i++) {
      const x = (i / (values.length - 1)) * w;
      const y = top + height / 2 - values[i] * height * 0.9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.shadowColor = stroke;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (reduce?.matches && now - last < 250) return;
    last = now;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const src = getSources();
    if (!src) {
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      return;
    }

    if (src.fft) {
      const bins = src.fft.getValue();
      const n = 40;
      const bw = w / n;
      for (let i = 0; i < n; i++) {
        const db = bins[Math.floor((i / n) * bins.length * 0.7)];
        const v = Math.max(0, Math.min(1, (db + 100) / 80));
        ctx.fillStyle = 'rgba(86,180,233,0.10)';
        ctx.fillRect(i * bw + 1, h - v * h, bw - 2, v * h);
      }
    }

    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 1;
    if (src.waves.length === 2) {
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      drawWave(src.waves[0].getValue(), 0, h / 2, palette.old);
      drawWave(src.waves[1].getValue(), h / 2, h / 2, palette.new);
    } else if (src.waves.length === 1) {
      drawWave(src.waves[0].getValue(), 0, h, palette.accent);
    }
  }
  requestAnimationFrame(frame);
}
