// Duet mode: two moments of the planet, one in each ear. By default the
// oldest and the newest frame of a theme; with "Your year" (or a shared
// link) any year on the left against the newest on the right. Both go
// through the identical mapping, so whatever you hear differ between your
// ears is the planet having changed.
//
// Each voice keeps its own tempo, set by how far its year sits from the
// oldest (the oldest is always 80 BPM), so the two may drift against each
// other; that drift is part of the gap. Both start on the same
// downbeat so the first bar lands as one clear before/after chord.
//
// Listening modes:
//   together  the real duet: left year hard left, right year hard right (default)
//   turns     one bar each, alternating, centred. For mono speakers, one
//             earbud, or hearing in one ear, where hard panning would hide
//             one of the two years
//   oldest / newest   solo either year, centred
//
// The introduction. A Duet that starts with both years at once is hard to
// read: the ear cannot yet tell which sound is which. So when Duet is switched
// on (or the theme changes) in "together" mode, it first plays the left year
// alone in the left ear, then the right year alone in the right ear, then both:
// by the time they overlap, each has already been heard on its own. Pausing
// and resuming skips it.
//
// The reference voice (key N, off by default) is a third, quiet, centred
// voice: NOAA's independent record for the same two years, one bar each,
// through the same mapping. Methane and sea level only.

import { Voice, mapFeatures } from './sonify.js';
import { oldestFrame, newestFrame, physicalShort, physicalSpoken, physicalDelta, activeShare, spanBetween, pct } from '../data/loader.js';
import { referenceLine, trustSentence, sameMonths } from '../data/trust.js';
import { speakNote, showNote } from './scales.js';
import { t, tn } from '../i18n/index.js';

export const LISTEN_MODES = ['together', 'turns', 'oldest', 'newest'];

const TURN_GAP = 0.35;          // seconds of silence between turns
const DUET_LEVEL = 0.62;        // two voices together ~= one voice at 0.8
const SOLO_LEVEL = 0.8;
const REFERENCE_LEVEL = 0.3;    // quiet: it confirms, it does not lead
// Clarity. With both years sounding, a long reverb tail from each note smears into the next one and hides
// the two tempos and note counts, the very differences to hear. So in Duet the two voices are drier than
// in single play. And the introduction gives each year two bars on its own (not one), so the ear has
// learnt each sound before they overlap.
const DUET_SEND = 0.1;
const SOLO_SEND = 0.28;
const INTRO_BARS = 2;

export class Duet {
  constructor() {
    this.oldest = new Voice({ name: 'oldest', level: DUET_LEVEL });
    this.newest = new Voice({ name: 'newest', level: DUET_LEVEL });
    this.reference = new Voice({ name: 'reference', level: REFERENCE_LEVEL });
    this.reference.setPanOverride(0);
    this.referenceFrames = null;
    this.referenceOn = false;
    this.mode = 'together';
    this.running = false;
    this.theme = null;
    this.listeners = new Set();
    this.phaseListeners = new Set();
    this._intro = null;
    this.oldest.onBar((e) => this._onBar(e));
    this.newest.onBar((e) => this._onBar(e));
    this.reference.onBar((e) => this._onReferenceBar(e));
    this._applyMode();
  }

  onBar(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The introduction's steps: fn({ phase: 'left' | 'right' | 'both', time }). */
  onPhase(fn) {
    this.phaseListeners.add(fn);
    return () => this.phaseListeners.delete(fn);
  }

  _phase(phase, time) {
    this.phaseListeners.forEach((fn) => fn({ phase, time }));
  }

  /** pair = { left, right } frames (default: the two ends of the record). */
  setTheme(theme, pair = null, referenceFrames = null) {
    this.theme = theme;
    this.oldest.setFrame(pair?.left ?? oldestFrame(theme));
    this.newest.setFrame(pair?.right ?? newestFrame(theme));
    this.referenceFrames = referenceFrames;
    if (this.running) this.start({ introduce: true });
  }

  setMode(mode) {
    if (!LISTEN_MODES.includes(mode)) return;
    this.mode = mode;
    this._applyMode();
    if (this.running) this.start({ introduce: true });
  }

  /** The NOAA voice on or off; returns whether it can play for this theme. */
  setReference(on) {
    this.referenceOn = on && Boolean(this.referenceFrames);
    if (!this.referenceOn) this.reference.stop();
    else if (this.running) this._startReference(this.oldest.transport.seconds + 0.08);
    return this.referenceOn;
  }

  start({ introduce = false } = {}) {
    this.stop();
    this.running = true;
    const at = this.oldest.transport.seconds + 0.08;   // shared first downbeat
    if (this.mode === 'together' && introduce) {
      this._intro = 'left';
      this.oldest.start({ bars: INTRO_BARS, at });
    } else if (this.mode === 'together') {
      this.oldest.start({ at });
      this.newest.start({ at });
    } else if (this.mode === 'turns') {
      this.oldest.start({ bars: 1, at });
    } else {
      this[this.mode].start({ at });
    }
    if (this.referenceOn) this._startReference(at);
  }

  stop() {
    this.running = false;
    this._intro = null;
    this.oldest.stop();
    this.newest.stop();
    this.reference.stop();
  }

  /** Current output level of each side, in dB (for meters). */
  levels() {
    return { oldest: this.oldest.level(), newest: this.newest.level() };
  }

  dispose() {
    this.stop();
    [this.oldest, this.newest, this.reference].forEach((v) => v.dispose());
  }

  _startReference(at) {
    this._refIndex = 0;
    this.reference.setFrame(this.referenceFrames[0], { restart: true });
    this.reference.start({ bars: 1, at });
  }

  // The reference alternates its two years, one bar each, while Duet runs.
  _onReferenceBar(event) {
    if (!this.running || !this.referenceOn) return;
    this._refIndex = 1 - this._refIndex;
    this.reference.setFrame(this.referenceFrames[this._refIndex]);
    this.reference.start({ bars: 1, at: event.at + event.plan.barSeconds });
  }

  _applyMode() {
    const together = this.mode === 'together';
    this.oldest.setPanOverride(together ? -1 : 0);
    this.newest.setPanOverride(together ? 1 : 0);
    const level = together ? DUET_LEVEL : SOLO_LEVEL;
    this.oldest.setLevel(level);
    this.newest.setLevel(level);
    const send = together ? DUET_SEND : SOLO_SEND;
    this.oldest.setSend(send);
    this.newest.setSend(send);
  }

  _onBar(event) {
    if (this.running && this._intro === 'left' && event.voice === 'oldest') {
      // The left year is sounding alone; the right year follows on its own.
      this._intro = 'right';
      this._phase('left', event.time);
      this.newest.start({ at: event.at + INTRO_BARS * event.plan.barSeconds + TURN_GAP });
    } else if (this.running && this._intro === 'right' && event.voice === 'newest') {
      // The right year is sounding alone; the left joins on its next downbeat.
      this._intro = null;
      this._phase('right', event.time);
      const join = event.at + INTRO_BARS * event.plan.barSeconds;
      this.oldest.start({ at: join });
      this._phase('both', event.time + INTRO_BARS * event.plan.barSeconds);
    }
    if (this.running && this.mode === 'turns') {
      const other = event.voice === 'oldest' ? this.newest : this.oldest;
      other.start({ bars: 1, at: event.at + event.plan.barSeconds + TURN_GAP });
    }
    this.listeners.forEach((fn) => fn(event));
  }
}

// ------------------------------------------------------------ the pair

/**
 * The two frames a Duet plays. `left` is a year (or null for the oldest),
 * `right` a year (or null for the newest). When the right year is partial
 * (the current year, January to the latest month), the left year is
 * averaged over the same months so the comparison is fair.
 */
export function duetPair(theme, { left = null, right = null } = {}) {
  const pick = (year, fallback) => (year === null || theme.side === 'b' ? fallback : theme.frames.find((f) => f.year === year) ?? fallback);
  let a = pick(left, oldestFrame(theme));
  let b = pick(right, newestFrame(theme));
  if (a.year > b.year) [a, b] = [b, a];
  if (b.window?.kind === 'partial') a = sameMonths(theme, a, b.window.months);
  return { left: a, right: b };
}

// ------------------------------------------------------------ the gap

const TIMBRE_RANK = { sine: 0, triangle: 1, sawtooth: 2 };

/**
 * Plain account of what changed between the two frames, both as sound and
 * as the underlying number, in the current language. Used for the gap
 * panel, the live caption and the spoken announcement when Duet starts.
 */
export function describeGap(theme, pair = duetPair(theme)) {
  const a = pair.left;
  const b = pair.right;
  const pa = mapFeatures(a);
  const pb = mapFeatures(b);
  const items = [];
  const words = [];
  const changed = (key, cond, up) => { if (cond) words.push(t(`word.${key}.${up ? 'up' : 'down'}`)); };

  const steps = pb.scaleDegree - pa.scaleDegree;
  items.push({ aspect: t('aspect.pitch'), from: showNote(pa.note), to: showNote(pb.note), same: steps === 0,
    change: steps === 0 ? t('change.same') : tn(steps > 0 ? 'change.stepsUp' : 'change.stepsDown', Math.abs(steps)) });
  changed('pitch', steps, steps > 0);

  const dn = pb.notesPerBar - pa.notesPerBar;
  items.push({ aspect: t('aspect.notes'), from: pa.notesPerBar, to: pb.notesPerBar, same: dn === 0,
    change: dn === 0 ? t('change.same') : t(`word.notes.${dn > 0 ? 'up' : 'down'}`) });
  changed('notes', dn, dn > 0);

  const dt = pb.tempoBPM - pa.tempoBPM;
  items.push({ aspect: t('aspect.tempo'), from: `${pa.tempoBPM} BPM`, to: `${pb.tempoBPM} BPM`, same: Math.abs(dt) < 4,
    change: Math.abs(dt) < 4 ? t('change.aboutSame') : t(`word.tempo.${dt > 0 ? 'up' : 'down'}`) });
  changed('tempo', Math.abs(dt) >= 4, dt > 0);

  const dtim = TIMBRE_RANK[pb.timbre] - TIMBRE_RANK[pa.timbre];
  items.push({ aspect: t('aspect.timbre'), from: t(`timbre.${pa.timbre}`), to: t(`timbre.${pb.timbre}`), same: dtim === 0,
    change: dtim === 0 ? t('change.same') : t(`word.timbre.${dtim > 0 ? 'up' : 'down'}`) });
  changed('timbre', dtim, dtim > 0);

  const tenseA = pa.interval.startsWith('minor');
  const tenseB = pb.interval.startsWith('minor');
  items.push({ aspect: t('aspect.harmony'), from: t(tenseA ? 'harmony.tense' : 'harmony.calm'), to: t(tenseB ? 'harmony.tense' : 'harmony.calm'), same: tenseA === tenseB,
    change: tenseA === tenseB ? t('change.same') : t(`word.harmony.${tenseB ? 'up' : 'down'}`) });
  changed('harmony', tenseA !== tenseB, tenseB);

  const dv = pb.velocity - pa.velocity;
  items.push({ aspect: t('aspect.loudness'), from: pa.velocity.toFixed(2), to: pb.velocity.toFixed(2), same: Math.abs(dv) < 0.1,
    change: Math.abs(dv) < 0.1 ? t('change.aboutSame') : t(`word.loud.${dv > 0 ? 'up' : 'down'}`) });
  changed('loud', Math.abs(dv) >= 0.1, dv > 0);

  const shareA = activeShare(a);
  const shareB = activeShare(b);
  const physical = {
    label: theme.physical.label,
    from: physicalShort(a),
    to: physicalShort(b),
    delta: physicalDelta(a, b),
    activeLabel: shareA?.label ?? null,
    activeFrom: shareA ? pct(shareA.percent) : null,
    activeTo: shareB ? pct(shareB.percent) : null,
  };

  const list = words.length === 0 ? null
    : words.length === 1 ? words[0]
    : t('list.and', { head: words.slice(0, -1).join(', '), last: words[words.length - 1] });
  const sentence = list ? t('gap.sentence', { b: b.short, a: a.short, list }) : t('gap.same', { b: b.short, a: a.short });

  const trust = trustSentence(theme, a, b);
  const noaa = referenceLine(theme, a, b, Math.sign(b.physical.value - a.physical.value));
  // The current year is partial: say which months, and that the other year uses the same ones.
  const months = b.window?.kind === 'partial' ? t('gap.sameMonths', { label: b.label }) : '';
  const levels = theme.parent === 'greenhouse_gases' && noaa ? t('ref.levels.ch4') : theme.parent === 'sea_level' && noaa ? t('ref.levels.sea') : '';

  const sideWord = theme.side === 'b' ? t('gap.sideB', { title: theme.title }) : '';
  const where = theme.region ? t('gap.over', { over: theme.region.over }) : '';
  const spoken = [
    t('gap.intro', { theme: theme.name, where, side: sideWord, a: a.short, b: b.short }),
    t('gap.values', { a: a.short, va: physicalSpoken(a), b: b.short, vb: physicalSpoken(b) }),
    physical.activeLabel ? t('gap.share', { label: physical.activeLabel, from: physical.activeFrom, to: physical.activeTo }) : '',
    months,
    t('gap.listen', { sentence }),
    trust.sentence,
    noaa ? `${noaa} ${levels}` : '',
    t('gap.notes', { na: speakNote(pa.note), ta: t(`timbreLong.${pa.timbre}`), nb: speakNote(pb.note), tb: t(`timbreLong.${pb.timbre}`) }),
  ].filter(Boolean).join(' ');

  return { oldest: a, newest: b, pa, pb, items, words, physical, sentence, spoken, trust, noaa, months, apart: spanBetween(theme, a, b) };
}
