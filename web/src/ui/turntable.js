// The stage: the globe, the rolling year, the transport and the groove
// timeline. View + input only; main.js owns playback state and audio.
//
// The scrubber is a native <input type="range"> laid over the groove, so
// arrow keys, Page Up/Down and Home/End work for free and screen readers
// announce it as a slider, with aria-valuetext like "Aug 08-15, 2014, frame
// 14 of 25". The groove under it draws every year's real value as a tick, so
// the timeline is also the theme's chart.

import { createGlobe } from './globe.js';
import { createOdometer } from './odometer.js';
import { physicalShort, activeShare } from '../data/loader.js';

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

  const globe = createGlobe(globeEl);
  const year = createOdometer($('year-single'));
  const years = { oldest: createOdometer($('year-old')), newest: createOdometer($('year-new')) };

  let theme = null;
  let ticks = [];

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
    $('scrub-start').textContent = theme.yearRange[0];
    $('scrub-end').textContent = theme.yearRange[1];
    stage.dataset.theme = theme.id;
    globe.setTheme(theme);

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

  function showFrame(index, { instant = false } = {}) {
    if (!theme) return;
    const frame = theme.frames[index];
    globe.showFrame(frame);
    globeEl.setAttribute('aria-label', altFor(frame, theme));
    year.set(frame.year, { instant });
    frameLabel.textContent = frame.label;
    nowValue.textContent = `${capitalize(theme.physical.label)}: ${physicalShort(frame)}`;
    const share = activeShare(frame);
    nowShare.textContent = share ? `${share.percent < 10 ? share.percent.toFixed(1) : Math.round(share.percent)}% ${share.label}` : '';
    scrubber.value = String(index);
    scrubber.setAttribute('aria-valuetext', `${frame.label}, frame ${index + 1} of ${theme.frames.length}`);
    ticks.forEach((t, i) => t.classList.toggle('is-current', i === index));
  }

  function setPlaying(playing) {
    root.classList.toggle('is-playing', playing);
    globe.setPlaying(playing);
    const what = stage.dataset.mode === 'duet' ? ' duet' : '';
    playBtn.setAttribute('aria-label', playing ? `Pause${what}` : `Play${what}`);
    playBtn.title = playing ? 'Pause (Space)' : 'Play (Space)';
  }

  // A bar was heard: the play ring pulses and the year's width follows its tempo.
  function beat(side, params) {
    globe.setTempo(side, params.tempoBPM);
    (side === 'single' ? year : years[side]).stretch(params.tempoBPM);
    playBtn.classList.remove('is-beat');
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
    if (!on) globe.setDuet(false);
  }

  function showDuet(gap) {
    globe.setDuet(true, gap.oldest, gap.newest);
    globeEl.setAttribute('aria-label', `Two planets. Left: ${altFor(gap.oldest, theme)} Right: ${altFor(gap.newest, theme)}`);
    years.oldest.set(gap.oldest.year, { instant: true });
    years.newest.set(gap.newest.year, { instant: true });
    years.oldest.stretch(gap.pa.tempoBPM);
    years.newest.stretch(gap.pb.tempoBPM);
    $('gap-years').textContent = `${gap.oldest.year} → ${gap.newest.year}, ${gap.years} years apart`;
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
