// The WebGL stage: renderer, scene, camera, sizing and pixel ratio. It never runs its own
// loop — the SceneDirector calls render() from the single GSAP ticker, and simply doesn't
// while the globe is off-stage, the tab is hidden, or the page sits in the bfcache.
import { ColorManagement, LinearSRGBColorSpace, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { TierConfig } from "../tier";
import { AdaptiveDpr } from "../tier";
import { FOV } from "../camera";

// colours are authored as sRGB hex and written out untouched (the look is tuned by eye)
ColorManagement.enabled = false;

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.01, 100);
  readonly dpr: AdaptiveDpr;
  width = 1;
  height = 1;
  private ro: ResizeObserver;
  private onResize = new Set<() => void>();

  constructor(readonly canvas: HTMLCanvasElement, tier: TierConfig) {
    this.dpr = new AdaptiveDpr(tier.dprCap);
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      // MSAA only where it's cheap and visible; at 2× the shaders' own edge AA is enough
      antialias: tier.msaa && (window.devicePixelRatio || 1) < 2,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(this.dpr.value);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth), h = Math.max(1, this.canvas.clientHeight);
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.onResize.forEach((fn) => fn());
  }

  whenResized(fn: () => void) {
    this.onResize.add(fn);
    return () => this.onResize.delete(fn);
  }

  /** Feed a frame interval while animating; applies any pixel-ratio step. */
  private cap: number | null = null;

  sampleFrame(ms: number) {
    if (this.dpr.sample(ms)) {
      this.renderer.setPixelRatio(this.cap === null ? this.dpr.value : Math.min(this.cap, this.dpr.value));
      this.renderer.setSize(this.width, this.height, false);
      this.onResize.forEach((fn) => fn());
    }
  }

  /** Temporarily cap the pixel ratio (the ambient map); null restores the adaptive value. */
  setDprCap(cap: number | null) {
    this.cap = cap;
    const v = cap === null ? this.dpr.value : Math.min(cap, this.dpr.value);
    if (v === this.renderer.getPixelRatio()) return;
    this.renderer.setPixelRatio(v);
    this.renderer.setSize(this.width, this.height, false);
    this.onResize.forEach((fn) => fn());
  }

  get pixelRatio() {
    return this.renderer.getPixelRatio();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
      m.geometry?.dispose();
      if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
      else m.material?.dispose();
    });
    this.renderer.dispose();
  }
}
