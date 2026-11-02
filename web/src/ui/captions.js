// Words for what is on screen and in the speakers.
//
//   altText(frame, theme)     rich alt text built from the frame's own
//                             numbers: what the map shows, the real value and
//                             where it sits on the theme's fixed scale, how
//                             much of it is "active", how far it has moved
//   captionLine(frame, ...)   the plain-English "subtitle" for the bar now
//                             playing: real numbers -> the sound they made
//   createCaptionTrack(...)   the visible caption bar + the screen-reader
//                             caption region + optional speech, all synced
//                             to the bar that is actually sounding
//
// Every description is generated from the same JSON the sound comes from,
// so the words, the sound and the picture can never disagree.

import { mapFeatures, duckMusic, TENSE_FROM } from '../audio/sonify.js';
import { physicalShort, physicalSpoken, activeShare } from '../data/loader.js';
import { speakNote, showNote } from '../audio/scales.js';

const MAP_DESCRIPTION = {
  wildfires: 'World map of satellite-detected active fires, drawn as orange dots over the night-time Earth',
  sea_level: 'World map of sea surface height: purple and blue where the ocean sits below its long-term mean, green near it, yellow, red and white above it; land is dark',
  air_quality: 'World map of nitrogen dioxide pollution: pale yellow for clean air, orange to dark red over polluted regions, black gaps where clouds blocked the satellite',
  greenhouse_gases: 'World map of methane in the mid-troposphere: pale green for lower concentrations through orange to deep red for the highest',
  wildfires_eic: "NASA Earth Information Center map of active fires seen by VIIRS: yellow and white specks of fire radiative power on dark land and a slate-blue ocean, with NASA's date stamp and colour bar in the lower left",
  sea_level_eic: 'NASA visualization of the sea seen through a porthole: sky above, blue water below, and a ruler in centimetres and inches up the middle with the 1993 sea level marked at zero',
  air_quality_eic: 'NASA TEMPO map of nitrogen dioxide over North America on a dark globe: light blue for clean air, cream through red to purple over polluted cities, dark where clouds or night hide the ground',
  greenhouse_gases_eic: 'NASA visualization of the globe wrapped in a purple haze of methane from the GEOS model, with a January-to-December timeline below',
};

const ACTIVE_NOUN = {
  wildfires: 'fire activity',
  sea_level: 'high-water ocean',
  air_quality: 'heavily polluted air',
  greenhouse_gases: 'methane-rich air',
  wildfires_eic: 'fire activity',
  sea_level_eic: 'water in the porthole',
  air_quality_eic: 'heavily polluted air',
  greenhouse_gases_eic: 'dense methane haze',
};

// Words from the same three numbers the sound follows, with the same
// thresholds, so what you read matches what you hear: level (value01: pitch,
// loudness, timbre), spread (activeShare01: notes per bar) and distance from
// the oldest frame (fromFirst01: tempo and harmony).
function featureWords(frame) {
  const v = frame.value01;
  const level = v < 0.33 ? 'low' : v < 0.66 ? 'middling' : 'high';
  const d = frame.activeShare01;
  const spread = d < 0.2 ? 'sparse' : d < 0.5 ? 'scattered' : d < 0.8 ? 'widespread' : 'dense';
  const first = frame.theme.endsWith('_eic') ? 'first frame' : 'oldest year';
  const moved = frame.index === 0 ? `this is the ${first}`
    : frame.fromFirst01 < 0.05 ? `close to the ${first}`
    : frame.fromFirst01 < TENSE_FROM ? `some way from the ${first}` : `far from the ${first}`;
  return { level, spread, moved };
}

/**
 * e.g. "Greenhouse Gases, August 2021. World map of methane ... Mean methane
 * at 400 hPa: 1,864 ppb, middling on this theme's fixed scale; scattered
 * methane-rich air (share of air holding at least 1,900 ppb of methane:
 * 32.8%); far from the oldest year."
 */
export function altText(frame, theme) {
  const w = featureWords(frame);
  const share = activeShare(frame);
  const shareText = share ? `; ${w.spread} ${ACTIVE_NOUN[frame.theme]} (share of ${share.label}: ${share.percent.toFixed(1)}%)` : '';
  return `${theme.name}${theme.side === 'b' ? ', side B' : ''}, ${frame.label}. ${MAP_DESCRIPTION[frame.theme]}. `
    + `${capitalize(theme.physical.label)}: ${physicalShort(frame)}, ${w.level} on this ${theme.side === 'b' ? "track's" : "theme's"} fixed scale`
    + `${shareText}; ${w.moved}.`;
}

/** The subtitle for a bar: "2021: 1,864 ppb, 33% methane-rich air" over "C5, 3 notes a bar, 109 BPM, triangle, tense third" */
export function captionLine(frame) {
  const p = mapFeatures(frame);
  const share = activeShare(frame);
  const data = [physicalShort(frame)];
  if (share) data.push(`${share.percent < 10 ? share.percent.toFixed(1) : Math.round(share.percent)}% ${ACTIVE_NOUN[frame.theme]}`);
  const sound = [
    showNote(p.note),
    `${p.notesPerBar} note${p.notesPerBar > 1 ? 's' : ''} a bar`,
    `${p.tempoBPM} BPM`,
    p.timbre,
    p.interval.startsWith('minor') ? 'tense third' : 'calm fifth',
  ];
  return { data: `${when(frame)}${data.join(', ')}`, sound: sound.join(', ') };
}

// The porthole has no clock: its label is the water level, so it is not said twice.
const when = (frame) => (physicalShort(frame).startsWith(frame.short) ? '' : `${frame.short}: `);

function spokenBrief(frame) {
  return `${when(frame).replace(/: $/, '. ')}${physicalShort(frame).replace('ppb', 'parts per billion').replace(' cm', ' centimetres').replace('×10¹⁵ molec/cm²', 'times ten to the fifteen')}.`;
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
      trackEl.classList.remove('is-new');
      void trackEl.offsetWidth;
      trackEl.classList.add('is-new');
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
    /** Duet: a static two-sided caption. */
    duet(gap) {
      clearTimeout(describeTimer);
      setLines(`${when(gap.oldest).replace(/: $/, ' ')}${gap.physical.from}  ⟷  ${when(gap.newest).replace(/: $/, ' ')}${gap.physical.to}`, `→ ${gap.sentence}`);
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
