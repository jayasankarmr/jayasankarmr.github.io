// Land dots: instanced quads lying on the surface (so they foreshorten when the camera tilts).
// They breathe, lift under the cursor, dim on the night side, fly in from the starfield during
// the intro, and unroll onto the flat map.
uniform float uTime, uSize, uIntro, uMorph, uAlpha, uNight, uMinPx, uMaxPx, uPixelRatio;
uniform vec2 uViewport;
uniform vec3 uSun, uCursor;
uniform float uCursorAmt;
uniform vec3 uColN, uColS, uColLimb;
uniform vec4 uLodCenter; // xyz: LOD patch centre, w: its angular radius (0 = no patch)
uniform float uLod;
attribute vec3 aPos;
attribute vec4 aMeta; // x seed, y intro delay, z unroll delay, w size jitter
varying vec2 vUv;
varying vec3 vCol;
varying float vA;

void main() {
  vec3 n = aPos;
  float seed = aMeta.x;

  float lp = clamp((uIntro - aMeta.y * 0.55) / 0.45, 0.0, 1.0);
  float e = easeOut3(lp);

  float swell = 0.5 + 0.5 * sin(uTime * 0.7 + seed * TAU + dot(n, vec3(3.1, 4.7, 2.3)));
  float cd = acos(clamp(dot(n, uCursor), -1.0, 1.0));
  float lift = exp(-pow(cd / 0.09, 2.0)) * uCursorAmt;
  float ring = sin(cd * 55.0 - uTime * 5.0) * exp(-cd * 9.0) * uCursorAmt;
  vec3 p = n * (1.0006 + lift * 0.035 + ring * 0.004);

  vec3 nn = n;
  if (uMorph > 0.0) {
    float mp = unrollAt(uMorph, aMeta.z);
    p = mix(p, mapPos(n, 0.0006), mp);
    nn = normalize(mix(n, uPlaneUp, mp));
  }

  vec3 start = normalize(hash31(seed * 91.7) - 0.5) * (3.0 + 4.5 * hash11(seed * 13.1));
  vec3 wob = vec3(sin(seed * 40.0 + lp * 6.0), cos(seed * 31.0 + lp * 5.0), sin(seed * 17.0 - lp * 7.0)) * 0.35 * (1.0 - e);
  p = mix(start + wob, p, e);

  vec3 toCam = normalize(cameraPosition - p);
  vec3 ori = normalize(mix(toCam, nn, e));
  vec3 t1 = normalize(cross(ori, abs(ori.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(ori, t1);
  float size = uSize * (0.85 + 0.3 * swell) * (1.0 + lift * 0.7) * (0.9 + 0.2 * aMeta.w) * mix(1.6, 1.0, e);
  // keep each dot between uMinPx and uMaxPx on screen (radius, CSS px) at any distance
  float pxPerUnit = uViewport.y / (2.0 * distance(cameraPosition, p) * 0.26795);
  size = clamp(size, uMinPx * uPixelRatio / pxPerUnit, uMaxPx * uPixelRatio * (1.0 + lift) / pxPerUnit);
  vec3 world = p + (t1 * position.x + t2 * position.y) * size;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  vUv = position.xy;

  float facing = dot(nn, toCam);
  vec3 col = mix(uColS, uColN, smoothstep(-0.55, 0.75, n.y));
  col = mix(col, uColLimb, smoothstep(0.6, 0.0, facing) * 0.55);
  float day = smoothstep(-0.12, 0.18, dot(n, uSun));
  col *= mix(uNight, 1.0, day);
  col = mix(col, vec3(1.0, 0.86, 0.62), lift * 0.45);
  // the LOD patch takes over near its centre when the camera is close
  float inPatch = uLodCenter.w > 0.0 ? 1.0 - smoothstep(uLodCenter.w * 0.72, uLodCenter.w, acos(clamp(dot(n, uLodCenter.xyz), -1.0, 1.0))) : 0.0;
  vCol = col;
  vA = uAlpha * mix(1.0, smoothstep(-0.02, 0.3, facing), e) * (0.72 + 0.28 * swell) * smoothstep(0.0, 0.25, lp) * (1.0 - uLod * inPatch);
}
