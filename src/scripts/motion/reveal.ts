// Scroll reveals: [data-reveal] fades up; [data-reveal="split"] staggers its words.
import { gsap, ScrollTrigger } from "./smooth";
import { split } from "./split";
import { reducedMotion } from "./env";

export function initReveals(root: ParentNode = document) {
  if (reducedMotion()) return;
  root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
    const kind = el.dataset.reveal;
    const start = el.dataset.revealStart ?? "top 85%";
    if (kind === "split" || kind === "chars") {
      const parts = split(el, kind === "chars" ? "chars" : "words");
      gsap.set(el, { opacity: 1 });
      gsap.from(parts, {
        yPercent: 110,
        rotate: kind === "chars" ? 6 : 2,
        duration: 1.1,
        ease: "expo.out",
        stagger: kind === "chars" ? 0.018 : 0.045,
        scrollTrigger: { trigger: el, start },
      });
    } else {
      gsap.fromTo(
        el,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: el, start } }
      );
    }
  });
  ScrollTrigger.refresh();
}
