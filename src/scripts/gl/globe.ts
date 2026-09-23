// Atlas globe: dotted landmass (src/data/land-dots.json), atmosphere, place markers,
// and great-circle-ish arcs that draw between stops. focus(i) flies the globe to a place.
import * as THREE from "three";
import landDots from "../../data/land-dots.json";
import { gsap } from "../motion/smooth";
import { dpr, onVisibility } from "../motion/env";

export type GlobePlace = { lat: number; lng: number; leg?: boolean };

const DEG = Math.PI / 180;
export function latLngToVec(lat: number, lng: number, r = 1) {
  const phi = (90 - lat) * DEG;
  const theta = (lng + 180) * DEG;
  return new THREE.Vector3(-Math.sin(phi) * Math.cos(theta) * r, Math.cos(phi) * r, Math.sin(phi) * Math.sin(theta) * r);
}
/** Euler (XYZ) that brings a surface point to face the camera (+z). */
function faceRotation(lat: number, lng: number) {
  const p = latLngToVec(lat, lng);
  const ry = Math.atan2(-p.x, p.z);
  const rx = Math.atan2(p.y, Math.hypot(p.x, p.z));
  return { rx, ry };
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const DOT_VERT = /* glsl */ `
  uniform float uSize, uPixelRatio;
  varying float vFacing;
  varying float vLat;
  void main() {
    vLat = position.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normalize(position));
    vFacing = dot(n, normalize(-mv.xyz));
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (3.0 / -mv.z);
  }`;
const DOT_FRAG = /* glsl */ `
  uniform vec3 uColor, uColor2;
  varying float vFacing;
  varying float vLat;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    float a = smoothstep(0.0, 0.55, vFacing);           // dots thin out toward the limb
    // land shades pole-to-pole between the two land colours (same colour = flat)
    vec3 col = mix(uColor2, uColor, smoothstep(-0.7, 0.8, vLat));
    gl_FragColor = vec4(col, a * 0.9);
  }`;
const ATMO_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const ATMO_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uPower, uAlpha; uniform bool uInner;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = uInner ? pow(1.0 - max(dot(vN, vV), 0.0), uPower) : pow(max(dot(-vN, vV), 0.0), uPower);
    gl_FragColor = vec4(uColor, f * uAlpha);
  }`;
const MARK_VERT = /* glsl */ `
  attribute float aActive; attribute float aIndex;
  uniform float uTime, uPixelRatio;
  varying float vActive; varying float vPulse; varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFacing = dot(normalize(normalMatrix * normalize(position)), normalize(-mv.xyz));
    vActive = aActive;
    vPulse = fract(uTime * 0.6 + aIndex * 0.37);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (18.0 + aActive * 26.0) * uPixelRatio * (3.0 / -mv.z);
  }`;
const MARK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vActive; varying float vPulse; varying float vFacing;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(0.32, 0.22, d);
    float ring = smoothstep(0.08, 0.0, abs(d - vPulse)) * (1.0 - vPulse) * (0.4 + vActive);
    float a = max(core, ring) * smoothstep(-0.05, 0.25, vFacing);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

export async function initGlobe(canvas: HTMLCanvasElement, places: GlobePlace[], colors: { land: string; accent: string; atmo: string; base: string; land2?: string; stars?: string; glow?: number }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr());
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  camera.position.set(0, 0, 4.4);

  const world = new THREE.Group(); // positioned (layout offset)
  const globe = new THREE.Group(); // rotated (focus)
  world.add(globe);
  scene.add(world);

  // base sphere hides back-facing dots and gives the planet a body
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(0.992, 96, 96), new THREE.MeshBasicMaterial({ color: colors.base })));
  // inner rim light + outer halo
  const atmoMat = (inner: boolean, power: number, alpha: number) => new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: inner ? THREE.FrontSide : THREE.BackSide,
    uniforms: { uColor: { value: new THREE.Color(colors.atmo) }, uPower: { value: power }, uAlpha: { value: alpha }, uInner: { value: inner } },
  });
  const glow = colors.glow ?? 1;
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.0, 96, 96), atmoMat(true, 3.0, 0.55 * glow)));
  world.add(new THREE.Mesh(new THREE.SphereGeometry(1.18, 96, 96), atmoMat(false, 5.0, 0.7 * glow)));

  // land dots
  const n = landDots.length / 2;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) latLngToVec(landDots[i * 2] / 10, landDots[i * 2 + 1] / 10, 1.001).toArray(pos, i * 3);
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dotMat = new THREE.ShaderMaterial({
    vertexShader: DOT_VERT, fragmentShader: DOT_FRAG, transparent: true, depthWrite: false,
    uniforms: { uSize: { value: 5.2 }, uPixelRatio: { value: dpr() }, uColor: { value: new THREE.Color(colors.land) }, uColor2: { value: new THREE.Color(colors.land2 ?? colors.land) } },
  });
  globe.add(new THREE.Points(dotGeo, dotMat));

  // markers
  const mPos = new Float32Array(places.length * 3);
  const mActive = new Float32Array(places.length);
  const mIndex = new Float32Array(places.map((_, i) => i));
  places.forEach((p, i) => latLngToVec(p.lat, p.lng, 1.004).toArray(mPos, i * 3));
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute("position", new THREE.BufferAttribute(mPos, 3));
  mGeo.setAttribute("aActive", new THREE.BufferAttribute(mActive, 1));
  mGeo.setAttribute("aIndex", new THREE.BufferAttribute(mIndex, 1));
  const mMat = new THREE.ShaderMaterial({
    vertexShader: MARK_VERT, fragmentShader: MARK_FRAG, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: dpr() }, uColor: { value: new THREE.Color(colors.accent) } },
  });
  const markers = new THREE.Points(mGeo, mMat);
  markers.renderOrder = 2;
  globe.add(markers);

  // arcs between consecutive stops, lifted in proportion to their length. Ground legs
  // (place.leg, e.g. Phuket → Pattaya → Bangkok) hug the surface as thin lines and belong
  // to the same trip as the arc before them.
  let trip = 0;
  const arcs = places.slice(1).map((p, i) => {
    const a = latLngToVec(places[i].lat, places[i].lng, 1.002);
    const b = latLngToVec(p.lat, p.lng, 1.002);
    const d = a.distanceTo(b);
    const local = !!p.leg;
    if (!local) trip++;
    const lift = 1.002 + d * (local ? 0.08 : 0.55);
    const mid = a.clone().add(b).normalize().multiplyScalar(lift);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.TubeGeometry(curve, local ? 24 : 64, local ? 0.0022 : 0.0035, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: colors.accent, transparent: true, opacity: 0.95, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    const total = geo.index!.count;
    geo.setDrawRange(0, 0);
    globe.add(mesh);
    return { geo, mat, total, trip, progress: 0 };
  });
  // trip each stop was reached on (stop 0 is home, trip 0)
  const tripAt = (i: number) => (i <= 0 ? 0 : arcs[i - 1].trip);
  // the latest trips stay bright; older ones recede so the route doesn't turn into a tangle
  const ageOpacity = (age: number) => (age <= 0 ? 0.95 : age === 1 ? 0.55 : age === 2 ? 0.3 : 0.14);

  // faint star field
  const starN = 900;
  const sPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 40);
    v.toArray(sPos, i * 3);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  scene.add(new THREE.Points(sGeo, new THREE.PointsMaterial({ color: colors.stars ?? colors.land, size: 0.09, transparent: true, opacity: 0.45, depthWrite: false })));

  // ---- state + interaction ----
  const home = faceRotation(places[0].lat, places[0].lng);
  const state = { rx: home.rx * 0.6, ry: home.ry - 1.2, zoom: 1, x: 0, y: 0, spin: 1, dragX: 0, dragY: 0 };
  let active = -1;

  let dragging = false, lastX = 0, lastY = 0, vx = 0, vy = 0;
  canvas.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") return; dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    vx = (e.clientX - lastX) * 0.005; vy = (e.clientY - lastY) * 0.005;
    lastX = e.clientX; lastY = e.clientY;
    state.dragX += vx; state.dragY = Math.max(-0.8, Math.min(0.8, state.dragY + vy));
  });
  const endDrag = () => (dragging = false);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // on tall/narrow screens pull the camera back so the globe fits the width
  let baseDist = 4.4;
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    baseDist = Math.max(4.4, 1.05 / (Math.tan(15 * DEG) * camera.aspect));
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  // screen-space projection of each marker, for HTML labels
  const tmp = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const project = () => places.map((_, i) => {
    tmp.fromArray(mPos, i * 3);
    nrm.copy(tmp).normalize().applyQuaternion(globe.getWorldQuaternion(new THREE.Quaternion()));
    tmp.applyMatrix4(globe.matrixWorld);
    camDir.copy(camera.position).sub(tmp).normalize();
    const facing = nrm.dot(camDir);
    tmp.project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmp.y * 0.5 + 0.5) * canvas.clientHeight, facing };
  });

  let onFrame: ((pts: ReturnType<typeof project>) => void) | undefined;
  let visible = true;
  // a fixed canvas is always "intersecting", so the page also pauses the loop explicitly
  let paused = false;
  onVisibility(canvas, (v) => (visible = v));
  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop((now) => {
    if (!visible || paused) return;
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();
    mMat.uniforms.uTime.value = t;
    if (!dragging) { state.dragX += vx; vx *= 0.94; vy *= 0.94; state.dragY *= 0.97; }
    state.ry += dt * 0.06 * state.spin;
    globe.rotation.set(state.rx + state.dragY, state.ry + state.dragX, 0, "XYZ");
    world.position.set(state.x, state.y, 0);
    camera.position.z = baseDist / state.zoom;
    arcs.forEach((a) => a.geo.setDrawRange(0, Math.floor((a.total * a.progress) / 3) * 3));
    renderer.render(scene, camera);
    onFrame?.(project());
  });
  canvas.classList.add("is-live");

  return {
    onFrame: (fn: typeof onFrame) => (onFrame = fn),
    /** Fly to stop i (−1 = free spin). Arcs up to i are drawn, later ones retract. */
    focus(i: number, zoom = 1.3) {
      if (i === active) return;
      active = i;
      for (let k = 0; k < places.length; k++) mActive[k] = k === i ? 1 : 0;
      mGeo.attributes.aActive.needsUpdate = true;
      const now = tripAt(i);
      arcs.forEach((a, k) => {
        gsap.to(a, { progress: k < i ? 1 : 0, duration: k === i - 1 ? 1.6 : 0.8, ease: "power2.inOut", overwrite: true });
        gsap.to(a.mat, { opacity: ageOpacity(now - a.trip), duration: 1.2, ease: "power2.out", overwrite: true });
      });
      if (i < 0) {
        gsap.to(state, { spin: 1, zoom: 1, rx: home.rx * 0.6, duration: 1.6, ease: "power3.inOut", overwrite: "auto" });
        return;
      }
      const f = faceRotation(places[i].lat, places[i].lng);
      // fold any drag + accumulated spin into ry, then take the short way round
      state.ry += state.dragX; state.dragX = 0; vx = 0;
      state.rx += state.dragY; state.dragY = 0;
      const ry = state.ry + wrap(f.ry - state.ry);
      gsap.to(state, { rx: f.rx, ry, zoom, spin: 0, duration: 1.8, ease: "power3.inOut", overwrite: "auto" });
    },
    layout(x: number, y: number) { gsap.to(state, { x, y, duration: 1.2, ease: "power3.inOut" }); },
    /** Stops drawing while the globe is off-stage (behind the logbook and below). */
    setPaused(p: boolean) { paused = p; },
    setLayoutNow(x: number, y: number) { state.x = x; state.y = y; },
  };
}
