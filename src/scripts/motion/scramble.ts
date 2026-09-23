// Text scramble: characters resolve left→right out of random glyphs.
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>_-+=*#";

export function scramble(el: HTMLElement, duration = 900) {
  const final = el.dataset.final ?? el.textContent ?? "";
  el.dataset.final = final;
  el.setAttribute("aria-label", final);
  const start = performance.now();
  const frame = () => {
    const p = Math.min(1, (performance.now() - start) / duration);
    const settled = Math.floor(p * final.length);
    let out = final.slice(0, settled);
    for (let i = settled; i < final.length; i++) out += final[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    el.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
  };
  frame();
}

/** Types text into el one character at a time. */
export function typeOut(el: HTMLElement, speed = 38) {
  const text = el.textContent ?? "";
  el.setAttribute("aria-label", text);
  el.textContent = "";
  let i = 0;
  return new Promise<void>((resolve) => {
    const id = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(id); resolve(); }
    }, speed);
  });
}
