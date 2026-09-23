// Everything the journey derives from src/data/travel.ts — legs, trips, distances, bearings.
// Pure: Astro uses it at build time (boarding-pass lines on the cards) and the client uses it
// for the scene. Nothing here invents data; every value is computed from the places list.
import type { Place } from "../../data/travel";
import { toVec, angleBetween, distanceKm, bearing, arcHeight } from "./geo";

export type Leg = {
  /** leg k joins stop k to stop k + 1 */
  index: number;
  from: number;
  to: number;
  /** central angle, radians */
  angle: number;
  km: number;
  /** reached overland on the same trip (`leg: true` on the destination) */
  overland: boolean;
  trip: number;
  /** arc apex height, globe radii */
  height: number;
  /** initial bearing, radians clockwise from north */
  heading: number;
};

export function buildLegs(places: Pick<Place, "lat" | "lng" | "leg">[]): Leg[] {
  let trip = 0;
  return places.slice(1).map((to, k) => {
    const from = places[k];
    const overland = !!to.leg;
    if (!overland) trip++;
    const angle = angleBetween(toVec(from.lat, from.lng), toVec(to.lat, to.lng));
    return {
      index: k,
      from: k,
      to: k + 1,
      angle,
      km: distanceKm(from.lat, from.lng, to.lat, to.lng),
      overland,
      trip,
      height: arcHeight(angle, overland),
      heading: bearing(from.lat, from.lng, to.lat, to.lng),
    };
  });
}

/** Trip each stop belongs to (home is trip 0). */
export const tripOf = (legs: Leg[], stop: number) => (stop <= 0 ? 0 : legs[stop - 1].trip);

export const formatKm = (km: number) => `${Math.round(km).toLocaleString("en-GB")} km`;

const MONTH = { month: "short", year: "numeric" } as const;
/** "2024-03" → "Mar 2024", "2024" → "2024" */
export const formatWhen = (d: string) =>
  new Date(d.length === 4 ? `${d}-01-01` : `${d.slice(0, 7)}-01`).toLocaleDateString("en-GB", d.length === 4 ? { year: "numeric" } : MONTH);
