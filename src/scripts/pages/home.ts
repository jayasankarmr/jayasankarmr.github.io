// Home: wires the page to the atlas. The SceneDirector owns the camera; the journey UI turns
// scroll into journey position and keeps the rail, cards and announcements in step; labels
// lay themselves out around the projected stops every frame.
import { initSmooth, gsap, ScrollTrigger, lenis } from "../motion/smooth";
import { initCursor } from "../motion/cursor";
import { initReveals } from "../motion/reveal";
import { reducedMotion } from "../motion/env";
import { registerMotion, ramp, smooth } from "../atlas/motion";
import { detectTier } from "../atlas/tier";
import { buildLegs } from "../atlas/journey";
import { readout } from "../atlas/ui/readout";
import { JourneyUI, type StopInfo } from "../atlas/ui/journey";
import { Labels } from "../atlas/labels";
import type { Director } from "../atlas/scene";

/** First visit this session plays the full opening; the flag is set as soon as it starts. */
function introKind(): "full" | "short" {
  let seen = false;
  try {
    seen = sessionStorage.getItem("jmr-intro") === "1";
    sessionStorage.setItem("jmr-intro", "1");
  } catch { /* storage blocked: treat as a first visit */ }
  return seen ? "short" : "full";
}

/** Any input fast-forwards the opening (CSS reveals and the globe alike). */
function skippable(onSkip: () => void) {
  const skip = () => {
    document.documentElement.classList.add("intro-skip");
    for (const a of document.getAnimations()) {
      if (!(a instanceof CSSAnimation) || !/^(ch-|sweep|in-|intro-)/.test(a.animationName)) continue;
      if (a.effect?.getComputedTiming().iterations === Infinity) continue;
      a.playbackRate = 6;
    }
    onSkip();
    ["wheel", "keydown", "pointerdown", "touchstart"].forEach((ev) => removeEventListener(ev, skip));
  };
  ["wheel", "keydown", "pointerdown", "touchstart"].forEach((ev) => addEventListener(ev, skip, { passive: true }));
}

async function main() {
  registerMotion(gsap);
  initSmooth();
  initCursor();
  document.documentElement.classList.add("is-loaded");
  const kind = introKind();
  let globeRef: Director | null = null;
  skippable(() => globeRef?.skipIntro());

  const canvas = document.querySelector<HTMLCanvasElement>("[data-globe]")!;
  const labelsRoot = document.querySelector<HTMLElement>("[data-labels]")!;
  const section = document.querySelector<HTMLElement>("[data-journey]")!;
  const stops: StopInfo[] = JSON.parse(section.dataset.stops!);
  const legs = buildLegs(stops);
  const pos = readout(document.querySelector<HTMLElement>("[data-pos]")!, reducedMotion());
  const rich = !reducedMotion();

  const tier = detectTier();
  document.documentElement.dataset.tier = tier.name;
  const globeP: Promise<Director | null> = tier.name !== "none"
    ? import("../atlas/scene")
        .then((m) => m.createAtlas(canvas, stops, tier))
        .catch((e) => { console.warn(e); return null; })
    : Promise.resolve(null);

  // the hero's type is already rising (CSS, from first paint); the globe joins when it's ready
  const globe = await globeP;
  globeRef = globe;

  if (!globe) {
    section.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => { img.loading = "lazy"; img.src = img.dataset.src!; });
    document.documentElement.classList.add("no-globe");
    canvas.remove();
    labelsRoot.remove();
    document.querySelector("[data-globe-ctl]")?.remove();
    initReveals();
    return;
  }

  // the opening: the full pull-back only if the pin is still on screen (the scene arrived early)
  const late = performance.now() > 1400 || document.documentElement.classList.contains("intro-skip");
  const glKind = !rich ? "none" : kind === "full" && !late ? "full" : "short";
  globe.intro(glKind);
  const pin = document.querySelector<HTMLElement>("[data-intro-pin]");
  if (glKind === "full" && pin) document.documentElement.classList.add("intro-gl");
  else pin?.parentElement?.remove();
  lenis?.on("scroll", () => globe.setScrollVelocity(lenis?.velocity ?? 0));
  initGlobeControl(globe);

  const labels = new Labels(labelsRoot, stops);
  const heroCol = document.querySelector<HTMLElement>(".at-hero__col");
  // the WebGL photo dissolve is a desktop-tier luxury; phones get a composited CSS reveal
  const ui = new JourneyUI(section, stops, legs, !rich, !tier.mobile && tier.name !== "low");
  (window as unknown as { __atlasQA: unknown }).__atlasQA = { stopY: (i: number) => ui.stopScrollY(i), stops: stops.length, director: globe };

  // the stop the page shows: cards + rail (UI), the readout decodes into it
  globe.onStop((i, dir) => {
    ui.setActive(i, dir);
    const p = stops[Math.max(0, i)];
    if (i >= 0 || !rich) pos.set(p.lat, p.lng, p.name);
  });

  if (rich) {
    // the deck: a sticky stage the scroll pilots
    section.classList.add("is-deck");
    ui.measure();
    ScrollTrigger.refresh();
    globe.scrollSource = () => ui.read(scrollY);
    const safeArea = () => {
      const deck = section.querySelector<HTMLElement>("[data-deck]")!.getBoundingClientRect();
      const w = innerWidth, h = innerHeight;
      globe.setSafeArea(globe.wide
        ? { x: deck.right + 24, y: 72, w: Math.max(80, w - deck.right - 24), h: h - 72 }
        : { x: 0, y: 108, w, h: Math.max(120, h * 0.56 - 108) });
    };
    safeArea();
    addEventListener("resize", safeArea);
  } else {
    // list layout: every pass is on the page, so its photo can lazy-load natively
    section.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => { img.loading = "lazy"; img.src = img.dataset.src!; });
    // each pass cuts the globe to its stop as it reaches the middle of the screen
    section.querySelectorAll<HTMLElement>("[data-card]").forEach((card, i) => {
      ScrollTrigger.create({ trigger: card, start: "top 55%", end: "bottom 55%", onToggle: (st) => st.isActive && globe.focus(i) });
    });
    ScrollTrigger.create({ trigger: section, start: "top 55%", onLeaveBack: () => globe.focus(-1) });
  }

  let liveAt = 0;
  globe.onFrame((d, dt) => {
    // the intro pin rides Thrissur as the planet recedes, then hands over to the markers
    if (pin?.isConnected) {
      const ip = d.introProgress;
      const p0 = d.projected[0];
      pin.style.transform = `translate3d(${p0.x.toFixed(1)}px, ${p0.y.toFixed(1)}px, 0)`;
      pin.style.opacity = String(1 - smooth(ramp(ip, 0.28, 0.5)));
      if (ip >= 1) pin.parentElement?.remove();
    }
    const w = innerWidth, h = innerHeight;
    labels.active = d.active;
    labels.reached = d.reached;
    labels.enabled = d.introProgress > 0.88; // no labels until the planet has assembled
    labels.reserved = () => {
      const r = ui.reserved();
      if (d.mode === "hero" || d.mode === "dive") {
        const b = heroCol?.getBoundingClientRect();
        if (b && b.bottom > 0) r.push({ x: b.left - 16, y: b.top - 16, w: b.width + 32, h: b.height + 32 });
      }
      return r;
    };
    labels.update(d.projected, dt, w, h);
    if (!rich) return;
    const s = ui.read(scrollY);
    ui.frame(d.altitude, d.comet);
    ui.settle(s.inJourney);
    // in flight, the readout ticks through the camera's real coordinates
    if (d.flying >= 0 && performance.now() - liveAt > 70) {
      liveAt = performance.now();
      const el = document.querySelector<HTMLElement>("[data-pos] [data-fx]");
      if (el) el.textContent = JourneyUI.transitText(d.pose.lat, d.pose.lng, stops[d.flying + 1].name);
    }
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
