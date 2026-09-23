uniform vec3 uColor;
varying vec2 vUv;
varying float vA;
void main() {
  float r = length(vUv);
  float core = exp(-r * r * 9.0);
  float glow = exp(-r * r * 2.5) * 0.35;
  float a = (core + glow) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, 0.0);
}
