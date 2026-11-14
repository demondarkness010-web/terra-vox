// Terra Vox app entry: owns state and connects data, audio and UI modules.

import '@fontsource-variable/anybody/standard.css';
import '@fontsource-variable/atkinson-hyperlegible-next/index.css';
import { loadThemes, loadSideB, getTheme, trackFor, airRegions, setAirRegion, context, frameForYear, oldestFrame, newestFrame } from './data/loader.js';
import { referenceFrames } from './data/trust.js';
import { Voice, startAudio, whenHeard } from './audio/sonify.js';
import { Duet, LISTEN_MODES, describeGap, duetPair } from './audio/duet.js';
import { createThemeTiles } from './ui/themeTiles.js';
import { createTurntable, createSegmented } from './ui/turntable.js';
import { createFieldGuide } from './ui/fieldGuide.js';
import { createMapKey } from './ui/mapKey.js';
import { createMappingReadout } from './ui/mappingReadout.js';
import { createGuessTheYear } from './ui/guessTheYear.js';
import { createCaptionTrack, altText, VERBOSITY } from './ui/captions.js';
import { createAnnouncer, installShortcuts, createHelpDialog } from './ui/a11y.js';
import { motionReduced } from './ui/tokens.js';
import { t, tn, setLang, lang, LANGS, applyStatic, preferredLang, onLang } from './i18n/index.js';

const prefs = loadPrefs();
setLang(prefs.lang ?? preferredLang());
applyStatic();

const themes = loadThemes();
const sidesB = loadSideB();

const state = {
  theme: themes[0],  // the track playing: a theme's side A or side B
  side: 'a',         // 'a' = then and now (GIBS, year by year) | 'b' = NASA EIC visualization
  index: 0,          // frame currently shown / sounding
  playing: false,
  duet: false,
  listenMode: 'together',
  mode: 'jukebox',   // 'jukebox' | 'guess'
  left: null,        // Duet's left year (Your year, or a shared link); null = oldest
  right: null,       // Duet's right year; null = newest
  reference: false,  // NOAA's quiet third voice in Duet (N)
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

// The first screen's view switch, above the themes: "Then and now" (side A,
// the calibrated record, played as a Duet) or "NASA EIC visualizations"
// (side B, the Earth Information Center's own frames, played as they
// appear). F flips it from anywhere.
const hasSideB = Object.keys(sidesB).length > 0;
const viewSwitch = document.getElementById('view-switch');
const views = createSegmented(document.getElementById('view-modes'), ['a', 'b'], (side) => chooseView(side), (v) => t(`view.${v}`));
viewSwitch.hidden = !hasSideB;

const sideNote = document.getElementById('side-note');
const eicCredit = document.getElementById('eic-credit');

// Air Quality follows one region at a time: the global mean barely moves,
// while North China has cleaned up and northern India has grown dirtier.
const regionSwitch = document.getElementById('region-switch');
const regions = createSegmented(document.getElementById('region-modes'),
  airRegions().map((r) => r.id), (id) => loadTrack(setAirRegion(id)), (id) => t(`region.${id}.short`));
const story = document.getElementById('track-story');

// Everything that depends on which track is loaded, but not on the frame.
function showTrack() {
  const tr = state.theme;
  views.select(tr.side);
  const b = sidesB[tr.parent];
  viewSwitch.querySelector('[data-value="b"]').disabled = !b;
  sideNote.textContent = tr.side === 'b' ? '' : t('sideNote.a', { dataset: tr.dataset, from: tr.rangeLabel[0], to: tr.rangeLabel[1] });
  sideNote.hidden = tr.side === 'b';
  // Side B: the visualization's own title, NASA credit and a link to its page.
  eicCredit.hidden = tr.side !== 'b';
  if (tr.side === 'b') {
    const link = eicCredit.querySelector('a');
    link.href = tr.page;
    link.textContent = t('eic.title', { svs: tr.svs, title: tr.title });
    eicCredit.querySelector('.eic-credit-text').textContent = tr.credits;
  }
  regionSwitch.hidden = !tr.region;
  if (tr.region) regions.select(tr.region.id);
  const line = tr.side === 'a' ? t(`story.${tr.parent}`) : null;
  story.hidden = !line;
  story.textContent = line ?? '';
  mapKey.setTrack(tr);
  guide.setTrack(tr, b);
  const p = duetPair(tr, yearsFor(tr));
  refToggle.hidden = !referenceFrames(tr, p.left, p.right);
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
    nowRead.setAttribute('aria-label', t('nowRead.label'));
  } else {
    ['tabindex', 'role', 'aria-label'].forEach((a) => nowRead.removeAttribute(a));
  }
}
new ResizeObserver(syncReadScroll).observe(nowRead);

// ------------------------------------------------------------ the pair

// The Duet's two years on a track: Your year (kept as typed) clamped to
// that record's range, so switching theme clamps it again.
function yearsFor(track) {
  if (track.side !== 'a') return { left: null, right: null };
  const clamp = (y) => (y === null ? null : frameForYear(track, y).frame.year);
  return { left: clamp(state.left), right: clamp(state.right) };
}

function currentPair() {
  return duetPair(state.theme, yearsFor(state.theme));
}

function renderDuet() {
  const pair = currentPair();
  const gap = describeGap(state.theme, pair);
  turntable.showDuet(gap);
  readout.showDuet(state.theme, gap.oldest, gap.newest);
  captions.duet(gap);
  guide.showDuet(gap.oldest, gap.newest);
  refToggle.hidden = !referenceFrames(state.theme, pair.left, pair.right);
  writeUrl();
  return gap;
}

// Push the pair (theme, years, reference) into the Duet's voices.
function loadDuetVoices() {
  const pair = currentPair();
  duet.setTheme(state.theme, pair, referenceFrames(state.theme, pair.left, pair.right));
  duet.setReference(state.reference);
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
    if (state.playing) { duet.stop(); setPlaying(false); announce(t('say.duetPaused')); }
    else { duet.start(); setPlaying(true); announce(t('say.duetPlaying')); }
    return;
  }
  ensureVoice();
  if (state.playing) {
    voice.stop();
    setPlaying(false);
    announce(t('say.pausedAt', { label: currentFrame().label }));
    captions.describe(currentFrame(), state.theme, { delay: 1400 });
  } else {
    voice.setFrame(currentFrame(), { restart: true });
    voice.start();
    setPlaying(true);
    announce(t('say.playingFrom', { theme: state.theme.name, label: currentFrame().label }));
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
    loadDuetVoices();
    tiles.setPlaying(state.theme.parent, state.playing);
    announce(`${clampNote()}${gap.spoken}`);
    return;
  }
  if (voice) {
    voice.setSweep(track.frames.length);
    voice.setFrame(currentFrame(), { restart: state.playing });
    if (!state.playing) voice.stop();
  }
  tiles.setPlaying(state.theme.parent, state.playing);
  const [y0, y1] = state.theme.rangeLabel;
  const what = track.side === 'b' ? t('say.whatB', { title: track.title }) : t('say.whatA');
  const where = track.region ? t('gap.over', { over: track.region.over }) : '';
  announce(t('say.loaded', { theme: state.theme.name, where, what, from: y0, to: y1, frames: tn('count.frames', state.theme.frameCount), signature: state.theme.signature })
    + (state.playing ? '' : ` ${t('say.pressSpace')}`));
  if (!state.playing) captions.describe(currentFrame(), state.theme, { delay: 2200 });
}

// The view switch. "NASA EIC visualizations" plays the visualization frame
// by frame as it appears; "Then and now" returns to the record as a Duet.
async function chooseView(side) {
  const next = trackFor(state.theme.parent, side);
  if (next === state.theme) { views.select(state.side); return; }
  if (side === 'b') {
    if (state.duet) await toggleDuet(false, { quiet: true });
    loadTrack(next);
    if (!state.playing) await togglePlay();
    announce(t('say.eicView', { title: next.title, credit: next.credits }));
  } else {
    loadTrack(next);
    if (!state.duet) await toggleDuet(true);
  }
}

function flipSide() {
  if (!hasSideB) return;
  chooseView(state.side === 'a' ? 'b' : 'a');
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
  if (state.duet) announce(describeGap(state.theme, currentPair()).spoken);
  else captions.describe(currentFrame(), state.theme, { delay: 0 });
}

// ------------------------------------------------------------ duet

// Entering Duet starts it straight away: the left year (the oldest, or Your
// year) and the newest year of the current theme, together, one in each ear.
// Leaving returns to the jukebox, paused where it was.
async function toggleDuet(on = !state.duet, { quiet = false } = {}) {
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
      duet.onPhase(({ phase, time }) => whenHeard(time, () => {
        if (!state.duet) return;
        const { left, right } = currentPair();
        const years = { year: phase === 'left' ? left.year : right.year };
        if (phase === 'both') {
          turntable.setIntro('both', t(`listenHelp.${state.listenMode}`), state.listenMode);
        } else {
          turntable.setIntro(phase, t(`intro.${phase}`, years));
        }
      }));
      [duet.oldest, duet.newest].forEach((v) => v.onNote((n) => whenHeard(n.time, () => {
        if (state.duet && state.playing && state.side === 'a') turntable.spark(n.voice, n.frame, n.velocity);
      })));
    }
    const gap = renderDuet();
    turntable.setListenMode(state.listenMode, t(`listenHelp.${state.listenMode}`));
    loadDuetVoices();
    duet.start({ introduce: true });
    setPlaying(true);
    meterLoop();
    announce(`${clampNote()}${gap.spoken}`);
  } else {
    duet.stop();
    setPlaying(false);
    render();
    writeUrl();
    if (!quiet) announce(t('say.duetOff', { theme: state.theme.name, label: currentFrame().label }));
  }
}

function setListenMode(mode) {
  state.listenMode = mode;
  duet?.setMode(mode);
  turntable.setListenMode(mode, t(`listenHelp.${mode}`));
  announce(`${t(`listen.${mode}`)}. ${t(`listenHelp.${mode}`)}`);
}

function cycleListenMode() {
  setListenMode(LISTEN_MODES[(LISTEN_MODES.indexOf(state.listenMode) + 1) % LISTEN_MODES.length]);
}

function meterLoop() {
  if (!state.duet) return;
  turntable.setMeters(duet.levels());
  requestAnimationFrame(meterLoop);
}

// NOAA's independent record as a quiet third voice, centred (N).
const refToggle = document.getElementById('ref-toggle');
function toggleReference(on = !state.reference) {
  if (!state.duet) { announce(t('say.refNeedsDuet')); return; }
  const pair = currentPair();
  if (!referenceFrames(state.theme, pair.left, pair.right)) { announce(t('say.refNone', { theme: state.theme.name })); return; }
  state.reference = on;
  duet.setReference(on);
  refToggle.setAttribute('aria-pressed', String(on));
  announce(t(on ? 'say.refOn' : 'say.refOff'));
}
refToggle.addEventListener('click', () => toggleReference());

// ------------------------------------------------------------ your year + shared links

// "Records start in 2003, so 2003 is used." when Your year falls outside the record.
function clampNote() {
  if (state.side !== 'a' || state.left === null) return '';
  const { frame, clamped } = frameForYear(state.theme, state.left);
  return clamped ? `${t(state.left < oldestFrame(state.theme).year ? 'clamp.before' : 'clamp.after', { asked: state.left, used: frame.year })} ` : '';
}

// The URL carries the Duet: ?theme=greenhouse_gases&left=2005&right=2026
// (&region=..., &view=eic, &lang=hi). Nothing is stored or sent anywhere.
function writeUrl() {
  const url = new URL(window.location.href);
  ['theme', 'left', 'right', 'region', 'view', 'ref'].forEach((k) => url.searchParams.delete(k));
  if (state.duet || state.side === 'b') {
    url.searchParams.set('theme', state.theme.parent);
    if (state.side === 'b') url.searchParams.set('view', 'eic');
    else {
      const pair = currentPair();
      url.searchParams.set('left', String(pair.left.year));
      url.searchParams.set('right', String(pair.right.year));
      if (state.theme.region) url.searchParams.set('region', state.theme.region.id);
      if (state.reference) url.searchParams.set('ref', '1');
    }
  }
  if (lang() !== 'en') url.searchParams.set('lang', lang());
  else url.searchParams.delete('lang');
  window.history.replaceState(null, '', url);
}

function readUrl() {
  const q = new URL(window.location.href).searchParams;
  const year = (k) => (q.has(k) && /^\d{4}$/.test(q.get(k)) ? Number(q.get(k)) : null);
  const theme = themes.find((th) => th.id === q.get('theme'))?.id ?? null;
  return {
    theme,
    left: year('left'),
    right: year('right'),
    region: airRegions().some((r) => r.id === q.get('region')) ? q.get('region') : null,
    view: q.get('view') === 'eic' ? 'b' : 'a',
    ref: q.get('ref') === '1',
    lang: LANGS[q.get('lang')] ? q.get('lang') : null,
  };
}

const copyBtn = document.getElementById('copy-link');
const copyStatus = document.getElementById('copy-status');
copyBtn.addEventListener('click', async () => {
  writeUrl();
  let ok = false;
  try { await navigator.clipboard.writeText(window.location.href); ok = true; } catch { /* no clipboard permission */ }
  const msg = ok ? t('link.copied') : t('link.manual', { url: window.location.href });
  copyStatus.textContent = msg;
  announce(msg);
});

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
  // The skip link must point at something on screen: the player is hidden in Guess the Year.
  const skip = document.querySelector('.skip-link');
  skip.setAttribute('href', mode === 'guess' ? '#guess-heading' : '#player');
  skip.dataset.i18n = mode === 'guess' ? 'skip.guess' : 'skip';
  skip.textContent = t(skip.dataset.i18n);
  if (mode === 'guess') {
    if (state.duet) toggleDuet(false);
    voice?.stop();
    setPlaying(false);
    guess.activate();
    document.getElementById('guess-heading').focus();
  } else {
    guess.deactivate();
    document.getElementById('player').focus();
    announce(t('say.jukebox'));
  }
}

document.getElementById('open-guess').addEventListener('click', () => setMode('guess'));
document.getElementById('close-guess').addEventListener('click', () => setMode('jukebox'));

// ------------------------------------------------------------ more

// The first screen is: pick a view and a theme, press play, Duet. Everything
// else (Guess the Year, the field guide, the mapping desk) sits behind one
// More button, below the player.
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

const describeSelect = document.getElementById('describe');
const speakToggle = document.getElementById('speak-toggle');
const motionToggle = document.getElementById('motion-toggle');
const langSelect = document.getElementById('lang');
const osReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

// Motion: full or reduce on html[data-motion]. Follows the OS setting until
// the listener chooses; the choice is remembered (WCAG 2.2.2 for the planet).
function setMotion(mode, { save = true, say = true } = {}) {
  document.documentElement.dataset.motion = mode;
  motionToggle.setAttribute('aria-pressed', String(mode === 'reduce'));
  if (save) savePrefs({ motion: mode });
  if (say) announce(t(mode === 'reduce' ? 'say.motionOn' : 'say.motionOff'));
}
motionToggle.addEventListener('click', () => setMotion(document.documentElement.dataset.motion === 'reduce' ? 'full' : 'reduce'));
osReduce.addEventListener('change', () => {
  if (!loadPrefs().motion) setMotion(osReduce.matches ? 'reduce' : 'full', { save: false, say: false });
});

function setVerbosity(v, { say = true } = {}) {
  captions.setVerbosity(v);
  describeSelect.value = v;
  savePrefs({ verbosity: v });
  if (say) announce(t('say.verbosity', { v: t(`verb.${v}`) }));
}

function setSpeak(on, { say = true } = {}) {
  captions.setSpeak(on);
  speakToggle.setAttribute('aria-pressed', String(on));
  savePrefs({ speak: on });
  if (say) announce(t(on ? 'say.speakOn' : 'say.speakOff'));
}

describeSelect.addEventListener('change', () => setVerbosity(describeSelect.value));
speakToggle.addEventListener('click', () => setSpeak(!captions.speak));
if (!captions.hasSpeech) speakToggle.hidden = true;

// Language: every caption, spoken sentence, label and help string (T).
langSelect.replaceChildren(...Object.entries(LANGS).map(([code, l]) => {
  const o = document.createElement('option');
  o.value = code;
  o.lang = code;
  o.textContent = l.name;
  return o;
}));
langSelect.value = lang();
function chooseLang(code, { say = true } = {}) {
  if (!setLang(code)) return;
  langSelect.value = code;
  savePrefs({ lang: code });
  writeUrl();
  if (say) announce(t('say.lang', { name: LANGS[code].name }));
}
langSelect.addEventListener('change', () => chooseLang(langSelect.value));
function cycleLang() {
  const codes = Object.keys(LANGS);
  chooseLang(codes[(codes.indexOf(lang()) + 1) % codes.length]);
}

// Everything already on screen, in the new language.
onLang(() => {
  tiles.relabel((n) => tn('count.frames', n));
  turntable.relabel();
  views.relabel();
  regions.relabel();
  [...describeSelect.options].forEach((o) => { o.textContent = t(`verb.${o.value}`); });
  showTrack();
  render();
  if (state.duet) {
    renderDuet();
    turntable.setListenMode(state.listenMode, t(`listenHelp.${state.listenMode}`));
  } else captions.show(currentFrame());
  turntable.setPlaying(state.playing);
  help.rebuild(helpGroups());
  guess.relabel();
  introNote();
});

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('terra-vox-prefs') ?? '{}'); } catch { return {}; }
}
function savePrefs(patch) {
  try { localStorage.setItem('terra-vox-prefs', JSON.stringify({ ...loadPrefs(), ...patch })); } catch { /* private mode */ }
}

// ------------------------------------------------------------ keyboard

const jukebox = () => state.mode === 'jukebox';
const SHORTCUTS = [
  { keys: [' '], label: () => t('key.play'), run: togglePlay, when: jukebox },
  { keys: ['['], label: () => t('key.prev'), run: () => step(-1), when: jukebox },
  { keys: [']'], label: () => t('key.next'), run: () => step(1), when: jukebox },
  { keys: ['1', '2', '3', '4'], label: () => t('key.theme'), when: jukebox,
    run: (e) => { const th = themes[Number(e.key) - 1]; tiles.select(th.id, { notify: true }); if (!state.playing) togglePlay(); } },
  { keys: ['d'], label: () => t('key.duet'), run: () => toggleDuet(), when: jukebox },
  { keys: ['f'], label: () => t('key.flip'), run: flipSide, when: () => jukebox() && hasSideB },
  { keys: ['l'], label: () => t('key.listen'), run: cycleListenMode, when: () => jukebox() && state.duet },
  { keys: ['n'], label: () => t('key.ref'), run: () => toggleReference(), when: jukebox },
  { keys: ['r'], label: () => t('key.repeat'), run: repeatDescription, when: jukebox },
  { keys: ['c'], label: () => t('key.describe'), run: () => {
    setVerbosity(VERBOSITY[(VERBOSITY.indexOf(captions.verbosity) + 1) % VERBOSITY.length]);
  } },
  { keys: ['s'], label: () => t('key.speak'), run: () => setSpeak(!captions.speak) },
  { keys: ['t'], label: () => t('key.lang'), run: cycleLang },
  { keys: ['m'], label: () => t('key.motion'), run: () => motionToggle.click() },
  { keys: ['g'], label: () => t('key.guess'), run: () => setMode(state.mode === 'jukebox' ? 'guess' : 'jukebox') },
  { keys: ['?', 'h'], label: () => t('key.help'), run: () => help.open() },
];

installShortcuts(SHORTCUTS);

const helpGroups = () => [
  { title: () => t('help.jukebox'), items: SHORTCUTS.filter((s) => s.when === jukebox || ['l', 'f'].includes(s.keys[0])) },
  { title: () => t('help.timeline'), items: [
    { keys: ['ArrowLeft', 'ArrowRight'], label: () => t('key.stepYear') },
    { keys: ['Home', 'End'], label: () => t('key.ends') },
  ] },
  { title: () => t('help.guess'), items: [
    { keys: [' '], label: () => t('key.mystery') },
    { keys: ['a'], label: () => t('key.hearOldest') },
    { keys: ['b'], label: () => t('key.hearNewest') },
    { keys: ['1', '2', '3', '4'], label: () => t('key.answer') },
    { keys: ['Enter'], label: () => t('key.nextRound') },
  ] },
  { title: () => t('help.anywhere'), items: SHORTCUTS.filter((s) => !s.when) },
];
const help = createHelpDialog(document.getElementById('help-dialog'), [document.getElementById('help-button')], helpGroups());

// ------------------------------------------------------------ introduction

// Shown once, or whenever a shared link arrives. "Start" unlocks audio inside
// this click and drops straight into the strongest moment: Duet on methane,
// oldest against newest; or Your year against the newest; or the link's Duet.
const intro = document.getElementById('intro');
const birthInput = document.getElementById('birth-year');
const startBtn = document.getElementById('intro-start');
const INTRO_THEME = 'greenhouse_gases';
const shared = readUrl();
const hasShared = Boolean(shared.theme);

function introNote() {
  const note = document.getElementById('intro-note');
  if (hasShared) {
    const th = trackFor(shared.theme, shared.view);
    const pair = shared.view === 'b' ? null : duetPair(th, { left: shared.left, right: shared.right });
    note.textContent = shared.view === 'b' ? t('intro.sharedEic', { theme: th.name, title: th.title })
      : t('intro.shared', { theme: th.name, a: pair.left.year, b: pair.right.year });
  } else note.textContent = t('intro.note');
  // Phones and tablets only let sound start from a tap, so the button says so.
  startBtn.textContent = t(window.matchMedia('(pointer: coarse)').matches ? 'intro.startTouch' : 'intro.start');
}

function openIntro() {
  if (help.isOpen) help.close();
  introNote();
  if (!intro.open) intro.showModal();
}

function closeIntro() {
  if (intro.open) intro.close();
  savePrefs({ introSeen: true });
}

// Your year: optional, kept only in this page (and the URL if you copy it).
function readBirthYear() {
  const raw = birthInput.value.trim();
  if (!raw) return null;
  const y = Number(raw);
  return Number.isInteger(y) && y >= 1900 && y <= new Date().getFullYear() ? y : NaN;
}
birthInput.addEventListener('input', () => {
  const y = readBirthYear();
  const hint = document.getElementById('birth-hint');
  if (Number.isNaN(y)) { birthInput.setAttribute('aria-invalid', 'true'); hint.textContent = t('birth.invalid'); return; }
  birthInput.removeAttribute('aria-invalid');
  if (y === null) { hint.textContent = t('birth.hint'); return; }
  const th = trackFor(INTRO_THEME, 'a');
  const { frame, clamped } = frameForYear(th, y);
  hint.textContent = clamped
    ? t(y < oldestFrame(th).year ? 'clamp.before' : 'clamp.after', { asked: y, used: frame.year })
    : t('birth.ok', { year: y, newest: newestFrame(th).year });
});

startBtn.addEventListener('click', async () => {
  const birth = readBirthYear();
  if (Number.isNaN(birth)) { birthInput.focus(); return; }
  closeIntro();
  if (state.mode !== 'jukebox') setMode('jukebox');
  if (hasShared) {
    state.left = shared.left;
    state.right = shared.right;
    state.reference = shared.ref;
    if (shared.region) setAirRegion(shared.region);
    tiles.select(shared.theme, { notify: false });
    if (shared.view === 'b') {
      loadTrack(trackFor(shared.theme, 'b'));
      await togglePlay();
      announce(t('say.eicView', { title: state.theme.title, credit: state.theme.credits }));
    } else {
      loadTrack(trackFor(shared.theme, 'a'));
      if (state.duet) { loadDuetVoices(); renderDuet(); if (!state.playing) await togglePlay(); } else await toggleDuet(true);
      refToggle.setAttribute('aria-pressed', String(state.reference));
    }
  } else {
    state.left = birth;
    tiles.select(INTRO_THEME, { notify: true });
    if (state.duet) { if (!state.playing) togglePlay(); } else await toggleDuet(true);
  }
  document.getElementById('player').focus();
});
document.getElementById('intro-skip').addEventListener('click', () => {
  closeIntro();
  document.getElementById('player').focus();
});
intro.addEventListener('cancel', () => savePrefs({ introSeen: true }));
document.getElementById('intro-again').addEventListener('click', openIntro);

// ------------------------------------------------------------ start

if (shared.lang) chooseLang(shared.lang, { say: false });
setMotion(prefs.motion ?? (osReduce.matches ? 'reduce' : 'full'), { save: false, say: false });
setVerbosity(prefs.verbosity ?? 'brief', { say: false });
setSpeak(prefs.speak ?? false, { say: false });
[...describeSelect.options].forEach((o) => { o.textContent = t(`verb.${o.value}`); });
document.getElementById('birth-hint').textContent = t('birth.hint');
tiles.select(state.theme.id);
tiles.relabel((n) => tn('count.frames', n));
turntable.setTheme(state.theme);
showTrack();
render();
captions.show(currentFrame());
if (!prefs.introSeen || hasShared) openIntro();

// Offline: cache the app and its data after the first visit (public/sw.js).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // The offline copy is several megabytes: fetch it after the page has settled, not alongside the first load.
  const install = () => navigator.serviceWorker.register('./sw.js').catch(() => { /* offline install is optional */ });
  window.addEventListener('load', () => setTimeout(install, 8000));
}

// The proof band: agreement with NOAA, read from the data, never typed in.
{
  for (const el of document.querySelectorAll('[data-proof]')) {
    const c = themes.find((t) => t.id === el.dataset.proof)?.referenceCheck;
    el.textContent = c ? c.r.toFixed(3) : '';
  }
  for (const el of document.querySelectorAll('[data-proof-years]')) {
    const c = themes.find((t) => t.id === el.dataset.proofYears)?.referenceCheck;
    el.textContent = c ? `${c.years[0]}–${c.years[1]}, n = ${c.n}` : '';
  }
  const from = Math.min(...themes.map((t) => t.yearRange[0]).filter(Number.isFinite));
  const to = Math.max(...themes.map((t) => t.yearRange[1]).filter(Number.isFinite));
  const span = document.querySelector('[data-proof-span]');
  if (span) span.textContent = `${from}–${to}`;
}

// Settings: always open on a wide screen, folded behind one button on a phone.
{
  const menu = document.getElementById('settings-menu');
  const wide = window.matchMedia('(min-width: 641px)');
  const sync = () => { menu.open = wide.matches; };
  sync();
  wide.addEventListener('change', sync);
}

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
      const tr = getTheme(themeId);
      return measureFrames((indices ?? tr.frames.map((_, i) => i)).map((i) => tr.frames[i]));
    },
  };
}
