// Live mapping readout: the actual numbers driving the sound right now.
//
// Every row is one locked formula: the normalized feature that went in and
// the sound parameter that came out ("hue → pitch: 0.62 → G4"). Updates on
// each bar, so judges and listeners can check the sound against the data.
// A disclosure underneath shows the raw (un-normalized) measurement and the
// theme's historical min/max that normalization used.
//
// It is a plain table, deliberately not an aria-live region: it changes every
// bar and would drown out a screen reader. The live caption track announces
// the plain-English version instead; this table is there to inspect.

import { mapFeatures } from '../audio/sonify.js';
import { physicalShort, activeShare } from '../data/loader.js';

const ROWS = [
  {
    key: 'pitch', label: 'hue → pitch', feature: 'hue',
    input: (f) => (f.hue / 360).toFixed(2),
    inputHint: (f) => `${Math.round(f.hue)}° warmth`,
    output: (p) => p.note,
    outputHint: (p) => `scale degree ${p.scaleDegree + 1}/10`,
  },
  {
    key: 'velocity', label: 'brightness → velocity', feature: 'brightness',
    input: (f) => f.brightness.toFixed(2),
    output: (p) => p.velocity.toFixed(2),
    outputHint: () => 'loudness',
  },
  {
    key: 'timbre', label: 'variance → timbre', feature: 'colorVariance',
    input: (f) => f.colorVariance.toFixed(2),
    output: (p) => p.timbre,
    outputHint: () => '<.15 sine · <.35 tri · saw',
  },
  {
    key: 'density', label: 'density → notesPerBar', feature: 'pixelDensity',
    input: (f) => f.pixelDensity.toFixed(2),
    output: (p) => String(p.notesPerBar),
    outputHint: () => 'range 1–8',
  },
  {
    key: 'tempo', label: 'frameDelta → tempo', feature: 'frameDelta',
    input: (f) => f.frameDelta.toFixed(2),
    output: (p) => `${p.tempoBPM} BPM`,
    outputHint: () => 'range 80–160',
  },
  {
    key: 'interval', label: 'frameDelta → interval', feature: 'frameDelta',
    input: (f) => (f.frameDelta > 0.5 ? '> 0.5' : '≤ 0.5'),
    output: (p) => (p.interval.startsWith('minor') ? 'minor 3rd' : 'perfect 5th'),
    outputHint: (p) => (p.interval.startsWith('minor') ? 'tense' : 'consonant'),
  },
  {
    key: 'pan', label: 'latBand → pan', feature: 'latBand',
    input: (f) => f.latBand,
    output: (p, side) => panWord(side === 'oldest' ? -1 : side === 'newest' ? 1 : p.pan),
    outputHint: (p, side) => (side ? 'Duet: hard pan' : ''),
  },
];

const RAW_ROWS = [
  ['hue', 'hue (warmth °)', 1],
  ['brightness', 'brightness', 3],
  ['colorVariance', 'colour variance', 3],
  ['pixelDensity', 'active density', 3],
  ['frameDelta', 'frame delta', 4],
];

function panWord(pan) {
  if (pan === 0) return '0 centre';
  return `${pan > 0 ? '+' : '−'}${Math.abs(pan).toFixed(1)} ${pan > 0 ? 'right' : 'left'}`;
}

export function createMappingReadout(container) {
  let mode = null;
  let theme = null;
  const cells = new Map();

  function build(nextMode) {
    mode = nextMode;
    cells.clear();
    const duet = mode === 'duet';
    container.replaceChildren();

    const head = el('div', 'readout-head');
    const frameLine = el('p', 'readout-frame');
    const physLine = el('p', 'readout-physical');
    head.append(frameLine, physLine);
    cells.set('frame', frameLine);
    cells.set('physical', physLine);

    const table = el('table', `readout-table${duet ? ' is-duet' : ''}`);
    const caption = el('caption', 'sr-only');
    caption.textContent = duet
      ? 'Mapping for the oldest and newest frame: normalized feature, then the sound it produces'
      : 'Mapping for the frame now playing: normalized feature, then the sound it produces';
    const thead = el('thead');
    const hr = el('tr');
    const cols = duet ? ['Mapping', 'Oldest', 'Newest'] : ['Mapping', 'Feature', 'Sound'];
    cols.forEach((c, i) => {
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
      const sides = duet ? ['oldest', 'newest'] : ['single'];
      if (duet) {
        sides.forEach((side) => {
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

    const details = el('details', 'readout-raw');
    const summary = el('summary');
    summary.textContent = duet ? 'Raw values and normalization (newest frame)' : 'Raw values and normalization';
    const note = el('p', 'readout-note');
    note.textContent = 'Each feature is min–max scaled against this theme\'s own history, so every theme drives the formulas across the same 0–1 range.';
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
    details.append(summary, note, rawTable);

    container.append(head, table, details);
  }

  function setText(key, text, hint) {
    const cell = cells.get(key);
    if (!cell) return;
    const html = hint ? `<span class="v">${text}</span><span class="h">${hint}</span>` : `<span class="v">${text}</span>`;
    if (cell.dataset.v === `${text}|${hint ?? ''}`) return;
    cell.dataset.v = `${text}|${hint ?? ''}`;
    cell.innerHTML = html;
    cell.classList.remove('flash');
    void cell.offsetWidth;   // restart the highlight animation
    cell.classList.add('flash');
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

  /** Single mode: show the frame now sounding. */
  function showFrame(nextTheme, frame) {
    theme = nextTheme;
    if (mode !== 'single') build('single');
    const p = mapFeatures(frame);
    setText('frame', `${theme.name} · ${frame.label}`);
    const share = activeShare(frame);
    setText('physical', `${theme.physical.label}: ${physicalShort(frame)}`, share ? `${share.percent.toFixed(1)}% ${share.label}` : undefined);
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
    setText('frame', `${theme.name} · ${oldest.year} vs ${newest.year}`);
    setText('physical', `${theme.physical.label}: ${physicalShort(oldest)} → ${physicalShort(newest)}`);
    const sides = { oldest: [oldest, mapFeatures(oldest)], newest: [newest, mapFeatures(newest)] };
    ROWS.forEach((row) => {
      Object.entries(sides).forEach(([side, [f, p]]) => {
        setText(`${row.key}:${side}`, `${row.input(f)} → ${row.output(p, side)}`);
      });
    });
    fillRaw(newest);
  }

  /** Briefly mark which side just started a bar (Duet). */
  function pulse(side) {
    container.querySelectorAll(`.cell.${side === 'oldest' ? 'old' : 'new'}`).forEach((c) => {
      c.classList.remove('pulse');
      void c.offsetWidth;
      c.classList.add('pulse');
    });
  }

  return { showFrame, showDuet, pulse };
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
