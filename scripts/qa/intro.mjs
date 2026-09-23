// Frame sequence of the opening from a fresh session (first visit): screenshots at fixed times
// after navigation, so the pin → pull-back → type build → atmosphere beats can be reviewed.
//   node scripts/qa/intro.mjs <outDir> [baseUrl] [width] [height] [times=ms,ms,…]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
const [out = ".revamp/latest", base = "http://localhost:4321", w = "1440", h = "900", times = "150,450,800,1150,1500,1900,2400,3400"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const mobile = +w < 768;
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--ignore-certificate-errors"] });
// warm the dev server's module graph so the timing reflects the page, not first compilation
const warm = await browser.newPage();
await warm.goto(base + "/", { waitUntil: "networkidle" });
await warm.close();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const issues = [];
page.on("console", (m) => ["error", "warning"].includes(m.type()) && issues.push(m.text().slice(0, 140)));
const t0 = Date.now();
await page.goto(base + "/", { waitUntil: "commit" });
const files = [];
for (const t of times.split(",").map(Number)) {
  const wait = t - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const f = join(out, `intro-${w}-${String(t).padStart(4, "0")}.png`);
  await page.screenshot({ path: f });
  files.push(f);
}
await browser.close();
console.log(files.join("\n"));
if (issues.length) console.log("console:", issues.join(" | "));
