// Great-circle arc for leg k at parameter t, lifted by its apex height; on the flat map the arc
// bows sideways off its chord instead. Shared by the route ribbons and the comet.
uniform vec4 uLegA[LEGS]; // xyz: start (unit), w: apex height
uniform vec4 uLegB[LEGS]; // xyz: end (unit), w: central angle
uniform float uMorph;

vec3 arcDir(int k, float t) {
  vec3 A = uLegA[k].xyz, B = uLegB[k].xyz;
  float om = uLegB[k].w;
  if (om < 1e-5) return A;
  return normalize((sin((1.0 - t) * om) * A + sin(t * om) * B) / sin(om));
}

vec3 arcPoint(int k, float t) {
  vec3 n = arcDir(k, t);
  float lift = uLegA[k].w * sin(PI * t);
  vec3 sph = n * (1.0025 + lift);
  if (uMorph <= 0.0) return sph;
  vec3 a = mapPos(uLegA[k].xyz, 0.0), b = mapPos(uLegB[k].xyz, 0.0);
  vec3 chord = b - a;
  vec3 side = length(chord) > 1e-5 ? normalize(cross(uPlaneUp, chord)) : vec3(0.0);
  vec3 flat_ = mapPos(n, 0.0025) + side * lift * 0.55;
  return mix(sph, flat_, unrollAt(uMorph, 0.3));
}
