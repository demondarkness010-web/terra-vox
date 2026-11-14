// The 3D globe (three.js). Loaded on demand by globe.js, after the first paint, so the
// 520 KB engine is not in the page's first load. See globe.js for the public API.

import * as THREE from 'three';
import { color, ms, easing, motionReduced } from './tokens.js';
import { trackLoading } from './globeLoading.js';

// Where each year's signal sits on the planet (the sparks), per theme and date. Lives here, not in the
// page's main file, because only the 3D globe uses it.
const pointFiles = import.meta.glob('../../../data/points/*.json', { eager: true, import: 'default' });
const NO_POINTS = [];
function pointsOf(frame) {
  if (!frame || frame.side === 'b') return NO_POINTS;
  return pointFiles[`../../../data/points/${frame.theme}.json`]?.[frame.date]?.points ?? NO_POINTS;
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const POOL = 96;
const IDLE_MS = 5000;     // DESIGN.md: loops stop after five seconds paused
const DIAMETER = 0.9;     // planet diameter as a share of stage height: the whole planet fits, with margin
const PART = 0.075;       // how far each Duet half leaves the seam, in planet radii
const SWEEP_PAD = 0.15;   // the cut starts above the limb and ends below the horizon

// The cut: uHalf -1 keeps the left half above the sweep line (and the whole
// planet below it), +1 keeps only the right half above the line, 0 is whole.
const CUT = /* glsl */ `
    if (uHalf < 0.0 && vView.y > uSweep && vN.x > 0.0) discard;
    if (uHalf > 0.0 && (vView.y <= uSweep || vN.x < 0.0)) discard;`;

const SPHERE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

const SPHERE_FRAG = /* glsl */ `
  uniform sampler2D uFrom;
  uniform sampler2D uTo;
  uniform float uMix;
  uniform vec3 uTint;
  uniform float uTintAmt;
  uniform float uHalf;
  uniform float uSweep;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    ${CUT}
    vec3 c = mix(texture2D(uFrom, vUv).rgb, texture2D(uTo, vUv).rgb, uMix);
    float facing = clamp(vN.z, 0.0, 1.0);
    c *= 0.4 + 0.6 * pow(facing, 0.55);
    c += uTint * pow(1.0 - facing, 2.6) * uTintAmt;
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

const RIM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uHalf;
  uniform float uSweep;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    ${CUT}
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
/** Signed east-west distance in degrees, -180..180 (east of `b` is positive, and on screen right). */
const lonDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

/** Circular mean longitude of a frame's signal, so the planet can face its data. */
function dataLon(frame) {
  const pts = pointsOf(frame);
  if (!pts.length) return 20;
  let x = 0;
  let y = 0;
  pts.forEach(([, lon]) => { x += Math.cos(lon * DEG); y += Math.sin(lon * DEG); });
  return Math.atan2(y, x) / DEG;
}

function tokenColor(name) {
  const c = new THREE.Color();
  // Read on the stage, where the space tokens apply (the page itself is paper).
  const stage = document.getElementById('stage');
  const v = stage ? getComputedStyle(stage).getPropertyValue(name).trim() : color(name);
  if (v) c.setStyle(v);
  return c;
}

// A modest laptop (4 cores or fewer, or 4 GB or less) gets a lighter globe: no antialiasing, one pixel per
// pixel, and 30 frames a second. The sound shares the same processor, so a lighter picture keeps it steady.
const LOW_POWER = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 8) <= 4;

export function createWebGLGlobe(container, onLost) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !LOW_POWER, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(LOW_POWER ? 1 : Math.min(window.devicePixelRatio || 1, 2));
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

  const COLORS = {
    limb: tokenColor('--limb'), ink: tokenColor('--ink'), old: tokenColor('--old'), new: tokenColor('--new'),
  };
  const TINTS = { single: COLORS.limb, oldest: COLORS.old, newest: COLORS.new };
  const SPARK = { single: COLORS.ink, oldest: COLORS.old, newest: COLORS.new };

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  camera.position.set(0, 0, 6);

  const sphereGeo = new THREE.SphereGeometry(1, 128, 96);
  const rimGeo = new THREE.SphereGeometry(1.1, 64, 48);
  const ringGeo = new THREE.RingGeometry(0.8, 1, 40);
  const dotGeo = new THREE.CircleGeometry(1, 16);
  const Z = new THREE.Vector3(0, 0, 1);
  const tmp = new THREE.Vector3();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  const BLACK = new THREE.Color(0, 0, 0);
  const sc = new THREE.Vector3();
  const mtx = new THREE.Matrix4();
  const col = new THREE.Color();

  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;

  const loading = trackLoading(container);
  const loader = new THREE.TextureLoader();
  const cache = new Map();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let dirty = true;

  function texture(url) {
    let tex = cache.get(url);
    if (tex) return tex;
    loading.start();
    tex = loader.load(url, () => {
      loading.end();
      tex.userData.ready = true;
      tex.userData.waiters.splice(0).forEach((fn) => fn());
    }, undefined, () => loading.end());
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
    const cut = { uHalf: { value: 0 }, uSweep: { value: 0 } };
    const uniforms = {
      uFrom: { value: blank }, uTo: { value: blank }, uMix: { value: 1 },
      uTint: { value: TINTS[side].clone() }, uTintAmt: { value: 0.22 }, ...cut,
    };
    spinner.add(new THREE.Mesh(sphereGeo, new THREE.ShaderMaterial({ uniforms, vertexShader: SPHERE_VERT, fragmentShader: SPHERE_FRAG })));
    const rimUniforms = { uColor: { value: TINTS[side].clone() }, uStrength: { value: 0.42 }, ...cut };
    const rim = new THREE.Mesh(rimGeo, new THREE.ShaderMaterial({
      uniforms: rimUniforms, vertexShader: SPHERE_VERT, fragmentShader: RIM_FRAG,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    // All of a planet's sparks are two instanced meshes (rings, dots): two draw calls a frame instead of up to
    // 192 separate meshes, which cost about 10 ms a frame on a slow laptop and made the motion and the sound
    // stutter. Blending is additive, so a spark fades by darkening its colour (black adds nothing).
    const sparkMesh = (geo) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), POOL);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(0, 0, 0));
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < POOL; i++) { m.setMatrixAt(i, HIDDEN); m.setColorAt(i, BLACK); }
      m.frustumCulled = false;
      spinner.add(m);
      return m;
    };
    const rings = sparkMesh(ringGeo);
    const dots = sparkMesh(dotGeo);
    const sparks = Array.from({ length: POOL }, () => ({ on: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), tint: new THREE.Color(), born: -1, life: 1 }));
    tilt.add(spinner);
    group.add(rim, tilt);
    scene.add(group);
    return { group, spinner, uniforms, rimUniforms, cut, sparks, rings, dots, next: 0, url: null, fadeStart: -1, fadeMs: 0 };
  }

  const main = makePlanet('single');
  const other = makePlanet('newest');
  other.group.visible = false;

  function setTint(planet, side) {
    planet.uniforms.uTint.value.copy(TINTS[side]);
    planet.rimUniforms.uColor.value.copy(TINTS[side]);
  }

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
      planet.fadeMs = motionReduced() ? ms('--dur-state') : ms('--dur-travel');
      planet.fadeStart = performance.now();
      dirty = true;
    };
    if (tex.userData.ready) go(); else tex.userData.waiters.push(go);
  }

  // ---------------------------------------------------------- state

  let theme = null;
  let playing = false;
  let pausedAt = performance.now();
  let spin = spinFor(20);        // shared, so both Duet halves show the same face of the planet
  let duetOn = false;
  const cut = { value: 0, tw: null };     // 0 whole .. 1 the seam has cut top to bottom
  const part = { value: 0, tw: null };    // 0 halves joined .. 1 parted

  function tween(from, to, delay, dur, ease) {
    return { from, to, start: performance.now() + delay, dur, ease };
  }
  function advance(state, now) {
    const tw = state.tw;
    if (!tw) return false;
    const t = tw.dur > 0 ? (now - tw.start) / tw.dur : (now >= tw.start ? 1 : -1);
    if (t < 0) return true;            // still waiting out its delay
    if (t >= 1) {
      state.value = tw.to;
      state.tw = null;
      tw.done?.();
      return true;
    }
    state.value = tw.from + (tw.to - tw.from) * tw.ease(t);
    return true;
  }

  function setTheme(next) {
    theme = next;
    const keep = new Set(next.frames.map((f) => f.imageUrl));
    for (const [url, tex] of cache) {
      if (!keep.has(url) && url !== main.url && url !== other.url) { tex.dispose(); cache.delete(url); }
    }
    spin = spinFor(dataLon(next.frames[0]));
    dirty = true;
  }

  function showFrame(frame) {
    show(main, frame.imageUrl);
    if (motionReduced()) { spin = spinFor(dataLon(frame)); dirty = true; }
    // warm the next two years so playback never waits on a download
    const i = theme?.frames.indexOf(frame) ?? -1;
    if (i >= 0) [1, 2].forEach((d) => texture(theme.frames[(i + d) % theme.frames.length].imageUrl));
  }

  // The one orchestrated moment (DESIGN.md, Motion): the seam cuts at 0,
  // the halves part one step later. Leaving runs it backwards at 0.7x.
  function setDuet(on, oldest, newest) {
    const step = ms('--split-step');
    if (on) {
      duetOn = true;
      setTint(main, 'oldest');
      setTint(other, 'newest');
      show(main, oldest.imageUrl);
      show(other, newest.imageUrl);
      if (motionReduced()) spin = spinFor(dataLon(newest));
      main.cut.uHalf.value = -1;
      other.cut.uHalf.value = 1;
      other.group.visible = true;
      cut.tw = tween(cut.value, 1, 0, ms('--dur-settle'), easing('--ease-settle'));
      part.tw = tween(part.value, 1, step, ms('--dur-split'), easing('--ease-part'));
    } else {
      duetOn = false;
      const k = 0.7;
      part.tw = tween(part.value, 0, step * 4 * k, ms('--dur-split') * k, easing('--ease-settle'));
      cut.tw = tween(cut.value, 0, step * 5 * k, ms('--dur-settle') * k, easing('--ease-settle'));
      cut.tw.done = () => {
        if (duetOn) return;
        main.cut.uHalf.value = 0;
        other.cut.uHalf.value = 0;
        other.group.visible = false;
        setTint(main, 'single');
      };
    }
    dirty = true;
  }

  function spark(side, frame, velocity = 0.7) {
    const planet = side === 'newest' ? other : main;
    const pts = pointsOf(frame);
    if (!pts.length || !planet.group.visible) return;
    const centre = lonFor(spin);
    const facing = pts.filter(([, lon]) => Math.abs(lonDiff(lon, centre)) < 72);
    // In Duet each half only shows its own side of the seam.
    const own = side === 'oldest' ? facing.filter(([, lon]) => lonDiff(lon, centre) < 4)
      : side === 'newest' ? facing.filter(([, lon]) => lonDiff(lon, centre) > -4) : facing;
    const pool = own.length >= 3 ? own : facing.length >= 3 ? facing : pts;
    const n = 2 + Math.round(velocity * 3);
    const tint = SPARK[side] ?? SPARK.single;
    // A spark lives one bar. The tempo comes from setTempo, not the --beat style token: reading a style
    // at every note made the browser recompute the page's styles each time, which held up the sound.
    const bpm = tempo[side] || tempo.single || tempo.oldest;
    const life = bpm ? (4 * 60000) / bpm : 2400;
    const now = performance.now();
    for (let k = 0; k < n; k++) {
      const [lat, lon] = pool[Math.floor(Math.random() * pool.length)];
      const s = planet.sparks[planet.next];
      planet.next = (planet.next + 1) % POOL;
      const v = latLon(lat, lon, 1.004);
      s.pos.copy(v);
      s.quat.setFromUnitVectors(Z, v.normalize());
      s.tint.copy(tint);
      s.on = true;
      s.born = now + k * 28;       // a short ripple rather than one flash
      s.life = life;
    }
  }

  const tempo = { single: 0, oldest: 0, newest: 0 };
  function setTempo(side, bpm) { tempo[side] = bpm; }
  function setPlaying(on) {
    if (playing && !on) pausedAt = performance.now();
    playing = on;
    dirty = true;
  }

  // ---------------------------------------------------------- frame loop

  const size = { w: 0, h: 0 };
  const resizer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    size.w = Math.round(width);
    size.h = Math.round(height);
    if (size.w && size.h) renderer.setSize(size.w, size.h, false);
    dirty = true;
  });
  resizer.observe(container);

  function degPerSecond(now) {
    if (motionReduced()) return 0;
    if (!playing) return now - pausedAt > IDLE_MS ? 0 : 2.5;
    const bpm = duetOn ? (tempo.oldest + tempo.newest) / 2 : tempo.single;
    if (!bpm) return 2.5;
    return 6 + ((Math.min(160, Math.max(80, bpm)) - 80) / 80) * 6;
  }

  function updateSparks(planet, now) {
    const calm = motionReduced();
    const half = planet.cut.uHalf.value;
    let alive = false;
    let changed = false;
    const { rings, dots } = planet;
    planet.sparks.forEach((s, i) => {
      if (!s.on) return;
      alive = true;
      changed = true;
      const t = (now - s.born) / s.life;
      let ringA = 0;
      let dotA = 0;
      if (t >= 1) {
        s.on = false;
      } else if (t >= 0) {
        ringA = (1 - t) ** 1.6 * (calm ? 0.6 : 0.95);
        dotA = 1 - t * t;
        if (half) {
          tmp.copy(s.pos).applyMatrix4(planet.spinner.matrixWorld);
          if ((tmp.x - planet.group.position.x) * half < 0) { ringA = 0; dotA = 0; }
        }
      }
      if (!s.on || (ringA === 0 && dotA === 0)) {
        rings.setMatrixAt(i, HIDDEN);
        dots.setMatrixAt(i, HIDDEN);
        return;
      }
      const r = calm ? 0.05 : 0.014 + 0.075 * (1 - (1 - Math.min(1, t * 2.5)) ** 3);
      rings.setMatrixAt(i, mtx.compose(s.pos, s.quat, sc.setScalar(r)));
      rings.setColorAt(i, col.copy(s.tint).multiplyScalar(ringA));
      dots.setMatrixAt(i, mtx.compose(s.pos, s.quat, sc.setScalar(0.013)));
      dots.setColorAt(i, col.copy(s.tint).multiplyScalar(dotA));
    });
    if (changed) {
      rings.instanceMatrix.needsUpdate = true;
      rings.instanceColor.needsUpdate = true;
      dots.instanceMatrix.needsUpdate = true;
      dots.instanceColor.needsUpdate = true;
    }
    return alive;
  }

  let visible = true;
  let lastTime = performance.now();
  let raf = 0;
  function frame(now) {
    raf = visible ? requestAnimationFrame(frame) : 0;
    if (LOW_POWER && now - lastTime < 30) return;
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (!size.w || !size.h) return;

    let active = dirty;
    dirty = false;
    if (advance(cut, now)) active = true;
    if (advance(part, now)) active = true;
    const speed = degPerSecond(now);
    if (speed > 0) { spin += speed * DEG * dt; active = true; }
    [main, other].forEach((p) => {
      p.spinner.rotation.y = spin;
      if (p.fadeStart >= 0) {
        const f = p.fadeMs > 0 ? Math.min(1, (now - p.fadeStart) / p.fadeMs) : 1;
        p.uniforms.uMix.value = f;
        if (f >= 1) p.fadeStart = -1;
        active = true;
      }
      if (updateSparks(p, now)) active = true;
    });
    if (!active) return;

    // Radius 1 is drawn at DIAMETER x half the stage height, and the whole planet is centred in the
    // stage (it used to be 1.15x with its lower limb cut off by the horizon, which hid the southern
    // hemisphere on short laptop screens).
    const halfH = 1 / DIAMETER;
    const halfW = (halfH * size.w) / size.h;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    const cy = 0;
    const gap = PART * part.value;
    main.group.position.set(-gap, cy, 0);
    other.group.position.set(gap, cy, 0);
    const top = halfH + SWEEP_PAD;
    const sweep = top - (top + halfH + SWEEP_PAD) * cut.value;
    main.cut.uSweep.value = sweep;
    other.cut.uSweep.value = sweep;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // Off screen, the loop stops; scrolling back starts it again.
  const watcher = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) {
      lastTime = performance.now();
      dirty = true;
      raf = requestAnimationFrame(frame);
    }
  });
  watcher.observe(container);

  function destroy() {
    cancelAnimationFrame(raf);
    clearTimeout(lostTimer);
    resizer.disconnect();
    watcher.disconnect();
    cache.forEach((tex) => tex.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { setTheme, showFrame, setDuet, spark, setTempo, setPlaying, destroy, webgl: true };
}
