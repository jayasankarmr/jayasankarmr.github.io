// A tile of paper/film grain, made on demand and handed to CSS as --grain on the element that
// needs it. Shipping it as a data: URI in the stylesheet would have the browser fetch it at load
// for elements far below the fold (and Lighthouse count it on the critical path); setting it on
// the element rather than the root keeps the one-off restyle to that subtree.
let tile: Promise<string> | null = null;

function make(size: number): Promise<string> {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return Promise.resolve("");
  const img = g.createImageData(size, size);
  let s = 0x9e3779b9;
  for (let i = 0; i < img.data.length; i += 4) {
    // xorshift32: deterministic, so the grain is the same on every visit
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const v = (s >>> 24) & 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return new Promise((resolve) => c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : ""), "image/png"));
}

/** Give `el` a --grain background (a 256px noise tile, drawn at 128 CSS px so it stays fine). */
export function grain(el: HTMLElement) {
  tile ??= make(256);
  return tile.then((url) => { if (url) el.style.setProperty("--grain", `url(${url})`); });
}
