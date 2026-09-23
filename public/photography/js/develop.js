/* ==========================================================================
   develop.js — the hero photograph develops from an orange-mask negative,
   coming up unevenly like a print in the tray, then hands back to the real
   <img>. Raw WebGL, no dependencies, no cursor interaction.
   The inline check in index.html's <head> adds html.hero-develop only when
   WebGL is present and motion is allowed; that class hides the <img> until
   this script is drawing. Any failure removes the class so the photo shows.
   ========================================================================== */

(function () {
  "use strict";

  var root = document.documentElement;
  if (!root.classList.contains("hero-develop")) return;

  var media = document.querySelector("[data-hero-media]");
  var img = media && media.querySelector("img");
  if (!img) return giveUp();

  var DURATION = 3400; // negative → positive
  var HANDOFF = 1100;  // canvas crossfades back to the plain <img>

  var VERT = "attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }";
  var FRAG = [
    "precision highp float;",
    "uniform sampler2D uTex;",
    "uniform vec2 uRes, uTexSize;",
    "uniform float uTime, uDevelop;",
    "varying vec2 vUv;",
    "float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }",
    "float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y); }",
    "float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return v; }",
    "vec2 coverUv(vec2 uv, vec2 res, vec2 tex){ float rs = res.x / res.y, rt = tex.x / tex.y;",
    "  vec2 s = rs > rt ? vec2(1.0, rt / rs) : vec2(rs / rt, 1.0); return (uv - 0.5) * s + 0.5; }",
    "void main(){",
    "  float agit = 1.0 - uDevelop;",
    // tray agitation: the image sways while it's still coming up
    "  vec2 uv = vUv + agit * 0.01 * vec2(sin(vUv.y * 16.0 + uTime * 1.6), cos(vUv.x * 12.0 + uTime * 1.2));",
    "  vec2 tuv = coverUv(uv, uRes, uTexSize);",
    "  float ca = 0.0015 + agit * 0.004;",
    "  vec3 col = vec3(texture2D(uTex, tuv + vec2(ca, 0.0)).r, texture2D(uTex, tuv).g, texture2D(uTex, tuv - vec2(ca, 0.0)).b);",
    // blotchy threshold so the print develops unevenly
    "  float n = fbm(vUv * 3.0 + uTime * 0.04);",
    "  float dev = smoothstep(n - 0.3, n + 0.05, uDevelop * 1.35 - 0.2);",
    "  vec3 neg = (1.0 - col) * vec3(1.0, 0.6, 0.36) * 0.4;",
    "  col = mix(neg, col, dev);",
    "  col = mix(col, col * vec3(1.0, 0.22, 0.15), (1.0 - dev) * 0.55);", // safelight wash
    // a drifting edge light leak that burns off as the print fixes
    "  float leak = fbm(vUv * 2.1 + vec2(uTime * 0.035, -uTime * 0.028));",
    "  vec3 leakCol = mix(vec3(0.92, 0.2, 0.07), vec3(1.0, 0.68, 0.28), leak);",
    "  float edge = smoothstep(0.55, 1.05, vUv.x + leak * 0.4) * 0.5;",
    "  col += leakCol * edge * leak * dev * agit * 2.0;",
    "  col += (hash(vUv * uRes + fract(uTime * 7.0) * 91.0) - 0.5) * 0.075 * (0.35 + agit);", // grain
    // match the <img>'s CSS filter (hero.css) so the handoff is seamless
    "  col = (col * 1.06 - 0.5) * 1.02 + 0.5;",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  var canvas = document.createElement("canvas");
  canvas.className = "hero__develop";
  canvas.setAttribute("aria-hidden", "true");
  var gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) return giveUp();

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  var prog, loc = {};
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
  } catch (e) {
    return giveUp();
  }
  ["uTex", "uRes", "uTexSize", "uTime", "uDevelop"].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var pLoc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(pLoc);
  gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

  var source = new Image();
  source.decoding = "async";
  source.onerror = giveUp;
  source.onload = start;
  source.src = img.currentSrc || img.src;

  function start() {
    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(loc.uTex, 0);
    gl.uniform2f(loc.uTexSize, source.naturalWidth, source.naturalHeight);

    media.appendChild(canvas);
    var t0 = performance.now();
    var handedOff = false;

    function frame(now) {
      var t = now - t0;
      resize();
      // power2.inOut, same curve the prototype used
      var p = Math.min(1, t / DURATION);
      var dev = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      gl.uniform1f(loc.uTime, t / 1000);
      gl.uniform1f(loc.uDevelop, dev);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (p >= 1 && !handedOff) {
        handedOff = true;
        root.classList.remove("hero-develop"); // the real <img> is back underneath
        canvas.style.transition = "opacity " + HANDOFF + "ms ease";
        canvas.style.opacity = "0";
        setTimeout(function () {
          canvas.remove();
          var lose = gl.getExtension("WEBGL_lose_context");
          if (lose) lose.loseContext();
        }, HANDOFF + 50);
        return;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function resize() {
    // grain hides the lower resolution; saves fill-rate on large screens
    var scale = Math.min(window.devicePixelRatio || 1, 2) * 0.75;
    var w = Math.round(canvas.clientWidth * scale);
    var h = Math.round(canvas.clientHeight * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(loc.uRes, w, h);
  }

  function giveUp() {
    root.classList.remove("hero-develop");
    if (canvas && canvas.parentNode) canvas.remove();
  }
})();
