// The planet's body: deep night ocean with a cool inner rim that brightens on the sunlit limb.
uniform vec3 uColor, uRim;
uniform vec3 uSun;
uniform float uAlpha;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec3 v = normalize(cameraPosition - vWorld);
  float facing = max(dot(vN, v), 0.0);
  float rim = pow(1.0 - facing, 3.2);
  float sun = smoothstep(-0.25, 0.6, dot(vN, uSun));
  vec3 col = uColor * (0.8 + 0.35 * sun) + uRim * rim * (0.45 + 0.55 * sun);
  gl_FragColor = vec4(col, uAlpha);
}
