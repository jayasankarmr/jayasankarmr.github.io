// Stop markers: screen-facing so they stay crisp at every altitude. States come from uniforms.
uniform float uTime, uMorph, uIntro, uActive, uReached, uPixelRatio;
uniform vec2 uViewport;
attribute vec3 aPos;
attribute vec4 aMeta; // x index, y recurring, z home, w unroll delay
varying vec2 vUv;
varying float vActive;
varying float vReached;
varying vec4 vMeta;
varying float vA;
void main() {
  vec3 n = aPos;
  vec3 p = n * 1.0015;
  if (uMorph > 0.0) p = mix(p, mapPos(n, 0.0015), unrollAt(uMorph, aMeta.w));
  vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float isActive = 1.0 - step(0.5, abs(aMeta.x - uActive));
  float size = (isActive > 0.5 ? 34.0 : aMeta.y > 0.5 ? 22.0 : 14.0) * uPixelRatio;
  clip.xy += position.xy * size / uViewport * 2.0 * clip.w;
  gl_Position = clip;
  vUv = position.xy;
  vActive = isActive;
  vReached = step(aMeta.x, uReached + 0.5);
  vMeta = aMeta;
  vec3 toCam = normalize(cameraPosition - p);
  vec3 nn = uMorph > 0.0 ? normalize(mix(n, uPlaneUp, unrollAt(uMorph, aMeta.w))) : n;
  vA = smoothstep(-0.05, 0.25, dot(nn, toCam)) * smoothstep(0.8, 1.0, uIntro);
}
