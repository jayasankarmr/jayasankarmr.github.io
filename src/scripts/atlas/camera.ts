// Map camera: the pose is a target on the globe, a distance, a tilt and a heading, plus where
// the target should sit on screen. The globe never moves; the camera orbits it. Screen
// placement uses a lens shift (setViewOffset), so layout never distorts the orbit maths.
import type { PerspectiveCamera } from "three";
import { DEG, frame, toVec } from "./geo";

export type Pose = {
  lat: number;
  lng: number;
  /** camera distance from the target point, globe radii */
  dist: number;
  /** radians from straight down (0) toward the horizon */
  tilt: number;
  /** radians clockwise from north: the direction the camera looks along */
  heading: number;
  /** where the target sits on screen, −1…1 from the centre (sy up) */
  sx: number;
  sy: number;
};

export const FOV = 30;

export const clonePose = (p: Pose): Pose => ({ ...p });

/** Shortest signed difference between two longitudes, degrees. */
export const lngDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/** Distance at which a globe of radius 1 spans `radiusPx` on a viewport `viewportH` px tall. */
export function fitDist(radiusPx: number, viewportH: number, fov = FOV) {
  const a = Math.atan((radiusPx / (viewportH / 2)) * Math.tan((fov / 2) * DEG));
  return 1 / Math.sin(a) - 1;
}

/** Ground width (globe radii) visible across the viewport at a distance (flat approximation). */
export const viewWidthAt = (dist: number, aspect: number, fov = FOV) => 2 * dist * Math.tan((fov / 2) * DEG) * aspect;

export function applyPose(cam: PerspectiveCamera, p: Pose, w: number, h: number) {
  const T = toVec(p.lat, p.lng);
  const { up: U, east: E, north: N } = frame(p.lat, p.lng);
  const ch = Math.cos(p.heading), shh = Math.sin(p.heading);
  const H = [N[0] * ch + E[0] * shh, N[1] * ch + E[1] * shh, N[2] * ch + E[2] * shh];
  const ct = Math.cos(p.tilt), st = Math.sin(p.tilt);
  cam.position.set(
    T[0] + (U[0] * ct - H[0] * st) * p.dist,
    T[1] + (U[1] * ct - H[1] * st) * p.dist,
    T[2] + (U[2] * ct - H[2] * st) * p.dist,
  );
  cam.up.set(U[0] * st + H[0] * ct, U[1] * st + H[1] * ct, U[2] * st + H[2] * ct);
  cam.lookAt(T[0], T[1], T[2]);
  // tight near plane at street level, room for the starfield behind
  cam.near = Math.max(0.0004, p.dist * 0.04);
  cam.far = p.dist + 80;
  cam.aspect = w / h;
  cam.setViewOffset(w, h, -p.sx * (w / 2), p.sy * (h / 2), w, h);
  cam.updateProjectionMatrix();
}
