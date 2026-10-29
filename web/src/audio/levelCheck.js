// Dev-only loudness check used to calibrate the timbre trims in sonify.js.
// In the dev server console:  await __terraVox.levels('greenhouse_gases', [0, 23])
// Renders each frame offline and reports RMS / peak in dBFS.

import * as Tone from 'tone';
import { Voice, getMaster, mapFeatures } from './sonify.js';

export async function measureFrames(frames, seconds = 3.2) {
  const out = [];
  for (const frame of frames) {
    const buf = await Tone.Offline(async ({ transport }) => {
      const m = getMaster();
      await Tone.loaded();
      const v = new Voice({ name: 'offline', destination: m.input, level: 0.8 });
      v.setFrame(frame);
      transport.start(0);
      v.start();
    }, seconds, 2, 44100);
    const [l, r] = buf.toArray();
    let sum = 0;
    let peak = 0;
    for (let k = 0; k < l.length; k++) {
      sum += (l[k] ** 2 + r[k] ** 2) / 2;
      peak = Math.max(peak, Math.abs(l[k]), Math.abs(r[k]));
    }
    out.push({
      date: frame.date,
      ...mapFeatures(frame),
      rmsDb: +(20 * Math.log10(Math.sqrt(sum / l.length))).toFixed(1),
      peakDb: +(20 * Math.log10(peak)).toFixed(1),
    });
  }
  return out;
}
