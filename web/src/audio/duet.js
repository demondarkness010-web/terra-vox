// Duet mode: the oldest and the newest frame of a theme, played at the same
// time through two independent voices, hard-panned left and right. Both go
// through the identical mapping, so whatever you hear differ between your
// ears is the planet having changed.
//
// Each voice keeps its own data-driven tempo, so the two may drift against
// each other; that drift is part of the gap. Both start on the same
// downbeat so the first bar lands as one clear before/after chord.
//
// Listening modes:
//   together  the real duet: oldest hard left, newest hard right (default)
//   turns     one bar each, alternating, centred. For mono speakers, one
//             earbud, or hearing in one ear, where hard panning would hide
//             one of the two years
//   oldest / newest   solo either year, centred

import { Voice, mapFeatures } from './sonify.js';
import { oldestFrame, newestFrame, physicalShort, physicalSpoken, physicalDelta, activeShare } from '../data/loader.js';
import { speakNote } from './scales.js';

export const LISTEN_MODES = {
  together: 'Together (stereo)',
  turns: 'Take turns',
  oldest: 'Oldest only',
  newest: 'Newest only',
};

const TURN_GAP = 0.35;          // seconds of silence between turns
const DUET_LEVEL = 0.62;        // two voices together ~= one voice at 0.8
const SOLO_LEVEL = 0.8;

export class Duet {
  constructor() {
    this.oldest = new Voice({ name: 'oldest', level: DUET_LEVEL });
    this.newest = new Voice({ name: 'newest', level: DUET_LEVEL });
    this.mode = 'together';
    this.running = false;
    this.theme = null;
    this.listeners = new Set();
    this.oldest.onBar((e) => this._onBar(e));
    this.newest.onBar((e) => this._onBar(e));
    this._applyMode();
  }

  onBar(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setTheme(theme) {
    this.theme = theme;
    this.oldest.setFrame(oldestFrame(theme));
    this.newest.setFrame(newestFrame(theme));
    if (this.running) this.start();
  }

  setMode(mode) {
    if (!LISTEN_MODES[mode]) return;
    this.mode = mode;
    this._applyMode();
    if (this.running) this.start();
  }

  start() {
    this.stop();
    this.running = true;
    const at = this.oldest.transport.seconds + 0.08;   // shared first downbeat
    if (this.mode === 'together') {
      this.oldest.start({ at });
      this.newest.start({ at });
    } else if (this.mode === 'turns') {
      this.oldest.start({ bars: 1, at });
    } else {
      this[this.mode].start({ at });
    }
  }

  stop() {
    this.running = false;
    this.oldest.stop();
    this.newest.stop();
  }

  /** Current output level of each side, in dB (for meters). */
  levels() {
    return { oldest: this.oldest.level(), newest: this.newest.level() };
  }

  dispose() {
    this.stop();
    this.oldest.dispose();
    this.newest.dispose();
  }

  _applyMode() {
    const together = this.mode === 'together';
    this.oldest.setPanOverride(together ? -1 : 0);
    this.newest.setPanOverride(together ? 1 : 0);
    const level = together ? DUET_LEVEL : SOLO_LEVEL;
    this.oldest.setLevel(level);
    this.newest.setLevel(level);
  }

  _onBar(event) {
    if (this.running && this.mode === 'turns') {
      const other = event.voice === 'oldest' ? this.newest : this.oldest;
      other.start({ bars: 1, at: event.at + event.plan.barSeconds + TURN_GAP });
    }
    this.listeners.forEach((fn) => fn(event));
  }
}

// ------------------------------------------------------------ the gap

const TIMBRE_RANK = { sine: 0, triangle: 1, sawtooth: 2 };
const TIMBRE_WORD = { sine: 'smooth sine', triangle: 'hollow triangle', sawtooth: 'buzzy sawtooth' };

/**
 * Plain-English account of what changed between the oldest and newest frame,
 * both as sound and as the underlying number. Used for the gap panel, the
 * live caption and the spoken announcement when Duet starts.
 */
export function describeGap(theme) {
  const a = oldestFrame(theme);
  const b = newestFrame(theme);
  const pa = mapFeatures(a);
  const pb = mapFeatures(b);
  const items = [];
  const words = [];

  const steps = pb.scaleDegree - pa.scaleDegree;
  const stepWord = (n) => `${n} scale step${n === 1 ? '' : 's'}`;
  items.push({ aspect: 'Pitch', from: pa.note, to: pb.note, change: steps === 0 ? 'same' : steps > 0 ? `${stepWord(steps)} higher` : `${stepWord(-steps)} lower` });
  if (steps) words.push(steps > 0 ? 'higher' : 'lower');

  const dn = pb.notesPerBar - pa.notesPerBar;
  items.push({ aspect: 'Notes per bar', from: pa.notesPerBar, to: pb.notesPerBar, change: dn === 0 ? 'same' : dn > 0 ? 'busier' : 'sparser' });
  if (dn) words.push(dn > 0 ? 'busier' : 'sparser');

  const dt = pb.tempoBPM - pa.tempoBPM;
  items.push({ aspect: 'Tempo', from: `${pa.tempoBPM} BPM`, to: `${pb.tempoBPM} BPM`, change: Math.abs(dt) < 4 ? 'about the same' : dt > 0 ? 'faster' : 'slower' });
  if (Math.abs(dt) >= 4) words.push(dt > 0 ? 'faster' : 'slower');

  const dtim = TIMBRE_RANK[pb.timbre] - TIMBRE_RANK[pa.timbre];
  items.push({ aspect: 'Timbre', from: pa.timbre, to: pb.timbre, change: dtim === 0 ? 'same' : dtim > 0 ? 'harsher' : 'smoother' });
  if (dtim) words.push(dtim > 0 ? 'harsher' : 'smoother');

  const tenseA = pa.interval.startsWith('minor');
  const tenseB = pb.interval.startsWith('minor');
  items.push({ aspect: 'Harmony', from: tenseA ? 'tense m3' : 'calm P5', to: tenseB ? 'tense m3' : 'calm P5', change: tenseA === tenseB ? 'same' : tenseB ? 'more tense' : 'calmer' });
  if (tenseA !== tenseB) words.push(tenseB ? 'more tense' : 'calmer');

  const dv = pb.velocity - pa.velocity;
  items.push({ aspect: 'Loudness', from: pa.velocity.toFixed(2), to: pb.velocity.toFixed(2), change: Math.abs(dv) < 0.1 ? 'about the same' : dv > 0 ? 'louder' : 'softer' });
  if (Math.abs(dv) >= 0.1) words.push(dv > 0 ? 'louder' : 'softer');

  const shareA = activeShare(a);
  const shareB = activeShare(b);
  const pct = (x) => `${x < 10 ? x.toFixed(1) : Math.round(x)}%`;
  const physical = {
    label: theme.physical.label,
    from: physicalShort(a),
    to: physicalShort(b),
    delta: physicalDelta(a, b),
    activeLabel: shareA?.label ?? null,
    activeFrom: shareA ? pct(shareA.percent) : null,
    activeTo: shareB ? pct(shareB.percent) : null,
  };

  const list = words.length === 0 ? 'nearly the same as'
    : words.length === 1 ? `${words[0]} than`
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]} than`;
  const sentence = `${b.year} sounds ${list} ${a.year}.`;
  const spoken = `Duet. ${theme.name}: ${a.year} in your left ear, ${b.year} in your right. `
    + `In ${a.year}, ${physicalSpoken(a)}. In ${b.year}, ${physicalSpoken(b)}. `
    + (physical.activeLabel ? `The share of ${physical.activeLabel} went from ${physical.activeFrom} to ${physical.activeTo}. ` : '')
    + `Listen: ${sentence} `
    + `Left plays ${speakNote(pa.note)} on a ${TIMBRE_WORD[pa.timbre]}; right plays ${speakNote(pb.note)} on a ${TIMBRE_WORD[pb.timbre]}.`;

  return { oldest: a, newest: b, pa, pb, items, words, physical, sentence, spoken, years: b.year - a.year };
}
