// Core Terra Vox sonification: NASA frame features -> live Tone.js sound.
//
// Two layers:
//   mapFeatures()  the locked mapping formulas, verbatim, as a pure function
//   Voice          a synth chain that plays one frame's mapped parameters as a
//                  repeating bar and picks up new frames live
//
// The features arriving here are already normalized per theme (see
// scripts/extract_features.py), so every theme drives these formulas across
// the same 0-1 range. On top of that the mix is normalized: each timbre gets
// a loudness trim and the master bus compresses and limits, so switching
// themes never blows out the mix, and velocity never drops below 0.3, so it
// never goes silent.

import * as Tone from 'tone';
import { SCALE, INTERVAL_SEMITONES, MOTIF, foldDegree, transpose } from './scales.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ------------------------------------------------------------ locked mapping

/**
 * The locked Terra Vox formulas. `f` is one frame's normalized features:
 * { hue 0-360, brightness 0-1, colorVariance 0-1, pixelDensity 0-1,
 *   frameDelta 0-1, latBand 'north' | 'equatorial' | 'south' }.
 */
export function mapFeatures(f) {
  const scale = SCALE;
  const scaleDegree = Math.floor((f.hue / 360) * scale.length) % scale.length;
  const note = scale[scaleDegree];

  const velocity = clamp(0.3 + (f.brightness * 0.7), 0.3, 1.0);

  const timbre = f.colorVariance < 0.15 ? 'sine'
    : f.colorVariance < 0.35 ? 'triangle'
    : 'sawtooth';

  const notesPerBar = 1 + Math.round(f.pixelDensity * 7);       // range 1-8

  const tempoBPM = 80 + Math.round(f.frameDelta * 80);           // range 80-160

  const interval = f.frameDelta > 0.5 ? 'minor third (tense)' : 'perfect fifth (consonant)';

  const pan = f.latBand === 'north' ? -0.8 : f.latBand === 'south' ? 0.8 : 0;

  return { scaleDegree, note, velocity, timbre, notesPerBar, tempoBPM, interval, pan };
}

/**
 * How one bar of a frame is played. The bar opens on the mapped note; the
 * remaining notes walk a fixed pentatonic motif from it, so the pitch centre
 * still tracks hue. Under the melody, a soft dyad sounds the mapped interval
 * an octave below the mapped note.
 */
export function barPlan(params) {
  const barSeconds = (60 / params.tempoBPM) * 4;
  const step = barSeconds / params.notesPerBar;
  const hold = params.timbre === 'sawtooth' ? 0.55 : params.timbre === 'triangle' ? 0.75 : 0.95;
  const notes = [];
  for (let i = 0; i < params.notesPerBar; i++) {
    notes.push({
      note: SCALE[foldDegree(params.scaleDegree + MOTIF[i])],
      offset: i * step,
      duration: Math.min(step * hold, 1.6),
    });
  }
  const root = transpose(params.note, -12);
  const dyad = [root, transpose(root, INTERVAL_SEMITONES[params.interval])];
  return { barSeconds, step, notes, dyad };
}

// ------------------------------------------------------------ mix + master

// Loudness trims, calibrated by rendering every timbre x density x tempo
// combination offline and measuring RMS. The plucky triangle/saw envelopes
// carry much less energy than the sustained sine, so untrimmed the timbre
// switch alone moved the level by 15 dB. Trimmed: sine -16, triangle -16.9,
// sawtooth -19.5 dB RMS at full velocity (a saw sounds ~3 dB louder than its
// RMS suggests). Note density moves the level by only ~2 dB, so velocity
// (brightness) stays the dominant loudness control, as the mapping intends.
const TIMBRE = {
  sine:     { trim: 1.0, cutoff: 6000, env: { attack: 0.02,  decay: 0.25, sustain: 0.5,  release: 1.4 } },
  triangle: { trim: 1.3, cutoff: 4200, env: { attack: 0.01,  decay: 0.2,  sustain: 0.35, release: 1.0 } },
  sawtooth: { trim: 1.3, cutoff: 2200, env: { attack: 0.006, decay: 0.15, sustain: 0.25, release: 0.5 } },
};
const PAD_LEVEL = 0.35;

let master = null;

/** Shared master bus: voices -> (dry + reverb) -> compressor -> limiter -> out. */
export function getMaster({ reverb = true } = {}) {
  const ctx = Tone.getContext();
  if (master && master.context === ctx) return master;

  const input = new Tone.Gain(1);
  const compressor = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.01, release: 0.25 });
  const limiter = new Tone.Limiter(-1);
  const duck = new Tone.Gain(1);       // dips the music while speech talks
  const output = new Tone.Gain(0.9);   // master volume
  input.connect(compressor);
  if (reverb) {
    const verb = new Tone.Reverb({ decay: 4, preDelay: 0.03, wet: 1 });
    const send = new Tone.Gain(0.28);
    input.connect(send);
    send.connect(verb);
    verb.connect(compressor);
  }
  compressor.connect(limiter);
  limiter.connect(duck);
  duck.connect(output);
  output.toDestination();

  const waveform = new Tone.Waveform(1024);
  const fft = new Tone.FFT(64);
  limiter.connect(waveform);
  limiter.connect(fft);

  master = { context: ctx, input, duck, output, waveform, fft };
  return master;
}

/**
 * Run `fn` when audio scheduled for AudioContext time `time` is heard.
 * Uses a timer rather than Tone.Draw (requestAnimationFrame), which stops in
 * background tabs and would freeze captions while the music plays on.
 */
export function whenHeard(time, fn) {
  setTimeout(fn, Math.max(0, (time - Tone.immediate()) * 1000));
}

/** Unlock audio (must run inside a user gesture) and start the clock. */
export async function startAudio() {
  await Tone.start();
  const m = getMaster();
  const transport = Tone.getTransport();
  if (transport.state !== 'started') transport.start();
  return m;
}

export function setMasterVolume(linear) {
  getMaster().output.gain.rampTo(clamp(linear, 0, 1), 0.1);
}

/** Lower the music ~8 dB while spoken descriptions play, then restore it. */
export function duckMusic(on) {
  if (!master) return;
  master.duck.gain.rampTo(on ? 0.4 : 1, 0.25);
}

// ------------------------------------------------------------ voice

/**
 * One playing sonification. Holds the current frame, plays its bar on a loop
 * with its own tempo (so two voices in Duet mode keep independent tempos),
 * and reports every bar so captions and readouts stay in sync with the sound.
 */
export class Voice {
  constructor({ name = 'voice', destination = null, level = 0.5 } = {}) {
    this.name = name;
    this.frame = null;
    this.pending = null;
    this.params = null;
    this.panOverride = null;
    this.running = false;
    this.bar = 0;
    this.listeners = new Set();
    this._eventId = null;
    this._nextBarAt = 0;

    this.transport = Tone.getTransport();
    this.out = new Tone.Gain(level);
    this.panner = new Tone.Panner(0);
    this.trim = new Tone.Gain(1);
    this.filter = new Tone.Filter({ type: 'lowpass', frequency: 6000, Q: 0.7, rolloff: -12 });
    // Polyphonic so a note's release tail can overlap the next note's attack
    // (a mono Tone.Synth throws if a start time is not strictly increasing,
    // which a scrub-restart can produce, and the throw would kill the loop).
    this.lead = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: TIMBRE.sine.env });
    this.lead.maxPolyphony = 12;
    this._noteIds = [];
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.6, decay: 0.4, sustain: 0.7, release: 2.2 },
    });
    this.pad.maxPolyphony = 8;
    this.meter = new Tone.Meter({ smoothing: 0.8 });

    this.lead.connect(this.filter);
    this.pad.connect(this.filter);
    this.filter.connect(this.trim);
    this.trim.connect(this.panner);
    this.panner.connect(this.out);
    // Meter the mono signal before panning: Tone.Meter reads one channel, so
    // after a hard-right pan it would report silence.
    this.trim.connect(this.meter);
    this.out.connect(destination ?? getMaster().input);
  }

  onBar(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Load a frame. While playing, the frame is queued and takes over on the
   * next downbeat, so a bar never changes timbre halfway through. With
   * `restart`, it takes over immediately and a fresh bar starts now (used for
   * scrubbing, so the sound answers the hand without waiting for the bar).
   */
  setFrame(frame, { restart = false } = {}) {
    if (this.running && !restart) {
      this.pending = frame;
      return;
    }
    this._adopt(frame);
    if (restart && this.running) this._restart();
  }

  _adopt(frame) {
    this.pending = null;
    this.frame = frame;
    this.params = mapFeatures(frame);
    this._applyTimbre(this.params.timbre);
    this._applyPan();
  }

  setPanOverride(pan) {
    this.panOverride = pan;
    this._applyPan();
  }

  setLevel(linear, ramp = 0.15) {
    this.out.gain.rampTo(linear, ramp);
  }

  /**
   * Play bars until stopped, or only `bars` bars (e.g. 1 = an audition).
   * `at` is a Transport time in seconds; default is right now.
   */
  start({ bars = Infinity, at = null } = {}) {
    if (!this.frame) return;
    this.stop();   // also cancels notes still pending from a finished audition
    this.running = true;
    this.bar = 0;
    this._barsLeft = bars;
    this._nextBarAt = Math.max(at ?? 0, this.transport.seconds + 0.06);
    this._schedule();
  }

  stop() {
    this.running = false;
    if (this._eventId !== null) this.transport.clear(this._eventId);
    this._eventId = null;
    this._clearNotes();
    this.lead.releaseAll();
    this.pad.releaseAll();
  }

  _clearNotes() {
    this._noteIds.forEach((id) => this.transport.clear(id));
    this._noteIds = [];
  }

  dispose() {
    this.stop();
    this.listeners.clear();
    [this.lead, this.pad, this.filter, this.trim, this.panner, this.out, this.meter].forEach((n) => n.dispose());
  }

  level() {
    const v = this.meter.getValue();
    return typeof v === 'number' ? v : Math.max(...v);
  }

  // Start the next bar right away (used when the listener scrubs), instead of
  // waiting up to 3 s for the current bar to finish.
  _restart() {
    if (this._eventId !== null) this.transport.clear(this._eventId);
    this._clearNotes();
    this.lead.releaseAll();
    this.pad.releaseAll();
    this._nextBarAt = this.transport.seconds + 0.04;
    this._schedule();
  }

  _schedule() {
    this._eventId = this.transport.scheduleOnce((time) => this._playBar(time), this._nextBarAt);
  }

  _playBar(time) {
    if (!this.running) return;
    if (this.pending) this._adopt(this.pending);
    const params = this.params;
    const plan = barPlan(params);
    const barAt = this._nextBarAt;

    // The downbeat plays now; later notes are their own Transport events so a
    // restart can cancel them instead of letting the old bar bleed through.
    this._noteIds = [];
    plan.notes.forEach((n, i) => {
      const play = (t) => this.lead.triggerAttackRelease(n.note, n.duration, t, params.velocity);
      if (i === 0) play(time);
      else this._noteIds.push(this.transport.scheduleOnce(play, barAt + n.offset));
    });
    this.pad.triggerAttackRelease(plan.dyad, plan.barSeconds * 0.92, time, params.velocity * PAD_LEVEL);

    // Listeners run now, a lookahead before the bar sounds, so they can queue
    // the next frame in time; for UI work they should use whenHeard(event.time).
    const event = { voice: this.name, bar: this.bar, frame: this.frame, params, plan, time, at: this._nextBarAt };
    this.bar += 1;
    this.listeners.forEach((fn) => fn(event));

    this._nextBarAt += plan.barSeconds;
    this._barsLeft -= 1;
    if (this._barsLeft > 0) this._schedule();
    else { this.running = false; this._eventId = null; }
  }

  _applyTimbre(type) {
    const t = TIMBRE[type];
    this.lead.set({ oscillator: { type }, envelope: t.env });
    this.pad.set({ oscillator: { type } });
    this.filter.frequency.rampTo(t.cutoff, 0.1);
    this.trim.gain.rampTo(t.trim, 0.1);
  }

  _applyPan() {
    const pan = this.panOverride ?? this.params?.pan ?? 0;
    this.panner.pan.rampTo(pan, 0.1);
  }
}
