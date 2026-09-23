varying vec2 vUv;
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(vUv);
  float aa = fwidth(r) * 1.25;
  float a = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, a);
}
