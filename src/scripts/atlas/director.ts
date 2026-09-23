// SceneDirector: the single owner of camera state. Everything that moves the camera — scroll
// (the hero dive and the journey), the intro, drag with inertia, the keyboard, the idle spin —
// feeds into it; it composes one pose per frame, renders from the shared GSAP ticker, drives
// the routes, and hands projected stop positions and stop events to the DOM layers.
import { Raycaster, Vector2, Vector3 } from "three";
import { gsap } from "../motion/smooth";
import { Stage } from "./gl/stage";
import { World } from "./gl/world";
import { Lod } from "./gl/lod";
import { Routes } from "./gl/routes";
import { applyPose, fitDist, type Pose } from "./camera";
import { subsolar, toVec } from "./geo";
import { buildLegs, type Leg } from "./journey";
import { journeyPose, landPose, mixPose, routeState, stopHeading, type Frame, type Where } from "./choreo";
import { ease, springStep, springs } from "./motion";
import type { TierConfig } from "./tier";

export type AtlasPlace = { lat: number; lng: number; name: string; recurring?: boolean; home?: boolean; leg?: boolean };
export type Projected = { x: number; y: number; facing: number };
export type ScrollState = { heroOut: number; where: Where; inJourney: boolean };
type Rect = { x: number; y: number; w: number; h: number };
type FrameFn = (d: Director, dt: number) => void;

const HERO_TARGET = { lat: 14, lng: 104 };

export class Director {
  readonly stage: Stage;
  readonly world: World;
  readonly lod: Lod;
  readonly routes: Routes;
  readonly legs: Leg[];
  /** the choreographed pose (what scroll / intro / focus asks for) */
  readonly base: Pose;
  /** the composed pose actually rendered this frame */
  readonly pose: Pose;
  readonly projected: Projected[];
  mode: "hero" | "dive" | "journey" | "stop" = "hero";
  reducedMotion: boolean;
  /** scroll → pose (off in the reduced-motion list layout, which cuts with focus()) */
  scrollSource: (() => ScrollState) | null = null;
  /** the stop the page is showing (−1 in the hero) and how far the route has reached */
  active = -1;
  reached = -1;
  /** 0–1 along the leg being flown (0 while landed) */
  comet = 0;
  flying = -1;
  private safeArea: Rect | null = null;
  private drag = { vLat: 0, vLng: 0, sLat: { x: 0, v: 0 }, sLng: { x: 0, v: 0 }, active: false, x: 0, y: 0, t: 0, returning: false };
  private cursor = { x: 0, y: 0, over: false, amt: 0, hit: new Vector3() };
  private ray = new Raycaster();
  private ndc = new Vector2();
  private listeners = new Set<FrameFn>();
  private stopListeners = new Set<(i: number, dir: number) => void>();
  private offstage = false;
  private scrollVel = 0;
  private time = 0;
  private sunAt = 0;

  private tmp = new Vector3();
  private heroPose: Pose;
  private land0: Pose;
  private spinRate = 2.2; // degrees per second, westward like the real Earth seen from space
  private wave = { at: -1, x: 0, y: 0, z: 0 };
  private prevWhere: Where | null = null;

  constructor(readonly canvas: HTMLCanvasElement, readonly places: AtlasPlace[], readonly tier: TierConfig) {
    this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.legs = buildLegs(places);
    this.stage = new Stage(canvas, tier);
    this.world = new World(this.stage, tier, places);
    this.lod = new Lod(this.world, tier);
    this.routes = new Routes(this.world, this.legs, places);
    this.base = { lat: HERO_TARGET.lat, lng: HERO_TARGET.lng, dist: 3.4, tilt: 0, heading: 0, sx: 0.4, sy: 0 };
    this.pose = { ...this.base };
    this.heroPose = { ...this.base };
    this.land0 = { ...this.base };
    this.projected = places.map(() => ({ x: -9999, y: -9999, facing: -1 }));
    this.stage.whenResized(() => {
      this.world.syncViewport();
      Object.assign(this.heroPose, this.heroFrame());
      if (this.mode === "hero") Object.assign(this.base, this.heroFrame());
    });
    this.bindInput();
  }

  async init() {
    await this.world.build();
    await this.lod.build(this.stage.scene);
    this.routes.build(this.stage.scene);
    this.world.syncViewport();
    Object.assign(this.base, this.heroFrame());
    Object.assign(this.heroPose, this.base);
    this.updateSun();
    gsap.ticker.add(this.tick);
    this.canvas.classList.add("is-live");
    addEventListener("pagehide", () => (this.offstage = true));
    addEventListener("pageshow", (e) => { if (e.persisted) this.offstage = false; });
  }

  get wide() {
    const { width: w, height: h } = this.stage;
    return w >= 900 && w >= h * 0.9;
  }

  /** Framing for the hero: globe beside the text on wide screens, above it on narrow ones. */
  heroFrame(): Pick<Pose, "dist" | "sx" | "sy"> {
    const { width: w, height: h } = this.stage;
    if (this.wide) {
      const r = Math.min(h * 0.45, w * 0.36);
      return { dist: fitDist(r, h), sx: 0.42, sy: -0.04 };
    }
    const r = Math.min(w * 0.47, h * 0.3);
    return { dist: fitDist(r, h), sx: 0, sy: 0.42 };
  }

  /** The screen area the journey's target should sit in (clear of the card, rail and nav). */
  setSafeArea(r: Rect | null) {
    this.safeArea = r;
  }

  journeyFrame(): Frame {
    const { width: w, height: h } = this.stage;
    const wide = this.wide;
    const sa = this.safeArea ?? (wide ? { x: w * 0.42, y: 72, w: w * 0.58, h: h - 72 } : { x: 0, y: 64, w, h: h * 0.48 });
    const cx = sa.x + sa.w / 2, cy = sa.y + sa.h / 2;
    return {
      sx: (cx - w / 2) / (w / 2),
      sy: -(cy - h / 2) / (h / 2),
      land: wide ? 0.085 : 0.12,
      tilt: wide ? 0.92 : 0.8,
      cruiseTilt: 0.26,
    };
  }

  onFrame(fn: FrameFn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Active-stop changes (from scroll, or from focus() in the list layout). */
  onStop(fn: (i: number, dir: number) => void) {
    this.stopListeners.add(fn);
  }

  setOffstage(v: boolean) {
    this.offstage = v;
  }

  /** Lenis scroll velocity (px per frame): streaks the stars, and pulls a dragged globe home. */
  setScrollVelocity(v: number) {
    this.scrollVel = v;
    if (Math.abs(v) > 0.8) this.drag.returning = true;
  }

  // ---- the list layout (reduced motion): instant cuts to a stop ----

  focus(i: number) {
    const fr = this.journeyFrame();
    if (i < 0) {
      this.mode = "hero";
      Object.assign(this.base, this.heroFrame(), { lat: HERO_TARGET.lat, lng: HERO_TARGET.lng, tilt: 0, heading: 0 });
    } else {
      this.mode = "stop";
      landPose(this.places[i], stopHeading(this.legs, i), { ...fr, land: fr.land * 3.2, tilt: 0.55 }, this.base);
    }
    this.drag.returning = true;
    this.routes.state.forEach((s, k) => { s.progress = k < i ? 1 : 0; s.heat = k === i - 1 ? 1 : 0; });
    this.setActive(i, 1);
  }

  private setActive(i: number, dir: number) {
    if (i === this.active) return;
    this.active = i;
    this.reached = Math.max(this.reached, i);
    if (this.scrollSource) this.reached = i; // scrolled journeys can be rewound
    this.world.marker.uActive.value = i;
    this.world.marker.uReached.value = this.reached;
    this.stopListeners.forEach((fn) => fn(i, dir));
  }

  /** Touchdown: a shockwave ring runs out through the fine dots from the landing point. */
  land(i: number) {
    if (this.reducedMotion) return;
    const v = toVec(this.places[i].lat, this.places[i].lng);
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
    const worldPerPx = (2 * Math.min(this.pose.dist, 3.5) * Math.tan((15 * Math.PI) / 180)) / this.stage.height;
    return (worldPerPx * 180) / Math.PI;
  }

  /** Surface point under a screen point (unit vector), or null. */
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

  /** Camera height above the ground (globe radii). */
  get altitude() {
    return Math.max(0, this.stage.camera.position.length() - 1);
  }

  // ---- the frame ----

  private choreograph(dt: number, rich: boolean) {
    const s = this.scrollSource!();
    const fr = this.journeyFrame();
    if (s.heroOut <= 0 && rich && !this.drag.active) this.heroPose.lng -= this.spinRate * dt;
    Object.assign(this.heroPose, this.heroFrame());
    landPose(this.places[0], 0, fr, this.land0);
    let active: number;
    this.flying = -1;
    this.comet = 0;
    if (s.heroOut < 1) {
      this.mode = s.heroOut > 0 ? "dive" : "hero";
      mixPose(this.heroPose, this.land0, ease.camera(s.heroOut), this.base);
      this.routes.state.forEach((r) => { r.progress = 0; r.heat = 1; });
      active = s.heroOut > 0.86 ? 0 : -1;
      this.prevWhere = null;
    } else {
      this.mode = "journey";
      const w = s.where;
      const { comet } = journeyPose(w, this.places, this.legs, fr, this.base);
      this.comet = comet;
      this.flying = w.dwell ? -1 : w.i;
      routeState(w, this.legs, comet, this.routes.state);
      active = w.active;
      // touchdown: entering a stop's dwell from the leg that leads to it
      const p = this.prevWhere;
      if (p && !p.dwell && w.dwell && w.i === p.i + 1) this.land(w.i);
      this.prevWhere = { ...w };
    }
    if (active !== this.active) this.setActive(active, active > this.active ? 1 : -1);
  }

  private tick = (_time: number, deltaMs: number) => {
    if (this.offstage) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.time += dt;
    this.stage.sampleFrame(deltaMs);
    const rich = !this.reducedMotion;

    if (this.scrollSource) this.choreograph(dt, rich);
    else if (this.mode === "hero" && rich && !this.drag.active) this.base.lng -= this.spinRate * dt;
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
    this.routes.sync(this.flying, this.comet);

    this.stage.render();
    this.project();
    this.listeners.forEach((fn) => fn(this, dt));
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

  dispose() {
    gsap.ticker.remove(this.tick);

    this.stage.dispose();
  }
}

