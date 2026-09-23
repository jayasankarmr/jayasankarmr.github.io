// Generates src/data/land-dots.json: points evenly spread over the sphere
// (Fibonacci lattice) that fall on land, from Natural Earth 110m via world-atlas.
// Run once with `node scripts/build-land-dots.mjs`; the output is committed so
// the site has no runtime geo dependency.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve("world-atlas/land-110m.json"), "utf8"));
const land = feature(topo, topo.objects.land);

const polygons = land.features.flatMap((f) =>
  f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates
);

// even-odd ray cast over every ring, so holes (lakes, seas) subtract themselves
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const onLand = (lng, lat) =>
  polygons.some((poly) => poly.reduce((acc, ring) => (inRing(lng, lat, ring) ? !acc : acc), false));

const N = 26000;
const golden = Math.PI * (3 - Math.sqrt(5));
const out = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const theta = golden * i;
  const lat = (Math.asin(y) * 180) / Math.PI;
  let lng = ((theta * 180) / Math.PI) % 360;
  if (lng > 180) lng -= 360;
  if (lat < -60) continue; // Antarctica reads as noise at this density
  if (onLand(lng, lat)) out.push(Math.round(lat * 10), Math.round(lng * 10));
}
writeFileSync(new URL("../src/data/land-dots.json", import.meta.url), JSON.stringify(out));
console.log(`${out.length / 2} land dots`);
