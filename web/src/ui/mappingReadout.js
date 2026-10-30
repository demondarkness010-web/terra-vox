// The mixing desk: one channel strip per locked formula, showing what goes in
// (a normalized feature, as a fader position) and the sound that comes out.
// Faders move on every bar, so you can watch the data play the music. In Duet
// each strip has two faders, blue for the oldest year and orange for the
// newest.
//
// Underneath, "Show the numbers" keeps the exact table: formula, normalized
// input, output, raw measurement and the theme's normalization range. Neither
// part is an aria-live region (they change every bar and would drown out a
// screen reader); the caption track announces the plain-English version.

import { mapFeatures } from '../audio/sonify.js';
import { physicalShort, activeShare } from '../data/loader.js';

const flat = (note) => note.replace(/([A-G])b/, '$1♭');
const panValue = (pan) => (pan + 1) / 2;

const STRIPS = [
  { key: 'pitch', sound: 'Pitch', from: 'warmth', value: (f) => f.hue / 360, out: (p) => flat(p.note) },
  { key: 'velocity', sound: 'Loudness', from: 'brightness', value: (f) => f.brightness, out: (p) => p.velocity.toFixed(2) },
  { key: 'timbre', sound: 'Tone', from: 'colour variety', value: (f) => f.colorVariance, out: (p) => p.timbre, marks: [0.15, 0.35] },
  { key: 'density', sound: 'Notes per bar', from: 'active area', value: (f) => f.pixelDensity, out: (p) => String(p.notesPerBar) },
  { key: 'tempo', sound: 'Tempo', from: 'year-on-year change', value: (f) => f.frameDelta, out: (p) => `${p.tempoBPM} BPM` },
  { key: 'interval', sound: 'Harmony', from: 'year-on-year change', value: (f) => f.frameDelta, out: (p) => (p.interval.startsWith('minor') ? 'tense 3rd' : 'calm 5th'), marks: [0.5] },
  { key: 'pan', sound: 'Stereo', from: 'latitude', knob: true, input: (f) => f.latBand, value: (f, p, side) => panValue(side === 'oldest' ? -1 : side === 'newest' ? 1 : p.pan), out: (p, side) => panWord(side === 'oldest' ? -1 : side === 'newest' ? 1 : p.pan) },
];

const ROWS = [
  { key: 'pitch', label: 'hue → pitch', input: (f) => (f.hue / 360).toFixed(2), inputHint: (f) => `${Math.round(f.hue)}° warmth`, output: (p) => p.note, outputHint: (p) => `scale degree ${p.scaleDegree + 1}/10` },
  { key: 'velocity', label: 'brightness → velocity', input: (f) => f.brightness.toFixed(2), output: (p) => p.velocity.toFixed(2), outputHint: () => 'loudness' },
  { key: 'timbre', label: 'variance → timbre', input: (f) => f.colorVariance.toFixed(2), output: (p) => p.timbre, outputHint: () => '<.15 sine · <.35 tri · saw' },
  { key: 'density', label: 'density → notesPerBar', input: (f) => f.pixelDensity.toFixed(2), output: (p) => String(p.notesPerBar), outputHint: () => 'range 1–8' },
  { key: 'tempo', label: 'frameDelta → tempo', input: (f) => f.frameDelta.toFixed(2), output: (p) => `${p.tempoBPM} BPM`, outputHint: () => 'range 80–160' },
  { key: 'interval', label: 'frameDelta → interval', input: (f) => (f.frameDelta > 0.5 ? '> 0.5' : '≤ 0.5'), output: (p) => (p.interval.startsWith('minor') ? 'minor 3rd' : 'perfect 5th'), outputHint: (p) => (p.interval.startsWith('minor') ? 'tense' : 'consonant') },
  { key: 'pan', label: 'latBand → pan', input: (f) => f.latBand, output: (p, side) => panWord(side === 'oldest' ? -1 : side === 'newest' ? 1 : p.pan), outputHint: (p, side) => (side ? 'Duet: hard pan' : '') },
];

const RAW_ROWS = [
  ['hue', 'hue (warmth °)', 1],
  ['brightness', 'brightness', 3],
  ['colorVariance', 'colour variance', 3],
  ['pixelDensity', 'active density', 3],
  ['frameDelta', 'frame delta', 4],
];

function panWord(pan) {
  if (pan === 0) return 'centre';
  return `${Math.abs(pan) >= 1 ? 'hard ' : ''}${pan > 0 ? 'right' : 'left'}`;
}

export function createMappingReadout(container) {
  let mode = null;
  let theme = null;
  const cells = new Map();
  const strips = new Map();

  // ---------------------------------------------------------- the desk

  const head = el('div', 'desk-head');
  const frameLine = el('p', 'desk-frame');
  const physLine = el('p', 'desk-physical');
  head.append(frameLine, physLine);

  const board = el('ul', 'desk-board');
  STRIPS.forEach((s) => {
    const li = el('li', `strip strip-${s.key}`);
    const sound = el('p', 'strip-sound');
    sound.textContent = s.sound;
    const ctl = el('div', s.knob ? 'knob' : 'fader');
    ctl.setAttribute('aria-hidden', 'true');
    (s.marks ?? []).forEach((m) => {
      const mark = el('span', 'mark');
      mark.style.setProperty('--m', m);
      ctl.append(mark);
    });
    const caps = { single: el('i', 'cap single'), oldest: el('i', 'cap old'), newest: el('i', 'cap new') };
    ctl.append(caps.single, caps.oldest, caps.newest);
    const out = el('p', 'strip-out');
    const outs = { single: el('span', 'v single'), oldest: el('span', 'v old'), newest: el('span', 'v new') };
    out.append(outs.single, outs.oldest, outs.newest);
    const from = el('p', 'strip-in');
    li.append(sound, ctl, out, from);
    board.append(li);
    strips.set(s.key, { li, caps, outs, from });
  });

  const details = el('details', 'numbers');
  const summary = el('summary');
  summary.textContent = 'Show the numbers';
  const tableHost = el('div', 'numbers-body');
  details.append(summary, tableHost);
  container.replaceChildren(head, board, details);

  function setStrip(key, side, value, text) {
    const s = strips.get(key);
    s.caps[side].style.setProperty('--v', Math.max(0, Math.min(1, value)).toFixed(3));
    if (s.outs[side].textContent !== text) s.outs[side].textContent = text;
  }

  // ---------------------------------------------------------- the exact table

  function build(nextMode) {
    mode = nextMode;
    cells.clear();
    const duet = mode === 'duet';
    container.dataset.mode = mode;

    const table = el('table', `readout-table${duet ? ' is-duet' : ''}`);
    const caption = el('caption', 'sr-only');
    caption.textContent = duet
      ? 'Mapping for the oldest and newest frame: normalized feature, then the sound it produces'
      : 'Mapping for the frame now playing: normalized feature, then the sound it produces';
    const thead = el('thead');
    const hr = el('tr');
    (duet ? ['Formula', 'Oldest', 'Newest'] : ['Formula', 'Feature', 'Sound']).forEach((c, i) => {
      const th = el('th');
      th.scope = 'col';
      th.textContent = c;
      if (duet && i === 1) th.className = 'old';
      if (duet && i === 2) th.className = 'new';
      hr.append(th);
    });
    thead.append(hr);

    const tbody = el('tbody');
    ROWS.forEach((row) => {
      const tr = el('tr');
      const th = el('th');
      th.scope = 'row';
      th.innerHTML = `<code>${row.label.replace(' → ', '</code> → <code>')}</code>`;
      tr.append(th);
      if (duet) {
        ['oldest', 'newest'].forEach((side) => {
          const td = el('td', `cell ${side === 'oldest' ? 'old' : 'new'}`);
          tr.append(td);
          cells.set(`${row.key}:${side}`, td);
        });
      } else {
        const tdIn = el('td', 'cell in');
        const tdOut = el('td', 'cell out');
        tr.append(tdIn, tdOut);
        cells.set(`${row.key}:in`, tdIn);
        cells.set(`${row.key}:out`, tdOut);
      }
      tbody.append(tr);
    });
    table.append(caption, thead, tbody);

    const note = el('p', 'readout-note');
    note.textContent = `Each feature is min–max scaled against this theme's own history, so every theme drives the formulas across the same 0–1 range.${duet ? ' Raw values below are for the newest frame.' : ''}`;
    const rawTable = el('table', 'raw-table');
    const rawCaption = el('caption', 'sr-only');
    rawCaption.textContent = 'Raw measurement, theme range, and normalized value for each feature';
    const rh = el('thead');
    rh.innerHTML = '<tr><th scope="col">Feature</th><th scope="col">Raw</th><th scope="col">Theme min–max</th><th scope="col">Normalized</th></tr>';
    const rb = el('tbody');
    RAW_ROWS.forEach(([key, label]) => {
      const tr = el('tr');
      const th = el('th');
      th.scope = 'row';
      th.textContent = label;
      const raw = el('td');
      const range = el('td');
      const norm = el('td');
      tr.append(th, raw, range, norm);
      rb.append(tr);
      cells.set(`raw:${key}`, raw);
      cells.set(`range:${key}`, range);
      cells.set(`norm:${key}`, norm);
    });
    rawTable.append(rawCaption, rh, rb);
    tableHost.replaceChildren(table, note, rawTable);
  }

  function setText(key, text, hint) {
    const cell = cells.get(key);
    if (!cell) return;
    const id = `${text}|${hint ?? ''}`;
    if (cell.dataset.v === id) return;
    cell.dataset.v = id;
    cell.innerHTML = hint ? `<span class="v">${text}</span><span class="h">${hint}</span>` : `<span class="v">${text}</span>`;
  }

  function fillRaw(frame) {
    RAW_ROWS.forEach(([key, , digits]) => {
      const r = theme.normalization[key];
      const norm = key === 'hue' ? frame.hue / 360 : frame[key];
      setText(`raw:${key}`, frame.raw[key].toFixed(digits));
      setText(`range:${key}`, `${r.min.toFixed(digits)}–${r.max.toFixed(digits)}`);
      setText(`norm:${key}`, norm.toFixed(2));
    });
  }

  function inputWords(s, f) {
    return s.input ? `from ${s.input(f)}` : `from ${s.from} ${s.value(f).toFixed(2)}`;
  }

  /** Single mode: show the frame now sounding. */
  function showFrame(nextTheme, frame) {
    theme = nextTheme;
    if (mode !== 'single') build('single');
    const p = mapFeatures(frame);
    frameLine.textContent = `${theme.name} · ${frame.label}`;
    const share = activeShare(frame);
    physLine.textContent = `${capitalize(theme.physical.label)}: ${physicalShort(frame)}${share ? ` · ${share.percent.toFixed(1)}% ${share.label}` : ''}`;
    STRIPS.forEach((s) => {
      setStrip(s.key, 'single', s.value(frame, p), s.out(p));
      strips.get(s.key).from.textContent = inputWords(s, frame);
    });
    ROWS.forEach((row) => {
      setText(`${row.key}:in`, row.input(frame), row.inputHint?.(frame));
      setText(`${row.key}:out`, row.output(p), row.outputHint?.(p));
    });
    fillRaw(frame);
  }

  /** Duet mode: oldest and newest side by side. */
  function showDuet(nextTheme, oldest, newest) {
    theme = nextTheme;
    if (mode !== 'duet') build('duet');
    frameLine.textContent = `${theme.name} · ${oldest.year} and ${newest.year}`;
    physLine.textContent = `${capitalize(theme.physical.label)}: ${physicalShort(oldest)} → ${physicalShort(newest)}`;
    const sides = { oldest: [oldest, mapFeatures(oldest)], newest: [newest, mapFeatures(newest)] };
    STRIPS.forEach((s) => {
      Object.entries(sides).forEach(([side, [f, p]]) => setStrip(s.key, side, s.value(f, p, side), s.out(p, side)));
      strips.get(s.key).from.textContent = `from ${s.from}`;
    });
    ROWS.forEach((row) => {
      Object.entries(sides).forEach(([side, [f, p]]) => setText(`${row.key}:${side}`, `${row.input(f)} → ${row.output(p, side)}`));
    });
    fillRaw(newest);
  }

  /** Briefly mark which side just started a bar (Duet). */
  function pulse(side) {
    board.querySelectorAll(`.cap.${side === 'oldest' ? 'old' : 'new'}`).forEach((c) => {
      c.classList.remove('is-pulse');
      void c.offsetWidth;
      c.classList.add('is-pulse');
    });
  }

  return { showFrame, showDuet, pulse };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
