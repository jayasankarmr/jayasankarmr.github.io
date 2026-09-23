// Film: a vignette and a fine static grain laid over the scene — above the globe and its labels'
// backdrop, below the page's type and cards, so no text loses contrast to it. Plain CSS layers
// (no full-screen GPU pass), added once the opening is over. Phones and weak GPUs get the
// vignette alone: the grain is a blended full-screen layer.
import { grain } from "./grain";

export function film(after: Element, withGrain: boolean) {
  const el = document.createElement("div");
  el.className = "at-film";
  el.setAttribute("aria-hidden", "true");
  el.classList.toggle("has-grain", withGrain);
  const go = () => {
    after.after(el);
    (withGrain ? grain(el) : Promise.resolve()).then(() => requestAnimationFrame(() => el.classList.add("is-on")));
  };
  if ("requestIdleCallback" in window) requestIdleCallback(go);
  else setTimeout(go, 1500);
  return el;
}
