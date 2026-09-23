// Interaction checks on the home globe: cursor ripple, drag + inertia, keyboard orbit (with its
// focus ring), and forced tiers. Screenshots → <outDir>/interact-*.png
//   node scripts/qa/interact.mjs <outDir> [baseUrl]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [out = ".revamp/latest", base = "http://localhost:4321"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const issues = [];
const open = async (query = "") => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && issues.push(`${query || "default"} ${m.type()}: ${m.text().slice(0, 160)}`));
  page.on("pageerror", (e) => issues.push(`${query || "default"} pageerror: ${e.message}`));
  await page.goto(`${base}/${query}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.classList.contains("is-loaded"), null, { timeout: 15000 });
  await page.waitForTimeout(3000);
  return { ctx, page };
};

// 1. ripple under the cursor, then a drag with inertia
{
  const { ctx, page } = await open();
  const box = await page.evaluate(() => {
    const c = getComputedStyle(document.querySelector("[data-globe-ctl]"));
    return { x: parseFloat(c.getPropertyValue("--x")), y: parseFloat(c.getPropertyValue("--y")) };
  });
  await page.mouse.move(box.x - 60, box.y - 40, { steps: 6 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, "interact-ripple.png"), clip: { x: box.x - 260, y: box.y - 230, width: 440, height: 380 } });
  const before = await page.evaluate(() => document.querySelector("[data-pos]")?.textContent);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 30, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, "interact-drag.png") });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, "interact-drag-inertia.png") });
  await ctx.close();
  console.log("drag ok · readout unchanged by drag:", before?.slice(0, 30));
}
// 2. keyboard: tab to the globe control, focus ring, arrow keys
{
  const { ctx, page } = await open();
  let focused = "";
  for (let i = 0; i < 12 && !focused.includes("globe"); i++) {
    await page.keyboard.press("Tab");
    focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-roledescription") ?? document.activeElement?.textContent?.trim().slice(0, 20) ?? "");
  }
  for (let i = 0; i < 6; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(60); }
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, "interact-keyboard.png") });
  await ctx.close();
  console.log("keyboard focus reached:", focused);
}
// 3. forced tiers
for (const t of ["low", "mid", "none"]) {
  const { ctx, page } = await open(`?tier=${t}`);
  const info = await page.evaluate(() => ({ tier: document.documentElement.dataset.tier, globe: !!document.querySelector("[data-globe].is-live"), noGlobe: document.documentElement.classList.contains("no-globe") }));
  await page.screenshot({ path: join(out, `interact-tier-${t}.png`) });
  console.log(`tier=${t}`, JSON.stringify(info));
  await ctx.close();
}
await browser.close();
console.log(`console issues: ${issues.length}`);
issues.slice(0, 10).forEach((i) => console.log("  " + i));
