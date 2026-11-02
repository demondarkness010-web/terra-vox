// The stage: the globe, the big date, the transport and the groove
// timeline. View + input only; main.js owns playback state and audio.
//
// The scrubber is a native <input type="range"> laid over the groove, so
// arrow keys, Page Up/Down and Home/End work for free and screen readers
// announce it as a slider, with aria-valuetext like "Aug 08-15, 2014, frame
// 14 of 25". The groove under it draws every year's real value as a tick, so
// the timeline is also the theme's chart.

import { createGlobe } from './globe.js';
import { physicalShort, activeShare } from '../data/loader.js';
import { motionReduced } from './tokens.js';

export function createTurntable(root, { onTogglePlay, onScrub, onStep, onListenMode, listenModes = {}, altFor = defaultAlt }) {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const globeEl = $('globe');
  const playBtn = $('play');
  const prevBtn = $('prev');
  const nextBtn = $('next');
  const scrubber = $('scrubber');
  const ticksEl = $('groove-ticks');
  const themeTitle = $('player-theme');
  const frameLabel = $('frame-caption');
  const nowValue = $('now-value');
  const nowShare = $('now-share');
  // Side B: NASA's EIC visualization frames, shown flat as NASA drew them.
  const screen = $('eic-screen');
  const screenA = $('eic-a');
  const screenB = $('eic-b');

  const globe = createGlobe(globeEl);
  const year = bigDate($('year-single'));
  const years = { oldest: bigDate($('year-old')), newest: bigDate($('year-new')) };

  let theme = null;
  let ticks = [];

  playBtn.addEventListener('click', () => onTogglePlay?.());
  prevBtn.addEventListener('click', () => onStep?.(-1));
  nextBtn.addEventListener('click', () => onStep?.(1));
  scrubber.addEventListener('input', () => onScrub?.(Number(scrubber.value), { final: false }));
  scrubber.addEventListener('change', () => onScrub?.(Number(scrubber.value), { final: true }));

  function setTheme(next) {
    theme = next;
    // Air Quality is one region at a time, so the title says which.
    const title = theme.region ? `${theme.name}: ${theme.region.short}` : theme.name;
    themeTitle.textContent = title;
    scrubber.max = String(theme.frames.length - 1);
    const [r0, r1] = theme.rangeLabel;
    scrubber.setAttribute('aria-label', `${title} timeline, ${r0} to ${r1}`);
    $('scrub-start').textContent = r0;
    $('scrub-end').textContent = r1;
    $('groove-note').textContent = theme.side === 'b'
      ? `Each bar is one frame of NASA's visualization, its height the frame's ${theme.physical.label}`
      : "Each bar is one year, its height the year's value";
    stage.dataset.theme = theme.parent;
    stage.dataset.side = theme.side;
    const flat = theme.side === 'b';
    screen.hidden = !flat;
    globeEl.setAttribute('aria-hidden', String(flat));
    globeEl.classList.toggle('is-off', flat);
    if (flat) screen.style.setProperty('--aspect', String(theme.aspect));
    else globe.setTheme(theme);

    const values = theme.frames.map((f) => f.physical.value);
    const lo = Math.min(...values);
    const span = Math.max(...values) - lo || 1;
    // Tick i sits where the range thumb lands for value i.
    ticksEl.style.setProperty('--n', String(Math.max(1, theme.frames.length - 1)));
    ticks = theme.frames.map((f, i) => {
      const t = document.createElement('i');
      t.style.setProperty('--i', String(i));
      t.style.setProperty('--h', (0.16 + 0.84 * ((f.physical.value - lo) / span)).toFixed(3));
      return t;
    });
    ticksEl.replaceChildren(...ticks);
    ticks[0].classList.add('is-oldest');
    ticks[ticks.length - 1].classList.add('is-newest');
  }

  function showFrame(index) {
    if (!theme) return;
    const frame = theme.frames[index];
    if (theme.side === 'b') {
      screenA.src = frame.imageUrl;
      screen.setAttribute('aria-label', altFor(frame, theme));
    } else {
      globe.showFrame(frame);
      globeEl.setAttribute('aria-label', altFor(frame, theme));
    }
    year.set(frame.big);
    frameLabel.textContent = frame.label;
    nowValue.textContent = `${capitalize(theme.physical.label)}: ${physicalShort(frame)}`;
    const share = activeShare(frame);
    nowShare.textContent = share ? `${share.percent < 10 ? share.percent.toFixed(1) : Math.round(share.percent)}% ${share.label}` : '';
    scrubber.value = String(index);
    scrubber.setAttribute('aria-valuetext', `${frame.label}, frame ${index + 1} of ${theme.frames.length}`);
    screenB.hidden = true;
    ticks.forEach((t, i) => t.classList.toggle('is-current', i === index));
  }

  function setPlaying(playing) {
    root.classList.toggle('is-playing', playing);
    globe.setPlaying(playing);
    const what = stage.dataset.mode === 'duet' ? ' duet' : '';
    playBtn.setAttribute('aria-label', playing ? `Pause${what}` : `Play${what}`);
    playBtn.title = playing ? 'Pause (Space)' : 'Play (Space)';
  }

  // A bar was heard: the play ring pulses for one beat. With reduced motion
  // there is no ring; the button's fill steps once per bar instead.
  function beat(side, params) {
    globe.setTempo(side, params.tempoBPM);
    if (motionReduced()) {
      playBtn.classList.toggle('is-tick');
      return;
    }
    playBtn.classList.remove('is-beat', 'is-tick');
    void playBtn.offsetWidth;
    playBtn.classList.add('is-beat');
  }

  function spark(side, frame, velocity) {
    globe.spark(side, frame, velocity);
  }

  // ---------------------------------------------------------- duet view

  const duetPanel = $('duet-panel');
  const duetNow = $('duet-now');
  const listen = createSegmented($('listen-modes'), listenModes, (m) => onListenMode?.(m));

  function setDuet(on) {
    stage.dataset.mode = on ? 'duet' : 'single';
    root.dataset.mode = on ? 'duet' : 'single';
    duetPanel.hidden = !on;
    duetNow.hidden = !on;
    // Duet always compares the two ends of the record, so there is nothing
    // to scrub; say why rather than silently disabling.
    [scrubber, prevBtn, nextBtn].forEach((el) => { el.disabled = on; });
    scrubber.setAttribute('aria-description', on ? 'Unavailable in Duet mode, which always compares the oldest and newest frames.' : '');
    if (!on) { globe.setDuet(false); screenB.hidden = true; }
  }

  function showDuet(gap) {
    const pair = `Left: ${altFor(gap.oldest, theme)} Right: ${altFor(gap.newest, theme)}`;
    if (theme.side === 'b') {
      screenA.src = gap.oldest.imageUrl;
      screenB.src = gap.newest.imageUrl;
      screenB.hidden = false;
      screen.setAttribute('aria-label', `Two frames of NASA's visualization. ${pair}`);
    } else {
      globe.setDuet(true, gap.oldest, gap.newest);
      globeEl.setAttribute('aria-label', `Two planets. ${pair}`);
    }
    years.oldest.set(gap.oldest.big);
    years.newest.set(gap.newest.big);
    // the big dates are hidden from screen readers; they hear them here
    $('year-old-sr').textContent = `, ${gap.oldest.label}`;
    $('year-new-sr').textContent = `, ${gap.newest.label}`;
    $('gap-years').textContent = `${gap.oldest.short} → ${gap.newest.short}, ${gap.apart}`;
    $('gap-sentence').textContent = gap.sentence;
    const p = gap.physical;
    $('gap-physical').textContent =
      `${capitalize(p.label)}: ${p.from} → ${p.to} (${p.delta}).`
      + (p.activeLabel ? ` Share of ${p.activeLabel}: ${p.activeFrom} → ${p.activeTo}.` : '');
    $('gap-rows').replaceChildren(...gap.items.map((it) => {
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
    ticks.forEach((t) => t.classList.remove('is-current'));
  }

  function setListenMode(mode, help = '') {
    listen.select(mode);
    stage.dataset.listen = mode;
    $('listen-help').textContent = help;
  }

  // Meters are decorative (aria-hidden); levels arrive in dB.
  const meters = { oldest: $('duet-old-meter'), newest: $('duet-new-meter') };
  function setMeters({ oldest, newest }) {
    const h = (db) => Math.max(0, Math.min(1, (db + 54) / 48));
    meters.oldest.style.transform = `scaleY(${h(oldest)})`;
    meters.newest.style.transform = `scaleY(${h(newest)})`;
  }

  // In "Take turns", the side that is sounding brightens.
  function setTurn(side) {
    stage.dataset.turn = side;
  }

  return {
    setTheme, showFrame, setPlaying, beat, spark, setDuet, showDuet, setListenMode, setMeters, setTurn,
    stage, scrubber, playBtn, get theme() { return theme; },
  };
}

// A small ARIA radio group of buttons (roving tabindex, arrow keys).
export function createSegmented(container, options, onChange) {
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

// The big date ("2014", "21:20", "+6.2"): plain text, aria-hidden, since the
// full label is always in text elsewhere.
function bigDate(el) {
  el.setAttribute('aria-hidden', 'true');
  return { set(text) { el.textContent = String(text); } };
}

function defaultAlt(frame, theme) {
  return `${theme.name}, ${frame.label}`;
}
