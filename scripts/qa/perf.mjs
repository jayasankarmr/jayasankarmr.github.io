// Frame-rate + console sampling for the home page. Scrolls the journey with real wheel
// input (so Lenis and ScrollTrigger run the way they do for a visitor) while a
// requestAnimationFrame sampler records every frame interval.
//
//   node scripts/qa/perf.mjs <outDir> [baseUrl]
// Profiles: "desktop" = 1440×900 @2x (MacBook Air class), "mobile" = 390×844 @3x with
// 4× CPU throttling (a rough mid-range-Android stand-in; the GPU is still the host's).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [out = ".revamp/latest", base = "http://localhost:4321"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const PROFILES = [
  { name: "desktop", viewport: { width: 1440, height: 900 }, dpr: 2, cpu: 1 },
  { name: "mobile", viewport: { width: 390, height: 844 }, dpr: 3, cpu: 4, mobile: true },
];

function stats(deltas) {
  if (!deltas.length) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const total = deltas.reduce((a, b) => a + b, 0);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    frames: deltas.length,
    avgFps: +(1000 / (total / deltas.length)).toFixed(1),
    // "1% low": the frame rate implied by the slowest 1% of frame intervals
    low1Fps: +(1000 / pct(0.99)).toFixed(1),
    p50ms: +pct(0.5).toFixed(2),
    p99ms: +pct(0.99).toFixed(2),
    maxMs: +sorted[sorted.length - 1].toFixed(2),
    over20ms: deltas.filter((d) => d > 20).length,
    over34ms: deltas.filter((d) => d > 34).length,
  };
}

const SAMPLER = () => {
  window.__qa = { deltas: [], last: 0, on: false, longtasks: [] };
  const tick = (t) => {
    const q = window.__qa;
    if (q.on && q.last) q.deltas.push(t - q.last);
    q.last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__qa.on && window.__qa.longtasks.push(Math.round(e.duration)))).observe({ type: "longtask", buffered: false });
  } catch {}
};

async function run(browser, prof) {
  const ctx = await browser.newContext({
    viewport: prof.viewport, deviceScaleFactor: prof.dpr, isMobile: !!prof.mobile, hasTouch: !!prof.mobile,
  });
  const page = await ctx.newPage();
  const consoleLog = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && consoleLog.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => consoleLog.push(`pageerror: ${e.message}`));
  const cdp = await ctx.newCDPSession(page);
  await page.addInitScript(SAMPLER);
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.classList.contains("is-loaded"), null, { timeout: 20000 });
  await page.waitForTimeout(3500);
  if (prof.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });

  const gl = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const g = c && (c.getContext("webgl2") || c.getContext("webgl"));
    const ext = g && g.getExtension("WEBGL_debug_renderer_info");
    return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "n/a";
  });

  const sample = async (label, fn) => {
    await page.evaluate(() => { window.__qa.deltas = []; window.__qa.longtasks = []; window.__qa.last = 0; window.__qa.on = true; });
    const t0 = Date.now();
    await fn();
    const res = await page.evaluate(() => { window.__qa.on = false; return { d: window.__qa.deltas, lt: window.__qa.longtasks }; });
    return { label, seconds: +((Date.now() - t0) / 1000).toFixed(1), ...stats(res.d), longTasks: res.lt.length, longTaskMaxMs: Math.max(0, ...res.lt) };
  };

  const results = [];
  results.push(await sample("idle-hero", () => page.waitForTimeout(3000)));

  // scroll the journey: wheel input until the logbook reaches the top of the viewport
  const box = prof.viewport;
  await page.mouse.move(box.width * 0.5, box.height * 0.5);
  const scrollJourney = async () => {
    for (let i = 0; i < 600; i++) {
      if (prof.mobile) await page.evaluate(() => window.scrollBy(0, 36));
      else await page.mouse.wheel(0, 60);
      await page.waitForTimeout(16);
      if (i % 10 === 0) {
        const done = await page.evaluate(() => {
          const nb = document.querySelector("#notebook");
          return !nb || nb.getBoundingClientRect().top < innerHeight * 0.2;
        });
        if (done) break;
      }
    }
    await page.waitForTimeout(1200);
  };
  results.push(await sample("scroll-journey", scrollJourney));
  results.push(await sample("scroll-rest", async () => {
    for (let i = 0; i < 160; i++) {
      if (prof.mobile) await page.evaluate(() => window.scrollBy(0, 36));
      else await page.mouse.wheel(0, 60);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(800);
  }));

  if (prof.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  await ctx.close();
  return { profile: prof.name, gpu: gl, heapMB: mem, results, console: consoleLog };
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
for (const prof of PROFILES) report.push(await run(browser, prof));
await browser.close();
writeFileSync(join(out, "perf.json"), JSON.stringify(report, null, 2));
for (const r of report) {
  console.log(`\n== ${r.profile} (${r.gpu}) heap ${r.heapMB}MB`);
  for (const s of r.results) console.log(`  ${s.label.padEnd(15)} avg ${s.avgFps} fps · 1% low ${s.low1Fps} · p99 ${s.p99ms}ms · max ${s.maxMs}ms · >20ms ${s.over20ms}/${s.frames} · long tasks ${s.longTasks} (max ${s.longTaskMaxMs}ms)`);
  console.log(`  console: ${r.console.length ? r.console.join(" | ").slice(0, 400) : "clean"}`);
}
