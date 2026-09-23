// Home: page choreography around the fixed globe.
import { initSmooth, gsap, ScrollTrigger } from "../motion/smooth";
import { initCursor } from "../motion/cursor";
import { initReveals } from "../motion/reveal";
import { runLoader } from "../motion/loader";
import { split } from "../motion/split";
import { richMotion, reducedMotion, isNarrow } from "../motion/env";

const coord = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(2)}°${lng >= 0 ? "E" : "W"}`;

async function main() {
  initSmooth();
  initCursor();

  const canvas = document.querySelector<HTMLCanvasElement>("[data-globe]")!;
  const labelsRoot = document.querySelector<HTMLElement>("[data-labels]")!;
  const stops = [...document.querySelectorAll<HTMLElement>("[data-stop]")];
  const places = stops.map((s) => ({ lat: +s.dataset.lat!, lng: +s.dataset.lng!, name: s.dataset.name!, leg: "leg" in s.dataset }));
  const pos = document.querySelector<HTMLElement>("[data-pos]")!;
  const css = getComputedStyle(document.body);

  const globeP = richMotion()
    ? import("../gl/globe")
        .then((m) => m.initGlobe(canvas, places, {
          land: css.getPropertyValue("--land-n").trim(),
          land2: css.getPropertyValue("--land-s").trim(),
          accent: css.getPropertyValue("--accent").trim(),
          atmo: css.getPropertyValue("--atmo").trim(),
          stars: "#b9c2ff",
          base: "#070a1c",
          glow: 1.35,
        }))
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
    initReveals();
    return;
  }

  // layout: globe sits right of the text on desktop, above it on phones
  const place = (phase: "hero" | "journey") => {
    if (isNarrow()) globe.layout(0, phase === "hero" ? 1.05 : 0.85);
    else globe.layout(phase === "hero" ? 0.95 : 0.5, 0);
  };
  isNarrow() ? globe.setLayoutNow(0, 1.05) : globe.setLayoutNow(0.95, 0);
  // opacity is left to the CSS transition (.at-globe:not(.is-live)); tweening it here too fights that transition
  gsap.fromTo(canvas, { scale: 0.92 }, { scale: 1, duration: 2, ease: "expo.out" });

  // labels follow their markers every frame
  const labels = [...labelsRoot.querySelectorAll<HTMLElement>("[data-label]")];
  globe.onFrame((pts) => {
    pts.forEach((p, i) => {
      labels[i].style.transform = `translate(${p.x}px, ${p.y}px)`;
      labels[i].style.opacity = String(Math.max(0, Math.min(1, (p.facing - 0.1) * 4)));
    });
  });

  let current = -2;
  const activate = (i: number) => {
    if (i === current) return;
    current = i;
    globe.focus(i);
    place(i < 0 ? "hero" : "journey");
    labels.forEach((l, k) => l.classList.toggle("is-active", k === i));
    stops.forEach((s, k) => {
      s.classList.toggle("is-current", k === i);
      s.classList.toggle("is-past", k < i);
    });
    const p = places[Math.max(0, i)];
    pos.textContent = `${coord(p.lat, p.lng)} · ${p.name}`;
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
  // a jump (anchor, End key, fast flick) can't skip past it; once faded, the loop stops drawing.
  // (progress, not isActive: at the very bottom a trigger ending at "max" counts as left)
  let away = false, awayTimer = 0;
  const setAway = (v: boolean) => {
    if (v === away) return;
    away = v;
    canvas.classList.toggle("is-away", v);
    labelsRoot.classList.toggle("is-away", v);
    clearTimeout(awayTimer);
    if (v) awayTimer = window.setTimeout(() => globe.setPaused(true), 850); // after the 0.8s fade
    else globe.setPaused(false);
  };
  ScrollTrigger.create({
    trigger: "#notebook", start: "top 45%", end: "max",
    onUpdate: (st) => setAway(st.progress > 0),
    onRefresh: (st) => setAway(st.progress > 0),
  });

  initReveals();
}

main();
