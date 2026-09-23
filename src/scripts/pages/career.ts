// Career & projects: page choreography.
import { initSmooth, gsap, ScrollTrigger } from "../motion/smooth";
import { initCursor } from "../motion/cursor";
import { initReveals } from "../motion/reveal";
import { runLoader } from "../motion/loader";
import { scramble, typeOut } from "../motion/scramble";
import { richMotion, reducedMotion, finePointer } from "../motion/env";

async function main() {
  const lenis = initSmooth();
  initCursor();

  const hero = document.querySelector<HTMLElement>("[data-hero]")!;
  const canvas = document.querySelector<HTMLCanvasElement>("[data-hero-canvas]")!;
  const css = getComputedStyle(document.body);
  const glHero = richMotion()
    ? import("../gl/particles")
        .then((m) => m.initParticleName(canvas, {
          ink: css.getPropertyValue("--ink").trim(),
          accent: css.getPropertyValue("--signal").trim(),
          font: '"Archivo"',
        }))
        .catch((e) => { console.warn(e); return null; })
    : Promise.resolve(null);

  await runLoader(document.querySelector("[data-loader]"), [], 1600);
  const gl = await glHero;
  gl?.assemble();

  if (!reducedMotion()) {
    ScrollTrigger.create({
      trigger: hero, start: "top top", end: "bottom top", scrub: true,
      onUpdate: (st) => gl?.setScroll(st.progress),
    });
  }

  initCrosshair();
  initScrollReadout(lenis);
  initLog();
  initReveals();
}

function initCrosshair() {
  if (!finePointer() || reducedMotion()) return;
  const root = document.querySelector<HTMLElement>("[data-cross]")!;
  const h = root.querySelector<HTMLElement>(".bp-cross__h")!;
  const v = root.querySelector<HTMLElement>(".bp-cross__v")!;
  const read = root.querySelector<HTMLElement>("[data-cross-read]")!;
  window.addEventListener("pointermove", (e) => {
    root.classList.add("is-on");
    h.style.transform = `translateY(${e.clientY}px)`;
    v.style.transform = `translateX(${e.clientX}px)`;
    read.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
    read.textContent = `X ${(e.clientX / innerWidth).toFixed(3)} · Y ${((e.clientY + scrollY) / document.documentElement.scrollHeight).toFixed(3)}`;
  }, { passive: true });
  document.addEventListener("pointerleave", () => root.classList.remove("is-on"));
}

function initScrollReadout(lenis: ReturnType<typeof initSmooth>) {
  const el = document.querySelector<HTMLElement>("[data-scroll-pct]");
  if (!el) return;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    el.textContent = ((scrollY / Math.max(1, max)) * 100).toFixed(1).padStart(5, "0");
  };
  if (lenis) lenis.on("scroll", update);
  else addEventListener("scroll", update, { passive: true });
  update();
}

function initLog() {
  if (reducedMotion()) return;
  const cmd = document.querySelector<HTMLElement>("[data-type]");
  if (cmd) {
    const text = cmd.textContent;
    cmd.style.visibility = "hidden";
    ScrollTrigger.create({
      trigger: cmd, start: "top 85%", once: true,
      onEnter: () => { cmd.style.visibility = ""; cmd.textContent = text; typeOut(cmd); },
    });
  }
  // each commit draws its graph segment, pops its node, and scrambles its message in
  document.querySelectorAll<HTMLElement>("[data-commit]").forEach((row) => {
    const paths = row.querySelectorAll<SVGPathElement>("path");
    const node = row.querySelector(".bp-commit__node");
    const msg = row.querySelector<HTMLElement>("[data-scramble]");
    paths.forEach((p) => {
      const len = p.getTotalLength();
      gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
    });
    const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 80%", end: "bottom 60%", scrub: 0.6 } });
    tl.to(paths, { strokeDashoffset: 0, ease: "none" });
    gsap.from(node, { scale: 0, duration: 0.6, ease: "back.out(3)", scrollTrigger: { trigger: row, start: "top 75%" } });
    gsap.from(row.querySelectorAll(".bp-commit__meta, .bp-commit__sum, .bp-commit__tags, .bp-commit__date"), {
      opacity: 0, y: 14, duration: 0.9, ease: "expo.out", stagger: 0.06,
      scrollTrigger: { trigger: row, start: "top 75%", onEnter: () => msg && scramble(msg) },
    });
  });
}

main();
