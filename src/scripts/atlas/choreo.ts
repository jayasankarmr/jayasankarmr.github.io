// Journey choreography as pure functions of scroll: where you are in the journey (a stop's
// dwell, or a fraction of the leg after it) and the camera pose for that moment. Scrolling back
// runs the same functions backwards, so arcs un-draw and the camera flies home exactly.
import type { Pose } from "./camera";
import type { Leg } from "./journey";
import { slerp, toVec, toLatLng, type V3 } from "./geo";
import { scroll, ease, clamp, lerp, ramp, smooth } from "./motion";

export type Layout = { units: number[]; starts: number[]; total: number };

/** Scroll units per stop segment: the dwell plus the leg after it; long legs get more. */
export function segmentLayout(legs: Pick<Leg, "angle">[], stops: number): Layout {
  const units: number[] = [];
  for (let i = 0; i < stops; i++) units.push(i < stops - 1 ? 1 + legs[i].angle * scroll.perRadian : scroll.dwell + 0.25);
  const starts: number[] = [];
  let acc = 0;
  for (const u of units) { starts.push(acc); acc += u; }
  return { units, starts, total: acc };
}

export type Where = {
  /** the stop whose segment we're in */
  i: number;
  /** true while landed at stop i */
  dwell: boolean;
  /** 0–1 through the dwell (dwell) or through the leg i → i+1 (in flight) */
  f: number;
  /** the stop the UI should show: switches to i+1 late in the flight */
  active: number;
};

export const SWITCH_AT = 0.72;

/** Locate a journey position (in scroll units) within the segments. */
export function locate(u: number, L: Layout): Where {
  const n = L.units.length;
  const uu = clamp(u, 0, L.total - 1e-6);
  let i = 0;
  while (i < n - 1 && uu >= L.starts[i + 1]) i++;
  const local = uu - L.starts[i];
  const D = scroll.dwell;
  if (local < D || i === n - 1) return { i, dwell: true, f: clamp(local / (i === n - 1 ? L.units[i] : D)), active: i };
  const f = (local - D) / (L.units[i] - D);
  return { i, dwell: false, f, active: f >= SWITCH_AT ? i + 1 : i };
}

/** Scroll units at the centre of stop i's dwell (rail jumps, snapping, QA). */
export const dwellCentre = (i: number, L: Layout) => L.starts[i] + (i === L.units.length - 1 ? Math.min(scroll.dwell, L.units[i]) : scroll.dwell) / 2;

export type Frame = { sx: number; sy: number; land: number; tilt: number; cruiseTilt: number };

export type Place = { lat: number; lng: number };

/** Cinematic heading at a stop: partway toward the bearing of the leg that brought us here. */
export const stopHeading = (legs: Leg[], i: number) => (i <= 0 ? 0 : legs[i - 1].heading * 0.6);

/** How high the camera cruises on a leg, so both ends stay in frame. */
export const cruiseDist = (leg: Leg, land: number) => Math.max(land * 2.2, 0.16 + leg.angle * 1.9);

const angleLerp = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
/** zoom reads linearly when distance moves in log space */
const logLerp = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));

export function landPose(p: Place, heading: number, fr: Frame, out: Pose): Pose {
  out.lat = p.lat; out.lng = p.lng;
  out.dist = fr.land; out.tilt = fr.tilt; out.heading = heading;
  out.sx = fr.sx; out.sy = fr.sy;
  return out;
}

const va: V3 = [0, 0, 0], vb: V3 = [0, 0, 0], vm: V3 = [0, 0, 0];

/** Camera pose at a journey position. Also reports the comet's progress along the leg. */
export function journeyPose(w: Where, places: Place[], legs: Leg[], fr: Frame, out: Pose): { comet: number } {
  if (w.dwell) {
    landPose(places[w.i], stopHeading(legs, w.i), fr, out);
    out.heading += 0.05 * smooth(w.f); // a slow drift while landed, so the shot never freezes
    return { comet: 0 };
  }
  const f = w.f, A = places[w.i], B = places[w.i + 1], leg = legs[w.i];
  toVec(A.lat, A.lng, 1, va);
  toVec(B.lat, B.lng, 1, vb);
  const move = ease.camera(ramp(f, 0.1, 0.95));
  const at = toLatLng(slerp(va, vb, move, vm));
  const bump = smooth(ramp(f, 0, 0.45)) * (1 - smooth(ramp(f, 0.55, 1)));
  const cruise = cruiseDist(leg, fr.land);
  out.lat = at.lat; out.lng = at.lng;
  out.dist = logLerp(fr.land, cruise, bump);
  out.tilt = lerp(fr.tilt, fr.cruiseTilt, bump);
  out.heading = angleLerp(stopHeading(legs, w.i) + 0.05, stopHeading(legs, w.i + 1), smooth(ramp(f, 0.05, 0.6)));
  out.sx = fr.sx; out.sy = fr.sy;
  return { comet: ease.soft(ramp(f, 0.08, 0.88)) };
}

/** Blend two poses (shortest way round in longitude, log-space distance). */
export function mixPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  out.lat = lerp(a.lat, b.lat, t);
  out.lng = a.lng + ((((b.lng - a.lng) % 360) + 540) % 360 - 180) * t;
  out.dist = logLerp(a.dist, b.dist, t);
  out.tilt = lerp(a.tilt, b.tilt, t);
  out.heading = angleLerp(a.heading, b.heading, t);
  out.sx = lerp(a.sx, b.sx, t);
  out.sy = lerp(a.sy, b.sy, t);
  return out;
}

/**
 * The opening's pull-back: altitude climbs first (launch curve, log space), and only once the
 * camera is high enough to keep home in frame does the target slide over to the hero framing.
 */
export function introPose(street: Pose, hero: Pose, p: number, out: Pose): Pose {
  const up = ease.launch(ramp(p, 0, 0.72));
  const slide = smooth(ramp(up, 0.6, 1));
  out.dist = logLerp(street.dist, hero.dist, up);
  out.lat = lerp(street.lat, hero.lat, slide);
  out.lng = street.lng + ((((hero.lng - street.lng) % 360) + 540) % 360 - 180) * slide;
  out.tilt = lerp(street.tilt, hero.tilt, up);
  out.heading = angleLerp(street.heading, hero.heading, up);
  out.sx = lerp(street.sx, hero.sx, slide);
  out.sy = lerp(street.sy, hero.sy, slide);
  return out;
}

/** Route state for every leg at a journey position: drawn fraction and heat (1 hot → 0 cooled). */
export function routeState(w: Where, legs: Leg[], comet: number, out: { progress: number; heat: number }[]) {
  legs.forEach((_, k) => {
    const o = out[k];
    if (k < w.i - 1) { o.progress = 1; o.heat = 0; }
    else if (k === w.i - 1) { o.progress = 1; o.heat = w.dwell ? 1 : 1 - smooth(ramp(w.f, 0, 0.5)); }
    else if (k === w.i && !w.dwell) { o.progress = comet; o.heat = 1; }
    else { o.progress = 0; o.heat = 1; }
  });
}
