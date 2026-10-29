// Words for what is on screen and in the speakers.
//
//   altText(frame, theme)     rich alt text built from the frame's own
//                             features: what the map shows, its tone,
//                             brightness, colour variance, how much of it is
//                             "active", how much changed, and the real value
//   captionLine(frame, ...)   the plain-English "subtitle" for the bar now
//                             playing: real numbers -> the sound they made
//   createCaptionTrack(...)   the visible caption bar + the screen-reader
//                             caption region + optional speech, all synced
//                             to the bar that is actually sounding
//
// Every description is generated from the same JSON the sound comes from,
// so the words, the sound and the picture can never disagree.

import { mapFeatures, duckMusic } from '../audio/sonify.js';
import { physicalShort, physicalSpoken, activeShare } from '../data/loader.js';
import { speakNote } from '../audio/scales.js';

const MAP_DESCRIPTION = {
  wildfires: 'World map of satellite-detected active fires, drawn as orange dots over the night-time Earth',
  sea_level: 'World map of sea surface height: purple and blue where the ocean sits below its long-term mean, green near it, yellow, red and white above it; land is dark',
  air_quality: 'World map of nitrogen dioxide pollution: pale yellow for clean air, orange to dark red over polluted regions, black gaps where clouds blocked the satellite',
  greenhouse_gases: 'World map of methane in the mid-troposphere: pale green for lower concentrations through orange to deep red for the highest',
};

const ACTIVE_NOUN = {
  wildfires: 'fire activity',
  sea_level: 'high-water ocean',
  air_quality: 'heavily polluted air',
  greenhouse_gases: 'methane-rich air',
};

const band = (x, words) => words[x < 1 / 3 ? 0 : x < 2 / 3 ? 1 : 2];

function featureWords(frame) {
  const tone = band(frame.hue / 360, ['cool-toned', 'mid-toned', 'warm-toned']);
  const light = band(frame.brightness, ['dim', 'moderate brightness', 'bright']);
  // same thresholds as the timbre rule, so the words match what you hear
  const variance = frame.colorVariance < 0.15 ? 'low colour variance'
    : frame.colorVariance < 0.35 ? 'moderate colour variance' : 'high colour variance';
  const d = frame.pixelDensity;
  const spread = d < 0.2 ? 'sparse' : d < 0.5 ? 'scattered' : d < 0.8 ? 'widespread' : 'dense';
  const change = band(frame.frameDelta, ['little change from the year before', 'moderate change from the year before', 'sharp change from the year before']);
  const where = frame.latBand === 'north' ? 'centred north of the tropics'
    : frame.latBand === 'south' ? 'centred south of the tropics' : 'centred in the tropics';
  return { tone, light, variance, spread, change, where };
}

/**
 * e.g. "Greenhouse Gases, August 2014. World map of methane ... Relative to
 * this theme's record: mid-toned, moderate brightness, low colour variance,
 * sparse methane-rich air (2.0% at or above 1,900 ppb), centred north of
 * the tropics, little change from the year before. Mean methane: 1,815 ppb."
 */
export function altText(frame, theme) {
  const w = featureWords(frame);
  const share = activeShare(frame);
  const shareText = share ? ` (share of ${share.label}: ${share.percent.toFixed(1)}%)` : '';
  return `${theme.name}, ${frame.label}. ${MAP_DESCRIPTION[frame.theme]}. `
    + `Relative to this theme's record: ${w.tone}, ${w.light}, ${w.variance}, `
    + `${w.spread} ${ACTIVE_NOUN[frame.theme]}${shareText}, ${w.where}, ${w.change}. `
    + `${capitalize(theme.physical.label)}: ${physicalShort(frame)}.`;
}

/** The subtitle for a bar: "2014 · 1,815 ppb · 2% methane-rich air → Bb4 · 1 note/bar · 89 BPM · triangle · calm fifth" */
export function captionLine(frame) {
  const p = mapFeatures(frame);
  const share = activeShare(frame);
  const data = [String(frame.year), physicalShort(frame)];
  if (share) data.push(`${share.percent < 10 ? share.percent.toFixed(1) : Math.round(share.percent)}% ${ACTIVE_NOUN[frame.theme]}`);
  const sound = [
    p.note,
    `${p.notesPerBar} note${p.notesPerBar > 1 ? 's' : ''}/bar`,
    `${p.tempoBPM} BPM`,
    p.timbre,
    p.interval.startsWith('minor') ? 'tense third' : 'calm fifth',
  ];
  return { data: data.join(' · '), sound: sound.join(' · ') };
}

function spokenBrief(frame) {
  return `${frame.year}. ${physicalShort(frame).replace('ppb', 'parts per billion').replace(' cm', ' centimetres')}.`;
}

function spokenFull(frame) {
  const p = mapFeatures(frame);
  return `${frame.label}. ${capitalize(physicalSpoken(frame))}. `
    + `Playing ${speakNote(p.note)}, ${p.notesPerBar} notes per bar at ${p.tempoBPM} beats per minute, `
    + `${p.timbre} tone, ${p.interval.startsWith('minor') ? 'tense' : 'calm'} harmony.`;
}

// ------------------------------------------------------------ caption track

export const VERBOSITY = { off: 'Off', brief: 'Brief', full: 'Full' };

/**
 * The live caption track. `show(frame)` is called when a bar is heard.
 * Visible text always updates. What a screen reader hears per bar depends
 * on verbosity (brief: year + value; full: the whole caption). When playback
 * pauses or the listener scrubs, the frame's full alt text is described once
 * (after a short pause, so dragging the slider does not stutter).
 *
 * Speech (window.speechSynthesis) is for people without a screen reader: it
 * says the same words, cancels anything stale so it never lags behind the
 * music, and ducks the music by ~8 dB while it talks.
 */
export function createCaptionTrack({ dataEl, soundEl, liveEl }) {
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
    u.rate = 1.05;
    u.onstart = () => duck(true);
    u.onend = () => duck(false);
    u.onerror = () => duck(false);
    synth.speak(u);
  }

  function duck(on) {
    duckMusic(on);
  }

  function render(frame) {
    const line = captionLine(frame);
    dataEl.textContent = line.data;
    soundEl.textContent = `→ ${line.sound}`;
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
    /** Duet: a static two-sided caption. */
    duet(gap) {
      clearTimeout(describeTimer);
      dataEl.textContent = `${gap.oldest.year} ${gap.physical.from}  ⟷  ${gap.newest.year} ${gap.physical.to}`;
      soundEl.textContent = `→ ${gap.sentence}`;
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
