uniform float uTime, uAlpha;
uniform vec3 uHot, uCool, uGlow;
varying float vT, vSide, vProg, vHeat, vOverland, vRecur, vAngle;
void main() {
  if (vT > vProg || vProg <= 0.0) discard;
  float e = abs(vSide);
  float core = exp(-pow(e * 3.4, 2.0));
  float glow = exp(-pow(e * 1.35, 2.0)) * 0.32;
  // the drawing tip runs hot while the leg is still being drawn
  float tip = vProg < 0.999 ? smoothstep(vProg - 0.1, vProg, vT) : 0.0;
  vec3 col = mix(uCool, uHot, vHeat);
  col = mix(col, uGlow, tip * 0.6);
  float a = (core + glow) * mix(0.42, 1.0, vHeat) + tip * core * 0.9;
  // overland legs: road dashes (constant spacing along the ground)
  if (vOverland > 0.5) a *= smoothstep(0.35, 0.5, fract(vT * max(vAngle, 0.004) * 520.0));
  // recurring stops: a pulse keeps running up the leg into them
  if (vRecur > 0.5) a += core * 0.85 * exp(-pow((fract(uTime * 0.32) - vT) * 8.0, 2.0)) * step(0.999, vProg);
  a *= uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a, 0.0);
}
