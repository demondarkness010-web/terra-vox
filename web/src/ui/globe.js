// The globe: the NASA frame now playing, on a turning planet. Decorative
// (the stage around it carries the alt text), so everything here is optional
// for a screen-reader or keyboard user.
//
//   setTheme(theme)            jump to a theme, facing where its data is
//   showFrame(frame)           crossfade to a frame (single mode)
//   setDuet(on, old, new)      split into two planets, oldest left, newest right
//   spark(side, frame, vel)    one note: rings bloom at real active locations
//   setTempo(side, bpm)        spin speed follows tempo (80-160 BPM -> 6-12 deg/s)
//   setPlaying(on)             idle drift when paused
//
// Spark locations come from data/points (scripts/extract_points.py): pixels
// that count as "active" for the theme, the same rule that sets notes per bar.
// prefers-reduced-motion: the planet stops turning and faces the data, sparks
// fade in place instead of blooming, and the split happens without travel.
// Without WebGL it falls back to the flat frame as an <img>.

import * as THREE from 'three';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const SPARK_LIFE = 700;
const FADE_MS = 380;
const SPLIT_MS = 760;
const POOL = 56;
const COLORS = { single: 0xfff1d6, oldest: 0x56b4e9, newest: 0xe69f00 };
const RIMS = { single: 0x8fa6c8, oldest: 0x56b4e9, newest: 0xe69f00 };

const SPHERE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  void main() {
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const SPHERE_FRAG = /* glsl */ `
  uniform sampler2D uFrom;
  uniform sampler2D uTo;
  uniform float uMix;
  uniform vec3 uTint;
  uniform float uTintAmt;
  varying vec2 vUv;
  varying vec3 vN;
  void main() {
    vec3 c = mix(texture2D(uFrom, vUv).rgb, texture2D(uTo, vUv).rgb, uMix);
    float facing = clamp(vN.z, 0.0, 1.0);
    c *= 0.4 + 0.6 * pow(facing, 0.55);
    c += uTint * pow(1.0 - facing, 2.6) * uTintAmt;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

const RIM_VERT = /* glsl */ `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const RIM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vN;
  void main() {
    float a = pow(smoothstep(0.0, 0.5, -vN.z), 1.6) * uStrength;
    gl_FragColor = vec4(uColor * a, a);
    #include <colorspace_fragment>
  }`;

/** Local position on a unit sphere for an equirectangular frame, matching SphereGeometry's UVs. */
function latLon(lat, lon, r = 1) {
  const phi = ((lon + 180) / 360) * TAU;
  const theta = ((90 - lat) / 180) * Math.PI;
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r);
}
const spinFor = (lon) => Math.PI / 2 - ((lon + 180) / 360) * TAU;
const lonFor = (spin) => {
  const lon = ((Math.PI / 2 - spin) / TAU) * 360 - 180;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
};
const lonGap = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/** Circular mean longitude of a frame's signal, so the planet can face its data. */
function dataLon(frame) {
  const pts = frame?.signal?.points ?? [];
  if (!pts.length) return 20;
  let x = 0;
  let y = 0;
  pts.forEach(([, lon]) => { x += Math.cos(lon * DEG); y += Math.sin(lon * DEG); });
  return Math.atan2(y, x) / DEG;
}

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeBack = (t) => { const c = 1.35; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

// The public globe. WebGL can be refused or lost (a GPU reset, or the browser
// blocking a page after a context loss), so this keeps the latest state,
// shows the flat frame while WebGL is unavailable, retries, and replays the
// state into a fresh planet when it comes back. A live demo never goes blank.
export function createGlobe(container) {
  const last = { theme: null, frame: null, duet: null, playing: false, tempo: {} };
  let impl = null;
  let retries = 0;

  function replay() {
    if (last.theme) impl.setTheme(last.theme);
    if (last.duet) impl.setDuet(true, last.duet.oldest, last.duet.newest);
    else if (last.frame) impl.showFrame(last.frame);
    impl.setPlaying(last.playing);
    Object.entries(last.tempo).forEach(([side, bpm]) => impl.setTempo(side, bpm));
  }

  function useFlat() {
    impl?.destroy();
    impl = createFlatFallback(container);
    replay();
    retry();
  }

  function retry() {
    if (retries >= 6) return;
    retries += 1;
    setTimeout(() => {
      const next = createWebGLGlobe(container, useFlat);
      if (!next) { retry(); return; }
      impl.destroy();
      impl = next;
      replay();
    }, 2500 * retries);
  }

  impl = createWebGLGlobe(container, useFlat);
  if (!impl) useFlat();

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

function createWebGLGlobe(container, onLost) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const still = () => Boolean(reduce?.matches);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'globe-canvas';
  container.append(renderer.domElement);

  // three.js asks the browser to restore a lost context; if it does not come
  // back soon, hand over to the flat fallback.
  let lostTimer = null;
  renderer.domElement.addEventListener('webglcontextlost', () => {
    lostTimer = setTimeout(() => onLost(), 1500);
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => clearTimeout(lostTimer));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  camera.position.set(0, 0, 6);

  const sphereGeo = new THREE.SphereGeometry(1, 128, 96);
  const rimGeo = new THREE.SphereGeometry(1.1, 64, 48);
  const ringGeo = new THREE.RingGeometry(0.8, 1, 40);
  const dotGeo = new THREE.CircleGeometry(1, 16);
  const Z = new THREE.Vector3(0, 0, 1);

  const blank = new THREE.DataTexture(new Uint8Array([8, 10, 14, 255]), 1, 1);
  blank.needsUpdate = true;

  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  function texture(url) {
    let tex = cache.get(url);
    if (tex) return tex;
    tex = loader.load(url, () => {
      tex.userData.ready = true;
      tex.userData.waiters.splice(0).forEach((fn) => fn());
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, maxAniso);
    tex.userData.waiters = [];
    cache.set(url, tex);
    return tex;
  }

  function makePlanet(side) {
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.x = 0.32;     // lean north toward the viewer, where most data sits
    const spinner = new THREE.Group();
    const uniforms = {
      uFrom: { value: blank }, uTo: { value: blank }, uMix: { value: 1 },
      uTint: { value: new THREE.Color(RIMS[side]) }, uTintAmt: { value: 0.22 },
    };
    spinner.add(new THREE.Mesh(sphereGeo, new THREE.ShaderMaterial({ uniforms, vertexShader: SPHERE_VERT, fragmentShader: SPHERE_FRAG })));
    const rimUniforms = { uColor: { value: new THREE.Color(RIMS[side]) }, uStrength: { value: 0.42 } };
    const rim = new THREE.Mesh(rimGeo, new THREE.ShaderMaterial({
      uniforms: rimUniforms, vertexShader: RIM_VERT, fragmentShader: RIM_FRAG,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const sparks = Array.from({ length: POOL }, () => {
      const mat = () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const ring = new THREE.Mesh(ringGeo, mat());
      const dot = new THREE.Mesh(dotGeo, mat());
      ring.visible = dot.visible = false;
      spinner.add(ring, dot);
      return { ring, dot, born: -1 };
    });
    tilt.add(spinner);
    group.add(rim, tilt);
    scene.add(group);
    return { side, group, spinner, uniforms, rimUniforms, sparks, next: 0, spin: spinFor(20), speed: 3, url: null, fadeStart: -1 };
  }

  const planets = { oldest: makePlanet('single'), newest: makePlanet('newest') };
  const main = planets.oldest;
  planets.newest.group.visible = false;

  function setTint(planet, side) {
    planet.uniforms.uTint.value.setHex(RIMS[side]);
    planet.rimUniforms.uColor.value.setHex(RIMS[side]);
    planet.colorSide = side;
  }
  setTint(main, 'single');

  function show(planet, url) {
    if (!url || planet.url === url) return;
    planet.url = url;
    const tex = texture(url);
    const go = () => {
      if (planet.url !== url) return;
      const u = planet.uniforms;
      u.uFrom.value = u.uMix.value >= 0.5 ? u.uTo.value : u.uFrom.value;
      u.uTo.value = tex;
      u.uMix.value = 0;
      planet.fadeStart = performance.now();
    };
    if (tex.userData.ready) go(); else tex.userData.waiters.push(go);
  }

  function face(planet, frame) {
    planet.spin = spinFor(dataLon(frame));
  }

  // ---------------------------------------------------------- state

  let theme = null;
  let playing = false;
  let split = { value: 0, from: 0, to: 0, start: -1 };
  let axis = 'x';

  function setTheme(next) {
    theme = next;
    const keep = new Set(next.frames.map((f) => f.imageUrl));
    for (const [url, tex] of cache) {
      if (!keep.has(url) && url !== main.url && url !== planets.newest.url) { tex.dispose(); cache.delete(url); }
    }
    face(main, next.frames[0]);
    face(planets.newest, next.frames[next.frames.length - 1]);
  }

  function showFrame(frame) {
    show(main, frame.imageUrl);
    if (still()) face(main, frame);
    // warm the next two years so playback never waits on a download
    const i = theme?.frames.indexOf(frame) ?? -1;
    if (i >= 0) [1, 2].forEach((d) => texture(theme.frames[(i + d) % theme.frames.length].imageUrl));
  }

  function setDuet(on, oldest, newest) {
    if (on) {
      setTint(main, 'oldest');
      show(main, oldest.imageUrl);
      show(planets.newest, newest.imageUrl);
      face(main, oldest);
      face(planets.newest, newest);
      planets.newest.group.visible = true;
    } else {
      setTint(main, 'single');
    }
    split = { value: split.value, from: split.value, to: on ? 1 : 0, start: performance.now() };
  }

  function spark(side, frame, velocity = 0.7) {
    const planet = side === 'newest' ? planets.newest : main;
    const pts = frame?.signal?.points ?? [];
    if (!pts.length || !planet.group.visible) return;
    const centre = lonFor(planet.spin);
    const facing = pts.filter(([, lon]) => lonGap(lon, centre) < 72);
    const pool = facing.length >= 3 ? facing : pts;
    const n = 2 + Math.round(velocity * 3);
    const colour = COLORS[side === 'single' ? 'single' : side];
    const now = performance.now();
    for (let k = 0; k < n; k++) {
      const [lat, lon] = pool[Math.floor(Math.random() * pool.length)];
      const s = planet.sparks[planet.next];
      planet.next = (planet.next + 1) % POOL;
      const v = latLon(lat, lon, 1.004);
      const q = new THREE.Quaternion().setFromUnitVectors(Z, v.clone().normalize());
      [s.ring, s.dot].forEach((m) => {
        m.position.copy(v);
        m.quaternion.copy(q);
        m.material.color.setHex(colour);
        m.visible = true;
      });
      s.born = now + k * 28;       // a short ripple rather than one flash
    }
  }

  const tempo = { single: 0, oldest: 0, newest: 0 };
  function setTempo(side, bpm) { tempo[side] = bpm; }
  function setPlaying(on) { playing = on; }

  // ---------------------------------------------------------- frame loop

  const size = { w: 0, h: 0 };
  const resizer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    size.w = Math.round(width);
    size.h = Math.round(height);
    if (size.w && size.h) renderer.setSize(size.w, size.h, false);
  });
  resizer.observe(container);

  function degPerSecond(side) {
    const bpm = tempo[side];
    if (!playing || !bpm) return 2.5;
    return 6 + ((Math.min(160, Math.max(80, bpm)) - 80) / 80) * 6;
  }

  function updateSparks(planet, now) {
    const calm = still();
    planet.sparks.forEach((s) => {
      if (!s.ring.visible) return;
      const t = (now - s.born) / SPARK_LIFE;
      if (t < 0) { s.ring.material.opacity = 0; s.dot.material.opacity = 0; return; }
      if (t >= 1) { s.ring.visible = s.dot.visible = false; return; }
      const r = calm ? 0.05 : 0.014 + 0.075 * easeOut(t);
      s.ring.scale.setScalar(r);
      s.ring.material.opacity = (1 - t) ** 1.6 * (calm ? 0.6 : 0.95);
      s.dot.scale.setScalar(0.013);
      s.dot.material.opacity = 1 - t * t;
    });
  }

  let last = performance.now();
  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!size.w || !size.h) return;

    if (split.start >= 0) {
      const t = Math.min(1, (now - split.start) / SPLIT_MS);
      split.value = still() ? split.to : split.from + (split.to - split.from) * (split.to > split.from ? easeBack(t) : easeOut(t));
      if (t >= 1) {
        split.start = -1;
        split.value = split.to;
        if (split.to === 0) planets.newest.group.visible = false;
      }
    }

    const sides = { [main.side]: main, newest: planets.newest };
    Object.values(sides).forEach((p) => {
      const side = split.to === 1 ? (p === main ? 'oldest' : 'newest') : 'single';
      if (!still()) p.spin += degPerSecond(side) * DEG * dt;
      p.spinner.rotation.y = p.spin;
      if (p.fadeStart >= 0) {
        const f = Math.min(1, (now - p.fadeStart) / (still() ? 160 : FADE_MS));
        p.uniforms.uMix.value = f;
        if (f >= 1) p.fadeStart = -1;
      }
      updateSparks(p, now);
    });

    // layout: one planet, or two side by side (stacked when the stage is tall)
    axis = size.w / size.h < 0.92 ? 'y' : 'x';
    container.dataset.axis = axis;
    const s = split.value;
    const gap = 1.02 * s;
    const scaleA = 1 - 0.12 * Math.min(1, s);
    const scaleB = 0.88 * Math.min(1, Math.max(0, s * 1.6));
    main.group.scale.setScalar(scaleA);
    planets.newest.group.scale.setScalar(Math.max(0.0001, scaleB));
    if (axis === 'x') {
      main.group.position.set(-gap, 0, 0);
      planets.newest.group.position.set(gap, 0, 0);
    } else {
      main.group.position.set(0, gap, 0);
      planets.newest.group.position.set(0, -gap, 0);
    }

    const aspect = size.w / size.h;
    const needW = axis === 'x' ? 1.2 + 0.88 * s : 1.2;
    const needH = axis === 'y' ? 1.2 + 0.88 * s : 1.2;
    const halfH = Math.max(needH, needW / aspect);
    const halfW = halfH * aspect;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  function destroy() {
    cancelAnimationFrame(raf);
    clearTimeout(lostTimer);
    resizer.disconnect();
    cache.forEach((tex) => tex.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { setTheme, showFrame, setDuet, spark, setTempo, setPlaying, destroy, webgl: true };
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
  return {
    setTheme() {},
    showFrame(frame) { img.src = frame.imageUrl; },
    setDuet(on, oldest, newest) {
      img2.hidden = !on;
      if (on) { img.src = oldest.imageUrl; img2.src = newest.imageUrl; }
    },
    spark() {}, setTempo() {}, setPlaying() {},
    destroy() { img.remove(); img2.remove(); container.classList.remove('is-flat'); },
    webgl: false,
  };
}
