uniform vec3 uColor;
varying vec2 vUv;
varying float vA;
varying float vStretch;
void main() {
  float r = length(vec2(vUv.x, vUv.y * (vStretch > 0.5 ? 0.35 : 1.0)));
  float a = smoothstep(1.0, 0.0, r) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, 0.0);
}
