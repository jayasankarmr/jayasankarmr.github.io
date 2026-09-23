// Geo maths for the atlas, dependency-free so Astro can run it at build time (card distances,
// trip numbers) and the client can run it every frame (camera, labels, arcs).
// Sphere convention matches the original globe: radius 1, lat/lng in degrees,
//   x = −sinφ·cosθ, y = cosφ, z = sinφ·sinθ   with φ = 90° − lat, θ = lng + 180°
// so the local frame (east, north, up) is right-handed: east × north = up.

export type V3 = [number, number, number];
export const DEG = Math.PI / 180;
export const EARTH_KM = 6371;

export function toVec(lat: number, lng: number, r = 1, out: V3 = [0, 0, 0]): V3 {
  const phi = (90 - lat) * DEG, theta = (lng + 180) * DEG;
  const s = Math.sin(phi);
  out[0] = -s * Math.cos(theta) * r;
  out[1] = Math.cos(phi) * r;
  out[2] = s * Math.sin(theta) * r;
  return out;
}

export function toLatLng(v: V3): { lat: number; lng: number } {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  const lat = Math.asin(Math.max(-1, Math.min(1, v[1] / len))) / DEG;
  let lng = Math.atan2(v[2], -v[0]) / DEG - 180;
  if (lng < -180) lng += 360;
  return { lat, lng };
}

export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3, out: V3 = [0, 0, 0]): V3 => {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
};
export const normalize = (a: V3, out: V3 = [0, 0, 0]): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  out[0] = a[0] / l; out[1] = a[1] / l; out[2] = a[2] / l;
  return out;
};

/** Central angle between two unit vectors, radians. */
export const angleBetween = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

/** Great-circle interpolation between unit vectors. */
export function slerp(a: V3, b: V3, t: number, out: V3 = [0, 0, 0]): V3 {
  const om = angleBetween(a, b);
  if (om < 1e-6) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; }
  const s = Math.sin(om), wa = Math.sin((1 - t) * om) / s, wb = Math.sin(t * om) / s;
  out[0] = a[0] * wa + b[0] * wb; out[1] = a[1] * wa + b[1] * wb; out[2] = a[2] * wa + b[2] * wb;
  return out;
}

/** Great-circle distance in km (haversine). */
export function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const dLat = (latB - latA) * DEG, dLng = (lngB - lngA) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(latA * DEG) * Math.cos(latB * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing A → B, radians clockwise from north. */
export function bearing(latA: number, lngA: number, latB: number, lngB: number) {
  const p1 = latA * DEG, p2 = latB * DEG, dl = (lngB - lngA) * DEG;
  return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
}

/** Local tangent frame at a surface point. */
export function frame(lat: number, lng: number) {
  const up = toVec(lat, lng);
  const east = normalize(cross([0, 1, 0], up));
  const north = cross(up, east);
  return { up, east, north };
}

// ---- Equal Earth (Šavrič, Patterson & Jenny 2018): closed-form, Robinson-like outline
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
export const EQUAL_EARTH_EXTENT = { x: 2.7066, y: 1.3173 };

/** Equal Earth x/y (unit sphere) with longitudes measured from `lng0`. */
export function equalEarth(lat: number, lng: number, lng0 = 0): [number, number] {
  let l = (lng - lng0) * DEG;
  l = Math.atan2(Math.sin(l), Math.cos(l));
  const th = Math.asin(M * Math.sin(lat * DEG));
  const t2 = th * th, t6 = t2 * t2 * t2;
  const x = (l * Math.cos(th)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

/**
 * The flat map the globe unrolls onto: the plane tangent to the sphere at (lat0, lng0),
 * carrying an Equal Earth projection centred there. `scale` matches the sphere's local
 * east–west scale at the centre, so the region around it barely moves during the morph.
 */
export type MapPlane = { lat0: number; lng0: number; up: V3; east: V3; north: V3; y0: number; scale: number };

export function mapPlane(lat0: number, lng0: number): MapPlane {
  const { up, east, north } = frame(lat0, lng0);
  const [, y0] = equalEarth(lat0, lng0, lng0);
  // d(x)/d(lng) of Equal Earth at the centre vs cos(lat0) on the sphere
  const [xe] = equalEarth(lat0, lng0 + 0.01, lng0);
  const scale = (Math.cos(lat0 * DEG) * 0.01 * DEG) / xe;
  return { lat0, lng0, up, east, north, y0, scale };
}

export function toMap(lat: number, lng: number, p: MapPlane, lift = 0, out: V3 = [0, 0, 0]): V3 {
  const [x, y] = equalEarth(lat, lng, p.lng0);
  const u = x * p.scale, v = (y - p.y0) * p.scale;
  const h = 1 + lift;
  out[0] = p.up[0] * h + p.east[0] * u + p.north[0] * v;
  out[1] = p.up[1] * h + p.east[1] * u + p.north[1] * v;
  out[2] = p.up[2] * h + p.east[2] * u + p.north[2] * v;
  return out;
}

// ---- the Sun: subsolar point for a moment in time (NOAA low-precision formulae, ~0.1°)
export function subsolar(date = new Date()): { lat: number; lng: number } {
  const d = date.getTime() / 86400000 - 10957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * DEG;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const e = (23.439 - 0.00000036 * d) * DEG;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / DEG;
  const dec = Math.asin(Math.sin(e) * Math.sin(L)) / DEG;
  let eqt = (((q % 360) + 360) % 360) / 15 - (((ra % 360) + 360) % 360) / 15;
  if (eqt > 12) eqt -= 24;
  if (eqt < -12) eqt += 24;
  const utc = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lng = -15 * (utc - 12 + eqt);
  lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  return { lat: dec, lng };
}

/** Arc apex height (globe radii) for a leg: a hop for neighbours, a high sweep across seas. */
export const arcHeight = (angle: number, overland: boolean) =>
  overland ? 0.0025 + 0.02 * angle : Math.min(0.32, 0.012 + 0.3 * angle);

export const formatCoord = (lat: number, lng: number, digits = 2) =>
  `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lng).toFixed(digits)}°${lng >= 0 ? "E" : "W"}`;
