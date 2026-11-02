// Terra Vox app entry: owns state and connects data, audio and UI modules.

import '@fontsource-variable/anybody/standard.css';
import '@fontsource-variable/atkinson-hyperlegible-next/index.css';
import { loadThemes, loadSideB, getTheme, trackFor, airRegions, setAirRegion, context } from './data/loader.js';
import { Voice, startAudio, whenHeard } from './audio/sonify.js';
import { Duet, LISTEN_MODES, describeGap } from './audio/duet.js';
import { createThemeTiles } from './ui/themeTiles.js';
import { createTurntable, createSegmented } from './ui/turntable.js';
import { createFieldGuide } from './ui/fieldGuide.js';
import { createMapKey } from './ui/mapKey.js';
import { createMappingReadout } from './ui/mappingReadout.js';
import { createGuessTheYear } from './ui/guessTheYear.js';
import { createCaptionTrack, altText, VERBOSITY } from './ui/captions.js';
import { createAnnouncer, installShortcuts, createHelpDialog } from './ui/a11y.js';
import { motionReduced } from './ui/tokens.js';

const themes = loadThemes();
const sidesB = loadSideB();

const state = {
  theme: themes[0],  // the track playing: a theme's side A or side B
  side: 'a',         // 'a' = year by year (GIBS) | 'b' = NASA EIC visualization
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
  prevEl: document.getElementById('cap-prev'),
  trackEl: document.getElementById('caption-track'),
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
const guide = createFieldGuide(document.getElementById('field-guide'));
const mapKey = createMapKey(document.getElementById('map-key'));

// Side A / side B, like a record: A is the calibrated year-by-year record,
// B is the theme's NASA Earth Information Center visualization. The switch
// lives behind More; F flips it from anywhere.
const SIDES = { a: 'Side A, every year', b: 'Side B, NASA EIC' };
const sideSwitch = document.getElementById('side-switch');
const sideNote = document.getElementById('side-note');
const sides = createSegmented(document.getElementById('side-modes'), SIDES, (side) => setSide(side));
sideSwitch.hidden = Object.keys(sidesB).length === 0;

// Air Quality follows one region at a time: the global mean barely moves,
// while North China has cleaned up and northern India has grown dirtier.
const regionSwitch = document.getElementById('region-switch');
const regions = createSegmented(document.getElementById('region-modes'),
  Object.fromEntries(airRegions().map((r) => [r.id, r.short])), (id) => loadTrack(setAirRegion(id)));
const story = document.getElementById('track-story');

// Everything that depends on which track is loaded, but not on the frame.
function showTrack() {
  const t = state.theme;
  sides.select(t.side);
  const b = sidesB[t.parent];
  sideSwitch.querySelector('[data-value="b"]').disabled = !b;
  sideNote.textContent = t.side === 'b'
    ? `Side B: NASA EIC visualization ${t.svs}, ${t.title}`
    : `${t.dataset}, NASA GIBS, ${t.rangeLabel[0]}–${t.rangeLabel[1]}`;
  regionSwitch.hidden = !t.region;
  if (t.region) regions.select(t.region.id);
  const line = t.side === 'a' ? context?.themes?.[t.parent]?.story : null;
  story.hidden = !line;
  story.textContent = line ?? '';
  mapKey.setTrack(t);
  guide.setTrack(t, b);
}

const duetToggle = document.getElementById('duet-toggle');
duetToggle.addEventListener('click', () => toggleDuet());

function currentFrame() {
  return state.theme.frames[state.index];
}

// The interface moves on the music's clock (DESIGN.md, Motion): one beat of
// the bar just heard, written to --beat for the ring, captions and sparks.
function setBeat(bpm) {
  if (bpm > 0) document.documentElement.style.setProperty('--beat', `${Math.round(60000 / bpm)}ms`);
}

function ensureVoice() {
  if (!voice) {
    voice = new Voice({ name: 'jukebox', level: 0.8 });
    voice.setSweep(state.theme.frames.length);   // stereo is time: oldest left, newest right
    voice.onBar(onBar);
    // Each note blooms on the globe at a real place in the data, when it is heard.
    voice.onNote((n) => whenHeard(n.time, () => {
      if (!state.duet && state.playing && n.frame.theme === state.theme.id && state.side === 'a') turntable.spark('single', n.frame, n.velocity);
    }));
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
    setBeat(event.params.tempoBPM);
    turntable.beat('single', event.params);
    if (playing) captions.bar(frame);
  });
}

function render() {
  turntable.showFrame(state.index);
  readout.showFrame(state.theme, currentFrame());
  guide.showFrame(currentFrame());
  syncReadScroll();
}

// On short screens the reading scrolls inside its panel; only then does it
// take a tab stop, so a keyboard can scroll it too.
const nowRead = document.getElementById('now-read');
function syncReadScroll() {
  if (nowRead.scrollHeight > nowRead.clientHeight + 1) {
    nowRead.tabIndex = 0;
    nowRead.setAttribute('role', 'region');
    nowRead.setAttribute('aria-label', 'Current reading');
  } else {
    ['tabindex', 'role', 'aria-label'].forEach((a) => nowRead.removeAttribute(a));
  }
}
new ResizeObserver(syncReadScroll).observe(nowRead);

function renderDuet() {
  const gap = describeGap(state.theme);
  turntable.showDuet(gap);
  readout.showDuet(state.theme, gap.oldest, gap.newest);
  captions.duet(gap);
  guide.showDuet(gap.oldest, gap.newest);
  return gap;
}

function setPlaying(playing) {
  state.playing = playing;
  turntable.setPlaying(playing);
  tiles.setPlaying(state.theme.parent, playing);
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
  loadTrack(trackFor(id, state.side));
}

// Load a track (a theme's side A or B) into the player, keeping play state.
function loadTrack(track) {
  state.theme = track;
  state.side = track.side;
  state.index = 0;
  turntable.setTheme(state.theme);
  showTrack();
  render();
  if (state.duet) {
    const gap = renderDuet();
    duet.setTheme(state.theme);
    tiles.setPlaying(state.theme.parent, state.playing);
    announce(gap.spoken);
    return;
  }
  if (voice) {
    voice.setSweep(track.frames.length);
    voice.setFrame(currentFrame(), { restart: state.playing });
    if (!state.playing) voice.stop();
  }
  tiles.setPlaying(state.theme.parent, state.playing);
  const [y0, y1] = state.theme.rangeLabel;
  const what = track.side === 'b' ? `side B, NASA's ${track.title} visualization` : 'side A, year by year';
  const where = track.region ? `, over ${track.region.over}` : '';
  announce(`${state.theme.name}${where}, ${what}: ${y0} to ${y1}, ${state.theme.frameCount} frames. ${state.theme.signature}. ${state.playing ? '' : 'Press Space to play.'}`);
  if (!state.playing) captions.describe(currentFrame(), state.theme, { delay: 2200 });
}

function setSide(side) {
  const next = trackFor(state.theme.parent, side);
  if (next === state.theme) { sides.select(state.side); return; }
  loadTrack(next);
}

function flipSide() {
  setSide(state.side === 'a' ? 'b' : 'a');
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
      duet.onBar((e) => whenHeard(e.time, () => {
        if (!state.duet) return;
        readout.pulse(e.voice);
        setBeat(e.params.tempoBPM);
        turntable.beat(e.voice, e.params);
        turntable.setTurn(e.voice);
      }));
      [duet.oldest, duet.newest].forEach((v) => v.onNote((n) => whenHeard(n.time, () => {
        if (state.duet && state.playing && state.side === 'a') turntable.spark(n.voice, n.frame, n.velocity);
      })));
    }
    const gap = renderDuet();
    turntable.setListenMode(state.listenMode, LISTEN_HELP[state.listenMode]);
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
  turntable.setListenMode(mode, LISTEN_HELP[mode]);
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
const moreToggle = document.getElementById('more-toggle');

function setMode(mode) {
  if (mode === state.mode) return;
  state.mode = mode;
  document.getElementById('panel-jukebox').hidden = mode !== 'jukebox';
  document.getElementById('panel-guess').hidden = mode !== 'guess';
  duetToggle.hidden = mode !== 'jukebox';
  moreToggle.hidden = mode !== 'jukebox';
  if (mode === 'guess') {
    if (state.duet) toggleDuet(false);
    voice?.stop();
    setPlaying(false);
    guess.activate();
    document.getElementById('guess-heading').focus();
  } else {
    guess.deactivate();
    document.getElementById('player').focus();
    announce('Jukebox. Choose a theme and press Space to play, or D for Duet.');
  }
}

document.getElementById('open-guess').addEventListener('click', () => setMode('guess'));
document.getElementById('close-guess').addEventListener('click', () => setMode('jukebox'));

// ------------------------------------------------------------ more

// The first screen is: pick a theme, press play, Duet. Everything else
// (Guess the Year, side B, the field guide, the mapping desk) sits behind
// one More button, below the player.
const more = document.getElementById('more');

function setMore(open) {
  more.hidden = !open;
  moreToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    const heading = document.getElementById('more-heading');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ behavior: motionReduced() ? 'auto' : 'smooth', block: 'start' });
  }
}
moreToggle.addEventListener('click', () => setMore(more.hidden));

// ------------------------------------------------------------ settings

const prefs = loadPrefs();
const describeSelect = document.getElementById('describe');
const speakToggle = document.getElementById('speak-toggle');
const motionToggle = document.getElementById('motion-toggle');
const osReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

// Motion: full or reduce on html[data-motion]. Follows the OS setting until
// the listener chooses; the choice is remembered (WCAG 2.2.2 for the planet).
function setMotion(mode, { save = true, say = true } = {}) {
  document.documentElement.dataset.motion = mode;
  motionToggle.setAttribute('aria-pressed', String(mode === 'reduce'));
  if (save) savePrefs({ motion: mode });
  if (say) announce(mode === 'reduce' ? 'Reduce motion on. The planet holds still.' : 'Reduce motion off.');
}
motionToggle.addEventListener('click', () => setMotion(document.documentElement.dataset.motion === 'reduce' ? 'full' : 'reduce'));
osReduce.addEventListener('change', () => {
  if (!loadPrefs().motion) setMotion(osReduce.matches ? 'reduce' : 'full', { save: false, say: false });
});

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
  { keys: ['f'], label: 'Flip the record: side A (every year) / side B (NASA EIC visualization)', run: flipSide, when: () => jukebox() && Object.keys(sidesB).length > 0 },
  { keys: ['l'], label: 'Duet: next listening mode', run: cycleListenMode, when: () => jukebox() && state.duet },
  { keys: ['r'], label: 'Repeat the description', run: repeatDescription, when: jukebox },
  { keys: ['c'], label: 'Description detail: off / brief / full', run: () => {
    const order = Object.keys(VERBOSITY);
    setVerbosity(order[(order.indexOf(captions.verbosity) + 1) % order.length]);
  } },
  { keys: ['s'], label: 'Speak aloud on / off', run: () => setSpeak(!captions.speak) },
  { keys: ['m'], label: 'Reduce motion on / off', run: () => motionToggle.click() },
  { keys: ['g'], label: 'Guess the Year / back to the jukebox', run: () => setMode(state.mode === 'jukebox' ? 'guess' : 'jukebox') },
  { keys: ['?', 'h'], label: 'Show these shortcuts', run: () => help.open() },
];

installShortcuts(SHORTCUTS);

const help = createHelpDialog(document.getElementById('help-dialog'), [document.getElementById('help-button')], [
  { title: 'Jukebox', items: SHORTCUTS.filter((s) => s.when === jukebox || ['l', 'f'].includes(s.keys[0])) },
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

// ------------------------------------------------------------ introduction

// Shown once. "Start" unlocks audio inside this click and drops straight into
// the strongest moment: Duet on methane, 2003 against 2026.
const intro = document.getElementById('intro');
const INTRO_THEME = 'greenhouse_gases';

// Phones and tablets only let sound start from a tap, so the button says so.
if (window.matchMedia('(pointer: coarse)').matches) {
  document.getElementById('intro-start').textContent = 'Headphones on, tap to start sound';
}

function openIntro() {
  if (help.isOpen) help.close();
  if (!intro.open) intro.showModal();
}

function closeIntro() {
  if (intro.open) intro.close();
  savePrefs({ introSeen: true });
}

document.getElementById('intro-start').addEventListener('click', () => {
  closeIntro();
  if (state.mode !== 'jukebox') setMode('jukebox');
  tiles.select(INTRO_THEME, { notify: true });
  if (state.duet) { if (!state.playing) togglePlay(); } else toggleDuet(true);
  document.getElementById('player').focus();
});
document.getElementById('intro-skip').addEventListener('click', () => {
  closeIntro();
  document.getElementById('player').focus();
});
intro.addEventListener('cancel', () => savePrefs({ introSeen: true }));
document.getElementById('intro-again').addEventListener('click', openIntro);

// ------------------------------------------------------------ start

setMotion(prefs.motion ?? (osReduce.matches ? 'reduce' : 'full'), { save: false, say: false });
setVerbosity(prefs.verbosity ?? 'brief', { say: false });
setSpeak(prefs.speak ?? false, { say: false });
tiles.select(state.theme.id);
turntable.setTheme(state.theme);
showTrack();
render();
captions.show(currentFrame());
if (!prefs.introSeen) openIntro();

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
