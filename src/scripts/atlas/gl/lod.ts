// Level-of-detail dots for close-ups: two clipmap levels (≈13 km and ≈3.3 km spacing), each one
// instanced G×G hex grid re-centred on the camera's ground point and fading in by distance.
// Rivers and lakes only appear in the fine level, where they read as lines rather than noise.
import {
  BufferAttribute, Color, InstancedBufferGeometry, LinearFilter, Mesh, NormalBlending, ShaderMaterial, Texture, Vector2, Vector4,
  type Scene,
} from "three";
import type { TierConfig } from "../tier";
import type { World } from "./world";
import { PALETTE } from "./world";
import { geoMeta, regionLandUrl, regionWaterUrl } from "./data";
import common from "./shaders/common.glsl?raw";
import lodVert from "./shaders/lod.vert.glsl?raw";
import dotsFrag from "./shaders/dots.frag.glsl?raw";

const LAT_REF = Math.cos((20 * Math.PI) / 180); // near-square cells across the 5–33°N corridor

async function maskTexture(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const t = new Texture(img);
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

type Level = { mesh: Mesh; mat: ShaderMaterial; step: number; far: number; radius: number };

export class Lod {
  private levels: Level[] = [];
  /** 0–1: how much the fine level has taken over (the director shares it with the global dots) */
  coverage = 0;
  radius = 0;

  constructor(private world: World, private tier: TierConfig) {}

  async build(scene: Scene) {
    const [land, water] = await Promise.all([maskTexture(regionLandUrl), maskTexture(regionWaterUrl)]);
    const r = geoMeta.region;
    const region = new Vector4(r.west, r.north, r.width * r.res, r.height * r.res);
    const G = this.tier.lodGrid;
    const quad = new InstancedBufferGeometry();
    quad.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    quad.instanceCount = G * G;
    // coarse level: regional views; fine level: landings (with rivers and lakes)
    for (const [step, far, rivers] of [[0.12, 1.15, 0], [0.03, 0.3, 1]] as const) {
      const u = this.world.u;
      const mat = new ShaderMaterial({
        vertexShader: common + lodVert,
        fragmentShader: dotsFrag,
        uniforms: {
          uTime: u.uTime, uSun: u.uSun, uPixelRatio: u.uPixelRatio, uViewport: u.uViewport,
          uPlaneUp: u.uPlaneUp, uPlaneEast: u.uPlaneEast, uPlaneNorth: u.uPlaneNorth, uPlane: u.uPlane,
          uStepLat: { value: step }, uStepLng: { value: step / LAT_REF }, uG: { value: G },
          uSize: { value: ((step * Math.PI) / 180) * 0.34 }, uMinPx: { value: 0.6 }, uMaxPx: { value: 4.2 },
          uAlpha: { value: 0 }, uNight: { value: 0.72 }, uRivers: { value: rivers },
          uIdx: { value: new Vector2() }, uRegion: { value: region },
          uLand: { value: land }, uWater: { value: water },
          uColN: { value: new Color(PALETTE.landN) }, uColS: { value: new Color(PALETTE.landS) }, uWaterCol: { value: new Color("#8ff8ff") },
          uWave: { value: new Vector4(0, 0, 0, -1) },
        },
        transparent: true, depthWrite: false, blending: NormalBlending,
      });
      const mesh = new Mesh(quad.clone(), mat);
      (mesh.geometry as InstancedBufferGeometry).instanceCount = G * G;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      mesh.visible = false;
      scene.add(mesh);
      this.levels.push({ mesh, mat, step, far, radius: ((G / 2) * step * Math.PI) / 180 });
    }
  }

  /** Re-centre on the camera target; fade each level by camera distance. */
  update(lat: number, lng: number, dist: number, fade = 1) {
    let fine = 0;
    this.levels.forEach((L, k) => {
      // fade in below `far`; the coarse level hands over to the fine one below its `near`
      let a = 1 - smoothstep(L.far * 0.62, L.far, dist);
      if (k === 0) {
        const fineIn = 1 - smoothstep(0.03, this.levels[1].far, dist);
        a *= 1 - fineIn * 0.85;
      } else fine = a;
      a *= fade;
      L.mat.uniforms.uAlpha.value = a;
      L.mesh.visible = a > 0.003;
      if (L.mesh.visible) {
        const stepLng = L.step / LAT_REF;
        L.mat.uniforms.uIdx.value.set(Math.round(lat / L.step), Math.round(lng / stepLng));
      }
    });
    const coarse = this.levels[0]?.mat.uniforms.uAlpha.value ?? 0;
    this.coverage = Math.max(coarse, fine);
    this.radius = this.levels[0]?.radius ?? 0;
  }

  /** Landing shockwave through the fine dots; `age` seconds since touchdown, < 0 for none. */
  setWave(x: number, y: number, z: number, age: number) {
    for (const L of this.levels) L.mat.uniforms.uWave.value.set(x, y, z, age);
  }
}

function smoothstep(a: number, b: number, v: number) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
