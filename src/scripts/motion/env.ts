// Capability + preference checks shared by every motion module.
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
export const isNarrow = () => matchMedia("(max-width: 767px)").matches;

let glOk: boolean | undefined;
export function hasWebGL(): boolean {
  if (glOk !== undefined) return glOk;
  try {
    const c = document.createElement("canvas");
    glOk = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    glOk = false;
  }
  return glOk;
}

/** Rich = WebGL + motion allowed. Everything immersive gates on this. */
export const richMotion = () => !reducedMotion() && hasWebGL();

export const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

/** Run `cb` once when `el` comes within `margin` of the viewport — used to lazy-load WebGL. */
export function whenNear(el: Element, cb: () => void, margin = "50% 0px") {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        cb();
      }
    },
    { rootMargin: margin }
  );
  io.observe(el);
}

/** Toggle `run` as el enters/leaves the viewport — pauses offscreen render loops. */
export function onVisibility(el: Element, run: (visible: boolean) => void) {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => run(e.isIntersecting)));
  io.observe(el);
  return () => io.disconnect();
}
