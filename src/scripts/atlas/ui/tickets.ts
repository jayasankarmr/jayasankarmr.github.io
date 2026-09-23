// "Some stops were for the music." As the section arrives the page's accent blends from amber
// to pink (and back at the footer); the tickets come in as a stack that fans out into the grid,
// each settling from a slight tilt; the foil catches the pointer's angle; a stub tears a little on
// hover; a click flips a ticket to its back (venue, date, a real barcode). Hovering a ticket
// pings its city on the map when the city is one of the journey's stops.
import { gsap, ScrollTrigger } from "../../motion/smooth";
import { stagger } from "../motion";
import { grain } from "./grain";

type Opts = { reduced: boolean; fine: boolean; highlight?: (i: number) => void };

export function initTickets(section: HTMLElement, o: Opts) {
  const grid = section.querySelector<HTMLElement>("[data-tickets]")!;
  const slots = [...grid.children] as HTMLElement[];
  const tickets = [...grid.querySelectorAll<HTMLButtonElement>("[data-ticket]")];

  // accent: amber → pink as the section arrives, pink → amber as the footer takes over. Set only
  // on the elements whose CSS re-declares the accent (the nav, this section's head, the footer,
  // the cursor)
  const scoped = [document.querySelector(".site-nav"), section.querySelector(".tk__head"), document.getElementById("contact"), document.querySelector(".cursor")]
    .filter((el): el is HTMLElement => !!el);
  let live = 0, foot = 0, last = "";
  const apply = () => {
    const v = (live * (1 - foot)).toFixed(2);
    if (v === last) return;
    last = v;
    for (const el of scoped) el.style.setProperty("--accent-mix", v);
  };
  ScrollTrigger.create({ trigger: section, start: "top 90%", end: "top 35%", onUpdate: (st) => { live = st.progress; apply(); } });
  ScrollTrigger.create({ trigger: "#contact", start: "top 95%", end: "top 55%", onUpdate: (st) => { foot = st.progress; apply(); } });

  tickets.forEach((t) => {
    // the flip's 3D (and its back face) is built on first contact, not at load
    const arm = () => t.classList.add("is-3d");
    for (const ev of ["pointerenter", "pointerdown", "focus"]) t.addEventListener(ev, arm, { once: true });
    t.addEventListener("click", () => {
      arm();
      t.setAttribute("aria-pressed", String(t.getAttribute("aria-pressed") !== "true"));
    });
    const stop = t.dataset.stop;
    if (stop !== undefined && o.highlight) {
      t.addEventListener("pointerenter", () => o.highlight!(+stop));
      t.addEventListener("pointerleave", () => o.highlight!(-1));
    }
  });

  // The rest is armed a viewport ahead of the section: nothing is measured or tweened at
  // start-up, and until then the tickets simply sit in their grid.
  const near = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    near.disconnect();
    grain(grid);
    if (!o.reduced) fanOut();
    if (o.fine && !o.reduced) tickets.forEach(tilt);
  }, { rootMargin: "100% 0px" });
  near.observe(grid);

  // the stack fans out into the grid (scrubbed: scrolling back re-stacks it)
  function fanOut() {
    const centre = () => ({ x: grid.offsetWidth / 2, y: Math.min(grid.offsetHeight, 420) / 2 });
    const off = (el: HTMLElement) => ({ x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2 });
    const rot = (i: number) => [-7, 5, -3, 8, -6, 4, -9, 6][i % 8];
    slots.forEach((s, i) => (s.style.zIndex = String(10 + i)));
    gsap.fromTo(slots, {
      x: (i: number) => centre().x - off(slots[i]).x,
      y: (i: number) => centre().y - off(slots[i]).y,
      rotation: (i: number) => rot(i),
      scale: 0.9,
    }, {
      x: 0, y: 0, rotation: 0, scale: 1, ease: "power3.out", stagger: stagger.ticket,
      scrollTrigger: { trigger: grid, start: "top 92%", end: "top 38%", scrub: 0.7, invalidateOnRefresh: true },
    });
  }

  // tilt toward the pointer; the foil's sheen follows its angle
  function tilt(t: HTMLButtonElement) {
    gsap.set(t, { transformPerspective: 900 });
    const rx = gsap.quickTo(t, "rotationX", { duration: 0.6, ease: "power3" });
    const ry = gsap.quickTo(t, "rotationY", { duration: 0.6, ease: "power3" });
    t.addEventListener("pointermove", (e) => {
      const r = t.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      rx(-(y - 0.5) * 7);
      ry((x - 0.5) * 9);
      t.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      t.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      t.style.setProperty("--ang", ((Math.atan2(y - 0.5, x - 0.5) * 180) / Math.PI).toFixed(1));
    });
    t.addEventListener("pointerleave", () => { rx(0); ry(0); });
  }

  // the waveform only runs while the headline is on screen
  const io = new IntersectionObserver(([e]) => section.classList.toggle("is-on", e.isIntersecting));
  io.observe(section.querySelector(".tk__titlewrap") ?? section);
}
