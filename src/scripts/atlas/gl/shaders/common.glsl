// Shared by every atlas shader: hashing, the unroll map projection, a few easings.
#define PI 3.141592653589793
#define TAU 6.283185307179586

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float easeOut3(float t) { float u = 1.0 - t; return 1.0 - u * u * u; }

// The flat map the globe unrolls onto: the plane tangent at the map centre, carrying an
// Equal Earth projection (src/scripts/atlas/geo.ts mapPlane/toMap mirror this on the CPU).
uniform vec3 uPlaneUp, uPlaneEast, uPlaneNorth;
uniform vec3 uPlane; // x: centre longitude (rad), y: centre y offset, z: scale

vec3 mapPos(vec3 n, float lift) {
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lng = atan(n.z, -n.x) - PI;
  float l = lng - uPlane.x;
  l = atan(sin(l), cos(l));
  float th = asin(0.8660254 * sin(lat));
  float t2 = th * th, t6 = t2 * t2 * t2;
  float x = l * cos(th) / (0.8660254 * (1.340264 - 0.243318 * t2 + t6 * (0.006251 + 0.034164 * t2)));
  float y = th * (1.340264 - 0.081106 * t2 + t6 * (0.000893 + 0.003796 * t2));
  return uPlaneUp * (1.0 + lift) + uPlaneEast * (x * uPlane.z) + uPlaneNorth * ((y - uPlane.y) * uPlane.z);
}

// per-vertex unroll progress: near the map centre first, the far side last
float unrollAt(float morph, float delay) {
  return smoothstep(0.0, 1.0, clamp(morph * 1.6 - delay * 0.6, 0.0, 1.0));
}
