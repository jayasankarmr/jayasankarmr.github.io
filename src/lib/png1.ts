// Build-time reader for the 1-bit greyscale land masks (scripts/build-geo.mjs writes them):
// just enough PNG to get at the pixels — no interlace, no palette — on Node's own zlib.
import { inflateSync } from "node:zlib";

export type Bitmap = { w: number; h: number; at(x: number, y: number): boolean };

export function readMask(buf: Uint8Array): Bitmap {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let w = 0, h = 0;
  const idat: Uint8Array[] = [];
  for (let o = 8; o < buf.length; ) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(...buf.subarray(o + 4, o + 8));
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      w = view.getUint32(o + 8);
      h = view.getUint32(o + 12);
      if (data[8] !== 1 || data[9] !== 0 || data[12] !== 0) throw new Error("png1: expected a 1-bit greyscale, non-interlaced PNG");
    } else if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil(w / 8);
  const px = new Uint8Array(stride * h);
  // undo the per-row filters (for bit depths under 8, the filter's "pixel" is one byte)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride);
    const up = y ? px.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i ? row[i - 1] : 0, b = up[i], c = i ? up[i - 1] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 255;
    }
  }
  return { w, h, at: (x, y) => x >= 0 && y >= 0 && x < w && y < h && ((px[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1) === 1 };
}
