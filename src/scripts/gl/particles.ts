// Blueprint hero: a name made of points. Sampled from text drawn to an offscreen
// canvas; each point has a home (in the letterform) and a scatter position (a 3D cloud).
// The cursor repels points; scroll blows the name back apart into the cloud.
import * as THREE from "three";
import { gsap } from "../motion/smooth";
import { dpr, onVisibility } from "../motion/env";

const VERT = /* glsl */ `
  attribute vec3 aHome;
  attribute vec3 aScatter;
  attribute float aRand;
  uniform float uTime, uScatter, uMouseStrength, uSize, uPixelRatio, uRadius;
  uniform vec2 uMouse;
  varying float vHot;
  varying float vAccent;
  void main() {
    // staggered per point so the name dissolves from its edges, not all at once
    float s = clamp(uScatter * 1.5 - aRand * 0.5, 0.0, 1.0);
    s = s * s * (3.0 - 2.0 * s);
    vec3 pos = mix(aHome, aScatter, s);
    pos.z += sin(uTime * 0.9 + aRand * 40.0) * 0.025;
    pos.xy += vec2(sin(uTime * 0.5 + aRand * 20.0), cos(uTime * 0.4 + aRand * 30.0)) * 0.012;

    vec2 d = pos.xy - uMouse;
    float f = smoothstep(uRadius, 0.0, length(d)) * uMouseStrength;
    pos.xy += normalize(d + 1e-4) * f * 0.55;
    pos.z += f * 0.9;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (1.0 + f * 1.2) * (12.0 / -mv.z);
    vHot = f;
    vAccent = step(0.975, aRand);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uInk, uAccent;
  varying float vHot;
  varying float vAccent;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    gl_FragColor = vec4(mix(uInk, uAccent, clamp(vAccent + vHot * 1.6, 0.0, 1.0)), 1.0);
  }
`;

function sampleText(lines: string[], family: string, targetCount: number) {
  const W = 2000;
  const lineH = 300;
  const H = lineH * lines.length + 40;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  // fit the widest line to the canvas
  // canvas font shorthand must be "<weight> <size> <family>" — anything else silently falls back to 10px sans
  const setFont = (px: number) => { ctx.font = `800 ${px}px ${family}`; (ctx as any).fontStretch = "expanded"; };
  let size = 320;
  setFont(size);
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  size = Math.min(size * ((W * 0.96) / widest), lineH * 1.05);
  setFont(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 20 + lineH * (i + 0.5)));
  const data = ctx.getImageData(0, 0, W, H).data;

  // pick a sampling step that lands near the target count
  let filled = 0;
  for (let i = 3; i < data.length; i += 16) if (data[i] > 128) filled++;
  const step = Math.max(2, Math.round(Math.sqrt((filled * 4) / targetCount)));
  const pts: number[] = [];
  for (let y = 0; y < H; y += step)
    for (let x = 0; x < W; x += step) {
      const jx = x + (Math.random() - 0.5) * step * 0.6;
      const jy = y + (Math.random() - 0.5) * step * 0.6;
      if (data[(Math.round(jy) * W + Math.round(jx)) * 4 + 3] > 128) pts.push(jx / W - 0.5, (H / 2 - jy) / W, 0); // both axes scaled by W keeps the aspect
    }
  return { pts, aspect: W / H, heightRatio: H / W };
}

export async function initParticleName(canvas: HTMLCanvasElement, opts: { ink: string; accent: string; font: string }) {
  await document.fonts.load(`800 100px ${opts.font}`).catch(() => {});
  const narrow = innerWidth < 768;
  const lines = narrow ? ["JAYA", "SANKAR"] : ["JAYASANKAR"];
  const { pts, heightRatio } = sampleText(lines, opts.font, narrow ? 6000 : 11000);
  const count = pts.length / 3;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 12);

  // world width the name spans (fits ~86% of the view width at z=0)
  const home = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const rand = new Float32Array(count);
  let span = 10;
  const layout = () => {
    const vh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const vw = vh * camera.aspect;
    span = Math.min(vw * (narrow ? 0.9 : 0.86), (vh * 0.62) / heightRatio);
    for (let i = 0; i < count; i++) {
      home[i * 3] = pts[i * 3] * span;
      home[i * 3 + 1] = pts[i * 3 + 1] * span + vh * (narrow ? 0.06 : 0.03);
      home[i * 3 + 2] = 0;
    }
    geo.attributes.aHome.needsUpdate = true;
    mat.uniforms.uRadius.value = span * 0.09;
  };
  for (let i = 0; i < count; i++) {
    // scatter into a wide, shallow ellipsoid cloud
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(2 * Math.random() - 1);
    const r = 4 + Math.cbrt(Math.random()) * 7;
    scatter[i * 3] = Math.sin(v) * Math.cos(u) * r * 1.6;
    scatter[i * 3 + 1] = Math.sin(v) * Math.sin(u) * r * 0.8;
    scatter[i * 3 + 2] = Math.cos(v) * r * 0.9 - 2;
    rand[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(home, 3));
  geo.setAttribute("aHome", new THREE.BufferAttribute(home, 3));
  geo.setAttribute("aScatter", new THREE.BufferAttribute(scatter, 3));
  geo.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uScatter: { value: 1 },
      uMouse: { value: new THREE.Vector2(99, 99) },
      uMouseStrength: { value: 0 },
      uRadius: { value: 1 },
      uSize: { value: narrow ? 1.9 : 2.4 },
      uPixelRatio: { value: dpr() },
      uInk: { value: new THREE.Color(opts.ink) },
      uAccent: { value: new THREE.Color(opts.accent) },
    },
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    layout();
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  // pointer → world coords on the z=0 plane
  const target = new THREE.Vector2(99, 99);
  const ndc = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let strength = 0;
  window.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(camera);
    dir.copy(ndc).sub(camera.position).normalize();
    const t = -camera.position.z / dir.z;
    target.set(camera.position.x + dir.x * t, camera.position.y + dir.y * t);
    strength = 1;
  }, { passive: true });
  document.addEventListener("pointerleave", () => (strength = 0));

  const state = { intro: 1, scroll: 0 };
  let visible = true;
  onVisibility(canvas, (v) => (visible = v));
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const u = mat.uniforms;
    u.uTime.value = clock.getElapsedTime();
    u.uMouse.value.lerp(target, 0.12);
    u.uMouseStrength.value += (strength - u.uMouseStrength.value) * 0.06;
    u.uScatter.value = Math.max(state.intro, state.scroll);
    points.rotation.y = state.scroll * 0.5 + Math.sin(u.uTime.value * 0.2) * 0.02;
    points.rotation.x = state.scroll * -0.2;
    renderer.render(scene, camera);
  });
  canvas.classList.add("is-live");

  return {
    assemble: (duration = 2.6) => gsap.to(state, { intro: 0, duration, ease: "expo.out" }),
    setScroll: (p: number) => (state.scroll = p),
  };
}
