// Terra Vox app entry: owns state and connects data, audio and UI modules.

import { loadThemes, getTheme } from './data/loader.js';
import { Voice, startAudio, whenHeard } from './audio/sonify.js';
import { Duet, LISTEN_MODES, describeGap } from './audio/duet.js';
import { createThemeTiles } from './ui/themeTiles.js';
import { createTurntable } from './ui/turntable.js';
import { createMappingReadout } from './ui/mappingReadout.js';

const themes = loadThemes();

const state = {
  theme: themes[0],
  index: 0,          // frame currently shown / sounding
  playing: false,
  duet: false,
  listenMode: 'together',
};

let voice = null;
let duet = null;

const announcer = document.getElementById('sr-announcer');
function announce(text) {
  // Clear first so repeating the same sentence is still announced.
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = text; }, 30);
}

const tiles = createThemeTiles(document.getElementById('theme-tiles'), themes, {
  labelledBy: 'themes-heading',
  onSelect: selectTheme,
  onActivate: (id, { toggle }) => { if (toggle || !state.playing) togglePlay(); },
});

const turntable = createTurntable(document.getElementById('player'), {
  onTogglePlay: togglePlay,
  onScrub: scrubTo,
  onStep: step,
  listenModes: LISTEN_MODES,
  onListenMode: setListenMode,
});

const readout = createMappingReadout(document.getElementById('mapping-readout'));

const duetToggle = document.getElementById('duet-toggle');
duetToggle.addEventListener('click', () => toggleDuet());

function currentFrame() {
  return state.theme.frames[state.index];
}

function ensureVoice() {
  if (!voice) {
    voice = new Voice({ name: 'jukebox', level: 0.8 });
    voice.onBar(onBar);
  }
  return voice;
}

// One bar = one frame (one year). Each bar reports which frame it is about to
// play: queue the following year for the next downbeat now, and update the
// screen at the moment the bar is actually heard.
function onBar(event) {
  const { frame } = event;
  if (state.playing && frame.theme === state.theme.id) {
    voice.setFrame(state.theme.frames[(frame.index + 1) % state.theme.frames.length]);
  }
  whenHeard(event.time, () => {
    if (frame.theme !== state.theme.id) return;
    state.index = frame.index;
    render();
  });
}

function render() {
  turntable.showFrame(state.index);
  readout.showFrame(state.theme, currentFrame());
}

function renderDuet() {
  const gap = describeGap(state.theme);
  turntable.showDuet(gap);
  readout.showDuet(state.theme, gap.oldest, gap.newest);
  return gap;
}

function setPlaying(playing) {
  state.playing = playing;
  turntable.setPlaying(playing);
  tiles.setPlaying(state.theme.id, playing);
}

let unlocking = null;
async function unlock() {
  // The first press waits for the browser to unlock audio; ignore repeats
  // until it has, so a double press cannot start and stop in one go.
  if (unlocking) return false;
  unlocking = startAudio();
  try { await unlocking; } finally { unlocking = null; }
  return true;
}

async function togglePlay() {
  if (!(await unlock())) return;
  if (state.duet) {
    if (state.playing) { duet.stop(); setPlaying(false); announce('Duet paused.'); }
    else { duet.start(); setPlaying(true); announce('Duet playing.'); }
    return;
  }
  ensureVoice();
  if (state.playing) {
    voice.stop();
    setPlaying(false);
    announce(`Paused at ${currentFrame().label}.`);
  } else {
    voice.setFrame(currentFrame(), { restart: true });
    voice.start();
    setPlaying(true);
    announce(`Playing ${state.theme.name} from ${currentFrame().label}.`);
  }
}

function selectTheme(id) {
  state.theme = getTheme(id);
  state.index = 0;
  turntable.setTheme(state.theme);
  render();
  if (state.duet) {
    const gap = renderDuet();
    duet.setTheme(state.theme);
    tiles.setPlaying(state.theme.id, state.playing);
    announce(gap.spoken);
    return;
  }
  if (voice) {
    voice.setFrame(currentFrame(), { restart: state.playing });
    if (!state.playing) voice.stop();
  }
  tiles.setPlaying(state.theme.id, state.playing);
  const [y0, y1] = state.theme.yearRange;
  announce(`${state.theme.name}, ${y0} to ${y1}, ${state.theme.frameCount} frames. ${state.playing ? 'Playing.' : 'Press Space to play.'}`);
}

// Scrubbing answers immediately: while playing, a fresh bar starts on the new
// frame; while paused, one bar of the new frame plays as an audition, so a
// keyboard or screen-reader user hears every year they step onto.
let lastAudition = -1;
async function scrubTo(index, { final }) {
  if (index === state.index && !final) return;
  state.index = index;
  render();
  if (!voice && !final) return;
  await startAudio();
  ensureVoice();
  if (state.playing) {
    voice.setFrame(currentFrame(), { restart: true });
  } else if (index !== lastAudition || final) {
    lastAudition = index;
    voice.setFrame(currentFrame());
    voice.start({ bars: 1 });
  }
}

function step(delta) {
  if (state.duet) return;
  const n = state.theme.frames.length;
  scrubTo((state.index + delta + n) % n, { final: true });
}

// ------------------------------------------------------------ duet

// Entering Duet starts it straight away: the oldest and newest year of the
// current theme, together, one in each ear. Leaving returns to the jukebox,
// paused where it was.
async function toggleDuet(on = !state.duet) {
  if (on === state.duet) return;
  if (on && !(await unlock())) return;
  state.duet = on;
  duetToggle.setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('is-duet', on);
  turntable.setDuet(on);

  if (on) {
    voice?.stop();
    if (!duet) {
      duet = new Duet();
      duet.setMode(state.listenMode);
      duet.onBar((e) => whenHeard(e.time, () => { if (state.duet) readout.pulse(e.voice); }));
    }
    const gap = renderDuet();
    turntable.setListenMode(state.listenMode);
    duet.setTheme(state.theme);
    duet.start();
    setPlaying(true);
    meterLoop();
    announce(gap.spoken);
  } else {
    duet.stop();
    setPlaying(false);
    render();
    announce(`Duet off. Back to the ${state.theme.name} timeline at ${currentFrame().label}. Press Space to play.`);
  }
}

function setListenMode(mode) {
  state.listenMode = mode;
  duet?.setMode(mode);
  const help = {
    together: 'Oldest in your left ear, newest in your right, at the same time.',
    turns: 'One bar of the oldest year, then one bar of the newest, centred. Works on one speaker or one earbud.',
    oldest: 'Only the oldest year, centred.',
    newest: 'Only the newest year, centred.',
  };
  announce(`${LISTEN_MODES[mode]}. ${help[mode]}`);
}

function meterLoop() {
  if (!state.duet) return;
  turntable.setMeters(duet.levels());
  requestAnimationFrame(meterLoop);
}

// Minimal global keys (the full keyboard map lands with a11y.js).
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' && e.target.type !== 'range';
  if (typing || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); togglePlay(); }
  else if (e.key === '[') step(-1);
  else if (e.key === ']') step(1);
  else if (e.key === 'd' || e.key === 'D') toggleDuet();
});

tiles.select(state.theme.id);
turntable.setTheme(state.theme);
render();

if (import.meta.env.DEV) {
  window.__terraVox = {
    state,
    themes,
    gap: (id) => describeGap(getTheme(id ?? state.theme.id)),
    voices: () => ({ voice, duet }),
    duetContrast: async (id, seconds) => {
      const { measureDuet } = await import('./audio/levelCheck.js');
      return measureDuet(getTheme(id ?? state.theme.id), seconds);
    },
    audio: () => import('tone').then((Tone) => ({ context: Tone.getContext().state, transport: Tone.getTransport().state, seconds: Tone.getTransport().seconds })),
    levels: async (themeId, indices) => {
      const { measureFrames } = await import('./audio/levelCheck.js');
      const t = getTheme(themeId);
      return measureFrames((indices ?? t.frames.map((_, i) => i)).map((i) => t.frames[i]));
    },
  };
}
