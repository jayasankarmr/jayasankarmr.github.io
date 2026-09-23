// Geo data for the scene: land masks (1-bit PNGs from scripts/build-geo.mjs) and city lights.
// The global dots are a Fibonacci lattice filtered by the world mask at runtime, so each tier
// picks its own density. A small jitter breaks the lattice's spiral moiré at the limb.
import worldUrl from "../../../data/geo/world-land.png?url";
import regionLandUrl from "../../../data/geo/region-land.png?url";
import regionWaterUrl from "../../../data/geo/region-water.png?url";
import meta from "../../../data/geo/meta.json";
import { angleBetween, toVec, type V3 } from "../geo";

export { meta as geoMeta, regionLandUrl, regionWaterUrl };

export type Mask = { w: number; h: number; bits: Uint8Array };

export async function decodeMask(url: string): Promise<Mask> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const bits = new Uint8Array(c.width * c.height);
  for (let i = 0; i < bits.length; i++) bits[i] = px[i * 4] > 127 ? 1 : 0;
  return { w: c.width, h: c.height, bits };
}

export const loadWorldMask = () => decodeMask(worldUrl);

// deterministic PRNG so the dots sit in the same place on every visit
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DotField = {
  count: number;
  /** unit-sphere positions, xyz per dot */
  pos: Float32Array;
  /** x seed, y intro delay (0 near home → 1 far side), z unroll delay, w size jitter */
  meta: Float32Array;
};

/**
 * Land dots from a Fibonacci lattice of `n` points. `home` sets where the intro assembly
 * radiates from; `mapCentre` where the unroll starts.
 */
export function landDots(n: number, mask: Mask, home: V3, mapCentre: V3): DotField {
  const { w, h, bits } = mask;
  const res = 180 / h; // the world mask spans 90°N (row 0) to 90°S
  const rand = mulberry32(1987);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const spacingDeg = (Math.sqrt((4 * Math.PI) / n) * 180) / Math.PI;
  const pos: number[] = [];
  const m: number[] = [];
  const v: V3 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    let lat = (Math.asin(y) * 180) / Math.PI;
    let lng = (((golden * i * 180) / Math.PI) % 360) - 180;
    lat += (rand() - 0.5) * spacingDeg * 0.5;
    lng += ((rand() - 0.5) * spacingDeg * 0.5) / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    if (lat < -60 || lat > 89.5) continue;
    if (lng < -180) lng += 360;
    if (lng >= 180) lng -= 360;
    const r = Math.min(h - 1, Math.floor((90 - lat) / res));
    const c = Math.min(w - 1, Math.floor((lng + 180) / res));
    if (!bits[r * w + c]) continue;
    toVec(lat, lng, 1, v);
    pos.push(v[0], v[1], v[2]);
    const fromHome = angleBetween(v, home) / Math.PI;
    const fromCentre = angleBetween(v, mapCentre) / Math.PI;
    m.push(rand(), Math.min(1, Math.pow(fromHome, 0.8) + rand() * 0.06), fromCentre, rand());
  }
  return { count: pos.length / 3, pos: new Float32Array(pos), meta: new Float32Array(m) };
}

export type LightField = { count: number; pos: Float32Array; meta: Float32Array };

/** City lights: [lat×10, lng×10, weight 1–9, …] → positions + (weight 0–1, seed). */
export async function cityLights(): Promise<LightField> {
  const flat: number[] = (await import("../../../data/geo/lights.json")).default;
  const n = flat.length / 3;
  const pos = new Float32Array(n * 3);
  const m = new Float32Array(n * 2);
  const v: V3 = [0, 0, 0];
  const rand = mulberry32(7);
  for (let i = 0; i < n; i++) {
    toVec(flat[i * 3] / 10, flat[i * 3 + 1] / 10, 1, v);
    pos.set(v, i * 3);
    m[i * 2] = flat[i * 3 + 2] / 9;
    m[i * 2 + 1] = rand();
  }
  return { count: n, pos, meta: m };
}
