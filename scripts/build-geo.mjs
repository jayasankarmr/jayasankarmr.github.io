// Generates the geo data behind the atlas globe. Run once with `node scripts/build-geo.mjs`;
// the output is committed, so the site has no build-time or runtime geo dependency.
//
//   src/data/geo/world-land.png    1-bit land mask, 0.25°, whole world (world-atlas land-50m)
//   src/data/geo/region-land.png   1-bit land mask, 0.025° (~2.8 km), 5–33°N × 68–103°E
//                                  (world-atlas land-10m, with Natural Earth lakes cut out)
//   src/data/geo/region-water.png  1-bit rivers + lakes over the same grid (Natural Earth 10m)
//   src/data/geo/lights.json       night-side city lights: real populated places (≥ 75k people),
//                                  flat [lat×10, lng×10, weight 1–9, …]
//   src/data/geo/meta.json         grid geometry + sources
//
// Natural Earth (public domain) is fetched from GitHub at a pinned commit and cached in
// node_modules/.cache/atlas-geo, so re-runs are offline and reproducible.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { deflateSync, crc32 } from "node:zlib";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const OUT = new URL("../src/data/geo/", import.meta.url);
const CACHE = new URL("../node_modules/.cache/atlas-geo/", import.meta.url);
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

const NE_SHA = "ca96624a56bd078437bca8184e78163e5039ad19";
const NE_URL = (name) => `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_SHA}/geojson/${name}.geojson`;

async function naturalEarth(name) {
  const file = new URL(`${name}.geojson`, CACHE);
  if (!existsSync(file)) {
    process.stdout.write(`  fetching ${name}… `);
    const res = await fetch(NE_URL(name));
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log("ok");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

const topoLand = (res) => {
  const topo = JSON.parse(readFileSync(require.resolve(`world-atlas/land-${res}.json`), "utf8"));
  return feature(topo, topo.objects.land);
};

/** Polygon rings ([lng, lat][]) from any GeoJSON feature collection. */
const ringsOf = (fc) =>
  fc.features.flatMap((f) => {
    const g = f.geometry;
    if (!g) return [];
    if (g.type === "Polygon") return g.coordinates;
    if (g.type === "MultiPolygon") return g.coordinates.flat();
    return [];
  });

/** A bit grid: rows run north → south, columns west → east; each cell samples its centre. */
function grid({ west, north, res, width, height }) {
  const bits = new Uint8Array(width * height);
  return {
    west, north, res, width, height, bits,
    lat: (r) => north - (r + 0.5) * res,
    lng: (c) => west + (c + 0.5) * res,
  };
}

/** Even-odd scanline fill of every ring into the grid (value 1, or 0 to cut holes). */
function fill(g, rings, value = 1) {
  // edge table: for each edge, the rows whose centre latitude it crosses
  const rows = Array.from({ length: g.height }, () => []);
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[i];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      // rows r with lo <= lat(r) < hi  (half-open, so shared vertices count once)
      const rTop = Math.max(0, Math.ceil((g.north - hi) / g.res - 0.5));
      const rBot = Math.min(g.height - 1, Math.floor((g.north - lo) / g.res - 0.5));
      for (let r = rTop; r <= rBot; r++) {
        const y = g.lat(r);
        if (y < lo || y >= hi) continue;
        rows[r].push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
  }
  for (let r = 0; r < g.height; r++) {
    const xs = rows[r].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - g.west) / g.res - 0.5));
      const c1 = Math.min(g.width - 1, Math.floor((xs[k + 1] - g.west) / g.res - 0.5));
      for (let c = c0; c <= c1; c++) g.bits[r * g.width + c] = value;
    }
  }
}

/** Rasterises polylines into the grid, `thick` cells wide. */
function stroke(g, lines, thick = 1) {
  const set = (c, r) => {
    for (let dr = 0; dr < thick; dr++)
      for (let dc = 0; dc < thick; dc++) {
        const rr = r + dr - (thick >> 1), cc = c + dc - (thick >> 1);
        if (rr >= 0 && rr < g.height && cc >= 0 && cc < g.width) g.bits[rr * g.width + cc] = 1;
      }
  };
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [x1, y1] = line[i - 1];
      const [x2, y2] = line[i];
      const c1 = (x1 - g.west) / g.res - 0.5, r1 = (g.north - y1) / g.res - 0.5;
      const c2 = (x2 - g.west) / g.res - 0.5, r2 = (g.north - y2) / g.res - 0.5;
      const steps = Math.max(1, Math.ceil(Math.hypot(c2 - c1, r2 - r1) * 2));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        set(Math.round(c1 + (c2 - c1) * t), Math.round(r1 + (r2 - r1) * t));
      }
    }
  }
}

/** Minimal PNG writer: 1-bit greyscale, or 8-bit RGB for previews. */
function png(width, height, rowBytes, rowFn, colorType = 0, bitDepth = 1) {
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let r = 0; r < height; r++) {
    raw[r * (rowBytes + 1)] = 0; // filter: none
    rowFn(r, raw.subarray(r * (rowBytes + 1) + 1, (r + 1) * (rowBytes + 1)));
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const bitPng = (g) =>
  png(g.width, g.height, Math.ceil(g.width / 8), (r, row) => {
    row.fill(0);
    for (let c = 0; c < g.width; c++) if (g.bits[r * g.width + c]) row[c >> 3] |= 0x80 >> (c & 7);
  });

const write = (name, buf) => {
  writeFileSync(new URL(name, OUT), buf);
  console.log(`  ${name.padEnd(18)} ${(buf.length / 1024).toFixed(1)} KB`);
};

// ---- world mask: 0.25°, land-50m, Antarctica left out (it reads as noise on the globe)
console.log("world land mask");
const world = grid({ west: -180, north: 90, res: 0.25, width: 1440, height: 720 });
fill(world, ringsOf(topoLand("50m")));
for (let r = 0; r < world.height; r++) if (world.lat(r) < -60) world.bits.fill(0, r * world.width, (r + 1) * world.width);
write("world-land.png", bitPng(world));

// ---- regional masks: the corridor every stop lives in
const REGION = { west: 68, north: 33, res: 0.025, width: 1400, height: 1120 }; // 68–103°E, 5–33°N
console.log("region masks");
const [lakes, rivers, places] = await Promise.all([
  naturalEarth("ne_10m_lakes"),
  naturalEarth("ne_10m_rivers_lake_centerlines"),
  naturalEarth("ne_10m_populated_places_simple"),
]);
const inRegion = (coords) =>
  coords.some(([x, y]) => x >= REGION.west - 1 && x <= REGION.west + REGION.width * REGION.res + 1 && y <= REGION.north + 1 && y >= REGION.north - REGION.height * REGION.res - 1);

const land = grid(REGION);
fill(land, ringsOf(topoLand("10m")));
const lakeRings = ringsOf(lakes).filter(inRegion);
fill(land, lakeRings, 0);
write("region-land.png", bitPng(land));

const water = grid(REGION);
fill(water, lakeRings);
// rivers: major channels two cells wide, the rest one; minor tributaries (scalerank > 8) left out
const riverLines = (maxRank) =>
  rivers.features
    .filter((f) => f.geometry && (f.properties.scalerank ?? 99) <= maxRank)
    .flatMap((f) => (f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : []))
    .filter(inRegion);
stroke(water, riverLines(8), 1);
stroke(water, riverLines(4), 2);
write("region-water.png", bitPng(water));

// ---- city lights: populated places, weighted by population (log scale 1–9)
console.log("city lights");
const lights = [];
let kept = 0;
for (const f of places.features) {
  const p = f.properties;
  const pop = p.pop_max ?? 0;
  if (pop < 75000) continue;
  const w = Math.max(1, Math.min(9, Math.round((Math.log10(pop) - 4.8) * 3.4)));
  lights.push(Math.round(p.latitude * 10), Math.round(p.longitude * 10), w);
  kept++;
}
write("lights.json", Buffer.from(JSON.stringify(lights)));
console.log(`  ${kept} places`);

write(
  "meta.json",
  Buffer.from(JSON.stringify({
    world: { west: world.west, north: world.north, res: world.res, width: world.width, height: world.height },
    region: REGION,
    sources: {
      land: "world-atlas 2.0.2 (Natural Earth land 50m / 10m)",
      naturalEarth: `nvkelso/natural-earth-vector@${NE_SHA}: ne_10m_lakes, ne_10m_rivers_lake_centerlines, ne_10m_populated_places_simple`,
    },
  }, null, 2) + "\n")
);

// ---- review image (not committed): land grey, water cyan, lights amber
if (process.argv.includes("--preview")) {
  const prev = new URL("../.revamp/geo-preview-region.png", import.meta.url);
  const lightSet = new Set();
  for (let i = 0; i < lights.length; i += 3) {
    const r = Math.round((REGION.north - lights[i] / 10) / REGION.res), c = Math.round((lights[i + 1] / 10 - REGION.west) / REGION.res);
    for (let d = -2; d <= 2; d++)
      for (let e = -2; e <= 2; e++)
        if (r + d >= 0 && r + d < REGION.height && c + e >= 0 && c + e < REGION.width) lightSet.add((r + d) * REGION.width + (c + e));
  }
  mkdirSync(new URL("../.revamp/", import.meta.url), { recursive: true });
  writeFileSync(prev, png(REGION.width, REGION.height, REGION.width * 3, (r, row) => {
    for (let c = 0; c < REGION.width; c++) {
      const i = r * REGION.width + c;
      const rgb = lightSet.has(i) ? [255, 180, 84] : water.bits[i] ? [80, 230, 255] : land.bits[i] ? [70, 80, 110] : [8, 10, 24];
      row.set(rgb, c * 3);
    }
  }, 2, 8));
  console.log(`  preview → .revamp/geo-preview-region.png`);
}
