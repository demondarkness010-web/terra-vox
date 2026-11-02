// The mixing desk: one channel strip per mapping rule, showing what goes in
// (a measured input, as a fader position) and the sound that comes out.
// Faders move on every bar, so you can watch the data play the music. In Duet
// each strip has two faders, blue for the oldest year and orange for the
// newest.
//
// Underneath, "Show the numbers" keeps the exact table: rule, input, output,
// and the measured value on its fixed range. Neither part is an aria-live
// region (they change every bar and would drown out a screen reader); the
// caption track announces the plain-English version.

import { mapFeatures, timePan, TENSE_FROM } from '../audio/sonify.js';
import { physicalShort, activeShare } from '../data/loader.js';
import { showNote } from '../audio/scales.js';

const panValue = (pan) => (pan + 1) / 2;
const panOf = (f, side, count) => (side === 'oldest' ? -1 : side === 'newest' ? 1 : timePan(f.index, count));

const STRIPS = [
  { key: 'pitch', sound: 'Pitch', from: 'how much', value: (f) => f.value01, out: (p) => showNote(p.note) },
  { key: 'velocity', sound: 'Loudness', from: 'how much', value: (f) => f.value01, out: (p) => p.velocity.toFixed(2) },
  { key: 'timbre', sound: 'Tone', from: 'how much', value: (f) => f.value01, out: (p) => p.timbre, marks: [0.33, 0.66] },
  { key: 'density', sound: 'Notes per bar', from: 'how widespread', value: (f) => f.activeShare01, out: (p) => String(p.notesPerBar) },
  { key: 'tempo', sound: 'Tempo', from: 'distance from the oldest', value: (f) => f.fromFirst01, out: (p) => `${p.tempoBPM} BPM` },
  { key: 'interval', sound: 'Harmony', from: 'distance from the oldest', value: (f) => f.fromFirst01, out: (p) => (p.interval.startsWith('minor') ? 'tense 3rd' : 'calm 5th'), marks: [TENSE_FROM] },
  { key: 'pan', sound: 'Stereo', from: 'time', knob: true, input: (f, n) => `${f.index + 1} of ${n}`, value: (f, p, side, n) => panValue(panOf(f, side, n)), out: (p, side, f, n) => panWord(panOf(f, side, n)) },
];

const ROWS = [
  { key: 'pitch', label: 'value01 → pitch', input: (f) => f.value01.toFixed(2), inputHint: (f) => physicalShort(f), output: (p) => showNote(p.note), outputHint: (p) => `scale degree ${p.scaleDegree + 1}/10, ${p.instrument}` },
  { key: 'velocity', label: 'value01 → velocity', input: (f) => f.value01.toFixed(2), output: (p) => p.velocity.toFixed(2), outputHint: () => '0.4 + 0.6 × value' },
  { key: 'timbre', label: 'value01 → timbre', input: (f) => f.value01.toFixed(2), output: (p) => p.timbre, outputHint: () => 'under 0.33 sine, under 0.66 triangle, else saw' },
  { key: 'density', label: 'activeShare01 → notesPerBar', input: (f) => f.activeShare01.toFixed(2), output: (p) => String(p.notesPerBar), outputHint: () => 'range 1–8' },
  { key: 'tempo', label: 'fromFirst01 → tempo', input: (f) => f.fromFirst01.toFixed(2), output: (p) => `${p.tempoBPM} BPM`, outputHint: () => '80 + 60 × distance' },
  { key: 'interval', label: 'fromFirst01 → interval', input: (f) => (f.fromFirst01 >= TENSE_FROM ? `≥ ${TENSE_FROM}` : `< ${TENSE_FROM}`), output: (p) => (p.interval.startsWith('minor') ? 'minor 3rd' : 'perfect 5th'), outputHint: (p) => (p.interval.startsWith('minor') ? 'tense' : 'consonant') },
  { key: 'pan', label: 'time → pan', input: (f, n) => `${f.index + 1} of ${n}`, output: (p, side, f, n) => panWord(panOf(f, side, n)), outputHint: (p, side) => (side ? 'Duet: hard pan' : 'the sweep: oldest left, newest right') },
];

// The measured value and where it sits on the theme's fixed range.
const RAW_ROWS = [
  ['value', 'measured value', (f) => physicalShort(f)],
  ['range', 'fixed range', (f, t) => t.sound?.rangeLabel ?? '—'],
  ['value01', 'value01 (place on that range)', (f) => f.value01.toFixed(3)],
  ['activeShare01', 'activeShare01', (f) => f.activeShare01.toFixed(3)],
  ['fromFirst01', 'fromFirst01', (f) => f.fromFirst01.toFixed(3)],
];

function panWord(pan) {
  if (Math.abs(pan) < 0.05) return 'centre';
  if (Math.abs(pan) >= 1) return `hard ${pan > 0 ? 'right' : 'left'}`;
  return `${Math.round(Math.abs(pan) * 100)}% ${pan > 0 ? 'right' : 'left'}`;
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
    const li = el('li', `channel channel-${s.key}`);
    const sound = el('p', 'channel-sound');
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
    const out = el('p', 'channel-out');
    const outs = { single: el('span', 'v single'), oldest: el('span', 'v old'), newest: el('span', 'v new') };
    out.append(outs.single, outs.oldest, outs.newest);
    const from = el('p', 'channel-in');
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
      ? 'Mapping for the oldest and newest frame: measured input, then the sound it produces'
      : 'Mapping for the frame now playing: measured input, then the sound it produces';
    const thead = el('thead');
    const hr = el('tr');
    (duet ? ['Rule', 'Oldest', 'Newest'] : ['Rule', 'Input', 'Sound']).forEach((c, i) => {
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
    note.textContent = `We sonify the measurement, not the picture of it: each value sits on a fixed range for its theme, never stretched to this record's own lowest and highest, so a small change sounds small.${duet ? ' The values below are for the newest frame.' : ''}`;
    const rawTable = el('table', 'raw-table');
    const rawCaption = el('caption', 'sr-only');
    rawCaption.textContent = 'The measured value, its fixed range, and the three numbers the sound follows';
    const rh = el('thead');
    rh.innerHTML = '<tr><th scope="col">Input</th><th scope="col">Value</th></tr>';
    const rb = el('tbody');
    RAW_ROWS.forEach(([key, label]) => {
      const tr = el('tr');
      const th = el('th');
      th.scope = 'row';
      th.textContent = label;
      const raw = el('td');
      tr.append(th, raw);
      rb.append(tr);
      cells.set(`raw:${key}`, raw);
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
    RAW_ROWS.forEach(([key, , text]) => setText(`raw:${key}`, text(frame, theme)));
  }

  function inputWords(s, f, n) {
    return s.input ? `from ${s.from}, ${s.input(f, n)}` : `from ${s.from} ${s.value(f).toFixed(2)}`;
  }

  /** Single mode: show the frame now sounding. */
  function showFrame(nextTheme, frame) {
    theme = nextTheme;
    if (mode !== 'single') build('single');
    const p = mapFeatures(frame);
    frameLine.textContent = `${theme.name}, ${frame.label}`;
    const share = activeShare(frame);
    physLine.textContent = `${capitalize(theme.physical.label)}: ${physicalShort(frame)}${share ? `, ${share.percent.toFixed(1)}% ${share.label}` : ''}`;
    const n = theme.frames.length;
    STRIPS.forEach((s) => {
      setStrip(s.key, 'single', s.value(frame, p, null, n), s.out(p, null, frame, n));
      strips.get(s.key).from.textContent = inputWords(s, frame, n);
    });
    ROWS.forEach((row) => {
      setText(`${row.key}:in`, row.input(frame, n), row.inputHint?.(frame));
      setText(`${row.key}:out`, row.output(p, null, frame, n), row.outputHint?.(p));
    });
    fillRaw(frame);
  }

  /** Duet mode: oldest and newest side by side. */
  function showDuet(nextTheme, oldest, newest) {
    theme = nextTheme;
    if (mode !== 'duet') build('duet');
    frameLine.textContent = `${theme.name}${theme.side === 'b' ? ', side B' : ''}: ${oldest.short} and ${newest.short}`;
    physLine.textContent = `${capitalize(theme.physical.label)}: ${physicalShort(oldest)} → ${physicalShort(newest)}`;
    const sides = { oldest: [oldest, mapFeatures(oldest)], newest: [newest, mapFeatures(newest)] };
    const n = theme.frames.length;
    STRIPS.forEach((s) => {
      Object.entries(sides).forEach(([side, [f, p]]) => setStrip(s.key, side, s.value(f, p, side, n), s.out(p, side, f, n)));
      strips.get(s.key).from.textContent = `from ${s.from}`;
    });
    ROWS.forEach((row) => {
      Object.entries(sides).forEach(([side, [f, p]]) => setText(`${row.key}:${side}`, `${row.input(f, n)} → ${row.output(p, side, f, n)}`));
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
