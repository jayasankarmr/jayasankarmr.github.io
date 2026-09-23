// Intro loader (first page of a visit only): counts 0→100 against real readiness (fonts + listed images),
// never faster than `minMs`, then resolves so the page can play its entrance.
import { gsap } from "./smooth";
import { reducedMotion } from "./env";

export async function runLoader(el: HTMLElement | null, images: string[] = [], minMs = 1400) {
  const html = document.documentElement;
  // the intro plays once per visit; moving between pages shouldn't replay it
  let seen = false;
  try {
    seen = sessionStorage.getItem("jmr-intro") === "1";
    sessionStorage.setItem("jmr-intro", "1");
  } catch { /* storage blocked — play it */ }
  if (!el || reducedMotion() || seen) {
    el?.remove();
    html.classList.add("is-loaded");
    return;
  }
  html.classList.add("loader-running"); // tells the Base.astro failsafe that JS is in charge
  const count = el.querySelector<HTMLElement>("[data-loader-count]");
  const bar = el.querySelector<HTMLElement>("[data-loader-bar]");
  const tasks: Promise<unknown>[] = [
    document.fonts.ready,
    ...images.map((src) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = src; })),
  ];
  let done = 0;
  const state = { v: 0 };
  const target = () => (done / tasks.length) * 100;
  tasks.forEach((t) => t.then(() => done++));

  const start = performance.now();
  let last = start;
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = performance.now();
      const elapsed = t - start;
      const cap = Math.min(100, (elapsed / minMs) * 100);
      // frame-rate independent easing: same feel at 60Hz, 120Hz or a throttled tab
      state.v += (Math.min(cap, target()) - state.v) * (1 - Math.exp(-(t - last) / 110));
      last = t;
      if (count) count.textContent = String(Math.round(state.v)).padStart(3, "0");
      if (bar) bar.style.transform = `scaleX(${state.v / 100})`;
      if (state.v > 99.5 && elapsed >= minMs) {
        if (count) count.textContent = "100";
        resolve();
      } else requestAnimationFrame(tick);
    };
    tick();
  });
  html.classList.add("is-loaded");
  await gsap.to(el, { clipPath: "inset(0 0 100% 0)", duration: 1, ease: "expo.inOut" });
  el.remove();
}
