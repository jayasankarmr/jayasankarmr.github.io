// The atlas world: planet body, atmosphere, land dots, city lights, starfield, stop markers.
// Every material shares one set of uniform objects (time, sun, intro, unroll…), so the
// director writes each value once per frame.
import {
  AddEquation, BackSide, BufferAttribute, DoubleSide, BufferGeometry, Color, CustomBlending, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, NormalBlending, OneFactor, ShaderMaterial, SphereGeometry, Vector2, Vector3, Vector4,
  ZeroFactor,
} from "three";
import type { Stage } from "./stage";
import type { TierConfig } from "../tier";
import { mapPlane, toVec } from "../geo";
import { landDots, cityLights, loadWorldMask } from "./data";
import common from "./shaders/common.glsl?raw";
import bodyVert from "./shaders/body.vert.glsl?raw";
import bodyFrag from "./shaders/body.frag.glsl?raw";
import dotsVert from "./shaders/dots.vert.glsl?raw";
import dotsFrag from "./shaders/dots.frag.glsl?raw";
import lightsVert from "./shaders/lights.vert.glsl?raw";
import lightsFrag from "./shaders/lights.frag.glsl?raw";
import atmoVert from "./shaders/atmo.vert.glsl?raw";
import atmoFrag from "./shaders/atmo.frag.glsl?raw";
import starsVert from "./shaders/stars.vert.glsl?raw";
import starsFrag from "./shaders/stars.frag.glsl?raw";
import markersVert from "./shaders/markers.vert.glsl?raw";
import markersFrag from "./shaders/markers.frag.glsl?raw";

export type WorldPlace = { lat: number; lng: number; recurring?: boolean; home?: boolean };

export const PALETTE = {
  body: "#050818",
  rim: "#2c47d6",
  landN: "#6ff2e0",
  landS: "#9a82ff",
  limb: "#4a5cff",
  atmoA: "#39c6ff",
  atmoB: "#5057ff",
  lights: "#ffe2b8",
  stars: "#b9c2ff",
  accent: "#ffb454",
  home: "#6ff2e0",
  dim: "#8990c4",
};

const col = (hex: string) => new Color(hex);

/**
 * Light that adds onto whatever is behind it — including the page, through the transparent
 * canvas — without writing alpha (which would turn empty space opaque black). Shaders using it
 * output premultiplied colour.
 */
export const ADDITIVE = {
  blending: CustomBlending, blendEquation: AddEquation,
  blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
} as const;

/** A unit quad (two triangles) that instanced meshes stamp once per instance. */
function quad(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function instanced(attrs: Record<string, [Float32Array, number]>, count: number) {
  const g = new InstancedBufferGeometry();
  const q = quad();
  g.setAttribute("position", q.getAttribute("position"));
  g.setIndex(q.getIndex());
  for (const [name, [arr, size]] of Object.entries(attrs)) g.setAttribute(name, new InstancedBufferAttribute(arr, size));
  g.instanceCount = count;
  return g;
}

export class World {
  /** shared uniforms — the director writes these every frame */
  readonly u = {
    uTime: { value: 0 },
    uIntro: { value: 1 },
    uMorph: { value: 0 },
    uAlpha: { value: 1 },
    uSun: { value: new Vector3(1, 0, 0) },
    uCursor: { value: new Vector3(0, 0, 0) },
    uCursorAmt: { value: 0 },
    uPlaneUp: { value: new Vector3() },
    uPlaneEast: { value: new Vector3() },
    uPlaneNorth: { value: new Vector3() },
    uPlane: { value: new Vector3() },
    uPixelRatio: { value: 1 },
    uViewport: { value: new Vector2(1, 1) },
    uLod: { value: 0 },
    /** xyz: centre of the LOD patch, w: its angular radius (0 = none) */
    uLodCenter: { value: new Vector4(0, 0, 0, 0) },
  };
  readonly marker = { uActive: { value: -1 }, uReached: { value: -1 } };
  dotCount = 0;
  private body?: Mesh;
  private atmo?: Mesh;

  constructor(private stage: Stage, private tier: TierConfig, private places: WorldPlace[]) {
    const plane = mapPlane(22, 82);
    this.u.uPlaneUp.value.fromArray(plane.up);
    this.u.uPlaneEast.value.fromArray(plane.east);
    this.u.uPlaneNorth.value.fromArray(plane.north);
    this.u.uPlane.value.set((82 * Math.PI) / 180, plane.y0, plane.scale);
  }

  async build() {
    const { scene } = this.stage;
    const home = toVec(this.places[0].lat, this.places[0].lng);
    const centre = toVec(22, 82);
    const [mask, lights] = await Promise.all([loadWorldMask(), this.tier.lights ? cityLights() : Promise.resolve(null)]);

    // ---- stars (drawn first, behind everything)
    const n = this.tier.stars;
    const dir = new Float32Array(n * 3), sm = new Float32Array(n * 4);
    const v = new Vector3();
    for (let i = 0; i < n; i++) {
      v.randomDirection().toArray(dir, i * 3);
      const layer = Math.floor(Math.random() * this.tier.starLayers) / Math.max(1, this.tier.starLayers - 1);
      sm.set([this.tier.starLayers === 1 ? 0.5 : layer, 0.6 + Math.random() ** 3 * 1.4, Math.random(), 0.4 + Math.random() * 1.8], i * 4);
    }
    const stars = new Mesh(instanced({ aDir: [dir, 3], aMeta: [sm, 4] }, n), new ShaderMaterial({
      vertexShader: common + starsVert, fragmentShader: starsFrag,
      uniforms: { ...this.u, uStreak: { value: new Vector2() }, uColor: { value: col(PALETTE.stars) } },
      // streak quads are built along the velocity, so their winding follows its direction
      side: DoubleSide, transparent: true, depthTest: false, depthWrite: false, ...ADDITIVE,
    }));
    stars.renderOrder = -10;
    stars.frustumCulled = false;
    stars.name = "stars";
    scene.add(stars);

    // ---- planet body: occludes the far side, carries the inner rim
    this.body = new Mesh(new SphereGeometry(0.995, 96, 64), new ShaderMaterial({
      vertexShader: bodyVert, fragmentShader: bodyFrag,
      uniforms: { uColor: { value: col(PALETTE.body) }, uRim: { value: col(PALETTE.rim) }, uSun: this.u.uSun, uAlpha: { value: 1 } },
      transparent: true,
    }));
    this.body.renderOrder = 0;
    scene.add(this.body);

    // ---- land dots
    const field = landDots(this.tier.lattice, mask, home, centre);
    this.dotCount = field.count;
    const spacing = Math.sqrt((4 * Math.PI) / this.tier.lattice);
    const dots = new Mesh(instanced({ aPos: [field.pos, 3], aMeta: [field.meta, 4] }, field.count), new ShaderMaterial({
      vertexShader: common + dotsVert, fragmentShader: dotsFrag,
      uniforms: {
        ...this.u,
        uSize: { value: spacing * 0.4 },
        uMinPx: { value: 0.75 },
        uMaxPx: { value: 3.4 },
        uNight: { value: 0.72 },
        uColN: { value: col(PALETTE.landN) }, uColS: { value: col(PALETTE.landS) }, uColLimb: { value: col(PALETTE.limb) },
      },
      transparent: true, depthWrite: false, blending: NormalBlending,
    }));
    dots.frustumCulled = false;
    dots.renderOrder = 2;
    dots.name = "dots";
    scene.add(dots);

    // ---- city lights (night side)
    if (lights) {
      const lm = new Mesh(instanced({ aPos: [lights.pos, 3], aMeta: [lights.meta, 2] }, lights.count), new ShaderMaterial({
        vertexShader: common + lightsVert, fragmentShader: lightsFrag,
        uniforms: { ...this.u, uSize: { value: spacing * 0.3 }, uColor: { value: col(PALETTE.lights) } },
        transparent: true, depthWrite: false, ...ADDITIVE,
      }));
      lm.frustumCulled = false;
      lm.renderOrder = 3;
      lm.name = "lights";
      scene.add(lm);
    }

    // ---- atmosphere shell
    this.atmo = new Mesh(new SphereGeometry(1.28, 96, 64), new ShaderMaterial({
      vertexShader: atmoVert, fragmentShader: atmoFrag,
      uniforms: { uSun: this.u.uSun, uColA: { value: col(PALETTE.atmoA) }, uColB: { value: col(PALETTE.atmoB) }, uIntensity: { value: 0.85 }, uHeight: { value: 0.045 } },
      side: BackSide, transparent: true, depthWrite: false, ...ADDITIVE,
    }));
    this.atmo.renderOrder = 1;
    this.atmo.name = "atmosphere";
    scene.add(this.atmo);

    // ---- stop markers
    const np = this.places.length;
    const mp = new Float32Array(np * 3), mm = new Float32Array(np * 4);
    this.places.forEach((p, i) => {
      const pv = toVec(p.lat, p.lng);
      mp.set(pv, i * 3);
      mm.set([i, p.recurring ? 1 : 0, p.home ? 1 : 0, 0.3], i * 4);
    });
    const markers = new Mesh(instanced({ aPos: [mp, 3], aMeta: [mm, 4] }, np), new ShaderMaterial({
      vertexShader: common + markersVert, fragmentShader: markersFrag,
      uniforms: {
        ...this.u, ...this.marker,
        uAccent: { value: col(PALETTE.accent) }, uHome: { value: col(PALETTE.home) }, uDim: { value: col(PALETTE.dim) },
      },
      transparent: true, depthWrite: false, depthTest: true,
    }));
    markers.frustumCulled = false;
    markers.renderOrder = 6;
    markers.name = "markers";
    scene.add(markers);

  }

  /** Compile every program up front (hidden layers included), so no first use stalls a frame. */
  async compileAll() {
    const { scene, camera, renderer } = this.stage;
    const hidden: { visible: boolean }[] = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    await renderer.compileAsync(scene, camera);
    hidden.forEach((o) => (o.visible = false));
  }

  /** Stars stretch along this screen-space velocity (CSS px per frame). */
  setStreak(x: number, y: number) {
    const s = this.stage.scene.getObjectByName("stars") as Mesh | undefined;
    ((s?.material as ShaderMaterial | undefined)?.uniforms.uStreak.value as Vector2 | undefined)?.set(x, y);
  }

  /** Atmosphere and body fade (intro fade-in, the unroll). */
  setAtmosphere(intensity: number) {
    if (this.atmo) (this.atmo.material as ShaderMaterial).uniforms.uIntensity.value = intensity;
  }

  setBodyAlpha(a: number) {
    if (!this.body) return;
    const m = this.body.material as ShaderMaterial;
    m.uniforms.uAlpha.value = a;
    m.depthWrite = a > 0.5;
    this.body.visible = a > 0.001;
  }

  /** The planet's body (the bloom pass borrows its shape as a depth-only occluder). */
  get bodyMesh() {
    return this.body;
  }

  syncViewport() {
    this.u.uPixelRatio.value = this.stage.pixelRatio;
    this.u.uViewport.value.set(this.stage.width * this.stage.pixelRatio, this.stage.height * this.stage.pixelRatio);
  }
}
