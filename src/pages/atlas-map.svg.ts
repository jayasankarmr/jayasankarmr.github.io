// The atlas without WebGL: the same flat map the globe unrolls into (Equal Earth, centred on
// India), drawn once at build time — land as dots from the world mask, every leg of the journey
// as a great-circle line (overland legs dashed), the stops as markers. The home page lays it
// behind everything when there is no WebGL2 or only a software renderer.
import type { APIRoute } from "astro";
// inlined by Vite at build time, so the prerendered endpoint doesn't depend on file paths
import worldLand from "../data/geo/world-land.png?inline";
import { readMask } from "../lib/png1";
import meta from "../data/geo/meta.json";
import { places } from "../data/travel";
import { buildLegs } from "../scripts/atlas/journey";
import { equalEarth, slerp, toLatLng, toVec } from "../scripts/atlas/geo";

const LNG0 = 82, LAT0 = 22;
const S = 1000; // map units per Equal Earth unit
const [, y0] = equalEarth(LAT0, LNG0, LNG0);
const xy = (lat: number, lng: number) => {
  const [x, y] = equalEarth(lat, lng, LNG0);
  return [x * S, -(y - y0) * S] as const;
};
const f = (n: number) => n.toFixed(1);

export const GET: APIRoute = () => {
  const mask = readMask(Buffer.from(worldLand.slice(worldLand.indexOf(",") + 1), "base64"));
  const { west, north, res } = meta.world;
  const land = (lat: number, lng: number) => mask.at(Math.floor((lng - west) / res), Math.floor((north - lat) / res));

  // the frame: the journey's region (Arabian Sea to the Gulf of Thailand), landscape; the page
  // crops it to the viewport ("slice"), so phones see the middle
  const [x0] = xy(LAT0, LNG0 - 31), [x1] = xy(LAT0, LNG0 + 31);
  const [, yc] = xy(18, LNG0);
  const W = x1 - x0, H = W * 0.64;
  const box = { x: x0, y: yc - H / 2, w: W, h: H };

  // land dots on a lat/lng grid, a dot per cell that is land
  const step = 0.36;
  let dots = "";
  for (let lat = -8; lat <= 46; lat += step) {
    for (let lng = LNG0 - 40; lng <= LNG0 + 40; lng += step / Math.cos((lat * Math.PI) / 180)) {
      if (!land(lat, lng)) continue;
      const [x, y] = xy(lat, lng);
      if (x < box.x - 6 || x > box.x + box.w + 6 || y < box.y - 6 || y > box.y + box.h + 6) continue;
      dots += `M${f(x)} ${f(y)}h0`;
    }
  }

  // the journey: great circles, sampled, projected
  const legs = buildLegs(places);
  const route = (overland: boolean) => legs.filter((l) => l.overland === overland).map((l) => {
    const a = toVec(places[l.from].lat, places[l.from].lng), b = toVec(places[l.to].lat, places[l.to].lng);
    const n = Math.max(6, Math.round(l.angle * 180));
    return Array.from({ length: n + 1 }, (_, k) => {
      const ll = toLatLng(slerp(a, b, k / n));
      const [x, y] = xy(ll.lat, ll.lng);
      return `${k ? "L" : "M"}${f(x)} ${f(y)}`;
    }).join("");
  }).join("");
  const stops = places.map((p) => {
    const [x, y] = xy(p.lat, p.lng);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${p.home ? 3.4 : 2.6}" fill="${p.home ? "#6ff2e0" : "#ffb454"}"/>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(box.x)} ${f(box.y)} ${f(box.w)} ${f(box.h)}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ff2e0"/><stop offset="1" stop-color="#9a82ff"/></linearGradient></defs>` +
    `<path d="${dots}" stroke="url(#land)" stroke-opacity="0.5" stroke-width="2.6" stroke-linecap="round" fill="none"/>` +
    `<path d="${route(false)}" stroke="#ffb454" stroke-opacity="0.75" stroke-width="0.9" fill="none"/>` +
    `<path d="${route(true)}" stroke="#ffb454" stroke-opacity="0.75" stroke-width="0.9" stroke-dasharray="2.5 2.5" fill="none"/>` +
    `${stops}</svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
};
