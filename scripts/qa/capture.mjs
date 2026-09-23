// Screenshots of the home journey (hero, every stop, logbook, tickets, footer) at the
// four review viewports, plus a reduced-motion pass and the career/photography heroes.
// Uses the installed Google Chrome, which renders WebGL on the real GPU even headless.
//
//   node scripts/qa/capture.mjs <outDir> [baseUrl] [--only=1440,390] [--stops=all|0,3,6]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const [out = ".revamp/latest", base = "http://localhost:4321"] = args.filter((a) => !a.startsWith("--"));
const only = flag("only")?.split(",");
const stopsFlag = flag("stops");

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900, stops: "all" },
  { name: "1920", width: 1920, height: 1080, stops: [0, 3, 4, 6, 8, 12, 14, 16, 18] },
  { name: "768", width: 768, height: 1024, stops: [0, 3, 4, 6, 8, 12, 14, 16, 18] },
  { name: "390", width: 390, height: 844, stops: "all", mobile: true },
].filter((v) => !only || only.includes(v.name));

const settle = (page, ms) => page.waitForTimeout(ms);
const log = [];

async function newPage(browser, vp, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
    ...extra,
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") log.push({ vp: vp.name, type: m.type(), text: m.text() });
  });
  page.on("pageerror", (e) => log.push({ vp: vp.name, type: "pageerror", text: e.message }));
  page.on("requestfailed", (r) => log.push({ vp: vp.name, type: "requestfailed", text: `${r.url()} ${r.failure()?.errorText}` }));
  return { ctx, page };
}

/** Scroll so stop i sits on the activation line; returns once the page has had time to fly there. */
async function toStop(page, i, wait = 2400) {
  await page.evaluate((i) => {
    const el = document.querySelectorAll("[data-stop]")[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const line = window.__qaActivationLine ?? 0.55;
    window.scrollTo({ top: window.scrollY + r.top + r.height / 2 - innerHeight * line, behavior: "instant" });
  }, i);
  await settle(page, wait);
}

async function toSelector(page, sel, offset = 0, wait = 2000) {
  await page.evaluate(([sel, offset]) => {
    const el = document.querySelector(sel);
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + offset, behavior: "instant" });
  }, [sel, offset]);
  await settle(page, wait);
}

async function shoot(page, dir, name) {
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function captureViewport(browser, vp) {
  const dir = join(out, vp.name);
  mkdirSync(dir, { recursive: true });
  const { ctx, page } = await newPage(browser, vp);
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.classList.contains("is-loaded"), null, { timeout: 15000 });
  await settle(page, 3200);
  await shoot(page, dir, "00-hero");

  const count = await page.locator("[data-stop]").count();
  const want = stopsFlag ? (stopsFlag === "all" ? "all" : stopsFlag.split(",").map(Number)) : vp.stops;
  const stops = want === "all" ? [...Array(count).keys()] : want.filter((i) => i < count);
  for (const i of stops) {
    await toStop(page, i);
    await shoot(page, dir, `stop-${String(i + 1).padStart(2, "0")}`);
  }

  await toSelector(page, "#notebook", 0);
  await shoot(page, dir, "logbook-head");
  await toSelector(page, "#notebook .at-notebook__grid, #notebook [data-logbook-grid]", -80);
  await shoot(page, dir, "logbook-grid");
  const route = page.locator(".at-panel--route").first();
  if (await route.count()) await route.screenshot({ path: join(dir, "logbook-route-panel.png") }).catch(() => {});

  if (!vp.mobile) {
    // hover state of the career card (custom cursor label)
    const door = page.locator(".at-door--career").first();
    if (await door.count()) {
      await door.scrollIntoViewIfNeeded();
      await settle(page, 800);
      const b = await door.boundingBox();
      if (b) {
        await page.mouse.move(b.x + b.width * 0.35, b.y + b.height * 0.72, { steps: 8 });
        await settle(page, 900);
        await page.screenshot({ path: join(dir, "logbook-career-hover.png"), clip: { x: Math.max(0, b.x - 40), y: Math.max(0, b.y - 40), width: Math.min(vp.width, b.width + 80), height: b.height + 80 } });
        await page.mouse.move(5, 5);
      }
    }
  }

  await toSelector(page, "#live", 0);
  await shoot(page, dir, "tickets-head");
  await toSelector(page, "#live ol, #live [data-tickets]", -60);
  await shoot(page, dir, "tickets-grid");
  await toSelector(page, "#contact", 0);
  await shoot(page, dir, "footer");
  await ctx.close();
}

async function captureReduced(browser, vp) {
  const dir = join(out, `${vp.name}-reduced`);
  mkdirSync(dir, { recursive: true });
  const { ctx, page } = await newPage(browser, vp, { reducedMotion: "reduce" });
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await settle(page, 2500);
  await shoot(page, dir, "00-hero");
  for (const i of [0, 3, 6, 18]) {
    await toStop(page, i, 1600);
    await shoot(page, dir, `stop-${String(i + 1).padStart(2, "0")}`);
  }
  await toSelector(page, "#notebook", 0, 1200);
  await shoot(page, dir, "logbook-head");
  await toSelector(page, "#live", 0, 1200);
  await shoot(page, dir, "tickets-head");
  await ctx.close();
}

async function captureOtherPages(browser) {
  const dir = join(out, "pages");
  mkdirSync(dir, { recursive: true });
  for (const [path, name] of [["/career/", "career"], ["/photography/", "photography"]]) {
    const { ctx, page } = await newPage(browser, { name: `1440${path}`, width: 1440, height: 900 });
    await page.goto(base + path, { waitUntil: "networkidle" });
    await settle(page, 4000);
    await shoot(page, dir, `${name}-hero`);
    await ctx.close();
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const t0 = Date.now();
for (const vp of VIEWPORTS) {
  process.stdout.write(`${vp.name}… `);
  await captureViewport(browser, vp);
}
for (const vp of VIEWPORTS.filter((v) => v.name === "1440" || v.name === "390")) {
  process.stdout.write(`${vp.name}-reduced… `);
  await captureReduced(browser, vp);
}
if (!only) await captureOtherPages(browser);
await browser.close();

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "console.json"), JSON.stringify(log, null, 2));
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${out} · console issues: ${log.length}`);
for (const l of log.slice(0, 20)) console.log(`  [${l.vp}] ${l.type}: ${l.text.slice(0, 160)}`);
