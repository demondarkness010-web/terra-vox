// Words for what is on screen and in the speakers, in the current language.
//
//   altText(frame, theme)     rich alt text built from the frame's own
//                             numbers: what the map shows, the real value and
//                             where it sits on the theme's fixed scale, how
//                             much of it is "active", how far it has moved
//   captionLine(frame, ...)   the plain "subtitle" for the bar now playing:
//                             real numbers -> the sound they made
//   createCaptionTrack(...)   the visible caption bar + the screen-reader
//                             caption region + optional speech, all synced
//                             to the bar that is actually sounding
//
// Every description is generated from the same JSON the sound comes from,
// so the words, the sound and the picture can never disagree.

import { mapFeatures, duckMusic, TENSE_FROM } from '../audio/sonify.js';
import { physicalShort, physicalSpoken, activeShare, pct } from '../data/loader.js';
import { speakNote, showNote } from '../audio/scales.js';
import { t, tn, lang, LANGS } from '../i18n/index.js';

// Words from the same three numbers the sound follows, with the same
// thresholds, so what you read matches what you hear: level (value01: pitch,
// loudness, timbre), spread (activeShare01: notes per bar) and distance from
// the oldest frame (fromFirst01: tempo and harmony).
function featureWords(frame) {
  const v = frame.value01;
  const level = t(`level.${v < 0.33 ? 'low' : v < 0.66 ? 'mid' : 'high'}`);
  const d = frame.activeShare01;
  const spread = t(`spread.${d < 0.2 ? 'sparse' : d < 0.5 ? 'scattered' : d < 0.8 ? 'wide' : 'dense'}`);
  const b = frame.theme.endsWith('_eic') ? 'B' : 'A';
  const moved = t(`moved${b}.${frame.index === 0 ? 'first' : frame.fromFirst01 < 0.05 ? 'close' : frame.fromFirst01 < TENSE_FROM ? 'some' : 'far'}`);
  return { level, spread, moved };
}

/**
 * e.g. "Greenhouse Gases, 2021 yearly average. World map of methane ... Mean
 * methane at 400 hPa: 1,864 ppb, middling on this theme's fixed scale;
 * scattered methane-rich air (share of air holding at least 1,900 ppb of
 * methane: 32.8%); far from the oldest year."
 */
export function altText(frame, theme) {
  const w = featureWords(frame);
  const share = activeShare(frame);
  const shareText = share ? t('alt.share', { spread: w.spread, noun: t(`noun.${frame.theme}`), label: share.label, pct: pct(share.percent) }) : '';
  return t('alt.text', {
    theme: theme.name,
    side: theme.side === 'b' ? t('alt.sideB') : '',
    label: frame.label,
    map: t(`map.${frame.theme}`),
    what: capitalize(theme.physical.label),
    value: physicalShort(frame),
    level: w.level,
    scale: t(theme.side === 'b' ? 'alt.scaleB' : 'alt.scaleA'),
    share: shareText,
    moved: w.moved,
  });
}

/** The subtitle for a bar: "2021: 1,864 ppb, 33% methane-rich air" over "C5, 3 notes a bar, 109 BPM, triangle, tense third" */
export function captionLine(frame) {
  const p = mapFeatures(frame);
  const share = activeShare(frame);
  const data = [physicalShort(frame)];
  if (share) data.push(`${pct(share.percent)} ${t(`noun.${frame.theme}`)}`);
  const sound = [
    showNote(p.note),
    tn('cap.notes', p.notesPerBar),
    `${p.tempoBPM} BPM`,
    t(`timbre.${p.timbre}`),
    t(p.interval.startsWith('minor') ? 'cap.tense' : 'cap.calm'),
  ];
  return { data: `${when(frame)}${data.join(', ')}`, sound: sound.join(', ') };
}

// The porthole has no clock: its label is the water level, so it is not said twice.
const when = (frame) => (physicalShort(frame).startsWith(frame.short) ? '' : `${frame.short}: `);

function spokenBrief(frame) {
  return `${when(frame).replace(/: $/, '. ')}${capitalize(physicalSpoken(frame))}.`;
}

function spokenFull(frame) {
  const p = mapFeatures(frame);
  return t('spoken.full', {
    label: frame.label,
    value: capitalize(physicalSpoken(frame)),
    note: speakNote(p.note),
    notes: p.notesPerBar,
    bpm: p.tempoBPM,
    timbre: t(`timbre.${p.timbre}`),
    harmony: t(p.interval.startsWith('minor') ? 'harmony.tenseWord' : 'harmony.calmWord'),
  });
}

// ------------------------------------------------------------ caption track

export const VERBOSITY = ['off', 'brief', 'full'];

// The browser voice for a language, preferring a local one. Voices load
// late in Chrome, so this is looked up each time.
function voiceFor(code) {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const want = LANGS[code].locale.toLowerCase();
  const prefix = code.toLowerCase();
  return voices.find((v) => v.lang.toLowerCase() === want && v.localService)
    ?? voices.find((v) => v.lang.toLowerCase() === want)
    ?? voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
    ?? null;
}

/** Whether the browser has a voice for the language (it may still speak with a default one). */
export function hasVoiceFor(code) {
  return Boolean(voiceFor(code));
}

/**
 * The live caption track. `show(frame)` is called when a bar is heard.
 * Visible text always updates. What a screen reader hears per bar depends
 * on verbosity (brief: year + value; full: the whole caption). When playback
 * pauses or the listener scrubs, the frame's full alt text is described once
 * (after a short pause, so dragging the slider does not stutter).
 *
 * Speech (window.speechSynthesis) is for people without a screen reader: it
 * says the same words in the current language, cancels anything stale so it
 * never lags behind the music, and ducks the music by ~8 dB while it talks.
 */
export function createCaptionTrack({ dataEl, soundEl, liveEl, prevEl = null, trackEl = null }) {
  let verbosity = 'brief';
  let speak = false;
  let describeTimer = null;
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  function say(text) {
    if (verbosity === 'off') return;
    liveEl.textContent = '';
    setTimeout(() => { liveEl.textContent = text; }, 20);
    speakOnly(text);
  }

  // Browser speech only (the screen reader already got the text elsewhere).
  function speakOnly(text) {
    if (!speak || !synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGS[lang()].locale;
    const v = voiceFor(lang());
    if (v) u.voice = v;
    u.rate = 1.05;
    u.onstart = () => duck(true);
    u.onend = () => duck(false);
    u.onerror = () => duck(false);
    synth.speak(u);
  }

  function duck(on) {
    duckMusic(on);
  }

  // Like lyrics: the line that just played moves up and dims as the next arrives.
  function setLines(data, sound) {
    if (dataEl.textContent === data && soundEl.textContent === sound) return;
    if (prevEl) prevEl.textContent = dataEl.textContent;
    dataEl.textContent = data;
    soundEl.textContent = sound;
    if (trackEl) {
      // Restart the animation by switching between two identical ones (a / -b), not by reading offsetWidth,
      // which forced a layout of the whole page on every bar and made a slow laptop stutter.
      const b = trackEl.classList.contains('is-new');
      trackEl.classList.remove(b ? 'is-new' : 'is-new-b');
      trackEl.classList.add(b ? 'is-new-b' : 'is-new');
    }
  }

  function render(frame) {
    const line = captionLine(frame);
    setLines(line.data, `→ ${line.sound}`);
  }

  return {
    /** A bar of `frame` is being heard now. */
    bar(frame) {
      render(frame);
      clearTimeout(describeTimer);
      if (verbosity === 'brief') say(spokenBrief(frame));
      else if (verbosity === 'full') say(spokenFull(frame));
    },
    /** Update the visible caption only. */
    show: render,
    /** Frame changed without playback (scrub, step, theme switch). */
    describe(frame, theme, { delay = 650 } = {}) {
      render(frame);
      clearTimeout(describeTimer);
      describeTimer = setTimeout(() => say(altText(frame, theme)), delay);
    },
    /** Duet: a static two-sided caption, then the trust line and NOAA under it. */
    duet(gap) {
      clearTimeout(describeTimer);
      const side = (f, v) => `${when(f).replace(/: $/, ' ')}${v}`;
      const extra = [gap.trust.sentence, gap.noaa].filter(Boolean).join(' ');
      setLines(`${side(gap.oldest, gap.physical.from)}  ⟷  ${side(gap.newest, gap.physical.to)}`, `→ ${gap.sentence} ${extra}`);
    },
    /** Speak an arbitrary sentence through the same channel (respects settings). */
    say,
    speakOnly,
    setVerbosity(v) { verbosity = v; if (v === 'off') synth?.cancel(); },
    setSpeak(on) { speak = on; if (!on) { synth?.cancel(); duck(false); } },
    get verbosity() { return verbosity; },
    get speak() { return speak; },
    hasSpeech: Boolean(synth),
  };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
