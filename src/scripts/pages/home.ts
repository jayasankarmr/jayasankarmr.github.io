// Home: wires the page to the atlas. The SceneDirector owns the camera; the journey UI turns
// scroll into journey position and keeps the rail, cards and announcements in step; labels
// lay themselves out around the projected stops every frame.
import { initSmooth, gsap, ScrollTrigger, lenis } from "../motion/smooth";
import { initCursor } from "../motion/cursor";
import { initReveals } from "../motion/reveal";
import { reducedMotion, finePointer } from "../motion/env";
import { registerMotion, ramp, smooth } from "../atlas/motion";
import { detectTier } from "../atlas/tier";
import { buildLegs } from "../atlas/journey";
import { readout } from "../atlas/ui/readout";
import type { StopInfo } from "../atlas/ui/journey";
import { atlasCursor } from "../atlas/ui/cursor";
import { navRoute } from "../atlas/ui/navroute";
import { initSkew } from "../atlas/ui/skew";
import { film } from "../atlas/ui/film";
import { clamp } from "../atlas/motion";
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
  const cursor = atlasCursor(initCursor());
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
  const route = navRoute(stops.length);
  // no flight to follow (list layout, or no WebGL): the micro-route tracks the list of passes,
  // by scroll progress so a jump past the journey still completes it
  const routeByList = () => ScrollTrigger.create({
    trigger: section, start: "top 50%", end: "bottom 50%",
    onUpdate: (st) => route.set(st.progress * (stops.length - 1)),
    onRefresh: (st) => route.set(st.progress * (stops.length - 1)),
  });
  // past the journey (however you got there: a flick, End, an anchor), the nav's readout rests
  // on the last stop rather than on whatever it was showing when the journey was skipped
  const lastStop = stops[stops.length - 1];
  const settleReadout = (st: ScrollTrigger) => { if (st.progress >= 1) pos.set(lastStop.lat, lastStop.lng, lastStop.name); };
  ScrollTrigger.create({ trigger: section, start: "top top", end: "bottom top", onUpdate: settleReadout, onRefresh: settleReadout });
  // display type leans with the scroll (desktop: phones scroll natively, and it would only cost them)
  if (rich && finePointer()) initSkew([...document.querySelectorAll<HTMLElement>(".at-hero__title, .lb__title, .at-live__title, .at-footer__cta")]);

  // the second wave (journey deck, labels, the sections below) loads alongside the scene
  const laterP = import("./home-later");
  const tier = detectTier();
  document.documentElement.dataset.tier = tier.name;
  const globeP: Promise<Director | null> = tier.name !== "none"
    ? import("../atlas/scene")
        .then((m) => m.createAtlas(canvas, stops, tier))
        .catch((e) => { console.warn(e); return null; })
    : Promise.resolve(null);

  // the hero's type is already rising (CSS, from first paint); the globe joins when it's ready
  const [globe, { JourneyUI, Labels, initLogbook, initTickets, footerArc }] = await Promise.all([globeP, laterP]);
  globeRef = globe;

  if (!globe) {
    section.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => { img.loading = "lazy"; img.src = img.dataset.src!; });
    document.documentElement.classList.add("no-globe");
    // the static map (built from the same data at build time) stands in for the scene
    const map = new Image();
    map.className = "at-map-static";
    map.alt = "";
    map.decoding = "async";
    map.src = "/atlas-map.svg";
    canvas.replaceWith(map);
    film(map, false);
    labelsRoot.remove();
    document.querySelector("[data-globe-ctl]")?.remove();
    initTickets(document.querySelector<HTMLElement>("#live")!, { reduced: !rich, fine: matchMedia("(hover: hover) and (pointer: fine)").matches });
    routeByList();
    initReveals();
    footerArc(document.querySelector<HTMLElement>("#contact")!, stops[stops.length - 1].name, !rich);
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
  cursor.attach(globe);
  film(canvas, !tier.mobile && tier.name !== "low");

  const labels = new Labels(labelsRoot, stops);
  const heroCol = document.querySelector<HTMLElement>(".at-hero__col");
  // the WebGL photo dissolve is a desktop-tier luxury; phones get a composited CSS reveal
  const ui = new JourneyUI(section, stops, legs, !rich, !tier.mobile && tier.name !== "low");
  (window as unknown as { __atlasQA: unknown }).__atlasQA = { stopY: (i: number) => ui.stopScrollY(i), stops: stops.length, director: globe };

  // the stop the page shows: cards + rail (UI), the readout decodes into it
  globe.onStop((i, dir) => {
    if (globe.mode === "unroll" || globe.mode === "map") return; // map highlights aren't journey stops
    ui.setActive(i, dir);
    const p = stops[Math.max(0, i)];
    if (i >= 0 || !rich) pos.set(p.lat, p.lng, p.name);
  });

  if (rich) {
    // the deck: a sticky stage the scroll pilots
    section.classList.add("is-deck");
    ui.measure();
    ScrollTrigger.refresh();
    // after the last stop: the unroll (as the logbook enters), the map's drift, the tickets' dimming
    const nb = document.querySelector<HTMLElement>("#notebook")!, live = document.querySelector<HTMLElement>("#live")!;
    let nbTop = 0, nbH = 1, liveTop = 0;
    const measureAfter = () => {
      nbTop = nb.getBoundingClientRect().top + scrollY;
      nbH = nb.offsetHeight;
      liveTop = live.getBoundingClientRect().top + scrollY;
    };
    measureAfter();
    new ResizeObserver(measureAfter).observe(document.body);
    globe.scrollSource = () => {
      const s = ui.read(scrollY), vh = innerHeight;
      return {
        ...s,
        unroll: clamp((scrollY - (nbTop - vh)) / (vh * 1.05)),
        ambient: clamp((scrollY - nbTop) / nbH),
        dim: clamp((scrollY - (liveTop - vh)) / (vh * 0.7)),
      };
    };
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
    routeByList();
    // list layout: every pass is on the page, so its photo can lazy-load natively
    section.querySelectorAll<HTMLImageElement>("img[data-src]").forEach((img) => { img.loading = "lazy"; img.src = img.dataset.src!; });
    // each pass cuts the globe to its stop as it reaches the middle of the screen
    section.querySelectorAll<HTMLElement>("[data-card]").forEach((card, i) => {
      ScrollTrigger.create({ trigger: card, start: "top 55%", end: "bottom 55%", onToggle: (st) => st.isActive && globe.focus(i) });
    });
    ScrollTrigger.create({ trigger: section, start: "top 55%", onLeaveBack: () => globe.focus(-1) });
    // the logbook's backdrop: a crossfade to the flat map instead of the unroll
    ScrollTrigger.create({
      trigger: "#notebook", start: "top 60%",
      onEnter: () => fade(() => globe.setMapInstant(true)),
      onLeaveBack: () => fade(() => globe.setMapInstant(false)),
    });
    const fade = (swap: () => void) => {
      canvas.style.transition = "opacity 0.25s";
      canvas.style.opacity = "0";
      window.setTimeout(() => { swap(); canvas.style.opacity = ""; }, 260);
    };
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
    labels.solo = d.mode === "unroll" || d.mode === "map";
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
    // the nav's micro-route: stops reached, plus the leg in flight; complete once the world unrolls
    route.set(d.mode === "unroll" || d.mode === "map" ? stops.length - 1 : d.flying >= 0 ? d.flying + d.comet : Math.max(0, d.active));
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
  // the flat map stays on as the logbook's backdrop; once the footer (opaque, and short enough
  // that its top may never climb far) is well in view, the scene stops drawing
  ScrollTrigger.create({
    trigger: "#contact", start: "top 70%", end: "max",
    onUpdate: (st) => setAway(st.progress > 0),
    onRefresh: (st) => setAway(st.progress > 0),
  });

  initTickets(document.querySelector<HTMLElement>("#live")!, {
    reduced: !rich,
    fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
    highlight: (i) => globe.setHighlight(i),
  });
  initLogbook(document.querySelector<HTMLElement>("#notebook")!, {
    reduced: !rich,
    fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
    glPhoto: !tier.mobile && tier.name !== "low",
    highlight: (i) => globe.setHighlight(i),
  });
  initReveals();
  footerArc(document.querySelector<HTMLElement>("#contact")!, stops[stops.length - 1].name, !rich);
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
