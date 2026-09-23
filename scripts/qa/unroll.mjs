// Frame sequence of "the world unrolls": from the last stop's landing down into the logbook.
//   node scripts/qa/unroll.mjs <outDir> [baseUrl] [width] [height] [steps]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const [out = ".revamp/latest", base = "http://localhost:4321", w = "1440", h = "900", steps = "7"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const mobile = +w < 768;
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
const issues = [];
p.on("console", (m) => ["error", "warning"].includes(m.type()) && issues.push(m.text().slice(0, 140)));
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForFunction(() => document.documentElement.classList.contains("is-loaded"));
await p.waitForTimeout(3000);
const [y0, y1] = await p.evaluate(() => {
  window.__atlasQA.noSnap = true;
  const nb = document.querySelector("#notebook");
  return [window.__atlasQA.stopY(window.__atlasQA.stops - 1), nb.getBoundingClientRect().top + scrollY + innerHeight * 0.35];
});
for (let k = 0; k <= +steps; k++) {
  await p.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), y0 + ((y1 - y0) * k) / +steps);
  await p.waitForTimeout(650);
  await p.screenshot({ path: join(out, `unroll-${w}-${k}.png`) });
}
// hover a route item: its city should light up on the map
const li = p.locator("[data-route-stop='12']");
await li.scrollIntoViewIfNeeded();
await p.waitForTimeout(600);
await li.hover();
await p.waitForTimeout(900);
await p.screenshot({ path: join(out, `unroll-${w}-hover.png`) });
console.log(await p.evaluate(() => ({ mode: window.__atlasQA.director.mode, highlight: window.__atlasQA.director.highlight })), "console:", issues.length ? issues.join(" | ") : "clean");
await b.close();
