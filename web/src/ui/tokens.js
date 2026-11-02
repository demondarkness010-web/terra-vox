// Design tokens, read from web/styles/main.css :root so no script hard-codes
// a colour, duration or easing (DESIGN.md). Read on demand: the motion toggle
// zeroes the durations, and every read after that sees it.

const style = () => getComputedStyle(document.documentElement);

export const token = (name) => style().getPropertyValue(name).trim();

/** A duration token in milliseconds ("320ms" -> 320, "0.5s" -> 500). */
export function ms(name) {
  const v = token(name);
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith('ms') ? n : n * 1000;
}

/** A colour token as a CSS string; three.js Color accepts it. */
export const color = (name) => token(name);

/** A cubic-bezier() token as an easing function of t in [0, 1]. */
export function easing(name) {
  const m = token(name).match(/cubic-bezier\(([^)]+)\)/);
  if (!m) return (t) => t;
  const [x1, y1, x2, y2] = m[1].split(',').map(Number);
  return bezier(x1, y1, x2, y2);
}

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
  const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const Y = (t) => ((ay * t + by) * t + cy) * t;
  const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = X(t) - x;
      if (Math.abs(err) < 1e-5) return Y(t);
      const d = dX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // Newton stalled: bisect, x(t) is monotonic for x1, x2 in [0, 1].
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      if (X(t) < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return Y(t);
  };
}

/** True when html[data-motion="reduce"]: the Motion toggle, or the OS setting by default. */
export const motionReduced = () => document.documentElement.dataset.motion === 'reduce';
