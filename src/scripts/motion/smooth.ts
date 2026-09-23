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
  return lenis;
}

export { gsap, ScrollTrigger };
