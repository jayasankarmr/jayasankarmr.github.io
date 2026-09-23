// WebGL draw calls per frame on the home page, sampled at the hero, the last stop and
// the footer: a budget check, and proof the globe stops drawing once it is off-stage.
//   node scripts/qa/drawcalls.mjs [baseUrl]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:4321";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.addInitScript(() => {
  window.__dc = 0; window.__frames = 0;
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) for (const m of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
    const o = C.prototype[m]; if (!o) continue; C.prototype[m] = function (...a) { window.__dc++; return o.apply(this, a); };
  }
  const t = () => { window.__frames++; requestAnimationFrame(t); }; requestAnimationFrame(t);
});
await p.goto(base + "/", { waitUntil: "networkidle" });
await p.waitForFunction(() => document.documentElement.classList.contains("is-loaded"));
await p.waitForTimeout(3000);
const measure = async (label) => {
  const a = await p.evaluate(() => [window.__dc, window.__frames]);
  await p.waitForTimeout(2000);
  const z = await p.evaluate(() => [window.__dc, window.__frames]);
  const canvas = await p.evaluate(() => { const c = document.querySelector("[data-globe]"); return c ? `${c.width}×${c.height} opacity ${getComputedStyle(c).opacity}` : "none"; });
  console.log(label.padEnd(10), "draw calls/frame", ((z[0] - a[0]) / (z[1] - a[1])).toFixed(1), "· draws in 2s", z[0] - a[0], "· canvas", canvas);
};
await measure("hero");
await p.evaluate(() => { const s = document.querySelectorAll("[data-stop]")[18]; scrollTo(0, scrollY + s.getBoundingClientRect().top - innerHeight * 0.5); });
await p.waitForTimeout(2500); await measure("stop 19");
await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(2500); await measure("footer");
await b.close();
