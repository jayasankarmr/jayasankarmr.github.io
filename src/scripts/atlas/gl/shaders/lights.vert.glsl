// City lights: real populated places, glowing only on the night side.
uniform float uTime, uSize, uIntro, uMorph, uAlpha, uPixelRatio;
uniform vec2 uViewport;
uniform vec3 uSun;
attribute vec3 aPos;
attribute vec2 aMeta; // x weight 0–1, y seed
varying vec2 vUv;
varying float vA;
void main() {
  vec3 n = aPos;
  vec3 p = n * 1.0012;
  vec3 nn = n;
  if (uMorph > 0.0) {
    float mp = unrollAt(uMorph, 0.5);
    p = mix(p, mapPos(n, 0.0012), mp);
    nn = normalize(mix(n, uPlaneUp, mp));
  }
  vec3 toCam = normalize(cameraPosition - p);
  vec3 t1 = normalize(cross(nn, abs(nn.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(nn, t1);
  float w = aMeta.x;
  float camDist = distance(cameraPosition, p);
  float pxPerUnit = uViewport.y / (2.0 * camDist * 0.26795);
  float size = min(uSize * (0.55 + 1.3 * w), (1.2 + 2.2 * w) * uPixelRatio / pxPerUnit);
  gl_Position = projectionMatrix * viewMatrix * vec4(p + (t1 * position.x + t2 * position.y) * size, 1.0);
  vUv = position.xy;
  float night = smoothstep(0.08, -0.16, dot(n, uSun));
  float twinkle = 0.75 + 0.25 * sin(uTime * (1.3 + aMeta.y * 2.0) + aMeta.y * 40.0);
  // an orbit-scale feature: it fades out as the camera comes down to regional views
  vA = uAlpha * night * twinkle * (0.35 + 0.65 * w) * smoothstep(0.0, 0.35, dot(nn, toCam)) * smoothstep(0.7, 1.0, uIntro) * smoothstep(0.7, 1.8, camDist);
}
