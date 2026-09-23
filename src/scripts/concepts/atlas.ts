// Concept C — Atlas: page choreography around a fixed globe.
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
  const places = stops.map((s) => ({ lat: +s.dataset.lat!, lng: +s.dataset.lng!, name: s.dataset.name! }));
  const pos = document.querySelector<HTMLElement>("[data-pos]")!;
  const css = getComputedStyle(document.body);

  const globeP = richMotion()
    ? import("../gl/globe")
        .then((m) => m.initGlobe(canvas, places, {
          land: css.getPropertyValue("--ink").trim(),
          accent: css.getPropertyValue("--gold").trim(),
          atmo: "#6f9bd8",
          base: "#08101d",
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
  gsap.fromTo(canvas, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 2, ease: "expo.out" });

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
      gsap.from(stop.querySelector(".at-stop__card"), {
        opacity: 0, y: 60, duration: 1.2, ease: "expo.out",
        scrollTrigger: { trigger: stop, start: "top 70%" },
      });
    }
  });
  ScrollTrigger.create({
    trigger: stops[0], start: "top 55%",
    onLeaveBack: () => activate(-1),
  });

  // globe steps back once the notebook takes over
  ScrollTrigger.create({
    trigger: "#notebook", start: "top 45%",
    onToggle: (st) => {
      canvas.classList.toggle("is-away", st.isActive || st.progress > 0);
      labelsRoot.classList.toggle("is-away", st.isActive || st.progress > 0);
    },
  });

  initReveals();
}

main();
