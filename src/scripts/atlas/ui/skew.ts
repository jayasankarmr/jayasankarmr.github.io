// Scroll feel: the page's display type leans with scroll velocity (skewY, capped) and springs
// upright as the scroll settles. Only type that is on screen is touched, and only while it is
// actually leaning; Lenis gives the velocity, so there is none of this under reduced motion.
import { gsap, lenis } from "../../motion/smooth";
import { clamp, feel, springStep, springs } from "../motion";

export function initSkew(els: HTMLElement[]) {
  if (!lenis || !els.length) return;
  const onScreen = new Set<HTMLElement>();
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const el = e.target as HTMLElement;
    if (e.isIntersecting) onScreen.add(el);
    else { onScreen.delete(el); el.style.transform = ""; }
  }));
  els.forEach((el) => io.observe(el));

  const s = { x: 0, v: 0 };
  let shown = 0;
  gsap.ticker.add((_t, deltaMs) => {
    const target = clamp(-(lenis?.velocity ?? 0) * feel.skewPerPx, -feel.skewMax, feel.skewMax);
    if (target === 0 && Math.abs(s.x) < 0.005 && Math.abs(s.v) < 0.005) {
      if (shown !== 0) { shown = 0; onScreen.forEach((el) => (el.style.transform = "")); }
      return;
    }
    springStep(s, target, Math.min(deltaMs / 1000, 0.05), springs.skew);
    const deg = Math.round(s.x * 100) / 100;
    if (deg === shown) return;
    shown = deg;
    const tf = deg ? `skewY(${deg}deg)` : "";
    onScreen.forEach((el) => (el.style.transform = tf));
  });
}
