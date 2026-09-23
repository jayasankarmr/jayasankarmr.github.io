// Device tiers for the atlas scene, and an adaptive pixel-ratio controller.
// High: Apple silicon / discrete GPUs. Mid: recent integrated and phone GPUs. Low: older phones
// and weak iGPUs. None: no WebGL2, or a software rasteriser — the static SVG map takes over.
// `?tier=high|mid|low|none` in the URL forces a tier (QA).

export type TierName = "high" | "mid" | "low" | "none";

export type TierConfig = {
  name: TierName;
  gpu: string;
  mobile: boolean;
  /** Fibonacci lattice size for the global dots (≈26% of it lands on land) */
  lattice: number;
  /** LOD clipmap grid (G×G instances) */
  lodGrid: number;
  dprCap: number;
  msaa: boolean;
  bloom: boolean;
  lights: boolean;
  ripple: boolean;
  stars: number;
  starLayers: number;
};

const TABLE: Record<Exclude<TierName, "none">, Omit<TierConfig, "name" | "gpu" | "mobile" | "dprCap">> = {
  high: { lattice: 80000, lodGrid: 176, msaa: true, bloom: true, lights: true, ripple: true, stars: 3000, starLayers: 3 },
  mid: { lattice: 50000, lodGrid: 128, msaa: true, bloom: false, lights: true, ripple: true, stars: 1500, starLayers: 2 },
  low: { lattice: 26000, lodGrid: 88, msaa: false, bloom: false, lights: false, ripple: false, stars: 800, starLayers: 1 },
};

function gpuString(): string | null {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const s = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return s;
  } catch {
    return null;
  }
}

function classify(gpu: string): TierName {
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(g)) return "none";
  if (/apple m\d|apple gpu|nvidia|geforce|quadro|rtx|radeon (rx|pro)|radeon\(tm\) (rx|pro)|amd radeon/.test(g)) return "high";
  if (/adreno[^\d]*(6[5-9]\d|7\d\d|8\d\d)|mali-g(7[1-9]|[89]\d|\d{3})|immortalis|xclipse|intel.*(iris|arc)/.test(g)) return "mid";
  if (/adreno|mali|powervr|intel|videocore/.test(g)) return "low";
  return "mid";
}

const DOWN: Record<TierName, TierName> = { high: "mid", mid: "low", low: "low", none: "none" };

let cached: TierConfig | undefined;

export function detectTier(): TierConfig {
  if (cached) return cached;
  const mobile = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 820;
  const forced = new URLSearchParams(location.search).get("tier") as TierName | null;
  const gpu = gpuString();
  let name: TierName = gpu === null ? "none" : classify(gpu);
  if (name !== "none") {
    const cores = navigator.hardwareConcurrency || 4;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    if (cores <= 4 || mem <= 4) name = DOWN[name];
    if (mobile && name === "high") name = "mid";
  }
  if (forced && ["high", "mid", "low", "none"].includes(forced)) name = forced;
  const dprCap = name === "high" && !mobile ? 2 : mobile ? 1.5 : name === "low" ? 1.25 : 1.5;
  cached = name === "none"
    ? { name, gpu: gpu ?? "none", mobile, dprCap: 1, ...TABLE.low }
    : { name, gpu: gpu ?? "", mobile, dprCap, ...TABLE[name] };
  return cached;
}

/**
 * Adaptive pixel ratio: steps down when frames are being dropped, and back up (never past
 * the tier cap) after a long clean run. Any step up that causes drops locks the ceiling.
 */
export class AdaptiveDpr {
  value: number;
  private ceiling: number;
  private window: number[] = [];
  private cleanFor = 0;
  private sinceChange = 0;
  private lastUp = -1;

  constructor(private cap: number, private floor = 1) {
    this.value = Math.min(cap, window.devicePixelRatio || 1);
    this.ceiling = this.value;
  }

  /** Feed one frame interval (ms) while the scene is animating; returns true if DPR changed. */
  sample(ms: number): boolean {
    if (ms > 250) return false; // tab switch, breakpoint — not a rendering signal
    this.window.push(ms);
    if (this.window.length > 90) this.window.shift();
    this.sinceChange += ms;
    if (this.lastUp >= 0 && this.sinceChange > 4000) this.lastUp = -1; // the step up held
    this.cleanFor = ms < 18.5 ? this.cleanFor + ms : 0;
    if (this.window.length < 45 || this.sinceChange < 1500) return false;
    const avg = this.window.reduce((a, b) => a + b, 0) / this.window.length;
    if (avg > 20 && this.value > this.floor) {
      if (this.lastUp >= 0 && this.sinceChange < 4000) this.ceiling = this.lastUp - 0.25;
      return this.set(Math.max(this.floor, this.value - 0.25));
    }
    if (this.cleanFor > 6000 && this.value < Math.min(this.cap, this.ceiling)) {
      this.lastUp = this.value + 0.25;
      return this.set(Math.min(this.cap, this.ceiling, this.value + 0.25));
    }
    return false;
  }

  private set(v: number) {
    if (v === this.value) return false;
    this.value = v;
    this.window.length = 0;
    this.sinceChange = 0;
    this.cleanFor = 0;
    return true;
  }
}
