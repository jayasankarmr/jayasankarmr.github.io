// Frame sequence of one leg of the journey: scroll through the flight from stop i to i+1 in
// steps and screenshot each, so the depart → fly → land beats (and their reverse) can be reviewed.
//   node scripts/qa/flight.mjs <outDir> <stop> [baseUrl] [width] [height] [steps]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const [out = ".revamp/latest", stop = "9", base = "http://localhost:4321", w = "1440", h = "900", steps = "8"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const mobile = +w < 768;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.documentElement.classList.contains("is-loaded"));
await page.waitForTimeout(2500);
const [y0, y1] = await page.evaluate((i) => { window.__atlasQA.noSnap = true; return [window.__atlasQA.stopY(i), window.__atlasQA.stopY(i + 1)]; }, +stop);
const files = [];
for (let k = 0; k <= +steps; k++) {
  const y = y0 + ((y1 - y0) * k) / +steps;
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await page.waitForTimeout(450);
  const f = join(out, `flight-${stop}-${String(k).padStart(2, "0")}.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
console.log(files.join(" "));
