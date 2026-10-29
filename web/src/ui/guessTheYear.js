// Guess the Year: an audio-first game.
//
// A frame from a hidden year plays. The player can flip to the two anchors,
// the oldest and the newest year of the same theme, and judge by ear where
// the mystery sits between them (denser, faster, tenser = more of the
// theme's active signal). Then they pick one of four years. The reveal is
// spoken first; showing the image is only a confirmation, so the whole game
// can be played without looking at the screen.
//
// Keys (while this tab is open): Space play/stop mystery, A oldest,
// B newest, 1-4 answer, Enter next round.

import { Voice, mapFeatures } from '../audio/sonify.js';
import { oldestFrame, newestFrame, physicalShort, physicalSpoken } from '../data/loader.js';
import { speakNote } from '../audio/scales.js';

const ANCHOR_BARS = 2;

export function createGuessTheYear(root, { themes, unlock, announce }) {
  const $ = (sel) => root.querySelector(sel);
  const themeSelect = $('#guess-theme');
  const playBtn = $('#guess-play');
  const oldBtn = $('#guess-oldest');
  const newBtn = $('#guess-newest');
  const options = $('#guess-options');
  const choicesSet = $('#guess-choices');
  const result = $('#guess-result');
  const verdict = $('#guess-verdict');
  const detail = $('#guess-detail');
  const nextBtn = $('#guess-next');
  const scoreEl = $('#guess-score');
  const img = $('#mystery-img');
  const cover = $('#mystery-cover');
  const yearBadge = $('#mystery-year');
  const hearing = $('#mystery-hearing');

  let voice = null;
  let round = null;          // { theme, frame, choices: [years], answered }
  let playing = null;        // 'mystery' | 'oldest' | 'newest' | null
  const score = { right: 0, played: 0, streak: 0 };

  themeSelect.innerHTML = '<option value="random">Any theme (random)</option>'
    + themes.map((t) => `<option value="${t.id}">${t.name} (${t.yearRange[0]}–${t.yearRange[1]})</option>`).join('');
  themeSelect.addEventListener('change', () => newRound());

  playBtn.addEventListener('click', () => toggleMystery());
  oldBtn.addEventListener('click', () => playAnchor('oldest'));
  newBtn.addEventListener('click', () => playAnchor('newest'));
  nextBtn.addEventListener('click', () => newRound({ autoplay: true }));

  function ensureVoice() {
    if (!voice) {
      voice = new Voice({ name: 'guess', level: 0.8 });
      voice.onBar((e) => {
        // anchors play a fixed number of bars, then hand back to silence
        if (playing !== 'mystery' && e.bar >= ANCHOR_BARS - 1) {
          setTimeout(() => setPlaying(null), e.plan.barSeconds * 1000);
        }
      });
    }
    return voice;
  }

  function setPlaying(what) {
    playing = what;
    playBtn.setAttribute('aria-pressed', String(what === 'mystery'));
    playBtn.querySelector('span').textContent = what === 'mystery' ? 'Stop mystery year' : 'Play mystery year';
    [oldBtn, newBtn].forEach((b) => b.classList.toggle('is-on', b === (what === 'oldest' ? oldBtn : what === 'newest' ? newBtn : null)));
    root.classList.toggle('is-playing', what !== null);
  }

  function pickTheme() {
    const v = themeSelect.value;
    if (v !== 'random') return themes.find((t) => t.id === v);
    return themes[Math.floor(Math.random() * themes.length)];
  }

  // Four years: the answer plus three decoys spread across the record, each
  // far enough from the others that a careful ear can tell them apart.
  function makeChoices(theme, answer) {
    // decoys come from inside the record too: offering an anchor year would
    // be a free elimination, since the mystery is never an anchor
    const years = theme.frames.slice(1, -1).map((f) => f.year);
    const span = years[years.length - 1] - years[0];
    const minGap = Math.max(3, Math.round(span / 6));
    const pool = shuffle(years.filter((y) => y !== answer.year));
    const picked = [answer.year];
    for (const y of pool) {
      if (picked.length === 4) break;
      if (picked.every((p) => Math.abs(p - y) >= minGap)) picked.push(y);
    }
    for (const y of pool) {          // tiny records: relax the spacing
      if (picked.length === 4) break;
      if (!picked.includes(y)) picked.push(y);
    }
    return picked.sort((a, b) => a - b);
  }

  function newRound({ autoplay = false } = {}) {
    stopAudio();
    const theme = pickTheme();
    // the anchors are the two ends, so the mystery is always somewhere inside
    const inner = theme.frames.slice(1, -1);
    const frame = inner[Math.floor(Math.random() * inner.length)];
    round = { theme, frame, choices: makeChoices(theme, frame), answered: false };

    oldBtn.querySelector('span').textContent = `(${oldestFrame(theme).year})`;
    newBtn.querySelector('span').textContent = `(${newestFrame(theme).year})`;
    oldBtn.setAttribute('aria-label', `Hear the oldest year, ${oldestFrame(theme).year}. Key A.`);
    newBtn.setAttribute('aria-label', `Hear the newest year, ${newestFrame(theme).year}. Key B.`);

    options.replaceChildren(...round.choices.map((year, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'option';
      b.dataset.year = String(year);
      b.innerHTML = `<kbd>${i + 1}</kbd> ${year}`;
      b.setAttribute('aria-label', `${year}. Key ${i + 1}.`);
      b.addEventListener('click', () => answer(year));
      return b;
    }));
    choicesSet.disabled = false;
    // the Next button is about to be hidden; keep keyboard focus somewhere useful
    if (result.contains(document.activeElement)) playBtn.focus();
    result.hidden = true;

    // hide everything that would give the year away
    img.hidden = true;
    img.removeAttribute('src');
    img.alt = '';
    cover.hidden = false;
    yearBadge.textContent = '';
    describeHearing(frame);

    const [y0, y1] = theme.yearRange;
    announce(`New round. ${theme.name}, somewhere between ${y0} and ${y1}. `
      + `Press Space to hear the mystery year, A for ${y0}, B for ${y1}, then 1 to 4 to answer: ${round.choices.join(', ')}.`);
    if (autoplay) toggleMystery(true);
  }

  // What the mystery sounds like, in words, without the year: lets someone
  // who cannot hear well still play from the mapped sound parameters.
  function describeHearing(frame) {
    const p = mapFeatures(frame);
    hearing.textContent = `Hearing: ${p.note} · ${p.notesPerBar} note${p.notesPerBar > 1 ? 's' : ''}/bar · ${p.tempoBPM} BPM · ${p.timbre} · ${p.interval.startsWith('minor') ? 'tense' : 'calm'}`;
  }

  async function toggleMystery(force) {
    if (!round) return;
    if (!(await unlock())) return;
    const v = ensureVoice();
    if (playing === 'mystery' && force !== true) { stopAudio(); return; }
    v.setFrame(round.frame, { restart: true });
    v.start();
    setPlaying('mystery');
  }

  async function playAnchor(which) {
    if (!round) return;
    if (!(await unlock())) return;
    const v = ensureVoice();
    const frame = which === 'oldest' ? oldestFrame(round.theme) : newestFrame(round.theme);
    v.setFrame(frame, { restart: true });
    v.start({ bars: ANCHOR_BARS });
    setPlaying(which);
    announce(`${which === 'oldest' ? 'Oldest' : 'Newest'}: ${frame.year}.`);
  }

  function stopAudio() {
    voice?.stop();
    setPlaying(null);
  }

  function answer(year) {
    if (!round || round.answered) return;
    round.answered = true;
    stopAudio();
    const { frame, theme } = round;
    const off = Math.abs(year - frame.year);
    const right = off === 0;
    score.played += 1;
    if (right) { score.right += 1; score.streak += 1; } else { score.streak = 0; }

    options.querySelectorAll('.option').forEach((b) => {
      const y = Number(b.dataset.year);
      b.classList.toggle('is-answer', y === frame.year);
      b.classList.toggle('is-wrong', y === year && !right);
    });
    choicesSet.disabled = true;

    // reveal: speech first, picture second
    img.src = frame.imageUrl;
    img.alt = `${theme.name}, ${frame.label}`;
    img.hidden = false;
    cover.hidden = true;
    yearBadge.textContent = frame.year;

    const p = mapFeatures(frame);
    verdict.textContent = right ? `Yes, it was ${frame.year}.` : `It was ${frame.year}. You said ${year}, ${off} year${off === 1 ? '' : 's'} off.`;
    detail.textContent = `${theme.name}, ${frame.label}: ${theme.physical.label} ${physicalShort(frame)}. `
      + `It played ${p.note}, ${p.notesPerBar} notes per bar at ${p.tempoBPM} BPM on a ${p.timbre}.`;
    result.hidden = false;
    scoreEl.textContent = `Score ${score.right} / ${score.played}${score.streak > 1 ? ` · streak ${score.streak}` : ''}`;
    nextBtn.focus();

    const lean = frame.year - (theme.yearRange[0] + theme.yearRange[1]) / 2 > 0 ? 'the newer half' : 'the older half';
    announce(`${right ? 'Correct!' : 'Not quite.'} The mystery was ${frame.label}, in ${lean} of the record. `
      + `${capitalize(physicalSpoken(frame))}. It played ${speakNote(p.note)}, ${p.notesPerBar} notes per bar. `
      + `Score ${score.right} of ${score.played}. Press Enter for the next round.`);
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    if (k === ' ' && tag !== 'BUTTON') { e.preventDefault(); toggleMystery(); }
    else if (k === 'a') playAnchor('oldest');
    else if (k === 'b') playAnchor('newest');
    else if (['1', '2', '3', '4'].includes(k) && round && !round.answered) answer(round.choices[Number(k) - 1]);
    else if (k === 'enter' && round?.answered && tag !== 'BUTTON') newRound({ autoplay: true });
    else return;
    e.stopPropagation();
  }

  function activate() {
    document.addEventListener('keydown', onKey);
    if (!round) newRound();
  }

  function deactivate() {
    document.removeEventListener('keydown', onKey);
    stopAudio();
  }

  return { activate, deactivate };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
