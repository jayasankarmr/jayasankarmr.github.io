// Home: page choreography around the fixed atlas globe.
import { initSmooth, gsap, ScrollTrigger, lenis } from "../motion/smooth";
import { initCursor } from "../motion/cursor";
import { initReveals } from "../motion/reveal";
import { runLoader } from "../motion/loader";
import { split } from "../motion/split";
import { reducedMotion } from "../motion/env";
import { registerMotion } from "../atlas/motion";
import { detectTier } from "../atlas/tier";
import { readout } from "../atlas/ui/readout";
import type { Director } from "../atlas/scene";

async function main() {
  registerMotion();
  initSmooth();
  initCursor();

  const canvas = document.querySelector<HTMLCanvasElement>("[data-globe]")!;
  const labelsRoot = document.querySelector<HTMLElement>("[data-labels]")!;
  const stops = [...document.querySelectorAll<HTMLElement>("[data-stop]")];
  const places = stops.map((s) => ({
    lat: +s.dataset.lat!, lng: +s.dataset.lng!, name: s.dataset.name!,
    leg: "leg" in s.dataset, recurring: "recurring" in s.dataset, home: "home" in s.dataset,
  }));
  const pos = readout(document.querySelector<HTMLElement>("[data-pos]")!, reducedMotion());

  const tier = detectTier();
  document.documentElement.dataset.tier = tier.name;
  const globeP: Promise<Director | null> = tier.name !== "none"
    ? import("../atlas/scene")
        .then((m) => m.createAtlas(canvas, places, tier))
        .catch((e) => { console.warn(e); return null; })
    : Promise.resolve(null);

  // hero title lines rise in after the loader
  const lines = reducedMotion() ? [] : [...document.querySelectorAll<HTMLElement>("[data-hero-line]")].flatMap((l) => [...split(l, "words")]);
  if (lines.length) gsap.set(lines, { yPercent: 110 });

  await runLoader(document.querySelector("[data-loader]"), [], 1500);
  const globe = await globeP;

  if (lines.length) gsap.to(lines, { yPercent: 0, duration: 1.4, ease: "expo.out", stagger: 0.08 });
  gsap.to("[data-hero-in]", { opacity: 1, y: 0, duration: 1.2, ease: "expo.out", stagger: 0.08, delay: 0.35 });

  if (!globe) {
    document.documentElement.classList.add("no-globe");
    canvas.remove();
    labelsRoot.remove();
    document.querySelector("[data-globe-ctl]")?.remove();
    initReveals();
    return;
  }

  // opacity is left to the CSS transition (.at-globe:not(.is-live)); tweening it here too fights that transition
  if (!reducedMotion()) gsap.fromTo(canvas, { scale: 0.94 }, { scale: 1, duration: 2, ease: "expo.out" });
  lenis?.on("scroll", () => globe.setScrollVelocity(lenis?.velocity ?? 0));
  initGlobeControl(globe);

  // labels follow their markers every frame
  const labels = [...labelsRoot.querySelectorAll<HTMLElement>("[data-label]")];
  globe.onFrame((d) => {
    d.projected.forEach((p, i) => {
      labels[i].style.transform = `translate(${p.x}px, ${p.y}px)`;
      labels[i].style.opacity = String(Math.max(0, Math.min(1, (p.facing - 0.1) * 4)));
    });
  });

  let current = -2;
  const activate = (i: number) => {
    if (i === current) return;
    current = i;
    if (i < 0) globe.hero();
    else globe.focus(i);
    globe.setStops(i, i);
    labels.forEach((l, k) => l.classList.toggle("is-active", k === i));
    stops.forEach((s, k) => {
      s.classList.toggle("is-current", k === i);
      s.classList.toggle("is-past", k < i);
    });
    const p = places[Math.max(0, i)];
    pos.set(p.lat, p.lng, p.name);
  };
  activate(-1);

  stops.forEach((stop, i) => {
    ScrollTrigger.create({
      trigger: stop, start: "top 55%", end: "bottom 55%",
      onToggle: (st) => { if (st.isActive) activate(i); },
    });
    if (!reducedMotion()) {
      // the wrapper, not the card: the card's scale/opacity belong to the CSS focus state
      gsap.from(stop.querySelector(".at-stop__inner"), {
        opacity: 0, y: 60, duration: 1.2, ease: "expo.out",
        scrollTrigger: { trigger: stop, start: "top 70%" },
      });
    }
  });
  // the rail fills in step with the activation line, so its tip always sits on the current node
  gsap.to("[data-rail-fill]", {
    scaleY: 1, ease: "none",
    scrollTrigger: { trigger: "#journey", start: "top 55%", end: "bottom 55%", scrub: true },
  });
  ScrollTrigger.create({
    trigger: stops[0], start: "top 55%",
    onLeaveBack: () => activate(-1),
  });

  // globe steps back once the notebook takes over. The trigger runs to the end of the page, so
  // a jump (anchor, End key, fast flick) can't skip past it; once faded, the scene stops drawing.
  // (progress, not isActive: at the very bottom a trigger ending at "max" counts as left)
  let away = false, awayTimer = 0;
  const setAway = (v: boolean) => {
    if (v === away) return;
    away = v;
    canvas.classList.toggle("is-away", v);
    labelsRoot.classList.toggle("is-away", v);
    clearTimeout(awayTimer);
    if (v) awayTimer = window.setTimeout(() => globe.setOffstage(true), 850); // after the 0.8s fade
    else globe.setOffstage(false);
  };
  ScrollTrigger.create({
    trigger: "#notebook", start: "top 45%", end: "max",
    onUpdate: (st) => setAway(st.progress > 0),
    onRefresh: (st) => setAway(st.progress > 0),
  });

  initReveals();
}

/** The hero's focusable globe: arrow keys turn it, Home recentres; the ring hugs the globe. */
function initGlobeControl(globe: Director) {
  const ctl = document.querySelector<HTMLElement>("[data-globe-ctl]");
  if (!ctl) return;
  const place = () => {
    const f = globe.heroFrame();
    const { width: w, height: h } = globe.stage;
    const r = (h / 2) * (Math.tan(Math.asin(1 / (1 + f.dist))) / Math.tan((15 * Math.PI) / 180));
    ctl.style.setProperty("--x", `${w / 2 + (f.sx * w) / 2}px`);
    ctl.style.setProperty("--y", `${h / 2 - (f.sy * h) / 2}px`);
    ctl.style.setProperty("--r", `${r}px`);
  };
  place();
  globe.stage.whenResized(place);
  const step = 6;
  ctl.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [step, 0], ArrowDown: [-step, 0] }[e.key];
    if (k) { e.preventDefault(); globe.nudge(k[0], k[1]); }
    else if (e.key === "Home") { e.preventDefault(); globe.recentre(); }
  });
}

main();
