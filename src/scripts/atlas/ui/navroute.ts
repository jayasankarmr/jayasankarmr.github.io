// The nav's "01 Journey" underline as a micro-route: one tick per stop, and a line that fills with
// the journey as it is flown (scrubbed, so it runs back when you scroll back). Decorative — the
// journey's position is announced by its own live region.
export function navRoute(n: number) {
  const link = document.querySelector<HTMLElement>('.site-nav__links a[aria-current="page"]');
  if (!link) return { set(_pos: number) {} };
  const el = document.createElement("span");
  el.className = "nav-route";
  el.setAttribute("aria-hidden", "true");
  const fill = document.createElement("span");
  fill.className = "nav-route__fill";
  el.appendChild(fill);
  const ticks = Array.from({ length: n }, (_, k) => {
    const t = document.createElement("i");
    t.style.left = `${((k / Math.max(1, n - 1)) * 100).toFixed(3)}%`;
    return el.appendChild(t);
  });
  link.appendChild(el);
  link.classList.add("has-route");

  let lastFill = -1, lastLit = -1;
  return {
    /** Journey position in stops: 0 at the first, n − 1 at the last, fractional in flight. */
    set(pos: number) {
      const f = Math.round((Math.max(0, Math.min(n - 1, pos)) / Math.max(1, n - 1)) * 1000) / 1000;
      if (f !== lastFill) {
        lastFill = f;
        fill.style.transform = `scaleX(${f})`;
      }
      const lit = Math.floor(pos + 1e-3);
      if (lit !== lastLit) {
        lastLit = lit;
        ticks.forEach((t, k) => t.classList.toggle("is-on", k <= lit));
      }
    },
  };
}
