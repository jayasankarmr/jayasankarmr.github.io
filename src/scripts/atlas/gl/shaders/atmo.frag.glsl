// Atmosphere: analytic glow from the view ray's closest approach to the planet, so it works
// from orbit (a limb halo) and from inside the shell during a landing (a horizon band).
// Brighter over the sunlit limb; teal toward the north, indigo toward the south.
uniform vec3 uSun;
uniform vec3 uColA, uColB;
uniform float uIntensity, uHeight;
varying vec3 vWorld;
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  float tca = -dot(ro, rd);
  float d2 = dot(ro, ro) - tca * tca;
  float b = sqrt(max(d2, 0.0));
  vec3 closest = ro + rd * max(tca, 0.0);
  vec3 n = normalize(closest);
  float glow = exp(-max(b - 1.0, 0.0) / uHeight);
  // looking down through the veil: a thin haze that thickens toward the limb
  if (b < 1.0 && tca > 0.0) glow = exp(-(1.0 - b) / (uHeight * 0.4)) * 0.5;
  float sun = 0.3 + 0.7 * smoothstep(-0.35, 0.65, dot(n, uSun));
  vec3 col = mix(uColB, uColA, smoothstep(-0.3, 0.8, n.y));
  gl_FragColor = vec4(col * glow * sun * uIntensity, 0.0);
}
