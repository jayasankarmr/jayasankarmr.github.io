// Route ribbons: every leg in one geometry. Width is in screen pixels (a quad strip offset
// across the projected direction), so arcs stay crisp at any altitude.
uniform vec4 uLegS[LEGS]; // x drawn fraction, y heat (1 hot → 0 cooled), z overland, w recurring
uniform float uPixelRatio;
uniform vec2 uViewport;
attribute float aLeg, aT, aSide;
varying float vT, vSide, vProg, vHeat, vOverland, vRecur, vAngle;

vec2 toScreen(vec4 c) { return (c.xy / c.w) * 0.5 * uViewport; }

void main() {
  int k = int(aLeg + 0.5);
  vec4 st = uLegS[k];
  mat4 pv = projectionMatrix * viewMatrix;
  vec4 c0 = pv * vec4(arcPoint(k, aT), 1.0);
  vec4 cA = pv * vec4(arcPoint(k, max(aT - 0.004, 0.0)), 1.0);
  vec4 cB = pv * vec4(arcPoint(k, min(aT + 0.004, 1.0)), 1.0);
  vec2 d = toScreen(cB) - toScreen(cA);
  vec2 dir = length(d) > 1e-4 ? normalize(d) : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  // half-width in px: a glow wide enough to read, a hotter leg a little wider
  float halfPx = (st.z > 0.5 ? 4.0 : 5.5) * mix(0.75, 1.0, st.y);
  c0.xy += nrm * aSide * halfPx * uPixelRatio * 2.0 / uViewport * c0.w;
  gl_Position = c0;
  vT = aT;
  vSide = aSide;
  vProg = st.x;
  vHeat = st.y;
  vOverland = st.z;
  vRecur = st.w;
  vAngle = uLegB[k].w;
}
