// Terra Vox app entry: owns state and connects data, audio and UI modules.

import { loadThemes, getTheme } from './data/loader.js';
import { Voice, startAudio, whenHeard } from './audio/sonify.js';
import { Duet, LISTEN_MODES, describeGap } from './audio/duet.js';
import { createThemeTiles } from './ui/themeTiles.js';
import { createTurntable } from './ui/turntable.js';
import { createMappingReadout } from './ui/mappingReadout.js';
import { createGuessTheYear } from './ui/guessTheYear.js';
import { createCaptionTrack, altText, VERBOSITY } from './ui/captions.js';
import { createAnnouncer, installShortcuts, createHelpDialog } from './ui/a11y.js';

const themes = loadThemes();

const state = {
  theme: themes[0],
  index: 0,          // frame currently shown / sounding
  playing: false,
  duet: false,
  listenMode: 'together',
  mode: 'jukebox',   // 'jukebox' | 'guess'
};

let voice = null;
let duet = null;

// ------------------------------------------------------------ words

const captions = createCaptionTrack({
  dataEl: document.getElementById('cap-data'),
  soundEl: document.getElementById('cap-sound'),
  liveEl: document.getElementById('sr-captions'),
});

const announceToReader = createAnnouncer(document.getElementById('sr-announcer'));
// Events go to the screen reader, and to the browser voice when "Speak
// aloud" is on, so the app is fully usable without a screen reader too.
function announce(text) {
  announceToReader(text);
  captions.speakOnly(text);
}

// ------------------------------------------------------------ views

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
  altFor: altText,
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
// screen and captions at the moment the bar is actually heard.
function onBar(event) {
  const { frame } = event;
  const playing = state.playing;
  if (playing && frame.theme === state.theme.id) {
    voice.setFrame(state.theme.frames[(frame.index + 1) % state.theme.frames.length]);
  }
  whenHeard(event.time, () => {
    if (frame.theme !== state.theme.id || state.duet) return;
    state.index = frame.index;
    render();
    if (playing) captions.bar(frame);
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
  captions.duet(gap);
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
    captions.describe(currentFrame(), state.theme, { delay: 1400 });
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
  announce(`${state.theme.name}, ${y0} to ${y1}, ${state.theme.frameCount} frames. ${state.theme.signature} data. ${state.playing ? '' : 'Press Space to play.'}`);
  if (!state.playing) captions.describe(currentFrame(), state.theme, { delay: 2200 });
}

// Scrubbing answers immediately: while playing, a fresh bar starts on the new
// frame; while paused, one bar of the new frame plays as an audition and the
// frame is described, so a keyboard or screen-reader user hears every year
// they step onto.
let lastAudition = -1;
async function scrubTo(index, { final }) {
  if (index === state.index && !final) return;
  state.index = index;
  render();
  if (!state.playing) captions.describe(currentFrame(), state.theme);
  if (!voice && !final) return;
  if (!(await unlock())) return;
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

function repeatDescription() {
  if (state.duet) announce(describeGap(state.theme).spoken);
  else captions.describe(currentFrame(), state.theme, { delay: 0 });
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

const LISTEN_HELP = {
  together: 'Oldest in your left ear, newest in your right, at the same time.',
  turns: 'One bar of the oldest year, then one bar of the newest, centred. Works on one speaker or one earbud.',
  oldest: 'Only the oldest year, centred.',
  newest: 'Only the newest year, centred.',
};

function setListenMode(mode) {
  state.listenMode = mode;
  duet?.setMode(mode);
  turntable.setListenMode(mode);
  announce(`${LISTEN_MODES[mode]}. ${LISTEN_HELP[mode]}`);
}

function cycleListenMode() {
  const modes = Object.keys(LISTEN_MODES);
  setListenMode(modes[(modes.indexOf(state.listenMode) + 1) % modes.length]);
}

function meterLoop() {
  if (!state.duet) return;
  turntable.setMeters(duet.levels());
  requestAnimationFrame(meterLoop);
}

// ------------------------------------------------------------ modes

const guess = createGuessTheYear(document.getElementById('panel-guess'), { themes, unlock, announce });
const modeTabs = [...document.querySelectorAll('.modes [role="tab"]')];

function setMode(mode) {
  if (mode === state.mode) return;
  state.mode = mode;
  modeTabs.forEach((tab) => {
    const on = tab.id === `tab-${mode}`;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  document.getElementById('panel-jukebox').hidden = mode !== 'jukebox';
  document.getElementById('panel-guess').hidden = mode !== 'guess';
  duetToggle.hidden = mode !== 'jukebox';
  if (mode === 'guess') {
    if (state.duet) toggleDuet(false);
    voice?.stop();
    setPlaying(false);
    guess.activate();
  } else {
    guess.deactivate();
    announce('Jukebox. Choose a theme and press Space to play, or D for Duet.');
  }
}

modeTabs.forEach((tab, i) => {
  tab.addEventListener('click', () => setMode(tab.id.replace('tab-', '')));
  tab.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = modeTabs[(i + d + modeTabs.length) % modeTabs.length];
    next.focus();
    setMode(next.id.replace('tab-', ''));
  });
});

// ------------------------------------------------------------ settings

const prefs = loadPrefs();
const describeSelect = document.getElementById('describe');
const speakToggle = document.getElementById('speak-toggle');

function setVerbosity(v, { say = true } = {}) {
  captions.setVerbosity(v);
  describeSelect.value = v;
  savePrefs({ verbosity: v });
  if (say) announce(`Descriptions: ${VERBOSITY[v]}.`);
}

function setSpeak(on, { say = true } = {}) {
  captions.setSpeak(on);
  speakToggle.setAttribute('aria-pressed', String(on));
  savePrefs({ speak: on });
  if (say) announce(on ? 'Speaking descriptions aloud.' : 'Speech off.');
}

describeSelect.addEventListener('change', () => setVerbosity(describeSelect.value));
speakToggle.addEventListener('click', () => setSpeak(!captions.speak));
if (!captions.hasSpeech) speakToggle.hidden = true;

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('terra-vox-prefs') ?? '{}'); } catch { return {}; }
}
function savePrefs(patch) {
  try { localStorage.setItem('terra-vox-prefs', JSON.stringify({ ...loadPrefs(), ...patch })); } catch { /* private mode */ }
}

// ------------------------------------------------------------ keyboard

const jukebox = () => state.mode === 'jukebox';
const SHORTCUTS = [
  { keys: [' '], label: 'Play / pause', run: togglePlay, when: jukebox },
  { keys: ['['], label: 'Previous year', run: () => step(-1), when: jukebox },
  { keys: [']'], label: 'Next year', run: () => step(1), when: jukebox },
  { keys: ['1', '2', '3', '4'], label: 'Choose theme 1–4 and play', when: jukebox,
    run: (e) => { const t = themes[Number(e.key) - 1]; tiles.select(t.id, { notify: true }); if (!state.playing) togglePlay(); } },
  { keys: ['d'], label: 'Duet on / off (oldest left, newest right)', run: () => toggleDuet(), when: jukebox },
  { keys: ['l'], label: 'Duet: next listening mode', run: cycleListenMode, when: () => jukebox() && state.duet },
  { keys: ['r'], label: 'Repeat the description', run: repeatDescription, when: jukebox },
  { keys: ['c'], label: 'Description detail: off / brief / full', run: () => {
    const order = Object.keys(VERBOSITY);
    setVerbosity(order[(order.indexOf(captions.verbosity) + 1) % order.length]);
  } },
  { keys: ['s'], label: 'Speak aloud on / off', run: () => setSpeak(!captions.speak) },
  { keys: ['g'], label: 'Switch Jukebox / Guess the Year', run: () => {
    const m = state.mode === 'jukebox' ? 'guess' : 'jukebox';
    setMode(m);
    document.getElementById(`tab-${m}`).focus();
  } },
  { keys: ['?', 'h'], label: 'Show these shortcuts', run: () => help.open() },
];

installShortcuts(SHORTCUTS);

const help = createHelpDialog(document.getElementById('help-dialog'), [document.getElementById('help-button')], [
  { title: 'Jukebox', items: SHORTCUTS.filter((s) => s.when === jukebox || s.keys[0] === 'l') },
  { title: 'Timeline (when focused)', items: [
    { keys: ['ArrowLeft', 'ArrowRight'], label: 'Step one year (plays it)' },
    { keys: ['Home', 'End'], label: 'Oldest / newest year' },
  ] },
  { title: 'Guess the Year', items: [
    { keys: [' '], label: 'Play / stop the mystery year' },
    { keys: ['a'], label: 'Hear the oldest year' },
    { keys: ['b'], label: 'Hear the newest year' },
    { keys: ['1', '2', '3', '4'], label: 'Answer' },
    { keys: ['Enter'], label: 'Next round' },
  ] },
  { title: 'Anywhere', items: SHORTCUTS.filter((s) => !s.when) },
]);

// ------------------------------------------------------------ start

setVerbosity(prefs.verbosity ?? 'brief', { say: false });
setSpeak(prefs.speak ?? false, { say: false });
tiles.select(state.theme.id);
turntable.setTheme(state.theme);
render();
captions.show(currentFrame());

if (import.meta.env.DEV) {
  window.__terraVox = {
    state,
    themes,
    gap: (id) => describeGap(getTheme(id ?? state.theme.id)),
    alt: (id, i = 0) => altText(getTheme(id).frames[i], getTheme(id)),
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
