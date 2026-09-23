// Lazy entry for the WebGL atlas: everything that pulls in three.js lives behind this import,
// so the page paints and becomes interactive before the scene downloads.
import { Director, type AtlasPlace } from "./director";
import type { TierConfig } from "./tier";

export type { AtlasPlace, Director };

export async function createAtlas(canvas: HTMLCanvasElement, places: AtlasPlace[], tier: TierConfig) {
  const director = new Director(canvas, places, tier);
  await director.init();
  return director;
}
