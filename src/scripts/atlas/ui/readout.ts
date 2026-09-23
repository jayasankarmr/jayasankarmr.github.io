// The nav's coordinate readout ("12.97°N 77.59°E · Bengaluru"): decodes out of random glyphs
// each time the journey lands somewhere new.
import { scramble } from "../../motion/scramble";
import { formatCoord } from "../geo";

export function readout(el: HTMLElement, reduced: boolean) {
  let last = el.textContent?.trim() ?? "";
  return {
    set(lat: number, lng: number, name: string) {
      const text = `${formatCoord(lat, lng)} · ${name}`;
      if (text === last) return;
      last = text;
      scramble(el, reduced ? 1 : 550, text);
    },
  };
}
