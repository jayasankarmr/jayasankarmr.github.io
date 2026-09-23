// Concept A — Darkroom: page choreography.
import { initSmooth, gsap, ScrollTrigger } from "../motion/smooth";
import { initCursor } from "../motion/cursor";
import { initReveals } from "../motion/reveal";
import { runLoader } from "../motion/loader";
import { initClock } from "../motion/clock";
import { split } from "../motion/split";
import { richMotion, reducedMotion, finePointer, isNarrow, whenNear } from "../motion/env";

const HERO_SRC = "/photography/images/hero.jpg";

async function main() {
  initSmooth();
  initCursor();
  initClock();

  const hero = document.querySelector<HTMLElement>("[data-hero]")!;
  const canvas = document.querySelector<HTMLCanvasElement>("[data-hero-canvas]")!;
  const title = document.querySelector<HTMLElement>("[data-hero-title]")!;
  const status = document.querySelector<HTMLElement>("[data-status]")!;

  // start the GL hero while the loader is still up, so it's ready for the reveal
  const glHero = richMotion()
    ? import("../gl/darkroom").then((m) => m.initDarkroomHero(canvas, HERO_SRC)).catch(() => null)
    : Promise.resolve(null);

  const chars = reducedMotion() ? [] : split(title, "chars");
  if (chars.length) gsap.set(chars, { yPercent: 115 });

  await runLoader(document.querySelector("[data-loader]"), [HERO_SRC]);

  const gl = await glHero;
  const fix = () => { status.textContent = "Fixed."; hero.classList.add("is-fixed"); };
  if (gl) gl.develop(3.4).then(fix);
  else setTimeout(fix, 600);
  if (chars.length) gsap.to(chars, { yPercent: 0, duration: 1.4, ease: "expo.out", stagger: 0.04, delay: 0.2 });

  if (!reducedMotion()) {
    // hero drifts up and dissolves as the page scrolls over it
    ScrollTrigger.create({
      trigger: hero, start: "top top", end: "bottom top", scrub: true,
      onUpdate: (st) => gl?.setScroll(st.progress),
    });
    gsap.to("[data-hero-content]", { yPercent: -18, opacity: 0, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom 20%", scrub: true } });
  }

  initRoll();
  initReveals();
}

function initRoll() {
  const section = document.querySelector<HTMLElement>("[data-roll]")!;
  const track = document.querySelector<HTMLElement>("[data-roll-track]")!;
  const pick = document.querySelector<SVGPathElement>("[data-pick]");

  // photo thumbnails get the light-leak shader on hover (desktop pointers only)
  if (richMotion() && finePointer()) {
    whenNear(section, () => {
      import("../gl/darkroom").then(({ initLeakImage }) => {
        section.querySelectorAll<HTMLElement>("[data-leak]").forEach((a) => {
          const img = a.querySelector("img")!;
          initLeakImage(a.querySelector("canvas")!, img.currentSrc || img.src, a).catch(() => {});
        });
      });
    });
  }

  let containerAnimation: gsap.core.Tween | undefined;
  if (!reducedMotion() && !isNarrow()) {
    // pin the sheet and translate the strip horizontally with vertical scroll
    document.documentElement.classList.add("dr-pinned");
    const distance = () => track.scrollWidth - window.innerWidth;
    containerAnimation = gsap.to(track, {
      x: () => -distance(),
      ease: "none",
      scrollTrigger: {
        trigger: section, start: "top top", end: () => `+=${distance()}`,
        pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1,
      },
    });
    // frames lift slightly as they pass centre
    track.querySelectorAll<HTMLElement>(".dr-frame").forEach((f) => {
      gsap.fromTo(f, { y: 24, opacity: 0.35 }, {
        y: 0, opacity: 1, ease: "power2.out",
        scrollTrigger: { trigger: f, containerAnimation, start: "left 95%", end: "left 55%", scrub: true },
      });
    });
  }

  if (pick && !reducedMotion()) {
    const len = pick.getTotalLength();
    gsap.set(pick, { strokeDasharray: len, strokeDashoffset: len });
    gsap.to(pick, {
      strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut",
      scrollTrigger: containerAnimation
        ? { trigger: pick, containerAnimation, start: "left 60%" }
        : { trigger: pick, start: "top 70%" },
    });
  }
}

main();
