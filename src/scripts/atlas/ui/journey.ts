// Journey UI: turns page scroll into journey position for the director, and keeps the DOM in
// step with it — the rail (a vertical flight path whose legs bow out by their arc heights), the
// card deck, live announcements, the magnetic dwell, and rail jumps. It never computes camera
// state: it hands scroll to the director and reacts to the director's stop events.
import { lenis } from "../../motion/smooth";
import { segmentLayout, dwellCentre, locate, type Layout, type Where } from "../choreo";
import type { Leg } from "../journey";
import { scroll as S, ease, clamp } from "../motion";
import { formatCoord, EARTH_KM } from "../geo";
import { CardDeck } from "./card";

export type StopInfo = { name: string; region: string; lat: number; lng: number; when?: string; recurring?: boolean; home?: boolean };
type Rect = { x: number; y: number; w: number; h: number };

const RAIL_W = 40; // rail svg viewBox width; stops sit on x = BASE, legs bow toward 0
const BASE = 30;

export class JourneyUI {
  readonly layout: Layout;
  heroOut = 0;
  u = 0;
  where: Where = { i: 0, dwell: true, f: 0, active: -1 };
  active = -1;
  seeking = false;
  private heroEl: HTMLElement;
  private track: HTMLElement;
  private rail: HTMLElement;
  private railStops: HTMLButtonElement[];
  private railFill: SVGPathElement;
  private plane: HTMLElement;
  private alt: HTMLElement;
  private deck: CardDeck;
  private live: HTMLElement;
  private snaps: HTMLElement[];
  private trackTop = 0;
  private unitPx = 1;
  private heroH = 1;
  private lastInput = 0;
  private dir = 1;
  private snapping = false;
  private liveTimer = 0;
  private cards: HTMLElement[];
  private cardRect: Rect | null = null;
  private activeAt = 0;
  private listeners = new Set<(i: number, dir: number) => void>();
  private stopY: number[];
  private railBox = { w: 1, h: 1 };

  constructor(root: HTMLElement, private stops: StopInfo[], private legs: Leg[], private reduced: boolean, glPhotos = true) {
    this.layout = segmentLayout(legs, stops.length);
    this.heroEl = document.querySelector<HTMLElement>("[data-hero]")!;
    this.track = root.querySelector<HTMLElement>("[data-track]")!;
    this.rail = root.querySelector<HTMLElement>("[data-rail]")!;
    this.railStops = [...root.querySelectorAll<HTMLButtonElement>("[data-rail-stop]")];
    this.railFill = root.querySelector<SVGPathElement>("[data-rail-fill]")!;
    this.plane = root.querySelector<HTMLElement>("[data-rail-plane]")!;
    this.alt = root.querySelector<HTMLElement>("[data-rail-alt]")!;
    this.deck = new CardDeck(root, reduced, matchMedia("(hover: hover) and (pointer: fine)").matches, glPhotos);
    this.cards = [...root.querySelectorAll<HTMLElement>("[data-card]")];
    this.live = root.querySelector<HTMLElement>("[data-live]")!;
    this.snaps = [...root.querySelectorAll<HTMLElement>("[data-snap]")];
    this.stopY = stops.map((_, i) => (i / Math.max(1, stops.length - 1)) * 1000);
    this.track.style.setProperty("--units", this.layout.total.toFixed(3));
    this.bindRail();
    this.measure();
    new ResizeObserver(() => this.measure()).observe(this.track);
    lenis?.on("virtual-scroll", ({ deltaY }: { deltaY: number }) => {
      this.lastInput = performance.now();
      if (deltaY) this.dir = Math.sign(deltaY);
      this.snapping = false;
    });
    addEventListener("keydown", () => (this.lastInput = performance.now()));
  }

  onStop(fn: (i: number, dir: number) => void) {
    this.listeners.add(fn);
  }

  /** Track geometry: where it starts, and how many px one journey unit takes. */
  measure() {
    const r = this.track.getBoundingClientRect();
    this.trackTop = r.top + scrollY;
    this.unitPx = Math.max(1, (this.track.offsetHeight - innerHeight) / this.layout.total);
    this.heroH = Math.max(1, this.heroEl.offsetHeight);
    // touch devices snap natively: one snap point per dwell centre
    this.snaps.forEach((s, i) => (s.style.top = `${dwellCentre(i, this.layout) * this.unitPx + innerHeight / 2}px`));
    const svg = this.rail.querySelector("svg");
    this.railBox = { w: svg?.clientWidth || 1, h: svg?.clientHeight || 1 };
    this.cardRect = null;
  }

  /** Page scroll position of stop i's dwell centre. */
  stopScrollY(i: number) {
    return this.trackTop + dwellCentre(i, this.layout) * this.unitPx;
  }

  /** Called every frame with the page scroll; returns what the director needs. */
  read(y: number) {
    this.heroOut = clamp(y / this.heroH);
    this.u = (y - this.trackTop) / this.unitPx;
    this.where = locate(Math.max(0, this.u), this.layout);
    return { heroOut: this.heroOut, where: this.where, inJourney: this.heroOut >= 1 && this.u < this.layout.total };
  }

  /** The director reports the active stop; the DOM follows. */
  setActive(i: number, dir: number) {
    if (i === this.active) return;
    const prev = this.active;
    this.active = i;
    this.activeAt = performance.now();
    this.deck.show(i, dir, this.seeking);
    this.cardRect = null;
    this.railStops.forEach((b, k) => {
      b.classList.toggle("is-current", k === i);
      b.classList.toggle("is-past", k < i);
      if (k === i) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      b.tabIndex = k === Math.max(0, i) ? 0 : -1;
    });
    this.listeners.forEach((fn) => fn(i, dir));
    // announce once the scroll settles (and only the destination of a rail jump)
    clearTimeout(this.liveTimer);
    if (i >= 0 && !this.seeking) this.liveTimer = window.setTimeout(() => this.announce(i), 450);
  }

  private announce(i: number) {
    const s = this.stops[i];
    const when = s.home ? "Home" : s.when ? `${s.recurring ? "Since " : ""}${s.when}${s.recurring ? ", on repeat" : ""}` : "";
    this.live.textContent = `Stop ${i + 1} of ${this.stops.length}: ${s.name}, ${s.region}.${when ? ` ${when}.` : ""}`;
  }

  /** Rail: flown path, the plane marker at the camera's place in the journey, live altitude. */
  frame(camHeightUnits: number, comet: number) {
    const w = this.where;
    let k = w.i, t = 0;
    if (!w.dwell && k < this.legs.length) t = comet;
    if (this.heroOut < 1) { k = 0; t = 0; }
    this.deck.flight(w.i, this.heroOut >= 1 && !w.dwell && w.active === w.i ? comet : null);
    const d = this.pathUpTo(k, t);
    this.railFill.setAttribute("d", d.path);
    this.plane.style.setProperty("--px", (d.x / RAIL_W).toFixed(4));
    this.plane.style.setProperty("--py", `${d.y / 10}%`);
    this.plane.style.setProperty("--rot", `${d.angle}rad`);
    this.alt.textContent = `Alt ${Math.round(camHeightUnits * EARTH_KM).toLocaleString("en-GB")} km`;
  }

  /** Reserved screen areas labels must stay clear of. */
  reserved(): Rect[] {
    const out: Rect[] = [{ x: 0, y: 0, w: innerWidth, h: 72 }];
    if (this.active >= 0) {
      // re-measure while the card is still moving into place, then cache
      if (!this.cardRect || performance.now() - this.activeAt < 900) {
        const r = this.cards[this.active]?.getBoundingClientRect();
        this.cardRect = r ? { x: r.left - 12, y: r.top - 12, w: r.width + 24, h: r.height + 24 } : null;
      }
      if (this.cardRect) out.push(this.cardRect);
      const rr = this.rail.getBoundingClientRect();
      if (rr.width) out.push({ x: rr.left - 8, y: rr.top - 8, w: rr.width + 16, h: rr.height + 16 });
    }
    return out;
  }

  /** Magnetic dwell: shortly after scrolling stops mid-flight, glide on to (or back to) a stop. */
  settle(inJourney: boolean) {
    if (this.reduced || !lenis || this.seeking || this.snapping) return;
    if ((window as unknown as { __atlasQA?: { noSnap?: boolean } }).__atlasQA?.noSnap) return; // frame-by-frame QA
    if (performance.now() - this.lastInput < S.snapIdle * 1000 || Math.abs(lenis.velocity) > 0.6) return;
    let target: number | null = null;
    if (this.heroOut > 0.04 && this.heroOut < 1) {
      target = this.dir > 0 ? (this.heroOut > S.commit ? this.stopScrollY(0) : 0) : this.heroOut < 1 - S.commit ? 0 : this.stopScrollY(0);
    } else if (inJourney && !this.where.dwell) {
      const { i, f } = this.where;
      const next = this.dir > 0 ? (f > S.commit ? i + 1 : i) : f < 1 - S.commit ? i : i + 1;
      target = this.stopScrollY(Math.min(next, this.stops.length - 1));
    }
    if (target === null || Math.abs(target - scrollY) < 2) return;
    this.snapping = true;
    const duration = clamp((Math.abs(target - scrollY) / innerHeight) * 0.9, S.snapMin, S.snapMax);
    lenis.scrollTo(target, { duration, easing: ease.inOut, onComplete: () => (this.snapping = false) });
  }

  /** Rail jump: fly there. Intermediate stops stay quiet; the destination is announced. */
  seek(i: number) {
    const y = this.stopScrollY(i);
    if (!lenis || this.reduced) { scrollTo({ top: y, behavior: "auto" }); return; }
    const hops = Math.abs(i - Math.max(0, this.active));
    this.seeking = true;
    lenis.scrollTo(y, {
      duration: clamp(0.8 + 0.08 * hops, 0.8, 2.4),
      easing: ease.inOut,
      onComplete: () => {
        this.seeking = false;
        const a = this.active;
        this.active = -2; // force the DOM to re-sync on the destination
        this.deck.show(-2, 1, true);
        this.setActive(a, 1);
      },
    });
  }

  private bindRail() {
    this.railStops.forEach((b, i) => {
      b.addEventListener("click", () => this.seek(i));
      b.addEventListener("keydown", (e) => {
        const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: this.railStops.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        const t = this.railStops[clamp(to, 0, this.railStops.length - 1)];
        this.railStops.forEach((x) => (x.tabIndex = x === t ? 0 : -1));
        t.focus();
      });
    });
  }

  // ---- rail geometry: one quadratic per leg, bowing left by the leg's arc height
  private ctrl(k: number): [number, number, number, number, number, number] {
    const y0 = this.stopY[k], y1 = this.stopY[k + 1];
    const bow = Math.min(1, this.legs[k].height / 0.18) * (BASE - 4);
    return [BASE, y0, BASE - bow * 2, (y0 + y1) / 2, BASE, y1];
  }

  /** SVG path of the flown route up to leg k at parameter t, and the plane's point + heading. */
  private pathUpTo(k: number, t: number) {
    let d = `M${BASE} ${this.stopY[0]}`;
    for (let j = 0; j < k && j < this.legs.length; j++) {
      const [, , cx, cy, x1, y1] = this.ctrl(j);
      d += `Q${cx} ${cy} ${x1} ${y1}`;
    }
    if (k >= this.legs.length || t <= 0) {
      const y = this.stopY[Math.min(k, this.stopY.length - 1)];
      return { path: d, x: BASE, y, angle: Math.PI / 2 };
    }
    // de Casteljau split of leg k at t
    const [x0, y0, cx, cy, x1, y1] = this.ctrl(k);
    const ax = x0 + (cx - x0) * t, ay = y0 + (cy - y0) * t;
    const bx = cx + (x1 - cx) * t, by = cy + (y1 - cy) * t;
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
    d += `Q${ax.toFixed(2)} ${ay.toFixed(2)} ${px.toFixed(2)} ${py.toFixed(2)}`;
    const sx = this.railBox.w / RAIL_W, sy = this.railBox.h / 1000;
    return { path: d, x: px, y: py, angle: Math.atan2((by - ay) * sy, (bx - ax) * sx) };
  }

  /** The nav's live readout text while flying. */
  static transitText(lat: number, lng: number, to: string) {
    return `${formatCoord(lat, lng)} · → ${to}`;
  }
}
