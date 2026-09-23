// Starfield: three depth shells; stars stretch into streaks with scroll velocity.
uniform float uTime, uAlpha, uPixelRatio;
uniform vec2 uViewport;
uniform vec2 uStreak; // screen-space velocity (px/frame), already scaled
attribute vec3 aDir;
attribute vec4 aMeta; // x layer 0–1 (near → far), y size px, z seed, w twinkle speed
varying vec2 vUv;
varying float vA;
varying float vStretch;
void main() {
  float layer = aMeta.x;
  vec3 world = aDir * mix(22.0, 60.0, layer);
  vec4 clip = projectionMatrix * viewMatrix * vec4(world, 1.0);
  float depthFactor = mix(1.0, 0.35, layer);
  vec2 vel = uStreak * depthFactor;
  float len = length(vel);
  vec2 dir = len > 0.001 ? vel / len : vec2(0.0, 1.0);
  vec2 side = vec2(-dir.y, dir.x);
  float size = aMeta.y * uPixelRatio;
  vec2 off = side * position.x * size + dir * position.y * (size + len * uPixelRatio);
  clip.xy += off / uViewport * 2.0 * clip.w;
  gl_Position = clip;
  vUv = position.xy;
  vStretch = len;
  float tw = 0.65 + 0.35 * sin(uTime * aMeta.w + aMeta.z * 50.0);
  vA = uAlpha * tw * mix(0.9, 0.4, layer);
}
