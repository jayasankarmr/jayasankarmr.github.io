// Selective bloom, high tier only: the amber glow layer (route ribbons + comet, with the planet as
// a depth-only occluder so far-side arcs can't glow through it) renders into a quarter-resolution
// target, a dual-Kawase down/up pair softens it, and it is added back over the frame. Six draw
// calls, and only while there are routes to glow (not in the hero). Grain and vignette are CSS.
import {
  HalfFloatType, LinearFilter, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial,
  UnsignedByteType, Vector2, WebGLRenderTarget, type Camera, type Object3D, type TextureDataType,
} from "three";
import type { Stage } from "./stage";
import { ADDITIVE } from "./world";

export const BLOOM_LAYER = 1;

const vert = /* glsl */ `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// dual Kawase: a 5-tap downsample and an 8-tap tent upsample, both leaning on bilinear filtering
const down = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec4 s = texture2D(tSrc, vUv) * 4.0;
  s += texture2D(tSrc, vUv - o) + texture2D(tSrc, vUv + o);
  s += texture2D(tSrc, vUv + vec2(o.x, -o.y)) + texture2D(tSrc, vUv - vec2(o.x, -o.y));
  gl_FragColor = s / 8.0;
}`;
const up = /* glsl */ `uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uStrength; varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec4 s = texture2D(tSrc, vUv + vec2(-2.0 * o.x, 0.0)) + texture2D(tSrc, vUv + vec2(2.0 * o.x, 0.0));
  s += texture2D(tSrc, vUv + vec2(0.0, 2.0 * o.y)) + texture2D(tSrc, vUv + vec2(0.0, -2.0 * o.y));
  s += (texture2D(tSrc, vUv + o) + texture2D(tSrc, vUv - o) + texture2D(tSrc, vUv + vec2(o.x, -o.y)) + texture2D(tSrc, vUv - vec2(o.x, -o.y))) * 2.0;
  gl_FragColor = vec4(s.rgb / 12.0 * uStrength, 0.0);
}`;

export class Bloom {
  /** 0 = off (nothing drawn); scaled by the director with the routes' own fade */
  strength = 0;
  private a: WebGLRenderTarget;
  private b: WebGLRenderTarget;
  private c: WebGLRenderTarget;
  private quad = new Scene();
  private cam = new OrthographicCamera();
  private mDown: Mesh;
  private mUp: Mesh;
  private mComp: Mesh;
  private occluder: Mesh;

  constructor(private stage: Stage, glow: Object3D[], private body: Mesh) {
    const r = stage.renderer;
    // the glow is additive and runs past 1.0 where arcs cross; keep that headroom if we can
    const type: TextureDataType = r.extensions.has("EXT_color_buffer_float") ? HalfFloatType : UnsignedByteType;
    const rt = (depthBuffer: boolean) => new WebGLRenderTarget(1, 1, { type, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer, stencilBuffer: false });
    this.a = rt(true);
    this.b = rt(false);
    this.c = rt(false);
    glow.forEach((o) => o.layers.enable(BLOOM_LAYER));
    // the planet, depth only, so the glow pass is occluded exactly like the frame
    this.occluder = new Mesh(body.geometry, new MeshBasicMaterial({ colorWrite: false }));
    this.occluder.layers.set(BLOOM_LAYER);
    this.occluder.renderOrder = -1;
    stage.scene.add(this.occluder);

    const g = new PlaneGeometry(2, 2);
    const mat = (frag: string, blend: boolean) => new ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, uTexel: { value: new Vector2() }, uStrength: { value: 1 } },
      ...(blend ? { transparent: true, ...ADDITIVE } : {}),
    });
    const quad = (m: ShaderMaterial) => { const q = new Mesh(g, m); q.frustumCulled = false; this.quad.add(q); return q; };
    this.mDown = quad(mat(down, false));
    this.mUp = quad(mat(up, false));
    this.mComp = quad(mat(up, true));
    this.resize();
    stage.whenResized(() => this.resize());
  }

  /** Compile the glow and blur programs up front, so the first flight doesn't stall. */
  async compile() {
    const { renderer, scene, camera } = this.stage;
    const mask = camera.layers.mask;
    camera.layers.enableAll();
    await renderer.compileAsync(scene, camera);
    camera.layers.mask = mask;
    await renderer.compileAsync(this.quad, this.cam);
    // allocate the targets and run each pass once now, not on the first frame of the journey
    // (routes are all undrawn at this point, so the composite adds nothing to the canvas)
    [this.a, this.b, this.c].forEach((t) => renderer.initRenderTarget(t));
    this.strength = 1;
    this.render(camera);
    this.strength = 0;
  }

  private resize() {
    const pr = this.stage.pixelRatio;
    const w = Math.max(1, Math.round((this.stage.width * pr) / 4)), h = Math.max(1, Math.round((this.stage.height * pr) / 4));
    this.a.setSize(w, h);
    this.b.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.c.setSize(w, h);
  }

  private pass(q: Mesh, src: WebGLRenderTarget, dst: WebGLRenderTarget | null) {
    const m = q.material as ShaderMaterial;
    m.uniforms.tSrc.value = src.texture;
    (m.uniforms.uTexel.value as Vector2).set(1 / src.width, 1 / src.height);
    this.quad.children.forEach((c) => (c.visible = c === q));
    const r = this.stage.renderer;
    r.setRenderTarget(dst);
    if (dst) r.clear(true, false, false);
    r.render(this.quad, this.cam);
  }

  /** After the frame has been drawn to the canvas: glow → blur → add. */
  render(camera: Camera) {
    if (this.strength <= 0.001) return;
    const r = this.stage.renderer;
    const auto = r.autoClear;
    r.autoClear = false;
    const mask = camera.layers.mask;
    camera.layers.set(BLOOM_LAYER);
    // occlude exactly as the frame did: the planet stops writing depth as the world unrolls
    this.occluder.visible = this.body.visible && (this.body.material as ShaderMaterial).depthWrite;
    r.setRenderTarget(this.a);
    r.clear(true, true, false);
    r.render(this.stage.scene, camera);
    camera.layers.mask = mask;
    this.pass(this.mDown, this.a, this.b);
    this.pass(this.mUp, this.b, this.c);
    (this.mComp.material as ShaderMaterial).uniforms.uStrength.value = this.strength;
    this.pass(this.mComp, this.c, null);
    r.autoClear = auto;
  }
}
