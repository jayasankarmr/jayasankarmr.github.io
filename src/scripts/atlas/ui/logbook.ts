// The logbook: the headline rises by word as the amber "between the stops." sweeps in; tiles
// arrive from depth in reading order; every tile tilts toward the pointer with a sheen and a
// border glow. The route card is a scrollable itinerary whose line fills as you read it, and
// hovering a place lights it on the map behind. The career card types its git log on hover; the
// doorways' Enter buttons are magnetic but confined to their corner; clicking a doorway morphs it
// into the page it opens (cross-document view transitions).
import { gsap, ScrollTrigger } from "../../motion/smooth";
import { split } from "../../motion/split";
import { typeOut } from "../../motion/scramble";
import { stagger } from "../motion";

type Opts = { reduced: boolean; fine: boolean; glPhoto: boolean; highlight: (i: number) => void };

export function initLogbook(root: HTMLElement, o: Opts) {
  const head = root.querySelector<HTMLElement>("[data-lb-head]")!;
  const tiles = [...root.querySelectorAll<HTMLElement>("[data-tile]")];
  if (!o.reduced) {
    const words = [...split(head.querySelector<HTMLElement>("[data-lb-words]")!, "words")];
    gsap.set(words, { yPercent: 110 });
    ScrollTrigger.create({
      trigger: head, start: "top 78%", once: true,
      onEnter: () => {
        head.classList.add("is-in");
        gsap.to(words, { yPercent: 0, duration: 1, ease: "atlas.out", stagger: stagger.word });
      },
    });
    // tiles rise out of depth, ordered by where they sit in the grid (reading order)
    const order = tiles.map((t) => ({ t, k: Math.round(t.offsetTop / 40) * 1000 + t.offsetLeft })).sort((a, b) => a.k - b.k).map((x) => x.t);
    gsap.set(order, { opacity: 0, z: -140, rotationX: 9, y: 36, clipPath: "inset(14% 0% 0% 0% round 12px)", transformPerspective: 1400 });
    ScrollTrigger.create({
      trigger: root.querySelector("[data-lb-grid]"), start: "top 82%", once: true,
      onEnter: () => gsap.to(order, {
        opacity: 1, z: 0, rotationX: 0, y: 0, clipPath: "inset(0% 0% 0% 0% round 12px)",
        duration: 1.1, ease: "atlas.out", stagger: stagger.card, clearProps: "transform,clipPath",
      }),
    });
  } else head.classList.add("is-in");

  if (o.fine && !o.reduced) tiles.forEach(tilt);
  route(root, o);
  gitLog(root, o.reduced);
  root.querySelectorAll<HTMLElement>("[data-door]").forEach((door) => {
    if (o.fine && !o.reduced) magnet(door);
    door.addEventListener("click", () => {
      // name the morphing element only for this navigation (other links just crossfade)
      if (door.dataset.door === "career") door.style.viewTransitionName = "career-sheet";
      else {
        door.querySelector<HTMLElement>("[data-door-media]")!.style.viewTransitionName = "photo-hero";
        try { sessionStorage.setItem("jmr-vt", "photo"); } catch { /* the photo page just plays its own intro */ }
      }
    });
    // back/forward cache: clear the names if the page is restored
    addEventListener("pageshow", () => {
      door.style.viewTransitionName = "";
      door.querySelector<HTMLElement>("[data-door-media]")?.style.removeProperty("view-transition-name");
    });
  });
  const media = root.querySelector<HTMLElement>("[data-door-media]");
  if (media && o.glPhoto && o.fine && !o.reduced) {
    // build the hover surface in idle time after the opening, so neither a scroll nor the first
    // hover pays for a WebGL context
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      ?? ((cb: () => void) => window.setTimeout(cb, 300));
    let started = false;
    const build = () => { if (!started) { started = true; void import("../gl/door-photo").then((m) => m.initDoorPhoto(media)); } };
    // true idle only (no timeout): a visitor who never pauses builds it on first hover instead
    window.setTimeout(() => idle(build), 3500);
    media.closest("a")!.addEventListener("pointerenter", build, { once: true });
  }
}

function tilt(el: HTMLElement) {
  gsap.set(el, { transformPerspective: 1200 });
  const rx = gsap.quickTo(el, "rotationX", { duration: 0.7, ease: "power3" });
  const ry = gsap.quickTo(el, "rotationY", { duration: 0.7, ease: "power3" });
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    rx(-(y - 0.5) * 5);
    ry((x - 0.5) * 6);
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
  });
  el.addEventListener("pointerleave", () => { rx(0); ry(0); });
}

/** A doorway's Enter button leans toward the pointer, confined to its corner. */
function magnet(door: HTMLElement) {
  const btn = door.querySelector<HTMLElement>("[data-magnet]");
  if (!btn) return;
  const mx = gsap.quickTo(btn, "x", { duration: 0.6, ease: "elastic.out(1, 0.45)" });
  const my = gsap.quickTo(btn, "y", { duration: 0.6, ease: "elastic.out(1, 0.45)" });
  door.addEventListener("pointermove", (e) => {
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2 - (gsap.getProperty(btn, "x") as number), cy = r.top + r.height / 2 - (gsap.getProperty(btn, "y") as number);
    const dx = e.clientX - cx, dy = e.clientY - cy;
    const k = Math.min(1, 28 / Math.max(1, Math.hypot(dx, dy) * 0.22));
    // never left or down past a small radius: the description and title live there
    mx(Math.max(-26, Math.min(8, dx * 0.22 * k)));
    my(Math.max(-8, Math.min(26, dy * 0.22 * k)));
  });
  door.addEventListener("pointerleave", () => { mx(0); my(0); });
}

/** The route card: fill line + edge fades follow the list's own scroll; hover lights the map. */
function route(root: HTMLElement, o: Opts) {
  const sc = root.querySelector<HTMLElement>("[data-route-scroll]");
  if (!sc) return;
  const fill = root.querySelector<HTMLElement>("[data-route-fill]")!;
  const list = sc.querySelector("ol")!;
  const update = () => {
    const max = sc.scrollHeight - sc.clientHeight;
    const p = max > 0 ? sc.scrollTop / max : 1;
    fill.style.setProperty("--fill", (0.12 + 0.88 * p).toFixed(4));
    sc.style.setProperty("--ft", sc.scrollTop > 4 ? "2.5rem" : "0rem");
    sc.style.setProperty("--fb", sc.scrollTop < max - 4 ? "3rem" : "0rem");
    sc.style.setProperty("--list-h", `${list.offsetHeight + 24}px`);
  };
  sc.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(sc);
  update();
  sc.querySelectorAll<HTMLElement>("[data-route-stop]").forEach((li) => {
    li.addEventListener("pointerenter", () => o.highlight(+li.dataset.routeStop!));
    li.addEventListener("pointerleave", () => o.highlight(-1));
  });
}

/** The career card's git log types itself the first time the card is hovered or focused. */
function gitLog(root: HTMLElement, reduced: boolean) {
  const pre = root.querySelector<HTMLElement>("[data-gitlog]");
  if (!pre) return;
  const lines: string[] = JSON.parse(pre.dataset.gitlog!);
  const door = pre.closest("a")!;
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    for (const line of lines) {
      const row = document.createElement("div");
      const hash = document.createElement("b");
      hash.textContent = line.slice(0, 8);
      const msg = document.createElement("span");
      msg.textContent = line.slice(8);
      row.append(hash, msg);
      pre.appendChild(row);
      if (!reduced) await typeOut(msg, 14);
    }
  };
  door.addEventListener("pointerenter", start);
  door.addEventListener("focus", start);
}
