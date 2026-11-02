// The Terra Vox mapping: one frame's measurement -> the music it makes.
//
// We sonify the measurement, not the picture of it. Every frame arrives with
// three numbers built by scripts/extract_features.py from its real NASA value
// on a FIXED range per theme (scripts/theme_defs.py, stated in the README),
// never stretched to the min and max of our own frames:
//
//   value01        the headline measurement on its fixed range
//                  -> pitch, loudness and timbre ("how much")
//   activeShare01  share of the region past its "active" threshold, 0-100 %
//                  -> notes per bar ("how widespread")
//   fromFirst01    |value01 - the oldest frame's value01|
//                  -> tempo and the tense third ("how far it has moved")
//
// Stereo carries one thing only, time: oldest on the left, newest on the
// right (Duet, and the sweep in single play). See timePan().
//
// Pure: no Tone.js, no DOM. scripts/validate_mapping.py imports this file in
// Node and checks the correlations the README states.

import { SCALE, INTERVAL_SEMITONES, MOTIF, foldDegree, transpose } from './scales.js';

export const TENSE_FROM = 0.25;   // fromFirst01 at or above this plays the tense third
export const SWEEP_PAN = 0.8;     // the sweep's outer positions; never fully one ear

// Theme says what, the music says how much: each theme keeps one fixed
// instrument. The octave lives here because it changes the note; the
// envelope and noise layer live in sonify.js.
export const INSTRUMENT = {
  greenhouse_gases: { name: 'soft pad', octave: 0 },
  sea_level: { name: 'deep bass', octave: -1 },
  wildfires: { name: 'plucked notes', octave: 0 },
  air_quality: { name: 'breathy noise', octave: 0 },
};

/** The instrument for a frame's theme ("sea_level_eic" plays like "sea_level"). */
export function instrumentFor(themeId = '') {
  return INSTRUMENT[themeId.replace(/_eic$/, '')] ?? INSTRUMENT.greenhouse_gases;
}

/**
 * One frame's musical parameters. `f` is a frame from data/features (or
 * data/eic.json) with value01, activeShare01, fromFirst01 and theme.
 */
export function mapFeatures(f) {
  const scale = SCALE;
  const { octave, name: instrument } = instrumentFor(f.theme);
  const scaleDegree = Math.floor(f.value01 * 9.999);                     // pitch = how much
  const note = transpose(scale[scaleDegree], 12 * octave);

  const velocity = 0.4 + 0.6 * f.value01;                                // more = louder

  const timbre = f.value01 < 0.33 ? 'sine' : f.value01 < 0.66 ? 'triangle' : 'sawtooth';

  const notesPerBar = 1 + Math.round(f.activeShare01 * 7);               // density = how widespread

  const tempoBPM = 80 + Math.round(60 * f.fromFirst01);                  // 80-140: how far it has moved

  const interval = f.fromFirst01 >= TENSE_FROM ? 'minor third (tense)' : 'perfect fifth (consonant)';

  return { scaleDegree, note, velocity, timbre, notesPerBar, tempoBPM, interval, octave, instrument };
}

/**
 * Stereo position for frame `index` of `count` in single play: the sweep
 * travels from the left ear (oldest) to the right (newest), so the listener
 * hears the record move across their head. Duet uses the hard ends, -1 and 1.
 */
export function timePan(index, count) {
  return count > 1 ? SWEEP_PAN * (-1 + (2 * index) / (count - 1)) : 0;
}

/**
 * How one bar of a frame is played. The bar opens on the mapped note; the
 * remaining notes walk a fixed pentatonic motif from it, so the pitch centre
 * still tracks the measurement. Under the melody, a soft dyad sounds the
 * mapped interval an octave below the mapped note.
 */
export function barPlan(params) {
  const barSeconds = (60 / params.tempoBPM) * 4;
  const step = barSeconds / params.notesPerBar;
  const hold = params.timbre === 'sawtooth' ? 0.55 : params.timbre === 'triangle' ? 0.75 : 0.95;
  const shift = 12 * (params.octave ?? 0);
  const notes = [];
  for (let i = 0; i < params.notesPerBar; i++) {
    notes.push({
      note: transpose(SCALE[foldDegree(params.scaleDegree + MOTIF[i])], shift),
      offset: i * step,
      duration: Math.min(step * hold, 1.6),
    });
  }
  const root = transpose(params.note, -12);
  const dyad = [root, transpose(root, INTERVAL_SEMITONES[params.interval])];
  return { barSeconds, step, notes, dyad };
}
