// The atlas's context cursor, on top of the shared ring-and-dot (motion/cursor.ts). On the
// planet the ring becomes a turning glyph and the dot a crosshair reading the real latitude and
// longitude under it; doorways say ENTER, tickets FLIP (or FLIP BACK). Labels here are small
// tags beside the pointer rather than the shared filled disc, so they never sit on the text they
// describe. Touch has no cursor at all (the shared cursor never starts, or hides on touch input).
import type { CursorParts } from "../../motion/cursor";
import type { Director } from "../scene";
import { formatCoord } from "../geo";

export function atlasCursor(parts: CursorParts | null) {
  if (!parts) return { attach(_globe: Director) {} };
  const { root, ring, dot } = parts;
  root.classList.add("cursor--atlas");
  ring.insertAdjacentHTML("beforeend",
    '<svg class="cursor__glyph" viewBox="0 0 24 24"><path d="M4.6 10.4A7.6 7.6 0 0 1 17.9 7.2M19.4 13.6A7.6 7.6 0 0 1 6.1 16.8"/><path d="M18.4 3.6v3.9h-3.9M5.6 20.4v-3.9h3.9"/></svg>');
  dot.insertAdjacentHTML("beforeend",
    '<svg class="cursor__cross" viewBox="-16 -16 32 32"><path d="M-15 0h9M6 0h9M0-15v9M0 6v9"/></svg><span class="cursor__tag"></span>');
  const tag = dot.querySelector<HTMLElement>(".cursor__tag")!;

  let over: Element | null = null;
  let onCanvas = false;
  let globe: Director | null = null;
  let x = 0, y = 0, text = "", coordAt = 0;

  const setTag = (t: string) => {
    if (t === text) return;
    text = t;
    tag.textContent = t;
    root.classList.toggle("has-tag", !!t);
  };

  /** What the pointer is over, as a word (the planet is handled per frame). */
  const context = () => {
    const t = over?.closest<HTMLElement>("[data-ticket], [data-door], [data-cursor]");
    if (!t) return "";
    if (t.hasAttribute("data-ticket")) return t.getAttribute("aria-pressed") === "true" ? "Flip back" : "Flip";
    if (t.hasAttribute("data-door")) return "Enter";
    return t.dataset.cursor ?? "";
  };

  // runs after the shared cursor's own pointerover (registered first): tags replace its disc
  document.addEventListener("pointerover", (e) => {
    over = e.target as Element;
    onCanvas = over === globe?.canvas;
    root.classList.remove("has-label");
    if (!onCanvas) { root.classList.remove("is-globe"); setTag(context()); }
  });
  document.addEventListener("click", () => { if (!onCanvas) setTag(context()); });
  addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; }, { passive: true });

  /** The planet: live coordinates under the crosshair, refreshed as the camera or pointer moves. */
  const frame = (d: Director) => {
    if (!onCanvas) return;
    const ll = d.latLngAt(x, y);
    root.classList.toggle("is-globe", !!ll);
    if (!ll) { setTag(""); return; }
    const now = performance.now();
    if (now - coordAt < 60) return; // readable, and no layout churn at 120 Hz
    coordAt = now;
    setTag(formatCoord(ll.lat, ll.lng));
  };

  return {
    attach(g: Director) {
      globe = g;
      g.onFrame(frame);
    },
  };
}
