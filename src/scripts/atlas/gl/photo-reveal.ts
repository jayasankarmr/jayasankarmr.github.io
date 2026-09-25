// A stop's photograph arrives through a noise-driven dissolve: a warm burn runs along the front,
// the frame swims and splits into RGB before settling. Raw WebGL (src/scripts/gl/raw.ts): one
// surface, created and compiled while the browser is idle, moved into whichever pass needs it,
// and hidden again once the plain <img> takes back over.
import { Surface } from "../../gl/raw";

const NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }
// object-fit: cover, anchored at pos like CSS object-position (0..1, y up)
vec2 coverUv(vec2 uv, vec2 res, vec2 tex, vec2 pos){ float rs = res.x / res.y, rt = tex.x / tex.y;
  vec2 s = rs > rt ? vec2(1.0, rt / rs) : vec2(rs / rt, 1.0); return uv * s + (1.0 - s) * pos; }
`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uTexSize, uPos;
uniform float uP, uTime;
varying vec2 vUv;
${NOISE}
void main() {
  vec2 uv0 = vec2(vUv.x, vUv.y);
  float n = fbm(uv0 * 3.2 + vec2(0.0, uTime * 0.05)) * 0.75 + uv0.x * 0.25;
  float reveal = smoothstep(n - 0.02, n + 0.02, uP);
  float front = smoothstep(n - 0.12, n, uP) * (1.0 - smoothstep(n, n + 0.06, uP));
  float settle = 1.0 - clamp(uP, 0.0, 1.0);
  vec2 disp = (vec2(fbm(uv0 * 5.0), fbm(uv0 * 5.0 + 7.3)) - 0.5) * 0.09 * settle;
  vec2 uv = coverUv(uv0 + disp, uRes, uTexSize, uPos);
  float sh = 0.012 * settle;
  vec3 col = vec3(texture2D(uTex, uv + vec2(sh, 0.0)).r, texture2D(uTex, uv).g, texture2D(uTex, uv - vec2(sh, 0.0)).b);
  vec3 burn = vec3(1.0, 0.71, 0.33);
  gl_FragColor = vec4(mix(col, burn, front * 0.85) * max(reveal, front), max(reveal, front));
}`;

let shared: { canvas: HTMLCanvasElement; s: Surface } | null = null;

/** Create and compile the reveal surface ahead of time (call from an idle callback). */
export function warmPhotoReveal() {
  if (shared) return shared;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = canvas.height = 2;
  shared = { canvas, s: new Surface(canvas, FRAG) };
  shared.s.draw(); // forces the program to link now rather than on the first reveal
  return shared;
}

export async function revealPhoto(fig: HTMLElement, img: HTMLImageElement, duration = 1100) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // decode + downscale off the main thread to the size the pass actually shows, then upload that
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.min(img.naturalWidth, Math.round(fig.clientWidth * dpr));
  const bmp = await createImageBitmap(img, { resizeWidth: w, resizeHeight: Math.round((w * img.naturalHeight) / img.naturalWidth), resizeQuality: "high", imageOrientation: "flipY" });
  const { canvas, s } = warmPhotoReveal();
  fig.appendChild(canvas);
  canvas.style.display = "";
  s.textureFrom(bmp, "uTex");
  s.set("uTexSize", [bmp.width, bmp.height]);
  // crop where the <img> crops, so the hand-back at the end doesn't jump
  const [px = 50, py = 50] = getComputedStyle(img).objectPosition.split(" ").map((v) => (v.endsWith("%") ? parseFloat(v) : 50));
  s.set("uPos", [px / 100, 1 - py / 100]);
  bmp.close();
  img.style.opacity = "0";
  const start = performance.now();
  await new Promise<void>((done) => {
    const frame = () => {
      const t = (performance.now() - start) / duration;
      s.resize(dpr);
      s.set("uP", Math.min(1.15, t * 1.15));
      s.set("uTime", t * 4);
      s.draw();
      if (t < 1) requestAnimationFrame(frame);
      else done();
    };
    frame();
  });
  img.style.opacity = "";
  canvas.style.display = "none";
}
