uniform float uTime;
uniform vec3 uAccent, uHome, uDim;
varying vec2 vUv;
varying float vActive;
varying float vReached;
varying vec4 vMeta;
varying float vA;
void main() {
  float d = length(vUv);
  vec3 col = vMeta.z > 0.5 ? uHome : mix(uDim, uAccent, max(vReached, vActive));
  float core = smoothstep(0.34, 0.24, d) * (vActive > 0.5 ? 1.0 : 0.85);
  float a = core;
  // pulse ring on the active stop; recurring stops loop three rings, always
  float ph = fract(uTime * 0.55 + vMeta.x * 0.37);
  a = max(a, smoothstep(0.07, 0.0, abs(d - (0.3 + ph * 0.7))) * (1.0 - ph) * vActive);
  if (vMeta.y > 0.5) {
    for (int k = 0; k < 3; k++) {
      float q = fract(uTime * 0.42 + float(k) / 3.0);
      a = max(a, smoothstep(0.05, 0.0, abs(d - (0.34 + q * 0.62))) * (1.0 - q) * 0.75 * max(vReached, vActive));
    }
  }
  a *= vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}
