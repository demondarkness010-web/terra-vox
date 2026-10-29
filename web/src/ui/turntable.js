// The central play area: the current NASA frame on the "turntable", the
// transport buttons and the timeline scrubber. This module is view + input
// only; main.js owns playback state and the audio engine.
//
// The scrubber is a native <input type="range">, so arrow keys, Page Up/Down
// and Home/End work for free and screen readers announce it as a slider.
// aria-valuetext makes them read "Aug 08-15, 2014, frame 14 of 25" instead
// of a bare index.

export function createTurntable(root, { onTogglePlay, onScrub, onStep, altFor = defaultAlt }) {
  const $ = (sel) => root.querySelector(sel);
  const stage = $('#stage');
  const img = $('#frame-img');
  const yearBadge = $('#frame-year');
  const caption = $('#frame-caption');
  const recordLabel = $('#record-label');
  const playBtn = $('#play');
  const prevBtn = $('#prev');
  const nextBtn = $('#next');
  const scrubber = $('#scrubber');
  const scrubStart = $('#scrub-start');
  const scrubEnd = $('#scrub-end');
  const themeTitle = root.querySelector('#player-theme') ?? document.getElementById('player-theme');

  let theme = null;

  playBtn.addEventListener('click', () => onTogglePlay?.());
  prevBtn.addEventListener('click', () => onStep?.(-1));
  nextBtn.addEventListener('click', () => onStep?.(1));
  scrubber.addEventListener('input', () => onScrub?.(Number(scrubber.value), { final: false }));
  scrubber.addEventListener('change', () => onScrub?.(Number(scrubber.value), { final: true }));

  function setTheme(next) {
    theme = next;
    themeTitle.textContent = theme.name;
    scrubber.max = String(theme.frames.length - 1);
    scrubber.setAttribute('aria-label', `${theme.name} timeline, ${theme.yearRange[0]} to ${theme.yearRange[1]}`);
    scrubStart.textContent = theme.yearRange[0];
    scrubEnd.textContent = theme.yearRange[1];
    recordLabel.src = theme.thumbnailUrl;
    stage.dataset.theme = theme.id;
  }

  function showFrame(index) {
    if (!theme) return;
    const frame = theme.frames[index];
    if (img.dataset.src !== frame.imageUrl) {
      img.src = frame.imageUrl;
      img.dataset.src = frame.imageUrl;
    }
    img.alt = altFor(frame, theme);
    yearBadge.textContent = frame.year;
    caption.textContent = `${theme.name} · ${frame.label}`;
    scrubber.value = String(index);
    scrubber.setAttribute('aria-valuetext', `${frame.label}, frame ${index + 1} of ${theme.frames.length}`);
    prevBtn.disabled = false;
    nextBtn.disabled = false;
  }

  function setPlaying(playing) {
    root.classList.toggle('is-playing', playing);
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.title = playing ? 'Pause (Space)' : 'Play (Space)';
  }

  return { setTheme, showFrame, setPlaying, stage, scrubber, playBtn, get theme() { return theme; } };
}

function defaultAlt(frame, theme) {
  return `${theme.name}, ${frame.label}`;
}
