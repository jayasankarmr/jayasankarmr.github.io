// Routes: all legs as one ribbon mesh (one draw call) plus the comet (one more). Per-leg state —
// how much is drawn, how hot it is, overland or not, recurring destination — is a small uniform
// array the director rewrites every frame from the choreography.
import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector4, type Scene } from "three";
import type { Leg } from "../journey";
import type { World } from "./world";
import { PALETTE } from "./world";
import { toVec } from "../geo";
import common from "./shaders/common.glsl?raw";
import arc from "./shaders/arc.glsl?raw";
import routesVert from "./shaders/routes.vert.glsl?raw";
import routesFrag from "./shaders/routes.frag.glsl?raw";
import cometVert from "./shaders/comet.vert.glsl?raw";
import cometFrag from "./shaders/comet.frag.glsl?raw";
import { ADDITIVE } from "./world";

export type LegState = { progress: number; heat: number };

export class Routes {
  readonly state: LegState[];
  private legA: Vector4[];
  private legB: Vector4[];
  private legS: Vector4[];
  private comet = new Vector4(0, 0, 0, 0.14);
  private alpha = { value: 1 };

  constructor(private world: World, private legs: Leg[], private places: { lat: number; lng: number; recurring?: boolean }[]) {
    this.state = legs.map(() => ({ progress: 0, heat: 1 }));
    this.legA = legs.map((l) => new Vector4(...toVec(places[l.from].lat, places[l.from].lng), l.height));
    this.legB = legs.map((l) => new Vector4(...toVec(places[l.to].lat, places[l.to].lng), l.angle));
    this.legS = legs.map((l) => new Vector4(0, 1, l.overland ? 1 : 0, places[l.to].recurring ? 1 : 0));
  }

  build(scene: Scene) {
    const n = this.legs.length;
    const u = this.world.u;
    const shared = {
      uTime: u.uTime, uMorph: u.uMorph, uPixelRatio: u.uPixelRatio, uViewport: u.uViewport,
      uPlaneUp: u.uPlaneUp, uPlaneEast: u.uPlaneEast, uPlaneNorth: u.uPlaneNorth, uPlane: u.uPlane,
      uLegA: { value: this.legA }, uLegB: { value: this.legB },
      uHot: { value: new Color(PALETTE.accent) },
    };

    // ribbons: (S+1)×2 vertices per leg, segments scaled to the leg's length
    const leg: number[] = [], t: number[] = [], side: number[] = [], index: number[] = [];
    this.legs.forEach((l, k) => {
      const S = Math.max(24, Math.min(160, Math.round(l.angle * 420)));
      const base = leg.length;
      for (let s = 0; s <= S; s++) for (const sd of [-1, 1]) { leg.push(k); t.push(s / S); side.push(sd); }
      for (let s = 0; s < S; s++) {
        const a = base + s * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(leg.length * 3), 3));
    g.setAttribute("aLeg", new BufferAttribute(new Float32Array(leg), 1));
    g.setAttribute("aT", new BufferAttribute(new Float32Array(t), 1));
    g.setAttribute("aSide", new BufferAttribute(new Float32Array(side), 1));
    g.setIndex(index);
    const ribbons = new Mesh(g, new ShaderMaterial({
      defines: { LEGS: n },
      vertexShader: common + arc + routesVert,
      fragmentShader: routesFrag,
      uniforms: { ...shared, uLegS: { value: this.legS }, uAlpha: this.alpha, uCool: { value: new Color("#9d7fb8") }, uGlow: { value: new Color("#fff1d6") } },
      // the strip's winding flips with the screen direction of each leg
      side: DoubleSide, transparent: true, depthWrite: false, ...ADDITIVE,
    }));
    ribbons.frustumCulled = false;
    ribbons.renderOrder = 5;
    ribbons.name = "routes";
    scene.add(ribbons);

    // comet: a head plus a lagging particle trail
    const P = 44;
    const cg = new InstancedBufferGeometry();
    cg.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    cg.setIndex([0, 1, 2, 0, 2, 3]);
    const au = new Float32Array(P), seed = new Float32Array(P);
    for (let i = 0; i < P; i++) { au[i] = i === 0 ? 0 : Math.pow(i / (P - 1), 1.3); seed[i] = Math.random(); }
    cg.setAttribute("aU", new InstancedBufferAttribute(au, 1));
    cg.setAttribute("aSeed", new InstancedBufferAttribute(seed, 1));
    cg.instanceCount = P;
    const comet = new Mesh(cg, new ShaderMaterial({
      defines: { LEGS: n },
      vertexShader: common + arc + cometVert,
      fragmentShader: cometFrag,
      uniforms: { ...shared, uComet: { value: this.comet }, uCore: { value: new Color("#fff6e6") } },
      transparent: true, depthWrite: false, ...ADDITIVE,
    }));
    comet.frustumCulled = false;
    comet.renderOrder = 7;
    comet.name = "comet";
    scene.add(comet);
  }

  /** Push this frame's leg states; `flying` is the leg under way (−1 for none) and its progress. */
  sync(flying: number, cometT: number) {
    this.state.forEach((s, k) => this.legS[k].set(s.progress, s.heat, this.legS[k].z, this.legS[k].w));
    const on = flying >= 0 && cometT > 0.001 && cometT < 0.999 ? 1 : 0;
    // the trail spans a fixed ground distance, so short hops don't get a comet longer than the leg
    const len = flying >= 0 ? Math.min(0.45, 0.018 / Math.max(0.01, this.legs[flying].angle)) : 0.14;
    this.comet.set(Math.max(0, flying), cometT, on, len);
  }

  setAlpha(a: number) {
    this.alpha.value = a;
  }
}
