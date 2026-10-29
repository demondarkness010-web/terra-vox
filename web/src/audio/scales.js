// Musical vocabulary for Terra Vox.
//
// Everything melodic is drawn from C minor pentatonic. Five notes with no
// semitone clashes, so any combination the data produces still sounds like
// music rather than noise.

export const PENTATONIC_OCTAVE = ['C', 'Eb', 'F', 'G', 'Bb'];

// C minor pentatonic repeated across two octaves: C4 .. Bb5 (10 degrees).
export const SCALE = ['C4', 'Eb4', 'F4', 'G4', 'Bb4', 'C5', 'Eb5', 'F5', 'G5', 'Bb5'];

// Harmony interval above the (octave-down) root, in semitones.
export const INTERVAL_SEMITONES = {
  'minor third (tense)': 3,
  'perfect fifth (consonant)': 7,
};

// Melodic shape for the notes after the downbeat: scale-degree offsets from
// the mapped note. Climbs in pentatonic "skips" (quartal, open-sounding) then
// steps back, so 1 note = just the mapped pitch and 8 notes = a full figure.
export const MOTIF = [0, 2, 4, 1, 3, 5, 2, 4];

// Keep a degree inside the 2-octave scale by reflecting off the ends.
export function foldDegree(degree, length = SCALE.length) {
  const max = length - 1;
  let d = degree;
  while (d < 0 || d > max) d = d < 0 ? -d : 2 * max - d;
  return d;
}

const NOTE_INDEX = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const INDEX_NOTE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// 'G4' + 3 -> 'Bb4'. Flat spellings throughout, to match the scale above.
export function transpose(note, semitones) {
  const [, name, octave] = note.match(/^([A-G]b?)(-?\d)$/);
  const midi = (Number(octave) + 1) * 12 + NOTE_INDEX[name] + semitones;
  return `${INDEX_NOTE[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

// Spoken-friendly note name: 'Eb4' -> 'E-flat 4'.
export function speakNote(note) {
  return note.replace(/^([A-G])b/, '$1-flat ').replace(/([A-G])(\d)/, '$1 $2').replace('  ', ' ');
}
