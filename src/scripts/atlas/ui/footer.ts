// The last beat: as "Where next?" arrives, a dashed amber flight path takes off from the journey's
// last stop (a pin above "Next stop") and drops into the question mark, which lights up as it
// lands. Scrubbed, so scrolling back undraws it; under reduced motion it is simply there.
// Decorative: it has no destination.
import { ScrollTrigger } from "../../motion/smooth";

const NS = "http://www.w3.org/2000/svg";

export function footerArc(footer: HTMLElement, lastStop: string, reduced: boolean) {
  const cta = footer.querySelector<HTMLElement>(".at-footer__cta");
  const kicker = footer.querySelector<HTMLElement>(".at-kicker");
  if (!cta || !kicker) return;
  const svg = document.createElementNS(NS, "svg");
  svg.classList.add("ft-arc");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<defs><mask id="ft-arc-m" maskUnits="userSpaceOnUse"><path class="ft-arc__draw"/></mask></defs>' +
    '<path class="ft-arc__path" mask="url(#ft-arc-m)"/>' +
    '<g class="ft-arc__from"><circle class="ft-arc__ring" r="9"/><circle r="3.5"/><text x="16" y="4"></text></g>' +
    '<circle class="ft-arc__head" r="3"/>';
  svg.querySelector("text")!.textContent = lastStop;
  footer.prepend(svg);
  const draw = svg.querySelector<SVGPathElement>(".ft-arc__draw")!;
  const path = svg.querySelector<SVGPathElement>(".ft-arc__path")!;
  const from = svg.querySelector<SVGGElement>(".ft-arc__from")!;
  const head = svg.querySelector<SVGCircleElement>(".ft-arc__head")!;

  /** An element's box in the footer's own coordinates. Offsets, so the scroll skew (a transform
   *  on the CTA) never moves the target. */
  const box = (el: HTMLElement) => {
    let x = 0, y = 0, e: HTMLElement | null = el;
    while (e && e !== footer) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent as HTMLElement | null; }
    return e === footer ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : null;
  };

  // the "?": its own character once the reveal has split the CTA; otherwise measured as a glyph
  const qBox = () => {
    const chars = cta.querySelectorAll<HTMLElement>(".split-char");
    const last = chars[chars.length - 1];
    const mask = last?.textContent === "?" ? last.parentElement : null;
    if (mask) {
      mask.classList.add("ft-q"); // lights up as the path lands
      return box(mask);
    }
    const walker = document.createTreeWalker(cta, NodeFilter.SHOW_TEXT);
    let node: Text | null = null, n: Node | null;
    while ((n = walker.nextNode())) if (n.textContent?.includes("?")) node = n as Text;
    if (!node) return null;
    const r = document.createRange();
    const k = node.textContent!.lastIndexOf("?");
    r.setStart(node, k);
    r.setEnd(node, k + 1);
    const q = r.getBoundingClientRect(), fr = footer.getBoundingClientRect();
    return { x: q.left - fr.left, y: q.top - fr.top, w: q.width, h: q.height };
  };

  let len = 1, p = reduced ? 1 : 0;

  /** Build the path in footer coordinates; the svg reaches a little above the footer for the apex. */
  const layout = () => {
    const q = qBox(), k = box(kicker);
    if (!q || !q.w || !k) return;
    const pad = 240, W = footer.offsetWidth, H = footer.offsetHeight + pad;
    svg.setAttribute("viewBox", `0 ${-pad} ${W} ${H}`);
    svg.style.top = `${-pad}px`;
    svg.style.height = `${H}px`;
    const s = { x: k.x + 4, y: k.y - Math.max(44, k.h * 3) };
    const e = { x: q.x + q.w * 0.54, y: q.y + q.h * 0.18 };
    const dx = e.x - s.x;
    const top = Math.min(s.y, e.y) - Math.min(200, Math.max(90, dx * 0.2));
    const d = `M${s.x.toFixed(1)} ${s.y.toFixed(1)}C${(s.x + dx * 0.22).toFixed(1)} ${top.toFixed(1)} ${(e.x - dx * 0.04).toFixed(1)} ${top.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
    path.setAttribute("d", d);
    draw.setAttribute("d", d);
    from.setAttribute("transform", `translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`);
    len = path.getTotalLength() || 1;
    draw.style.strokeDasharray = `${len}`;
    paint();
  };

  const paint = () => {
    draw.style.strokeDashoffset = `${len * (1 - p)}`;
    const pt = path.getPointAtLength(len * p);
    head.setAttribute("cx", pt.x.toFixed(1));
    head.setAttribute("cy", pt.y.toFixed(1));
    footer.classList.toggle("is-leaving", p > 0.01);
    footer.classList.toggle("is-flying", p > 0.02 && p < 0.985);
    footer.classList.toggle("is-arrived", p >= 0.985);
  };

  // the split reveal and web fonts both move the "?": lay out again whenever the CTA resizes
  new ResizeObserver(layout).observe(cta);
  if (reduced) { layout(); return; }
  const endY = () => Math.min(ScrollTrigger.maxScroll(window), footer.getBoundingClientRect().top + scrollY - innerHeight * 0.3);
  ScrollTrigger.create({
    trigger: footer, start: "top 92%", end: endY,
    onRefresh: layout,
    onUpdate: (st) => { p = st.progress; paint(); },
  });
}
