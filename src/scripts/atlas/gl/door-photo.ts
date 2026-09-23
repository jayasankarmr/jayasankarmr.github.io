// The Photography doorway's hover: the photo turns liquid around the pointer — a noise flow that
// swells where the cursor is, a slight RGB split — while the frame drifts in a slow Ken Burns.
// Raw WebGL, created on the first hover; it only draws while the hover lasts or is fading.
import { Surface } from "../../gl/raw";

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes, uTexSize, uMouse;
uniform float uHover, uTime, uZoom;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y); }
vec2 coverUv(vec2 uv, vec2 res, vec2 tex){ float rs = res.x / res.y, rt = tex.x / tex.y;
  vec2 s = rs > rt ? vec2(1.0, rt / rs) : vec2(rs / rt, 1.0); return (uv - 0.5) * s + 0.5; }
void main() {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float d = distance(vUv * asp, uMouse * asp);
  float swell = exp(-d * 5.0) * uHover;
  vec2 flow = vec2(noise(vUv * 5.0 + uTime * 0.35), noise(vUv * 5.0 - uTime * 0.3 + 7.1)) - 0.5;
  vec2 uv = (vUv - 0.5) / uZoom + 0.5 + flow * 0.05 * swell - (vUv - uMouse) * 0.05 * swell;
  vec2 t = coverUv(uv, uRes, uTexSize);
  float sh = 0.0022 * uHover + 0.007 * swell;
  vec3 col = vec3(texture2D(uTex, t + vec2(sh, 0.0)).r, texture2D(uTex, t).g, texture2D(uTex, t - vec2(sh, 0.0)).b);
  col *= mix(0.55, 0.68, uHover);
  gl_FragColor = vec4(col, 1.0);
}`;

export async function initDoorPhoto(media: HTMLElement) {
  const img = media.querySelector("img")!;
  await img.decode().catch(() => {});
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  media.appendChild(canvas);
  const s = new Surface(canvas, FRAG);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.min(img.naturalWidth, Math.round(media.clientWidth * dpr));
  const bmp = await createImageBitmap(img, { resizeWidth: w, resizeHeight: Math.round((w * img.naturalHeight) / img.naturalWidth), resizeQuality: "high", imageOrientation: "flipY" });
  s.textureFrom(bmp, "uTex");
  s.set("uTexSize", [bmp.width, bmp.height]);
  bmp.close();
  const door = media.closest("a")!;
  const st = { hover: 0, target: 0, mx: 0.5, my: 0.5, tx: 0.5, ty: 0.5, zoom: 1.02, t0: performance.now(), running: false };
  const loop = () => {
    st.hover += (st.target - st.hover) * 0.08;
    st.mx += (st.tx - st.mx) * 0.12;
    st.my += (st.ty - st.my) * 0.12;
    if (st.target > 0) st.zoom = Math.min(1.1, st.zoom + 0.00012);
    s.resize(dpr);
    s.set("uHover", st.hover);
    s.set("uMouse", [st.mx, st.my]);
    s.set("uZoom", st.zoom);
    s.set("uTime", (performance.now() - st.t0) / 1000);
    s.draw();
    if (st.target > 0 || st.hover > 0.005) requestAnimationFrame(loop);
    else { st.running = false; media.classList.remove("is-gl"); st.zoom = 1.02; }
  };
  const enter = () => {
    st.target = 1;
    media.classList.add("is-gl");
    if (!st.running) { st.running = true; requestAnimationFrame(loop); }
  };
  door.addEventListener("pointerenter", enter);
  door.addEventListener("pointerleave", () => (st.target = 0));
  door.addEventListener("pointermove", (e) => {
    const r = media.getBoundingClientRect();
    st.tx = (e.clientX - r.left) / r.width;
    st.ty = 1 - (e.clientY - r.top) / r.height;
  });
  if (door.matches(":hover")) enter();
}
