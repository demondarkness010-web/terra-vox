import * as Tone from 'tone';
import { loadThemes, getTheme } from './data/loader.js';
import { Voice, mapFeatures, barPlan, startAudio, getMaster } from './audio/sonify.js';

const status = document.getElementById('status');
const themes = loadThemes();
status.textContent = `Loaded ${themes.length} themes, ${themes.reduce((n, t) => n + t.frames.length, 0)} frames.`;

// Milestone-3 harness: play Wildfires through the engine, frame by frame.
let voice = null;
const btn = document.createElement('button');
btn.textContent = 'Play Wildfires';
document.getElementById('app').append(btn);
btn.addEventListener('click', async () => {
  await startAudio();
  const theme = getTheme('wildfires');
  if (!voice) {
    voice = new Voice({ name: 'test' });
    let i = 0;
    voice.setFrame(theme.frames[0]);
    voice.onBar((e) => {
      status.textContent = `${e.frame.label}: ${JSON.stringify(e.params)}`;
      if (e.bar % 2 === 1) voice.setFrame(theme.frames[(i = (i + 1) % theme.frames.length)]);
    });
  }
  if (voice.running) { voice.stop(); btn.textContent = 'Play Wildfires'; } else { voice.start(); btn.textContent = 'Stop'; }
});

// Offline level check: render each frame and report RMS / peak in dBFS.
async function measure(themeId, seconds = 3, frames = null) {
  const theme = getTheme(themeId);
  const list = (frames ?? theme.frames.map((_, i) => i)).map((i) => theme.frames[i]);
  return measureFrames(list, seconds);
}

async function measureFrames(list, seconds = 3) {
  const out = [];
  for (const frame of list) {
    const buf = await Tone.Offline(async ({ transport }) => {
      const m = getMaster();
      await Tone.loaded();
      const v = new Voice({ name: 'offline', destination: m.input });
      v.setFrame(frame);
      transport.start(0);
      v.start();
    }, seconds, 2, 44100);
    const ch = buf.getChannelData(0);
    const ch2 = buf.toArray()[1];
    let sum = 0; let peak = 0;
    for (let k = 0; k < ch.length; k++) { const s = Math.max(Math.abs(ch[k]), Math.abs(ch2[k])); sum += (ch[k] ** 2 + ch2[k] ** 2) / 2; if (s > peak) peak = s; }
    const rms = Math.sqrt(sum / ch.length);
    out.push({ date: frame.date, ...mapFeatures(frame), rmsDb: +(20 * Math.log10(rms)).toFixed(1), peakDb: +(20 * Math.log10(peak)).toFixed(1) });
  }
  return out;
}

window.__tv = { Tone, themes, mapFeatures, barPlan, measure, measureFrames };
