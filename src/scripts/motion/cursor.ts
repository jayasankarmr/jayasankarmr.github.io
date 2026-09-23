// Custom cursor: a dot that tracks exactly and a ring that trails.
// [data-cursor="label"] grows the ring and shows the label; [data-magnetic] pulls toward the pointer.
import { gsap } from "./smooth";
import { finePointer, reducedMotion } from "./env";

export function initCursor() {
  if (!finePointer() || reducedMotion()) return;
  const root = document.createElement("div");
  root.className = "cursor";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = '<span class="cursor__ring"><span class="cursor__label"></span></span><span class="cursor__dot"></span>';
  document.body.appendChild(root);
  document.documentElement.classList.add("has-cursor");

  const ring = root.querySelector<HTMLElement>(".cursor__ring")!;
  const dot = root.querySelector<HTMLElement>(".cursor__dot")!;
  const label = root.querySelector<HTMLElement>(".cursor__label")!;
  const rx = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3" });
  const ry = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3" });
  const dx = gsap.quickTo(dot, "x", { duration: 0.08, ease: "power3" });
  const dy = gsap.quickTo(dot, "y", { duration: 0.08, ease: "power3" });

  window.addEventListener("pointermove", (e) => {
    rx(e.clientX); ry(e.clientY); dx(e.clientX); dy(e.clientY);
    root.classList.add("is-active");
  }, { passive: true });
  document.addEventListener("pointerleave", () => root.classList.remove("is-active"));

  document.addEventListener("pointerover", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-cursor], a, button");
    root.classList.toggle("is-hover", !!t);
    const text = t?.dataset.cursor ?? "";
    label.textContent = text;
    root.classList.toggle("has-label", !!text);
  });

  document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
    const strength = Number(el.dataset.magnetic) || 0.35;
    const mx = gsap.quickTo(el, "x", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
    const my = gsap.quickTo(el, "y", { duration: 0.6, ease: "elastic.out(1, 0.4)" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      mx((e.clientX - (r.left + r.width / 2)) * strength);
      my((e.clientY - (r.top + r.height / 2)) * strength);
    });
    el.addEventListener("pointerleave", () => { mx(0); my(0); });
  });
}
