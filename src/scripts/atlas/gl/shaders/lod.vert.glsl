// LOD clipmap: a G×G hex grid of dots, fixed in lat/lng space (so it never swims) and
// re-centred on the camera's ground point. Land and water come from the regional 10m masks,
// so coastlines, lakes and rivers resolve at city scale. The landing wave travels through it.
uniform float uTime, uStepLat, uStepLng, uG, uSize, uMinPx, uMaxPx, uPixelRatio, uAlpha, uNight, uRivers;
uniform vec2 uViewport;
uniform vec2 uIdx;        // snapped centre: (row, column) indices of the grid
uniform vec4 uRegion;     // west, north, width°, height° of the mask textures
uniform sampler2D uLand, uWater;
uniform vec3 uSun, uColN, uColS, uWaterCol;
uniform vec4 uWave;       // xyz landing point, w: seconds since landing (< 0: none)
varying vec2 vUv;
varying vec3 vCol;
varying float vA;

void main() {
  float id = float(gl_InstanceID);
  float j = floor(id / uG), i = id - j * uG;
  float half_ = floor(uG * 0.5);
  float R = uIdx.x + j - half_;
  float C = uIdx.y + i - half_;
  vec3 h = hash31(R * 157.0 + C * 0.731);
  float lat = (R + (h.x - 0.5) * 0.3) * uStepLat;
  float lng = (C + 0.5 * mod(R, 2.0) + (h.y - 0.5) * 0.3) * uStepLng;

  vec2 uv = vec2((lng - uRegion.x) / uRegion.z, (uRegion.y - lat) / uRegion.w);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float land = texture2D(uLand, uv).r * inside;
  float water = texture2D(uWater, uv).r * inside * uRivers;
  float isWater = step(0.5, water);
  float show = max(step(0.5, land), isWater);

  float phi = radians(90.0 - lat), theta = radians(lng + 180.0);
  vec3 n = vec3(-sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));

  // radial fade toward the patch edge
  float cr = abs(i - half_) / half_, cc = abs(j - half_) / half_;
  float edge = 1.0 - smoothstep(0.62, 0.98, length(vec2(cr, cc)));

  // landing shockwave: a ring that lifts and flares dots as it passes
  float wave = 0.0;
  if (uWave.w >= 0.0) {
    float d = acos(clamp(dot(n, uWave.xyz), -1.0, 1.0));
    float r = uWave.w * 0.022;
    wave = exp(-pow((d - r) / 0.0035, 2.0)) * exp(-uWave.w * 1.6);
  }
  vec3 p = n * (1.0008 + wave * 0.004);

  vec3 toCam = normalize(cameraPosition - p);
  vec3 t1 = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n, t1);
  float pxPerUnit = uViewport.y / (2.0 * distance(cameraPosition, p) * 0.26795);
  float size = uSize * (0.9 + 0.2 * h.z) * (1.0 + isWater * 0.25 + wave * 1.5);
  size = clamp(size, uMinPx * uPixelRatio / pxPerUnit, uMaxPx * uPixelRatio / pxPerUnit);
  size *= show;
  gl_Position = projectionMatrix * viewMatrix * vec4(p + (t1 * position.x + t2 * position.y) * size, 1.0);
  vUv = position.xy;

  vec3 col = mix(uColS, uColN, smoothstep(-0.55, 0.75, n.y));
  col = mix(col, uWaterCol, isWater);
  float day = smoothstep(-0.12, 0.18, dot(n, uSun));
  col *= mix(uNight, 1.0, day);
  col += vec3(1.0, 0.8, 0.5) * wave * 1.2;
  float swell = 0.5 + 0.5 * sin(uTime * 0.7 + h.z * TAU);
  vCol = col;
  vA = uAlpha * edge * show * smoothstep(-0.02, 0.3, dot(n, toCam)) * (0.75 + 0.25 * swell) * mix(1.0, 1.25, isWater);
}
