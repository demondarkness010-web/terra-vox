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
  const output = new Tone.Gain(0.9);
  input.connect(compressor);
  if (reverb) {
    const verb = new Tone.Reverb({ decay: 4, preDelay: 0.03, wet: 1 });
    const send = new Tone.Gain(0.28);
    input.connect(send);
    send.connect(verb);
    verb.connect(compressor);
  }
  compressor.connect(limiter);
  limiter.connect(output);
  output.toDestination();

  const waveform = new Tone.Waveform(1024);
  const fft = new Tone.FFT(64);
  limiter.connect(waveform);
  limiter.connect(fft);

  master = { context: ctx, input, output, waveform, fft };
  return master;
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
    this.lead = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: TIMBRE.sine.env });
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
    this.out.connect(this.meter);
    this.out.connect(destination ?? getMaster().input);
  }

  onBar(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Load a frame. Timbre and pan change now; rhythm and pitch on the next bar. */
  setFrame(frame, { restart = false } = {}) {
    this.frame = frame;
    this.params = mapFeatures(frame);
    this._applyTimbre(this.params.timbre);
    this._applyPan();
    if (restart && this.running) this._restart();
  }

  setPanOverride(pan) {
    this.panOverride = pan;
    this._applyPan();
  }

  setLevel(linear, ramp = 0.15) {
    this.out.gain.rampTo(linear, ramp);
  }

  start() {
    if (this.running || !this.frame) return;
    this.running = true;
    this.bar = 0;
    this._nextBarAt = this.transport.seconds + 0.06;
    this._schedule();
  }

  stop() {
    this.running = false;
    if (this._eventId !== null) this.transport.clear(this._eventId);
    this._eventId = null;
    this.lead.triggerRelease();
    this.pad.releaseAll();
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
    this.pad.releaseAll();
    this._nextBarAt = this.transport.seconds + 0.04;
    this._schedule();
  }

  _schedule() {
    this._eventId = this.transport.scheduleOnce((time) => this._playBar(time), this._nextBarAt);
  }

  _playBar(time) {
    if (!this.running) return;
    const params = this.params;
    const plan = barPlan(params);

    plan.notes.forEach((n) => {
      this.lead.triggerAttackRelease(n.note, n.duration, time + n.offset, params.velocity);
    });
    this.pad.triggerAttackRelease(plan.dyad, plan.barSeconds * 0.92, time, params.velocity * PAD_LEVEL);

    const event = { voice: this.name, bar: this.bar, frame: this.frame, params, plan, time };
    this.bar += 1;
    Tone.getDraw().schedule(() => this.listeners.forEach((fn) => fn(event)), time);

    this._nextBarAt += plan.barSeconds;
    this._schedule();
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
