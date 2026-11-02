// The field guide: the science behind whatever is playing.
//
// For the current theme it shows the official record scientists cite (NOAA
// methane, NOAA satellite sea level, regional OMI NO2) with the frames this
// app plays drawn on top, so a listener can check that what they hear tracks
// the real record. The year that is sounding is marked on the chart in time
// with the music. Below: three checked facts with their sources, the
// satellites that made the data, the caveats, and every source link.
//
// Everything here is ordinary text and tables. The chart is an SVG with a
// one-paragraph text summary and the full numbers in a table.
//
// Marks take tones, never colours (DESIGN.md: no third accent hue): `ink`
// for the frames this app plays, `muted` for the official record, `quiet`
// dashed for a reference, `edge` for bars at rest. The signal pair appears
// only where it means what it always means: in Duet, the oldest frame is
// ringed in blue and the newest in orange. Tones map to CSS tokens in main.css.

import { reference, context } from '../data/loader.js';

const SVGNS = 'http://www.w3.org/2000/svg';

const fmt = (v, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v, d = 1) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), d)}`;
const when = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

// ------------------------------------------------------------ chart specs

function greenhouseSpec(theme) {
  const ref = reference?.greenhouse_gases;
  const airs = theme.frames.map((f) => ({ x: f.year, y: f.physical.value, frame: f.index }));
  const series = [];
  if (ref) series.push({ id: 'noaa', name: 'NOAA surface network', end: 'NOAA, surface', tone: 'muted', kind: 'line', points: ref.series.map((p) => ({ x: p.year, y: p.value })) });
  series.push({ id: 'app', name: 'AIRS frames in this app (400 hPa, about 7 km up)', end: 'AIRS, 7 km up (this app)', tone: 'ink', kind: 'dots', points: airs, playing: true });
  const a = airs[0];
  const b = airs[airs.length - 1];
  let summary = `The AIRS frames this app plays rose from ${fmt(a.y)} ppb in ${a.x} to ${fmt(b.y)} ppb in ${b.x}.`;
  if (ref) {
    const s = ref.series;
    const r03 = s.find((p) => p.year === a.x);
    const last = s[s.length - 1];
    summary = `NOAA's global surface record rose from ${fmt(s[0].value, 1)} ppb in ${s[0].year} to ${fmt(last.value, 1)} ppb in ${last.year}`
      + (r03 ? `, up ${fmt(last.value - r03.value, 0)} ppb since ${a.x}. ` : '. ')
      + summary + ' Methane thins with height, so the satellite line sits lower, but both climb together.';
  }
  return {
    title: 'Methane: the satellite frames against the surface record',
    yLabel: 'ppb', yFormat: (v) => fmt(v), series, summary,
    note: ref ? `NOAA growth in ${ref.growth.at(-1).year}: ${fmt(ref.growth.at(-1).value, 2)} ppb (preliminary; record ${fmt(Math.max(...ref.growth.map((g) => g.value)), 2)} ppb in ${ref.growth.reduce((m, g) => (g.value > m.value ? g : m)).year}). Latest month: ${fmt(ref.latestMonth.value, 1)} ppb (${monthName(ref.latestMonth.month)} ${ref.latestMonth.year}).` : null,
    sources: ref ? [{ name: `NOAA GML, ${ref.source.fileCreated ? `file of ${ref.source.fileCreated.replace(/\s+\d\d:\d\d:\d\d/, '')}` : 'annual means'}`, url: ref.source.page }] : [],
    table: tableFrom(series, 'Year', 'ppb', 1),
  };
}

function seaLevelSpec(theme) {
  const ref = reference?.sea_level;
  const base = theme.frames.find((f) => f.year === 1993) ?? theme.frames[0];
  const app = theme.frames.map((f) => ({ x: f.year, y: f.physical.value - base.physical.value, frame: f.index }));
  const series = [];
  let summary = '';
  if (ref) {
    const full = ref.series.filter((p) => !p.partial);
    const b0 = full.find((p) => p.year === 1993) ?? full[0];
    series.push({ id: 'noaa', name: 'NOAA satellite record, global mean', end: 'Global mean, NOAA', tone: 'muted', kind: 'line', points: full.map((p) => ({ x: p.year, y: (p.value - b0.value) / 10 })) });
    const last = full[full.length - 1];
    summary = `The official satellite record rose ${fmt((last.value - b0.value) / 10, 1)} cm from 1993 to ${last.year}, a trend of ${fmt(ref.trendMmPerYear, 1)} mm a year that is still speeding up (about ${fmt(ref.accelerationMmPerYear2, 2)} mm a year, every year). `;
  }
  series.push({ id: 'app', name: "This app's October frames (mean sea surface height, set to 0 in 1993)", end: 'October frames, this app', tone: 'ink', kind: 'dots', points: app, playing: true });
  const a = app.find((p) => p.x === 1993) ?? app[0];
  const b = app[app.length - 1];
  summary += `This app's frames, single October snapshots, rose ${fmt(b.y - a.y, 1)} cm from 1993 to ${b.x} and wobble with El Niño; NASA's gridded layer stops in 2018.`;
  return {
    title: 'Sea level: the frames against the global record',
    yLabel: 'cm vs 1993', yFormat: (v) => signed(v, 0), series, summary,
    note: ref ? `Both start at zero in 1993. Satellites: ${ref.missions.map((m) => m.name.replace('-', '‑')).join(', ')}.` : null,
    sources: ref ? [{ name: 'NOAA Laboratory for Satellite Altimetry', url: ref.source.page }] : [],
    table: tableFrom(series, 'Year', 'cm', 1),
  };
}

function airQualitySpec() {
  const ref = reference?.air_quality;
  if (!ref) return null;
  const line = (r, extra) => ({ id: r.id, name: r.name, kind: 'line', points: r.series.map((p) => ({ x: p.year, y: p.value })), ...extra });
  const by = Object.fromEntries(ref.regions.map((r) => [r.id, r]));
  const g = by.global;
  const regions = ref.regions.filter((r) => r.id !== 'global');
  // One March swings with the weather (cloud, snow, wind), so each end of
  // the record is a three-year average rather than a single year.
  const ends = (r) => {
    const v = r.series.map((p) => p.value);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const a = mean(v.slice(0, 3));
    const b = mean(v.slice(-3));
    const yr = (i) => r.series.at(i).year;
    return { pct: ((b - a) / a) * 100, from: `${yr(0)}–${String(yr(2)).slice(2)}`, to: `${yr(-3)}–${String(yr(-1)).slice(2)}` };
  };
  const change = Object.fromEntries(ref.regions.map((r) => [r.id, ends(r)]));
  const span = change[regions[0]?.id];
  // Small multiples: one panel per region with the whole-globe mean dashed
  // behind it, all on one scale, so the divergence reads without colour.
  const multiples = regions.map((r) => ({
    title: r.name,
    sub: `${signed(change[r.id].pct, 0)}%, ${change[r.id].from} to ${change[r.id].to}`,
    series: [
      ...(g ? [line(g, { tone: 'quiet', ref: true, width: 1.5 })] : []),
      line(r, { tone: 'ink', width: 2.5, playing: true }),
    ],
  }));
  const moved = (id) => `${change[id].pct < 0 ? 'fell' : 'rose'} ${fmt(Math.abs(change[id].pct), 0)}%`;
  const parts = [];
  if (by.eastern_us) parts.push(`the eastern US ${moved('eastern_us')}`);
  if (by.western_europe) parts.push(`western Europe ${moved('western_europe')}`);
  if (by.north_china) {
    const nc = by.north_china;
    // China's NO2 peaked around 2011 and fell after the 2013 clean-air plan.
    parts.push(nc.peak && nc.peak.year !== nc.last.year && nc.fromPeakPct < -25
      ? `the North China Plain peaked in ${nc.peak.year} and has dropped ${fmt(Math.abs(nc.fromPeakPct), 0)}% since`
      : `the North China Plain ${moved('north_china')}`);
  }
  if (by.northern_india) parts.push(`northern India ${moved('northern_india')}`);
  const summary = `March NO₂ from NASA's OMI, comparing ${span.from} with ${span.to}: ${parts.join(', ')}. `
    + (g ? `The whole-globe average moved only ${signed(change.global.pct, 0)}%, because the regional changes cancel out. That is why side A, which plays the global picture, sounds calmer rather than dirtier.` : '');
  const all = ref.regions.map((r) => line(r, {}));
  return {
    title: 'Air quality: regions moved apart while the globe stood still',
    yLabel: '×10¹⁵ molec/cm²', yFormat: (v) => fmt(v, v < 10 ? 1 : 0), multiples, summary,
    key: [
      { name: 'The region', tone: 'ink', kind: 'line' },
      ...(g ? [{ name: 'Whole-globe mean, the same in every panel', tone: 'quiet', kind: 'line', ref: true }] : []),
    ],
    series: all,
    note: "Derived by Terra Vox from NASA's OMI layer: every day of March, cos-latitude weighted, gaps skipped, each end a three-year average. Not an official NASA product; the palette saturates over the dirtiest cities, so peaks read low.",
    sources: [{ name: 'NASA OMI via GIBS, March means computed by Terra Vox', url: ref.source.page }],
    table: tableFrom(all, 'Year', '×10¹⁵', 2),
  };
}

function wildfireSpec(theme) {
  const bars = theme.frames.map((f) => ({ x: f.year, y: f.physical.value, frame: f.index }));
  const a = bars[0];
  const b = bars[bars.length - 1];
  const peak = bars.reduce((m, p) => (p.y > m.y ? p : m));
  const low = bars.reduce((m, p) => (p.y < m.y ? p : m));
  return {
    title: 'Wildfires: how much of the map was burning, every August 8–15',
    yLabel: '% of map', yFormat: (v) => `${fmt(v, 0)}%`,
    series: [{ id: 'app', name: 'MODIS Terra fire detections in this app (% of map)', tone: 'edge', kind: 'bars', points: bars, playing: true }],
    summary: `Fire pixels covered ${fmt(a.y, 1)}% of the map in ${a.x} and ${fmt(b.y, 1)}% in ${b.x}; the busiest window was ${peak.x} (${fmt(peak.y, 1)}%) and the quietest ${low.x} (${fmt(low.y, 1)}%). `
      + 'Counting detections misses intensity: studies of the same MODIS record find fewer fires overall but more extreme ones (see the facts).',
    note: 'No official global fire series matches an 8-day August snapshot, so this chart shows the frames themselves.',
    sources: [],
    table: tableFrom([{ name: 'Fire detections (% of map)', points: bars }], 'Year', '%', 2),
  };
}

function sideBSpec(track) {
  const pts = track.frames.map((f) => ({ x: f.index, y: f.physical.value, frame: f.index, label: f.short }));
  const a = pts[0];
  const b = pts[pts.length - 1];
  const hi = pts.reduce((m, p) => (p.y > m.y ? p : m));
  const lo = pts.reduce((m, p) => (p.y < m.y ? p : m));
  const unit = track.physical.units === 'x10^15 molecules/cm2' ? '×10¹⁵ molec/cm²' : track.physical.units;
  const v = (y) => `${fmt(y, Math.abs(y) < 10 ? 2 : 1)} ${unit}`;
  return {
    title: `Side B: ${track.physical.label} in each frame of NASA's visualization`,
    yLabel: unit, yFormat: (y) => fmt(y, Math.abs(y) < 10 ? 1 : 0),
    xLabels: (x) => track.frames[x]?.short ?? '',
    series: [{ id: 'app', name: `${track.physical.label}, measured from the frame's pixels`, tone: 'ink', kind: 'line', dots: true, points: pts, playing: true }],
    summary: `Measured from the pixels of NASA's "${track.title}": ${v(a.y)} at ${a.label}, ${v(b.y)} at ${b.label}; highest ${v(hi.y)} at ${hi.label}, lowest ${v(lo.y)} at ${lo.label}.`,
    note: `Read straight from the picture (rule: ${track.activeRule}). Each point is one frame the jukebox plays.`,
    sources: [{ name: `NASA SVS ${track.svs}: ${track.title}`, url: track.page }],
    table: tableFrom([{ name: track.physical.label, points: pts.map((p) => ({ x: p.label, y: p.y })) }], 'Frame', unit, 2),
  };
}

function tableFrom(series, xName, unit, digits) {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))];
  if (typeof xs[0] === 'number') xs.sort((a, b) => a - b);
  return {
    head: [xName, ...series.map((s) => `${s.name}${unit ? ` (${unit})` : ''}`)],
    rows: xs.map((x) => [x, ...series.map((s) => {
      const p = s.points.find((q) => q.x === x);
      return p ? fmt(p.y, digits) : '–';
    })]),
  };
}

function monthName(m) {
  return new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}

// ------------------------------------------------------------ chart drawing

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

function niceTicks(lo, hi, count = 5) {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * Draw one chart into `host`. `mark` is { now: x } for the frame sounding, or
 * { oldest: x, newest: x } in Duet. opts.domain shares a y range between
 * small multiples; opts.compact draws a short panel without end labels.
 */
function drawChart(host, spec, mark = {}, opts = {}) {
  const width = Math.max(240, host.clientWidth);
  const narrow = width < 620;
  const hasEnd = !narrow && !opts.compact && spec.series.some((s) => s.end);
  const m = { t: 22, r: hasEnd ? 196 : 16, b: 36, l: 58 };
  const height = opts.compact ? 190 : narrow ? 250 : 310;
  const all = spec.series.flatMap((s) => s.points);
  const xs = all.map((p) => p.x);
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const bars = spec.series.some((s) => s.kind === 'bars');
  if (bars) { x0 -= 0.6; x1 += 0.6; }
  let [y0, y1] = opts.domain ?? [Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y))];
  const pad = (y1 - y0) * 0.08 || 1;
  y0 = bars ? 0 : y0 - pad;
  y1 += pad;
  const X = (x) => m.l + ((x - x0) / (x1 - x0 || 1)) * (width - m.l - m.r);
  const Y = (y) => m.t + (1 - (y - y0) / (y1 - y0 || 1)) * (height - m.t - m.b);

  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart-svg', 'aria-hidden': 'true', focusable: 'false' });
  const grid = el('g', { class: 'grid' }, svg);
  for (const t of niceTicks(y0, y1, opts.compact ? 3 : narrow ? 4 : 5)) {
    el('line', { x1: m.l, x2: width - m.r, y1: Y(t), y2: Y(t) }, grid);
    el('text', { x: m.l - 10, y: Y(t), class: 'tick y', 'dominant-baseline': 'middle', 'text-anchor': 'end' }, grid).textContent = spec.yFormat(t);
  }
  const xTicks = spec.xLabels
    ? niceTicks(x0, x1, narrow ? 3 : 6).filter((t) => Number.isInteger(t))
    : niceTicks(Math.ceil(x0), Math.floor(x1), opts.compact || narrow ? 4 : 8).filter((t) => Number.isInteger(t));
  for (const t of xTicks) {
    el('text', { x: X(t), y: height - 10, class: 'tick x', 'text-anchor': 'middle' }, grid).textContent = spec.xLabels ? spec.xLabels(t) : t;
  }
  el('text', { x: m.l, y: 12, class: 'axis-label' }, grid).textContent = spec.yLabel;

  // the frame sounding now: a rule under the data
  if (mark.now != null && mark.now >= x0 && mark.now <= x1) {
    el('line', { x1: X(mark.now), x2: X(mark.now), y1: m.t, y2: height - m.b, class: 'now-rule' }, svg);
  }
  const anchorTone = (x) => (x === mark.oldest ? 't-old' : x === mark.newest ? 't-new' : null);

  const endLabels = [];
  for (const s of spec.series) {
    const g = el('g', { class: `series ${s.kind}` }, svg);
    if (s.kind === 'bars') {
      const w = Math.max(2, ((width - m.l - m.r) / (x1 - x0)) * 0.72);
      for (const p of s.points) {
        const tone = (s.playing && anchorTone(p.x)) || (s.playing && p.x === mark.now ? 't-ink' : `t-${s.tone}`);
        const top = Y(p.y);
        const h = Math.max(0, Y(0) - top);
        const r = Math.min(4, w / 2, h);
        // square bottom, 4px top corners, like the timeline groove
        el('path', { class: tone, d: `M${X(p.x) - w / 2},${Y(0)}V${top + r}q0,${-r} ${r},${-r}h${w - 2 * r}q${r},0 ${r},${r}V${Y(0)}Z` }, g);
      }
    } else {
      if (s.kind === 'line') {
        el('path', { class: `t-${s.tone}${s.ref ? ' ref' : ''}`, d: s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(''),
          'stroke-width': s.width ?? 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
      }
      if (s.kind === 'dots' || s.dots) {
        for (const p of s.points) el('circle', { class: `t-${s.tone}`, cx: X(p.x), cy: Y(p.y), r: s.kind === 'dots' ? 4 : 2.5 }, g);
      }
      if (s.playing) {
        for (const x of [mark.now, mark.oldest, mark.newest]) {
          const hit = x != null && s.points.find((p) => p.x === x);
          if (hit) el('circle', { cx: X(hit.x), cy: Y(hit.y), r: 9, class: `now-ring ${anchorTone(x) ?? 't-ink'}` }, svg);
        }
      }
    }
    if (hasEnd && s.end) {
      const lastPoint = s.points[s.points.length - 1];
      endLabels.push({ y: Y(lastPoint.y), text: s.end, tone: s.tone === 'edge' ? 'muted' : s.tone });
    }
  }
  // end labels, nudged apart so none overlap
  endLabels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) endLabels[i].y = Math.max(endLabels[i].y, endLabels[i - 1].y + 18);
  const over = endLabels.length ? endLabels[endLabels.length - 1].y - (height - m.b) : 0;
  if (over > 0) endLabels.forEach((l) => { l.y -= over; });
  for (const l of endLabels) {
    el('text', { x: width - m.r + 12, y: l.y, class: `end-label t-${l.tone}`, 'dominant-baseline': 'middle' }, svg).textContent = l.text;
  }
  host.replaceChildren(svg);
}

/** Small multiples: one compact panel per region on a shared scale. */
function drawMultiples(host, spec, mark) {
  const ys = spec.multiples.flatMap((p) => p.series.flatMap((s) => s.points.map((q) => q.y)));
  const domain = [Math.min(...ys), Math.max(...ys)];
  const grid = document.createElement('div');
  grid.className = 'multiples';
  const panels = spec.multiples.map((p) => {
    const box = document.createElement('div');
    box.className = 'multiple';
    const h = document.createElement('h4');
    h.textContent = p.title;
    const sub = document.createElement('p');
    sub.textContent = p.sub;
    const plot = document.createElement('div');
    box.append(h, sub, plot);
    grid.append(box);
    return { plot, spec: { ...spec, series: p.series } };
  });
  host.replaceChildren(grid);
  panels.forEach(({ plot, spec: one }) => drawChart(plot, one, mark, { compact: true, domain }));
}

function draw(host, spec, mark) {
  if (spec.multiples) drawMultiples(host, spec, mark);
  else drawChart(host, spec, mark);
}

// ------------------------------------------------------------ the guide

export function createFieldGuide(root) {
  const $ = (sel) => root.querySelector(sel);
  const lead = $('.guide-lead');
  const measures = $('.guide-measures span');
  const chartTitle = $('.chart-title');
  const chartHost = $('.chart');
  const chartKey = $('.chart-key');
  const chartSummary = $('.chart-summary');
  const chartNote = $('.chart-note');
  const chartTable = $('.chart-table');
  const facts = $('.facts');
  const sats = $('.sat-list');
  const caveats = $('.caveat-list');
  const sideB = $('.side-b-card');
  const sources = $('.source-list');

  let spec = null;
  let mark = {};
  let track = null;

  // Redraw on width changes only; the chart's own height must not loop it.
  let lastWidth = 0;
  const ro = new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    if (!spec || w === lastWidth) return;
    lastWidth = w;
    draw(chartHost, spec, mark);
  });
  ro.observe(chartHost);

  function setTrack(next, sideBTrack) {
    track = next;
    const themeId = next.parent;
    const ctx = context?.themes?.[themeId];
    lead.textContent = ctx?.lead ?? '';
    measures.textContent = next.side === 'b'
      ? `${next.dataset}. Terra Vox measures ${next.physical.label} from each frame.`
      : ctx?.measures ?? '';

    spec = next.side === 'b' ? sideBSpec(next)
      : themeId === 'greenhouse_gases' ? greenhouseSpec(next)
      : themeId === 'sea_level' ? seaLevelSpec(next)
      : themeId === 'air_quality' ? airQualitySpec(next)
      : wildfireSpec(next);
    root.querySelector('.chart-card').hidden = !spec;
    if (spec) {
      chartTitle.textContent = spec.title;
      chartHost.setAttribute('aria-label', spec.summary);
      chartSummary.textContent = spec.summary;
      chartNote.textContent = spec.note ?? '';
      chartNote.hidden = !spec.note;
      chartKey.replaceChildren(...(spec.key ?? spec.series).map((s) => {
        const li = document.createElement('li');
        const sw = document.createElement('span');
        sw.className = `swatch ${s.kind} t-${s.tone}${s.ref ? ' ref' : ''}`;
        sw.setAttribute('aria-hidden', 'true');
        li.append(sw, document.createTextNode(s.name));
        return li;
      }));
      renderTable(spec.table);
      mark = {};
      draw(chartHost, spec, mark);
    }

    facts.replaceChildren(...(ctx?.facts ?? []).map((f) => {
      const card = document.createElement('article');
      card.className = 'fact';
      card.innerHTML = '<p class="fact-figure"></p><p class="fact-text"></p><p class="fact-source"><a target="_blank" rel="noopener"></a></p>';
      card.querySelector('.fact-figure').textContent = f.figure;
      card.querySelector('.fact-text').textContent = f.text;
      const a = card.querySelector('a');
      a.href = f.url;
      a.textContent = f.source;
      return card;
    }));

    sats.replaceChildren(...(ctx?.instruments ?? []).map((s) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="sat-year"></span><span class="sat-body"><strong></strong><span></span></span>';
      li.querySelector('.sat-year').textContent = s.launched ? s.launched.slice(0, 4) : 'Model';
      li.querySelector('strong').textContent = s.name;
      li.querySelector('.sat-body span').textContent = `${s.launched ? `Launched ${when(s.launched)}. ` : ''}${s.role}.`;
      return li;
    }));

    caveats.replaceChildren(...(ctx?.caveats ?? []).map((c) => {
      const li = document.createElement('li');
      li.textContent = c;
      return li;
    }));

    const b = sideBTrack;
    sideB.hidden = !b;
    if (b) {
      sideB.querySelector('.side-b-title').textContent = `Side B: ${b.title}`;
      sideB.querySelector('.side-b-text').textContent = `Flip the record (F) to hear NASA's Earth Information Center visualization. ${b.dataset}. ${b.frameCount} frames sampled from NASA's animation, played through the same rules as side A. ${b.credits}`;
      const link = sideB.querySelector('a');
      link.href = b.page;
      link.textContent = `NASA Scientific Visualization Studio, visualization ${b.svs}`;
    }

    const list = [...(spec?.sources ?? []), ...(ctx?.sources ?? [])];
    sources.replaceChildren(...list.map((s) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = s.name;
      li.append(a);
      return li;
    }));
  }

  function renderTable(table) {
    const head = document.createElement('thead');
    const hr = document.createElement('tr');
    table.head.forEach((h) => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = h; hr.append(th); });
    head.append(hr);
    const body = document.createElement('tbody');
    table.rows.forEach((r) => {
      const tr = document.createElement('tr');
      r.forEach((v, i) => { const c = document.createElement(i ? 'td' : 'th'); if (!i) c.scope = 'row'; c.textContent = v; tr.append(c); });
      body.append(tr);
    });
    chartTable.replaceChildren(head, body);
  }

  const xOf = (frame) => (track.side === 'b' ? frame.index : frame.year);

  /** Mark the frame that is sounding now. */
  function showFrame(frame) {
    if (!spec || !track) return;
    const x = xOf(frame);
    if (mark.now === x) return;
    mark = { now: x };
    draw(chartHost, spec, mark);
  }

  /** Duet: ring the oldest frame in blue and the newest in orange. */
  function showDuet(oldest, newest) {
    if (!spec || !track) return;
    mark = { oldest: xOf(oldest), newest: xOf(newest) };
    draw(chartHost, spec, mark);
  }

  return { setTrack, showFrame, showDuet };
}
