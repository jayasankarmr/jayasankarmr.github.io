uniform vec3 uHot, uCore;
varying vec2 vUv;
varying float vU;
varying float vA;
void main() {
  float r = length(vUv);
  float g = exp(-r * r * 4.0);
  vec3 col = mix(uCore, uHot, smoothstep(0.0, 0.25, vU) * 0.8 + r * 0.4);
  float a = g * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a, 0.0);
}
