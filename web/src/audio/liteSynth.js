// A small polyphonic synth built straight on the browser's audio nodes, in place of Tone.PolySynth.
//
// Why: Tone builds every note from its own wrapper objects (oscillator, envelope, signals), each merging
// option objects on the main thread. On a slow laptop that came to tens of milliseconds a note, and while
// the page was also drawing the globe, notes reached the speakers late: the crackle heard in the Duet.
// Here a note is one OscillatorNode and one GainNode, scheduled ahead on the audio clock.
//
// It sounds the same as Tone.Synth: the browser's own sine, triangle and sawtooth waves (what Tone uses
// for those types too), a linear attack, then decay and release curves with Tone's time constant, peak
// level = velocity, and a note dropped (not stolen) when the polyphony limit is reached, as PolySynth does.

import * as Tone from 'tone';
import { noteHz } from './scales.js';

// Tone's exponential approach: reaches the target within about 1/200 after `seconds`.
const approach = (seconds) => Math.log(seconds + 1) / Math.log(200);

export class LiteSynth {
  /** `context` is a Tone context (live or offline); notes are scheduled on its audio clock. */
  constructor(context, { type = 'sine', envelope, maxPolyphony = 6 } = {}) {
    this.context = context;
    this.raw = context.rawContext;
    this.output = this.raw.createGain();
    this.type = type;
    this.env = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 1, ...envelope };
    this.maxPolyphony = maxPolyphony;
    this.voices = [];
  }

  set({ oscillator, envelope } = {}) {
    if (oscillator?.type) this.type = oscillator.type;
    if (envelope) this.env = { ...this.env, ...envelope };
    return this;
  }

  connect(destination) {
    Tone.connect(this.output, destination);
    return this;
  }

  /** One note or a chord (array), held `duration` seconds from `time`, peak level `velocity`. */
  triggerAttackRelease(notes, duration, time, velocity = 1) {
    const { attack, decay, sustain, release } = this.env;
    const t = Math.max(time, this.raw.currentTime);
    this.voices = this.voices.filter((v) => v.end > this.raw.currentTime);
    for (const note of Array.isArray(notes) ? notes : [notes]) {
      if (this.voices.filter((v) => v.end > t).length >= this.maxPolyphony) continue;
      const osc = this.raw.createOscillator();
      osc.type = this.type;
      osc.frequency.value = noteHz(note);
      const gain = this.raw.createGain();
      const p = gain.gain;
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(velocity, t + attack);
      p.setTargetAtTime(velocity * sustain, t + attack, approach(decay));
      const releaseAt = Math.max(t + duration, t + attack);
      p.setTargetAtTime(0, releaseAt, approach(release));
      const end = releaseAt + release;
      osc.connect(gain);
      gain.connect(this.output);
      osc.onended = () => gain.disconnect();
      osc.start(t);
      osc.stop(end);
      this.voices.push({ osc, gain, start: t, end, release });
    }
  }

  /** Release every note that is sounding or scheduled, from `time` (default: Tone's now). */
  releaseAll(time = this.context.now()) {
    const t = Math.max(time, this.raw.currentTime);
    for (const v of this.voices) {
      if (v.end <= t) continue;
      if (v.start >= t) {            // not started yet: it never plays
        v.osc.stop(v.start);
        v.end = v.start;
        continue;
      }
      const p = v.gain.gain;
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); }
      p.setTargetAtTime(0, t, approach(v.release));
      v.end = t + v.release;
      v.osc.stop(v.end);
    }
    this.voices = this.voices.filter((v) => v.end > t);
    return this;
  }

  dispose() {
    this.voices.forEach((v) => { try { v.osc.stop(); } catch { /* already stopped */ } v.gain.disconnect(); });
    this.voices = [];
    this.output.disconnect();
  }
}
