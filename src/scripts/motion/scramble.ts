// Text scramble: characters resolve left→right out of random glyphs.
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>_-+=*#";

/**
 * Splits el into a visually hidden copy of its text (what screen readers hear, once) and an
 * aria-hidden span the effect writes into. Idempotent.
 */
function visualTarget(el: HTMLElement) {
  let vis = el.querySelector<HTMLElement>(":scope > [data-fx]");
  if (!vis) {
    const text = el.textContent ?? "";
    el.dataset.final = text;
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = text;
    vis = document.createElement("span");
    vis.dataset.fx = "";
    vis.setAttribute("aria-hidden", "true");
    vis.textContent = text;
    el.replaceChildren(sr, vis);
  }
  return { vis, final: el.dataset.final ?? "" };
}

export function scramble(el: HTMLElement, duration = 900) {
  const { vis, final } = visualTarget(el);
  const start = performance.now();
  const frame = () => {
    const p = Math.min(1, (performance.now() - start) / duration);
    const settled = Math.floor(p * final.length);
    let out = final.slice(0, settled);
    for (let i = settled; i < final.length; i++) out += final[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    vis.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
  };
  frame();
}

/** Types text into el one character at a time. */
export function typeOut(el: HTMLElement, speed = 38) {
  const { vis, final } = visualTarget(el);
  vis.textContent = "";
  let i = 0;
  return new Promise<void>((resolve) => {
    const id = setInterval(() => {
      vis.textContent = final.slice(0, ++i);
      if (i >= final.length) { clearInterval(id); resolve(); }
    }, speed);
  });
}
