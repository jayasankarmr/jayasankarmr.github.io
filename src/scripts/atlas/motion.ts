// Motion tokens for the atlas: every easing curve, duration, stagger and scroll length the
// home page uses lives here. GSAP gets the curves as named eases ("atlas.out", …); CSS gets
// them as custom properties (base.css carries the same values as no-JS fallbacks).
import { gsap } from "../motion/smooth";

type Bezier = readonly [number, number, number, number];

export const curves = {
  /** expo-out: arrivals, reveals */
  out: [0.16, 1, 0.3, 1],
  /** symmetric: flips, morphs, page transitions */
  inOut: [0.65, 0, 0.35, 1],
  /** long, weighty settle for the camera landing */
  camera: [0.45, 0, 0.15, 1],
  /** the violent intro pull-back: slow start, hard shove, long glide */
  launch: [0.7, 0, 0.2, 1],
  /** gentle in-out for scrubbed values */
  soft: [0.37, 0, 0.63, 1],
} as const satisfies Record<string, Bezier>;

export const dur = {
  micro: 0.18,
  ui: 0.45,
  card: 0.85,
  text: 1.0,
  stamp: 0.5,
  wave: 1.2,
  scramble: 0.6,
  seekMin: 0.8,
  seekMax: 2.4,
  intro: 3.0,
  introRepeat: 0.8,
  vt: 0.7,
} as const;

export const stagger = { char: 0.022, word: 0.05, line: 0.09, card: 0.07, ticket: 0.06 } as const;

/** Scroll lengths, in small-viewport heights. */
export const scroll = {
  /** hero → first stop dive */
  heroOut: 0.6,
  /** one stop segment (dwell + the leg that follows it) */
  stop: { wide: 0.75, compact: 0.6 },
  /** extra scroll per radian of leg length, so long flights feel long */
  perRadian: 0.9,
  /** share of a segment spent landed at the stop */
  dwell: 0.42,
  /** sphere → map unroll */
  unroll: 1.4,
  /** idle time before the magnetic dwell glides in, and its duration range */
  snapIdle: 0.14,
  snapMin: 0.45,
  snapMax: 1.1,
  /** how far into a leg (0–1 of the transit) counts as committing to the next stop */
  commit: 0.15,
} as const;

/** Critically-damped-ish springs as (stiffness, damping) for the small spring integrator. */
export const springs = {
  ui: { k: 170, c: 26 },
  return: { k: 120, c: 22 },
  label: { k: 260, c: 32 },
  tilt: { k: 140, c: 18 },
} as const;

// ---- cubic-bezier → easing function (Newton–Raphson with bisection fallback)
export function bezier([x1, y1, x2, y2]: Bezier): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

export const ease = Object.fromEntries(Object.entries(curves).map(([k, v]) => [k, bezier(v)])) as Record<keyof typeof curves, (t: number) => number>;

export const cssBezier = (c: Bezier) => `cubic-bezier(${c.join(", ")})`;

let registered = false;
/** Registers the curves as GSAP eases ("atlas.out", …) and syncs the CSS custom properties. */
export function registerMotion() {
  if (registered) return;
  registered = true;
  for (const [name, fn] of Object.entries(ease)) gsap.registerEase(`atlas.${name}`, fn);
  const root = document.documentElement.style;
  for (const [name, c] of Object.entries(curves)) root.setProperty(`--ease-${name}`, cssBezier(c));
}

// ---- small numeric helpers shared by the choreography
export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0→1 as v goes a→b, clamped */
export const ramp = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** Frame-rate independent exponential approach: fraction to move this frame. */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);

/** One step of a damped spring toward `target`. Mutates and returns state. */
export function springStep(s: { x: number; v: number }, target: number, dt: number, { k, c }: { k: number; c: number }) {
  // semi-implicit Euler, sub-stepped so large frames stay stable
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (k * (target - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
  return s;
}
