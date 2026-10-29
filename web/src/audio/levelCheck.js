// Dev-only loudness check used to calibrate the timbre trims in sonify.js.
// In the dev server console:  await __terraVox.levels('greenhouse_gases', [0, 23])
// Renders each frame offline and reports RMS / peak in dBFS.

import * as Tone from 'tone';
import { Voice, getMaster, mapFeatures } from './sonify.js';
import { Duet } from './duet.js';

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

// ------------------------------------------------------------ duet contrast
//
// Is the Duet gap actually audible? Renders the duet offline and measures
// each ear separately:
//   rmsDb        loudness
//   centroidHz   spectral centroid, the "brightness" the ear hears as pitch/buzz
//   notesPerSec  note rate from the mapping (notesPerBar x tempo / 240); exact,
//                where an audio onset detector undercounts legato sine/triangle
// plus stereo separation: with only the oldest voice sounding, how far below
// the left channel the right channel sits (hard pan = large number).
//   await __terraVox.duetContrast('greenhouse_gases')

export async function measureDuet(theme, seconds = 6) {
  const render = (mute) => Tone.Offline(async ({ transport }) => {
    getMaster();
    await Tone.loaded();
    const duet = new Duet();
    duet.setTheme(theme);
    if (mute) duet[mute].out.gain.value = 0;
    transport.start(0);
    duet.start();
  }, seconds, 2, 44100);

  const both = (await render(null)).toArray();
  const oldOnly = (await render('newest')).toArray();
  const newOnly = (await render('oldest')).toArray();

  const sep = (buf, loud, quiet) => +(rmsDb(buf[loud]) - rmsDb(buf[quiet])).toFixed(1);
  const rate = (frame) => { const p = mapFeatures(frame); return +((p.notesPerBar * p.tempoBPM) / 240).toFixed(2); };
  return {
    theme: theme.id,
    left_oldest: channelStats(both[0]),
    right_newest: channelStats(both[1]),
    soloOldest: { ...channelStats(oldOnly[0]), notesPerSec: rate(theme.frames[0]) },
    soloNewest: { ...channelStats(newOnly[1]), notesPerSec: rate(theme.frames[theme.frames.length - 1]) },
    separationDb: { oldestLeftOverRight: sep(oldOnly, 0, 1), newestRightOverLeft: sep(newOnly, 1, 0) },
  };
}

function rmsDb(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return 20 * Math.log10(Math.sqrt(s / x.length) + 1e-12);
}

function channelStats(x, sr = 44100) {
  // spectral centroid over Hann-windowed 2048-sample frames, energy-weighted
  const N = 2048;
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  let num = 0;
  let den = 0;
  for (let start = 0; start + N <= x.length; start += N) {
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let i = 0; i < N; i++) re[i] = x[start + i] * win[i];
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const mag = Math.hypot(re[k], im[k]);
      num += mag * (k * sr) / N;
      den += mag;
    }
  }
  return {
    rmsDb: +rmsDb(x).toFixed(1),
    centroidHz: Math.round(den ? num / den : 0),
  };
}

// in-place iterative radix-2 FFT
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j]; const ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br; im[i + j] = ai + bi;
        re[i + j + len / 2] = ar - br; im[i + j + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
