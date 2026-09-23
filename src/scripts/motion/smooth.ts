// Lenis smooth scroll, driven by GSAP's ticker so ScrollTrigger stays in lockstep.
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { reducedMotion } from "./env";

gsap.registerPlugin(ScrollTrigger);

export let lenis: Lenis | null = null;

export function initSmooth(): Lenis | null {
  if (reducedMotion()) return null;
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1, anchors: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis?.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  // Keyboard focus: the browser scrolls a focused element into view, but a Lenis glide in
  // progress (a journey snap, say) puts the page straight back. Check against where Lenis is
  // heading, and send it to the element instead (just below the fixed nav, centred if it fits).
  addEventListener("focusin", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !lenis) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const top = r.top + scrollY, to = lenis.targetScroll;
    if (top >= to + 80 && top + r.height <= to + innerHeight - 16) return;
    lenis.scrollTo(Math.max(0, top - Math.max(96, (innerHeight - r.height) / 2)), { duration: 0.9, force: true });
  });
  return lenis;
}

export { gsap, ScrollTrigger };
