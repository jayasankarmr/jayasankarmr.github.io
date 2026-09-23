// The comet: a bright head at the tip of the leg being flown, trailed by particles that lag
// behind along the arc and drift off it as they fade.
uniform vec4 uComet; // x leg, y head t, z visible 0–1, w trail length (fraction of the leg)
uniform float uTime, uPixelRatio;
uniform vec2 uViewport;
attribute float aU;
attribute float aSeed;
varying vec2 vUv;
varying float vU;
varying float vA;
void main() {
  int k = int(uComet.x + 0.5);
  float t = uComet.y - aU * uComet.w;
  float alive = step(0.0, t) * uComet.z;
  t = clamp(t, 0.0, 1.0);
  vec3 p = arcPoint(k, t);
  vec3 jit = (hash31(aSeed * 71.3) - 0.5) * 0.012 * aU * (1.0 + 0.5 * sin(uTime * 3.0 + aSeed * 20.0));
  vec4 c = projectionMatrix * viewMatrix * vec4(p + jit * length(p - cameraPosition) * 0.5, 1.0);
  float size = mix(aU < 0.001 ? 11.0 : 4.2, 1.2, aU) * uPixelRatio;
  c.xy += position.xy * size / uViewport * 2.0 * c.w;
  gl_Position = c;
  vUv = position.xy;
  vU = aU;
  vA = alive * (1.0 - aU) * (aU < 0.001 ? 1.0 : 0.75);
}
