// Darkroom WebGL: the hero photo "develops" from an orange-mask negative with tray
// agitation, a warm light leak follows the cursor, grain + vignette throughout.
// Also exports the hover light-leak used on contact-sheet thumbnails.
import { Surface, GLSL_NOISE } from "./raw";
import { gsap } from "../motion/smooth";
import { dpr, onVisibility } from "../motion/env";

const HERO_FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uTexSize, uMouse;
uniform float uTime, uDevelop, uScroll, uMouseStrength;
varying vec2 vUv;
${GLSL_NOISE}
void main(){
  float aspect = uRes.x / uRes.y;
  vec2 uv = vUv;
  vec2 d = (vUv - uMouse) * vec2(aspect, 1.0);
  float md = length(d);
  float near = smoothstep(0.38, 0.0, md) * uMouseStrength;

  float agit = 1.0 - uDevelop;
  uv += agit * 0.01 * vec2(sin(uv.y * 16.0 + uTime * 1.6), cos(uv.x * 12.0 + uTime * 1.2));
  uv -= normalize(d + 1e-4) * vec2(1.0 / aspect, 1.0) * 0.022 * near;   // lens bulge under the cursor
  uv = (uv - 0.5) * (1.0 - uScroll * 0.14) + 0.5;                        // push in as you scroll away
  vec2 tuv = coverUv(uv, uRes, uTexSize);

  float ca = 0.0015 + uScroll * 0.012 + 0.006 * near;
  vec3 col = vec3(texture2D(uTex, tuv + vec2(ca, 0.0)).r, texture2D(uTex, tuv).g, texture2D(uTex, tuv - vec2(ca, 0.0)).b);

  // develop: blotchy threshold so it comes up unevenly, like a print in the tray
  float n = fbm(vUv * 3.0 + uTime * 0.04);
  float dev = smoothstep(n - 0.3, n + 0.05, uDevelop * 1.35 - 0.2);
  vec3 neg = (1.0 - col) * vec3(1.0, 0.6, 0.36) * 0.4;
  col = mix(neg, col, dev);
  col = mix(col, col * vec3(1.0, 0.22, 0.15), (1.0 - dev) * 0.55);      // safelight wash

  // light leaks: a drifting edge leak plus a bloom that trails the cursor
  float leak = fbm(vUv * 2.1 + vec2(uTime * 0.035, -uTime * 0.028));
  vec3 leakCol = mix(vec3(0.92, 0.2, 0.07), vec3(1.0, 0.68, 0.28), leak);
  float edge = smoothstep(0.55, 1.05, vUv.x + leak * 0.4) * 0.5;
  col += leakCol * (edge * leak + near * 0.6 * leak + uScroll * 0.45 * leak) * dev;

  col *= smoothstep(1.25, 0.3, length((vUv - 0.5) * vec2(1.15, 1.0)));  // vignette
  col += (hash(vUv * uRes + fract(uTime * 7.0) * 91.0) - 0.5) * 0.075;  // grain
  col *= 1.0 - smoothstep(0.5, 1.0, uScroll);
  gl_FragColor = vec4(col, 1.0);
}`;

export async function initDarkroomHero(canvas: HTMLCanvasElement, src: string) {
  const s = new Surface(canvas, HERO_FRAG);
  const size = await s.texture(src, "uTex");
  s.set("uTexSize", size);
  const state = { develop: 0, scroll: 0, mx: 0.5, my: 0.5, tx: 0.5, ty: 0.5, strength: 0 };
  let targetStrength = 0;

  window.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    state.tx = (e.clientX - r.left) / r.width;
    state.ty = 1 - (e.clientY - r.top) / r.height;
    targetStrength = 1;
  }, { passive: true });
  canvas.parentElement?.addEventListener("pointerleave", () => (targetStrength = 0));

  let visible = true;
  onVisibility(canvas, (v) => (visible = v));
  const t0 = performance.now();
  const frame = () => {
    requestAnimationFrame(frame);
    if (!visible) return;
    s.resize(dpr() * 0.75); // grain hides the lower res; saves fill-rate on 4K
    state.mx += (state.tx - state.mx) * 0.06;
    state.my += (state.ty - state.my) * 0.06;
    state.strength += (targetStrength - state.strength) * 0.04;
    s.set("uTime", (performance.now() - t0) / 1000);
    s.set("uMouse", [state.mx, state.my]);
    s.set("uMouseStrength", state.strength);
    s.set("uDevelop", state.develop);
    s.set("uScroll", state.scroll);
    s.draw();
  };
  frame();
  canvas.classList.add("is-live");

  return {
    develop: (duration = 3.2) => gsap.to(state, { develop: 1, duration, ease: "power2.inOut" }),
    setScroll: (v: number) => (state.scroll = v),
  };
}

const LEAK_FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uTexSize;
uniform float uTime, uHover;
varying vec2 vUv;
${GLSL_NOISE}
void main(){
  vec2 uv = (vUv - 0.5) * (1.0 - uHover * 0.06) + 0.5;
  float n = fbm(vUv * 3.0 + uTime * 0.3);
  uv.x += (n - 0.5) * 0.03 * uHover;
  vec2 tuv = coverUv(uv, uRes, uTexSize);
  float ca = 0.012 * uHover;
  vec3 col = vec3(texture2D(uTex, tuv + vec2(ca, 0.0)).r, texture2D(uTex, tuv).g, texture2D(uTex, tuv - vec2(ca, 0.0)).b);
  float sweep = smoothstep(uHover * 1.6 - 0.6, uHover * 1.6 - 0.1, vUv.x + n * 0.5);
  vec3 leak = mix(vec3(0.95, 0.22, 0.08), vec3(1.0, 0.72, 0.3), n);
  col += leak * (1.0 - sweep) * uHover * 0.55 * n;
  col = mix(col * vec3(1.0, 0.9, 0.85) * 0.92, col, uHover);             // rest state sits a touch muted
  col += (hash(vUv * uRes + fract(uTime) * 50.0) - 0.5) * 0.06;
  gl_FragColor = vec4(col, 1.0);
}`;

export async function initLeakImage(canvas: HTMLCanvasElement, src: string, host: HTMLElement) {
  const s = new Surface(canvas, LEAK_FRAG);
  const size = await s.texture(src, "uTex");
  s.set("uTexSize", size);
  const st = { hover: 0 };
  let running = false;
  const t0 = performance.now();
  const render = () => {
    s.resize(dpr());
    s.set("uTime", (performance.now() - t0) / 1000);
    s.set("uHover", st.hover);
    s.draw();
  };
  const loop = () => { if (!running) return; render(); requestAnimationFrame(loop); };
  // only animate while hovered or easing out; otherwise one still frame
  host.addEventListener("pointerenter", () => {
    if (!running) { running = true; loop(); }
    gsap.to(st, { hover: 1, duration: 0.9, ease: "power3.out", overwrite: true });
  });
  host.addEventListener("pointerleave", () => {
    gsap.to(st, { hover: 0, duration: 0.8, ease: "power3.out", overwrite: true, onComplete: () => { running = false; render(); } });
  });
  new ResizeObserver(() => { if (!running) render(); }).observe(canvas);
  render();
  canvas.classList.add("is-live");
}
