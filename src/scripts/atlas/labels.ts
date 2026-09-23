// Stop labels, laid out in screen space every frame the camera moves:
//  1. priority — the active stop, then its neighbours, home, recurring stops, visited, the rest
//  2. clustering — markers that crowd together merge into one badge named from the data
//     ("KERALA · 3" when they share a region, "THRISSUR +3" when they don't); hysteresis keeps
//     a badge from flickering as the camera moves, and when the camera dives the members spring
//     back out to their own markers
//  3. placement — the first free spot around the marker (right, left, above, below, diagonals)
//     that avoids placed labels, reserved UI (card, rail, nav) and the screen edge; failing
//     that, a spot further out joined by a leader line; failing that, the label hides
// The active stop never clusters and never hides.
import type { Projected } from "./director";

export type LabelStop = { name: string; region: string; home?: boolean; recurring?: boolean };
type Rect = { x: number; y: number; w: number; h: number };
type Anim = { x: number; y: number; o: number; to: number; tx: number; ty: number; shown: boolean };

const MERGE = 26, SPLIT = 36, GAP = 10, EDGE = 12;
const span = (cls: string) => Object.assign(document.createElement("span"), { className: cls });
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export class Labels {
  private items: HTMLElement[];
  private badges: HTMLElement[] = [];
  private badgeText: string[] = [];
  private lines: SVGPathElement[];
  private sizes: { w: number; h: number }[][] = [];
  private badgeSize: { w: number; h: number }[] = [];
  private anim: Anim[];
  private badgeAnim: Anim[];
  private leaderOf: number[];
  private placed: Rect[] = [];
  active = -1;
  reached = -1;
  /** set false during the intro / when the globe is away */
  enabled = true;
  /** the flat map: only the highlighted stop (route list hover) is named */
  solo = false;
  reserved: () => Rect[] = () => [];

  constructor(private root: HTMLElement, private stops: LabelStop[], badgePool = 6) {
    this.items = stops.map((s, i) => {
      const el = document.createElement("div");
      el.className = "lbl";
      el.dataset.label = String(i);
      el.appendChild(span("lbl__name")).textContent = s.name;
      root.appendChild(el);
      return el;
    });
    for (let b = 0; b < badgePool; b++) {
      const el = document.createElement("div");
      el.className = "lbl lbl--cluster";
      el.append(span("lbl__name"), span("lbl__count"));
      root.appendChild(el);
      this.badges.push(el);
      this.badgeText.push("");
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "lbl-lines");
    this.lines = stops.map(() => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      svg.appendChild(p);
      return p;
    });
    root.prepend(svg);
    const a = (): Anim => ({ x: 0, y: 0, o: 0, to: 0, tx: 0, ty: 0, shown: false });
    this.anim = stops.map(a);
    this.badgeAnim = this.badges.map(a);
    this.leaderOf = stops.map(() => -1);
    this.measure();
    document.fonts?.ready.then(() => this.measure());
  }

  /** Label boxes for both variants (normal, active), measured once and on resize. */
  measure() {
    this.sizes = this.items.map((el) => {
      const out: { w: number; h: number }[] = [];
      for (const on of [false, true]) {
        el.classList.toggle("is-active", on);
        out.push({ w: el.offsetWidth, h: el.offsetHeight });
      }
      el.classList.toggle("is-active", this.active === +el.dataset.label!);
      return out;
    });
  }

  private priority(i: number) {
    const s = this.stops[i];
    if (i === this.active) return 1e6;
    if (this.active >= 0 && Math.abs(i - this.active) === 1) return 5e5;
    if (s.home) return 3e5;
    if (s.recurring) return 2.5e5;
    if (i <= this.reached) return 1e5 + i;
    return 1e4 - i;
  }

  update(pts: Projected[], dt: number, w: number, h: number) {
    const vis: number[] = [];
    if (this.enabled) {
      pts.forEach((p, i) => {
        if (p.facing > 0.12 && p.x > 4 && p.x < w - 4 && p.y > 76 && p.y < h - 4) vis.push(i);
      });
    }
    if (this.solo) vis.splice(0, vis.length, ...vis.filter((i) => i === this.active));
    vis.sort((a, b) => this.priority(b) - this.priority(a));

    // ---- clusters (the active stop always stands alone)
    const leader = this.stops.map(() => -1);
    const clusters: { lead: number; members: number[] }[] = [];
    for (const i of vis) {
      if (i === this.active || leader[i] >= 0) continue;
      const members = [i];
      for (const j of vis) {
        if (j === i || j === this.active || leader[j] >= 0) continue;
        const thr = this.leaderOf[j] === i ? SPLIT : MERGE;
        if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) < thr) members.push(j);
      }
      if (members.length > 1) {
        members.forEach((m) => (leader[m] = i));
        clusters.push({ lead: i, members });
      }
    }

    // ---- place: active first, then by priority (a cluster ranks as its leader)
    this.placed = this.reserved().slice();
    const bounds: Rect = { x: EDGE, y: EDGE, w: w - EDGE * 2, h: h - EDGE * 2 };
    const inside = (r: Rect) => r.x >= bounds.x && r.y >= bounds.y && r.x + r.w <= bounds.x + bounds.w && r.y + r.h <= bounds.y + bounds.h;
    const free = (r: Rect) => inside(r) && !this.placed.some((q) => hit(r, q));
    const find = (ax: number, ay: number, sw: number, sh: number, force: boolean) => {
      const c: [number, number][] = [
        [ax + GAP, ay - sh / 2], [ax - GAP - sw, ay - sh / 2], [ax - sw / 2, ay - GAP - sh], [ax - sw / 2, ay + GAP],
        [ax + GAP - 2, ay - sh - 4], [ax + GAP - 2, ay + 4], [ax - GAP - sw + 2, ay - sh - 4], [ax - GAP - sw + 2, ay + 4],
      ];
      for (const [x, y] of c) { const r = { x, y, w: sw, h: sh }; if (free(r)) return { r, lead: false }; }
      for (const d of [46, 72, 104]) {
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2;
          const cx = ax + Math.cos(ang) * d, cy = ay + Math.sin(ang) * d;
          const r = { x: Math.cos(ang) >= 0 ? cx : cx - sw, y: cy - sh / 2, w: sw, h: sh };
          if (free(r)) return { r, lead: true };
        }
      }
      if (!force) return null;
      const r = { x: Math.min(Math.max(ax + GAP, bounds.x), bounds.x + bounds.w - sw), y: Math.min(Math.max(ay - sh / 2, bounds.y), bounds.y + bounds.h - sh), w: sw, h: sh };
      return { r, lead: false };
    };

    const shownLabel = new Set<number>();
    const target: (null | { r: Rect; lead: boolean })[] = this.stops.map(() => null);
    const badgeFor: { lead: number; members: number[]; r: Rect }[] = [];
    const queue: { kind: "label" | "cluster"; i: number; members?: number[] }[] = [];
    for (const i of vis) {
      if (leader[i] < 0) queue.push({ kind: "label", i });
      else if (leader[i] === i) queue.push({ kind: "cluster", i, members: clusters.find((c) => c.lead === i)!.members });
    }
    let badgeSlots = this.badges.length;
    for (const q of queue) {
      const p = pts[q.i];
      if (q.kind === "label") {
        const s = this.sizes[q.i]?.[q.i === this.active ? 1 : 0] ?? { w: 80, h: 16 };
        const f = find(p.x, p.y, s.w, s.h, q.i === this.active);
        if (f) { target[q.i] = f; shownLabel.add(q.i); this.placed.push(f.r); }
      } else if (badgeSlots > 0) {
        const k = this.badges.length - badgeSlots;
        const text = this.clusterText(q.members!);
        this.setBadge(k, text);
        const s = this.badgeSize[k] ?? { w: 90, h: 20 };
        const f = find(p.x, p.y, s.w, s.h, false);
        if (f) { badgeFor.push({ lead: q.i, members: q.members!, r: f.r }); this.placed.push(f.r); badgeSlots--; }
      }
    }

    // ---- animate toward targets; newly split labels start from their old badge
    const lerpK = 1 - Math.exp(-16 * dt), fadeK = 1 - Math.exp(-10 * dt);
    const oldBadgePos = new Map<number, { x: number; y: number }>();
    this.badgeAnim.forEach((a, k) => { if (a.shown && this.badges[k].dataset.lead) oldBadgePos.set(+this.badges[k].dataset.lead!, { x: a.x, y: a.y }); });
    this.items.forEach((el, i) => {
      const a = this.anim[i], t = target[i];
      el.classList.toggle("is-active", i === this.active);
      el.classList.toggle("is-reached", i <= this.reached);
      if (t) {
        if (!a.shown) {
          const from = this.leaderOf[i] >= 0 ? oldBadgePos.get(this.leaderOf[i]) : undefined;
          a.x = from?.x ?? t.r.x; a.y = from?.y ?? t.r.y;
          a.shown = true;
        }
        a.tx = t.r.x; a.ty = t.r.y; a.to = 1;
      } else { a.to = 0; if (a.o < 0.02) a.shown = false; }
      a.x += (a.tx - a.x) * lerpK;
      a.y += (a.ty - a.y) * lerpK;
      a.o += (a.to - a.o) * fadeK;
      el.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`;
      el.style.opacity = a.o.toFixed(3);
      // leader line from the marker to the nearest edge of the label
      const line = this.lines[i];
      if (t?.lead && a.o > 0.05) {
        const p = pts[i];
        const ex = Math.max(a.x, Math.min(p.x, a.x + t.r.w)), ey = Math.max(a.y, Math.min(p.y, a.y + t.r.h));
        line.setAttribute("d", `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`);
        line.style.opacity = (a.o * 0.9).toFixed(3);
      } else line.style.opacity = "0";
    });
    this.badges.forEach((el, k) => {
      const a = this.badgeAnim[k], b = badgeFor[k];
      if (b) {
        el.dataset.lead = String(b.lead);
        if (!a.shown) { a.x = b.r.x; a.y = b.r.y; a.shown = true; }
        a.tx = b.r.x; a.ty = b.r.y; a.to = 1;
      } else { a.to = 0; if (a.o < 0.02) { a.shown = false; delete el.dataset.lead; } }
      a.x += (a.tx - a.x) * lerpK;
      a.y += (a.ty - a.y) * lerpK;
      a.o += (a.to - a.o) * fadeK;
      el.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`;
      el.style.opacity = a.o.toFixed(3);
    });
    this.leaderOf = leader;
  }

  /** Name a cluster from the data: its shared region, or its leading stop plus a count. */
  private clusterText(members: number[]) {
    const regions = new Set(members.map((m) => this.stops[m].region));
    return regions.size === 1 ? `${[...regions][0]} · ${members.length}` : `${this.stops[members[0]].name} +${members.length - 1}`;
  }

  private setBadge(k: number, text: string) {
    if (this.badgeText[k] === text) return;
    this.badgeText[k] = text;
    const el = this.badges[k];
    const [name, count] = text.includes(" · ") ? text.split(" · ") : [text.replace(/ \+\d+$/, ""), text.match(/\+\d+$/)?.[0] ?? ""];
    el.children[0].textContent = name;
    el.children[1].textContent = count;
    el.setAttribute("aria-hidden", "true");
    this.badgeSize[k] = { w: el.offsetWidth, h: el.offsetHeight };
  }

  /** Rects of every label currently on screen (QA hook: collision audits). */
  rects(): Rect[] {
    return this.placed;
  }
}
