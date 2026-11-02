// Core Terra Vox sonification: a frame's mapped parameters -> live Tone.js sound.
//
// Two layers:
//   mapping.js     the mapping itself, a pure function of the frame's measured
//                  value (re-exported here so callers have one import)
//   Voice          a synth chain that plays one frame's mapped parameters as a
//                  repeating bar and picks up new frames live
//
// Each theme plays one fixed instrument (soft pad, deep bass, plucked notes,
// breathy noise), so the theme tells you what and the music how much. On top
// of that the mix is normalized: each timbre and instrument gets a loudness
// trim and the master bus compresses and limits, so switching themes never
// blows out the mix, and velocity never drops below 0.4, so it never goes
// silent.

import * as Tone from 'tone';
import { mapFeatures, barPlan, instrumentFor, timePan, TENSE_FROM } from './mapping.js';

export { mapFeatures, barPlan, instrumentFor, timePan, TENSE_FROM };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ------------------------------------------------------------ mix + master

// Each timbre sets the waveform's filter and a loudness trim, so stepping up
// from sine to triangle to sawtooth (value01 crossing 0.33 and 0.66) never
// makes a bigger value sound quieter: velocity (0.4-1.0, from value01) stays
// the loudness control. Trims calibrated by rendering frames offline
// (levelCheck.js) and measuring RMS; a saw sounds ~3 dB louder than its RMS.
const TIMBRE = {
  sine:     { trim: 1.0, cutoff: 6000 },
  triangle: { trim: 1.25, cutoff: 4200 },
  sawtooth: { trim: 1.25, cutoff: 2400 },
};

// One fixed instrument per theme (mapping.js INSTRUMENT names them): the
// theme tells you what, the music tells you how much. `osc` prefixes the
// waveform ("fat" = three detuned copies, a pad's width), `env` shapes every
// melody note, `cutoff` scales the timbre's filter, `trim` evens loudness out
// between instruments, and `breath` adds band-passed pink noise under each
// note at that share of its velocity.
const INSTRUMENTS = {
  'soft pad':      { osc: 'fat', env: { attack: 0.18, decay: 0.5, sustain: 0.7, release: 2.0 }, cutoff: 0.8, trim: 1.0 },
  'deep bass':     { osc: '', env: { attack: 0.008, decay: 0.4, sustain: 0.55, release: 0.9 }, cutoff: 0.5, trim: 0.9 },
  'plucked notes': { osc: '', env: { attack: 0.002, decay: 0.25, sustain: 0.0, release: 0.4 }, cutoff: 1.2, trim: 1.1 },
  'breathy noise': { osc: '', env: { attack: 0.05, decay: 0.3, sustain: 0.3, release: 0.9 }, cutoff: 0.9, trim: 1.0, breath: 0.9 },
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
  // iPhone: without a "playback" session, the ringer's silent switch mutes Web Audio.
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
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
    this.sweep = 0;
    this.instrument = INSTRUMENTS['soft pad'];
    this.running = false;
    this.bar = 0;
    this.listeners = new Set();
    this.noteListeners = new Set();
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
    this.lead = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: this.instrument.env });
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
    // after a hard-right pan it would report silence. Same for the waveform
    // tap the visualizer draws.
    this.trim.connect(this.meter);
    this.waveform = new Tone.Waveform(512);
    this.trim.connect(this.waveform);
    this.out.connect(destination ?? getMaster().input);
  }

  onBar(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Every lead note as it is scheduled: { voice, frame, index, count, time, velocity }. Observation only. */
  onNote(fn) {
    this.noteListeners.add(fn);
    return () => this.noteListeners.delete(fn);
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
    this._applySound(this.params);
    this._applyPan();
  }

  /** Fixed stereo position (Duet: -1 oldest, 1 newest; 0 centred), or null. */
  setPanOverride(pan) {
    this.panOverride = pan;
    this._applyPan();
  }

  /**
   * Single play: stereo position follows time across a track of `count`
   * frames, oldest left to newest right (the sweep). 0 = centred, which Guess
   * the Year needs so the ear does not give the answer away.
   */
  setSweep(count) {
    this.sweep = count;
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
    this.noteListeners.clear();
    [this.lead, this.pad, this.filter, this.trim, this.panner, this.out, this.meter, this.waveform,
      this.breathNoise, this.breathBand, this.breathEnv].forEach((n) => n?.dispose());
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
    const frame = this.frame;
    const breath = this.instrument.breath;
    plan.notes.forEach((n, i) => {
      const play = (t) => {
        this.lead.triggerAttackRelease(n.note, n.duration, t, params.velocity);
        if (breath) this._breathe(n.note, n.duration, t, params.velocity * breath);
        const note = { voice: this.name, frame, index: i, count: plan.notes.length, time: t, velocity: params.velocity };
        this.noteListeners.forEach((fn) => fn(note));
      };
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

  _applySound(params) {
    const t = TIMBRE[params.timbre];
    const inst = INSTRUMENTS[params.instrument] ?? INSTRUMENTS['soft pad'];
    this.instrument = inst;
    this.lead.set({ oscillator: { type: `${inst.osc}${params.timbre}` }, envelope: inst.env });
    this.pad.set({ oscillator: { type: params.timbre } });
    this.filter.frequency.rampTo(t.cutoff * inst.cutoff, 0.1);
    this.trim.gain.rampTo(t.trim * inst.trim, 0.1);
  }

  // The breath layer: pink noise, band-passed around each note so the hiss
  // still follows the pitch, built the first time a breathy theme plays.
  _breathe(note, duration, time, velocity) {
    if (!this.breathEnv) {
      // the voice's own context: this runs inside a scheduled callback, when
      // an offline render may no longer be Tone's current context
      const context = this.trim.context;
      this.breathNoise = new Tone.Noise({ context, type: 'pink' });
      this.breathBand = new Tone.Filter({ context, type: 'bandpass', frequency: 800, Q: 2.5 });
      this.breathEnv = new Tone.AmplitudeEnvelope({ context, attack: 0.07, decay: 0.3, sustain: 0.35, release: 0.7 });
      this.breathNoise.chain(this.breathBand, this.breathEnv, this.trim);
      this.breathNoise.start();
    }
    this.breathBand.frequency.setValueAtTime(Tone.Frequency(note).toFrequency() * 2, time);
    this.breathEnv.triggerAttackRelease(duration, time, velocity);
  }

  _applyPan() {
    const sweep = this.sweep > 1 && this.frame ? timePan(this.frame.index, this.sweep) : 0;
    this.panner.pan.rampTo(this.panOverride ?? sweep, 0.1);
  }
}
