// The globe: the NASA frame now playing, photographed from orbit. Decorative
// (the stage around it carries the alt text), so everything here is optional
// for a screen-reader or keyboard user.
//
//   setTheme(theme)            jump to a theme, facing where its data is
//   showFrame(frame)           crossfade to a frame (single mode)
//   setDuet(on, old, new)      the Duet split: a seam cuts the planet from top
//                              to bottom, oldest year on the left half, newest
//                              on the right, then the halves part on the seam
//   spark(side, frame, vel)    one note: rings bloom at real active locations
//   setTempo(side, bpm)        spin speed follows tempo (80-160 BPM -> 6-12 deg/s)
//   setPlaying(on)             idle drift when paused, still after five seconds
//
// Framing (DESIGN.md, Layout): the planet's diameter is 1.15x the stage
// height and its lower limb is cropped by the horizon, as seen from orbit.
// Colours, durations and easings are read from the CSS tokens.
// Spark locations come from data/points (scripts/extract_points.py): pixels
// that count as "active" for the theme, the same rule that sets notes per bar.
// Reduced motion (html[data-motion="reduce"]): the planet stops turning and
// faces its data, sparks fade in place, and the split happens without travel.
// The render loop pauses while the stage is off screen and idles when nothing
// moves. Without WebGL it falls back to the flat frame as an <img>.

import { trackLoading } from './globeLoading.js';

// Until the 3D engine is ready the stage shows "Loading the NASA frame" on black.
function createPlaceholder(container) {
  const loading = trackLoading(container);
  loading.start();
  return {
    setTheme() {}, showFrame() {}, setDuet() {}, spark() {}, setTempo() {}, setPlaying() {},
    destroy() { loading.end(); },
    webgl: false,
  };
}

// Is WebGL running in software (SwiftShader, llvmpipe: a virtual machine, a remote desktop, a headless
// browser, a machine with no usable graphics driver)? A 3D planet drawn on the CPU takes seconds to set up
// and then crawls, so there the flat NASA frames are the better view. Real graphics chips are unaffected.
function softwareRendering() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return false;                       // no WebGL at all: the normal fallback handles it
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software/i.test(name);
  } catch {
    return false;
  }
}

// The public globe. WebGL can be refused or lost (a GPU reset, or the browser
// blocking a page after a context loss), so this keeps the latest state,
// shows the flat frame while WebGL is unavailable, retries, and replays the
// state into a fresh planet when it comes back. A live demo never goes blank.
// The three.js engine itself is fetched after the first paint (globeGL.js), so
// the page becomes readable and usable before it arrives; state set in the
// meantime is replayed into it.
export function createGlobe(container) {
  const last = { theme: null, frame: null, duet: null, playing: false, tempo: {} };
  let impl = createPlaceholder(container);
  let retries = 0;
  let gl = null;

  function replay() {
    if (last.theme) impl.setTheme(last.theme);
    if (last.duet) impl.setDuet(true, last.duet.oldest, last.duet.newest);
    else if (last.frame) impl.showFrame(last.frame);
    impl.setPlaying(last.playing);
    Object.entries(last.tempo).forEach(([side, bpm]) => impl.setTempo(side, bpm));
  }

  async function engine() {
    if (!gl) {
      try { gl = await import('./globeGL.js'); } catch { gl = null; }
    }
    return gl;
  }

  function useFlat() {
    impl?.destroy();
    impl = createFlatFallback(container);
    replay();
    retry();
  }

  let software = false;

  function retry() {
    if (software || retries >= 6) return;
    retries += 1;
    setTimeout(async () => {
      const mod = await engine();
      const next = mod ? mod.createWebGLGlobe(container, useFlat) : null;
      if (!next) { retry(); return; }
      impl.destroy();
      impl = next;
      replay();
    }, 2500 * retries);
  }

  async function start() {
    if (softwareRendering()) { software = true; useFlat(); return; }
    const mod = await engine();
    impl.destroy();                       // ends the placeholder's loading note first
    const next = mod ? mod.createWebGLGlobe(container, useFlat) : null;
    if (!next) { useFlat(); return; }
    impl = next;
    replay();
  }
  // Start as soon as the page is idle (right after the first paint, never later than 1.5 s): the page is
  // readable and usable first, and the planet arrives a moment later. Waiting longer (for example until
  // the welcome dialog closes) was tried and rejected: creating the WebGL context late, next to the audio
  // start, made the planet fall back to the flat map on a low-memory laptop.
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1500 });
  else setTimeout(start, 400);

  return {
    setTheme(theme) { last.theme = theme; impl.setTheme(theme); },
    showFrame(frame) { last.frame = frame; impl.showFrame(frame); },
    setDuet(on, oldest, newest) { last.duet = on ? { oldest, newest } : null; impl.setDuet(on, oldest, newest); },
    spark(side, frame, velocity) { impl.spark(side, frame, velocity); },
    setTempo(side, bpm) { last.tempo[side] = bpm; impl.setTempo(side, bpm); },
    setPlaying(on) { last.playing = on; impl.setPlaying(on); },
    get webgl() { return impl.webgl; },
  };
}

// Without WebGL: the flat NASA frame, still the real picture.
function createFlatFallback(container) {
  container.classList.add('is-flat');
  const img = document.createElement('img');
  img.alt = '';
  img.className = 'globe-flat';
  const img2 = img.cloneNode();
  img2.classList.add('newest');
  img2.hidden = true;
  container.append(img, img2);
  const loading = trackLoading(container);
  for (const el of [img, img2]) {
    el.addEventListener('load', () => loading.end());
    el.addEventListener('error', () => loading.end());
  }
  const setSrc = (el, url) => {
    if (el.getAttribute('src') === url) return;   // same URL never fires load again
    loading.start();
    el.src = url;
  };
  return {
    setTheme() {},
    showFrame(frame) { setSrc(img, frame.imageUrl); },
    setDuet(on, oldest, newest) {
      img2.hidden = !on;
      if (on) { setSrc(img, oldest.imageUrl); setSrc(img2, newest.imageUrl); }
    },
    spark() {}, setTempo() {}, setPlaying() {},
    destroy() { img.remove(); img2.remove(); container.classList.remove('is-flat'); },
    webgl: false,
  };
}
