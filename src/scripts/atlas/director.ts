// SceneDirector: the single owner of camera state. Everything that moves the camera — the
// choreography (scroll, intro, focus), drag with inertia, the keyboard, the idle spin — feeds
// into it, and it composes one pose per frame, renders from the shared GSAP ticker, and hands
// projected stop positions to the DOM layers (labels, readouts).
import { Raycaster, Vector2, Vector3 } from "three";
import { gsap } from "../motion/smooth";
import { Stage } from "./gl/stage";
import { World } from "./gl/world";
import { Lod } from "./gl/lod";
import { applyPose, fitDist, lngDelta, type Pose } from "./camera";
import { bearing, subsolar, toVec, DEG } from "./geo";
import { springStep, springs } from "./motion";
import type { TierConfig } from "./tier";

export type AtlasPlace = { lat: number; lng: number; name: string; recurring?: boolean; home?: boolean; leg?: boolean };
export type Projected = { x: number; y: number; facing: number };
type FrameFn = (d: Director) => void;

const HERO_TARGET = { lat: 14, lng: 104 };

export class Director {
  readonly stage: Stage;
  readonly world: World;
  readonly lod: Lod;
  /** the choreographed pose (what scroll / intro / focus asks for) */
  readonly base: Pose;
  /** the composed pose actually rendered this frame */
  readonly pose: Pose;
  readonly projected: Projected[];
  mode: "hero" | "stop" = "hero";
  reducedMotion: boolean;
  private drag = { lat: 0, lng: 0, vLat: 0, vLng: 0, sLat: { x: 0, v: 0 }, sLng: { x: 0, v: 0 }, active: false, x: 0, y: 0, t: 0, returning: false };
  private cursor = { x: 0, y: 0, over: false, amt: 0, hit: new Vector3() };
  private ray = new Raycaster();
  private ndc = new Vector2();
  private listeners = new Set<FrameFn>();
  private offstage = false;
  private scrollVel = 0;
  private time = 0;
  private sunAt = 0;
  private flight?: gsap.core.Timeline;
  private tmp = new Vector3();
  private spinRate = 2.2; // degrees per second, westward like the real Earth seen from space
  private wave = { at: -1, x: 0, y: 0, z: 0 };

  constructor(readonly canvas: HTMLCanvasElement, readonly places: AtlasPlace[], readonly tier: TierConfig) {
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.stage = new Stage(canvas, tier);
    this.world = new World(this.stage, tier, places);
    this.lod = new Lod(this.world, tier);
    this.base = { lat: HERO_TARGET.lat, lng: HERO_TARGET.lng, dist: 3.4, tilt: 0, heading: 0, sx: 0.4, sy: 0 };
    this.pose = { ...this.base };
    this.projected = places.map(() => ({ x: -9999, y: -9999, facing: -1 }));
    this.stage.whenResized(() => {
      this.world.syncViewport();
      if (this.mode === "hero") Object.assign(this.base, this.heroFrame());
    });
    this.bindInput();
  }

  async init() {
    await this.world.build();
    await this.lod.build(this.stage.scene);
    this.world.syncViewport();
    Object.assign(this.base, this.heroFrame());
    this.updateSun();
    gsap.ticker.add(this.tick);
    this.canvas.classList.add("is-live");
    addEventListener("pagehide", () => (this.offstage = true));
    addEventListener("pageshow", (e) => { if (e.persisted) this.offstage = false; });
  }

  /** Framing for the hero: globe beside the text on wide screens, above it on narrow ones. */
  heroFrame(): Pick<Pose, "dist" | "sx" | "sy"> {
    const { width: w, height: h } = this.stage;
    if (w >= 900 && w >= h * 0.9) {
      const r = Math.min(h * 0.45, w * 0.36);
      return { dist: fitDist(r, h), sx: 0.42, sy: -0.04 };
    }
    const r = Math.min(w * 0.47, h * 0.3);
    return { dist: fitDist(r, h), sx: 0, sy: 0.42 };
  }

  /** Where a focused stop sits: right of the card column, or in the top half on narrow screens. */
  stopFrame(): Pick<Pose, "sx" | "sy"> {
    const { width: w, height: h } = this.stage;
    return w >= 900 && w >= h * 0.9 ? { sx: 0.34, sy: 0 } : { sx: 0, sy: 0.4 };
  }

  onFrame(fn: FrameFn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setOffstage(v: boolean) {
    this.offstage = v;
  }

  /** Lenis scroll velocity (px per frame): streaks the stars, and pulls a dragged globe home. */
  setScrollVelocity(v: number) {
    this.scrollVel = v;
    if (Math.abs(v) > 0.8) this.drag.returning = true;
  }

  // ---- choreography (Phase 3: time-based flights; Phase 4 drives `base` from scroll) ----

  hero() {
    this.mode = "hero";
    this.flight?.kill();
    const f = this.heroFrame();
    const to = { lat: HERO_TARGET.lat, lng: this.base.lng + lngDelta(this.base.lng, HERO_TARGET.lng), tilt: 0, heading: 0, ...f };
    if (this.reducedMotion) return void Object.assign(this.base, to);
    this.flight = gsap.timeline().to(this.base, { ...to, duration: 1.8, ease: "atlas.camera" });
  }

  focus(i: number) {
    const p = this.places[i];
    if (!p) return this.hero();
    this.mode = "stop";
    this.flight?.kill();
    this.drag.returning = true;
    const prev = this.places[i - 1];
    // cinematic heading: look along the leg that brought us here, eased halfway back to north
    const heading = prev ? bearing(prev.lat, prev.lng, p.lat, p.lng) * 0.5 : 0;
    const f = this.stopFrame();
    const to = { lat: p.lat, lng: this.base.lng + lngDelta(this.base.lng, p.lng), tilt: 0.55, heading, dist: 0.42, ...f };
    if (this.reducedMotion) return void Object.assign(this.base, to);
    // hop: lift to a cruise height that grows with the distance, then settle
    const span = Math.hypot(to.lat - this.base.lat, lngDelta(this.base.lng, p.lng)) * DEG;
    const cruise = Math.max(to.dist, Math.min(2.6, 0.5 + span * 2.2));
    this.flight = gsap.timeline({ onComplete: () => this.land(p.lat, p.lng) })
      .to(this.base, { lat: to.lat, lng: to.lng, heading: to.heading, sx: to.sx, sy: to.sy, duration: 1.8, ease: "atlas.camera" }, 0)
      .to(this.base, { dist: cruise, tilt: 0.12, duration: 0.8, ease: "power2.out" }, 0)
      .to(this.base, { dist: to.dist, tilt: to.tilt, duration: 1.1, ease: "atlas.camera" }, 0.7);
  }

  /** Touchdown: a shockwave ring runs out through the fine dots from the landing point. */
  land(lat: number, lng: number) {
    if (this.reducedMotion) return;
    const v = toVec(lat, lng);
    this.wave = { at: this.time, x: v[0], y: v[1], z: v[2] };
  }

  // ---- input: drag (mouse), keyboard orbit, cursor ripple ----

  private bindInput() {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const d = this.drag;
      d.active = true;
      d.returning = false;
      d.x = e.clientX; d.y = e.clientY; d.t = performance.now();
      d.vLat = d.vLng = 0;
      c.setPointerCapture(e.pointerId);
      document.documentElement.classList.add("is-dragging-globe");
    });
    c.addEventListener("pointermove", (e) => {
      const d = this.drag;
      if (!d.active) return;
      const now = performance.now();
      const k = this.degPerPx();
      const dLng = -(e.clientX - d.x) * k / Math.max(0.3, Math.cos((this.pose.lat * Math.PI) / 180));
      const dLat = (e.clientY - d.y) * k;
      d.sLng.x += dLng;
      d.sLat.x = Math.max(-60 - this.base.lat, Math.min(60 - this.base.lat, d.sLat.x + dLat));
      const dt = Math.max(1, now - d.t) / 1000;
      d.vLng = d.vLng * 0.6 + (dLng / dt) * 0.4;
      d.vLat = d.vLat * 0.6 + (dLat / dt) * 0.4;
      d.x = e.clientX; d.y = e.clientY; d.t = now;
    });
    const end = () => {
      this.drag.active = false;
      document.documentElement.classList.remove("is-dragging-globe");
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    addEventListener("pointermove", (e) => {
      this.cursor.x = e.clientX;
      this.cursor.y = e.clientY;
      this.cursor.over = e.pointerType === "mouse";
    }, { passive: true });
    document.addEventListener("pointerleave", () => (this.cursor.over = false));
  }

  /** Keyboard orbit (arrow keys on the focusable globe control); Home recentres. */
  nudge(dLat: number, dLng: number) {
    this.drag.returning = false;
    this.drag.vLat += dLat * 3;
    this.drag.vLng += dLng * 3;
  }

  recentre() {
    this.drag.returning = true;
  }

  /** Degrees of arc per CSS pixel at the target, so a drag tracks the pointer. */
  private degPerPx() {
    const h = this.stage.height;
    const worldPerPx = (2 * Math.min(this.pose.dist, 3.5) * Math.tan((15 * Math.PI) / 180)) / h;
    return (worldPerPx * 180) / Math.PI;
  }

  /** Surface point under the cursor (unit vector), or null. */
  hitAt(clientX: number, clientY: number, out = this.cursor.hit): Vector3 | null {
    const { width: w, height: h } = this.stage;
    this.ndc.set((clientX / w) * 2 - 1, -(clientY / h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.stage.camera);
    const o = this.ray.ray.origin, dir = this.ray.ray.direction;
    const b = o.dot(dir), c = o.lengthSq() - 1, disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    return out.copy(dir).multiplyScalar(t).add(o).normalize();
  }

  private updateSun() {
    const q = new URLSearchParams(location.search).get("sun");
    const s = subsolar(q ? new Date(q) : new Date());
    this.world.u.uSun.value.fromArray(toVec(s.lat, s.lng));
    this.sunAt = this.time;
  }

  // ---- the frame ----

  private tick = (_time: number, deltaMs: number) => {
    if (this.offstage) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.time += dt;
    this.stage.sampleFrame(deltaMs);
    const rich = !this.reducedMotion;

    if (this.mode === "hero" && rich && !this.drag.active) this.base.lng -= this.spinRate * dt;
    if (this.time - this.sunAt > 30) this.updateSun();

    // drag: inertia while free, a damped spring home once the page scrolls again
    const d = this.drag;
    if (!d.active) {
      if (d.returning) {
        springStep(d.sLat, 0, dt, springs.return);
        springStep(d.sLng, 0, dt, springs.return);
        d.vLat = d.vLng = 0;
        if (Math.abs(d.sLat.x) + Math.abs(d.sLng.x) < 0.01 && Math.abs(d.sLat.v) + Math.abs(d.sLng.v) < 0.01) d.returning = false;
      } else {
        const f = Math.exp(-3.5 * dt);
        d.sLat.x = Math.max(-60 - this.base.lat, Math.min(60 - this.base.lat, d.sLat.x + d.vLat * dt));
        d.sLng.x += d.vLng * dt;
        d.vLat *= f;
        d.vLng *= f;
      }
    }

    const p = this.pose;
    Object.assign(p, this.base);
    p.lat += d.sLat.x;
    p.lng += d.sLng.x;
    const { width: w, height: h } = this.stage;
    applyPose(this.stage.camera, p, w, h);

    const u = this.world.u;
    u.uTime.value = rich ? this.time : 0;
    // cursor ripple: only over the globe, only where the tier allows it
    const hit = this.cursor.over && this.tier.ripple && rich ? this.hitAt(this.cursor.x, this.cursor.y) : null;
    if (hit) u.uCursor.value.lerp(hit, d.active ? 1 : 0.35).normalize();
    this.cursor.amt += ((hit ? 1 : 0) - this.cursor.amt) * (1 - Math.exp(-6 * dt));
    u.uCursorAmt.value = this.cursor.amt;
    this.world.setStreak(0, rich ? Math.max(-40, Math.min(40, this.scrollVel * 0.9)) : 0);

    // close-ups: the clipmap takes over from the global dots around the target
    this.lod.update(p.lat, p.lng, p.dist);
    const t = toVec(p.lat, p.lng);
    u.uLodCenter.value.set(t[0], t[1], t[2], this.lod.radius);
    u.uLod.value = this.lod.coverage;
    const age = this.wave.at < 0 ? -1 : this.time - this.wave.at;
    this.lod.setWave(this.wave.x, this.wave.y, this.wave.z, age > 4 ? -1 : age);

    this.stage.render();
    this.project();
    this.listeners.forEach((fn) => fn(this));
  };

  /** Screen position of every stop (CSS px) and how squarely it faces the camera. */
  private project() {
    const cam = this.stage.camera;
    const { width: w, height: h } = this.stage;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    this.places.forEach((pl, i) => {
      const v = toVec(pl.lat, pl.lng, 1.0015);
      const n = toVec(pl.lat, pl.lng);
      const dx = cx - v[0], dy = cy - v[1], dz = cz - v[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      const facing = (n[0] * dx + n[1] * dy + n[2] * dz) / len;
      this.tmp.set(v[0], v[1], v[2]).project(cam);
      const o = this.projected[i];
      o.x = (this.tmp.x * 0.5 + 0.5) * w;
      o.y = (-this.tmp.y * 0.5 + 0.5) * h;
      o.facing = this.tmp.z > 1 ? -1 : facing;
    });
  }

  /** Marker states for the shader: which stop is active, and how far the route has reached. */
  setStops(active: number, reached: number) {
    this.world.marker.uActive.value = active;
    this.world.marker.uReached.value = reached;
  }

  dispose() {
    gsap.ticker.remove(this.tick);
    this.flight?.kill();
    this.stage.dispose();
  }
}
