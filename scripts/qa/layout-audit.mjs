// Layout audit for the journey, stop by stop:
//  - label collisions: pairs of visible globe labels ([data-label]) whose boxes intersect
//  - card overlap: visible text of other stops that intersects the active stop card
//  - faint text: smallest rendered size + effective contrast of inactive stop text
// Effective contrast folds ancestor opacity into the text colour over the page background.
//
//   node scripts/qa/layout-audit.mjs <outDir> [baseUrl] [width] [height]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [out = ".revamp/latest", base = "http://localhost:4321", w = "1440", h = "900"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const mobile = +w < 768;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.documentElement.classList.contains("is-loaded"), null, { timeout: 15000 });
await page.waitForTimeout(3000);

const count = await page.locator("[data-stop]").count();
const rows = [];
for (let i = 0; i < count; i++) {
  await page.evaluate((i) => {
    const el = document.querySelectorAll("[data-stop]")[i];
    const r = el.getBoundingClientRect();
    const line = window.__qaActivationLine ?? 0.55;
    window.scrollTo({ top: scrollY + r.top + r.height / 2 - innerHeight * line, behavior: "instant" });
  }, i);
  await page.waitForTimeout(2300);
  rows.push(await page.evaluate((i) => {
    const lum = ([r, g, b]) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const bg = [4, 5, 13];
    const effOpacity = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
    const visible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && effOpacity(el) > 0.08;
    };
    const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);

    // 1. globe label collisions
    const labels = [...document.querySelectorAll("[data-label]")]
      .map((l) => ({ name: l.textContent.trim().split("\n")[0], el: l.querySelector("[class*=name]") || l }))
      .filter((l) => visible(l.el));
    const collisions = [];
    for (let a = 0; a < labels.length; a++)
      for (let b = a + 1; b < labels.length; b++)
        if (hit(labels[a].el.getBoundingClientRect(), labels[b].el.getBoundingClientRect())) collisions.push(`${labels[a].name} × ${labels[b].name}`);

    // 2. active card vs other stops' visible text
    const stops = [...document.querySelectorAll("[data-stop]")];
    const card = stops[i].querySelector("[class*=card]") || stops[i];
    const cr = card.getBoundingClientRect();
    const overlaps = [];
    stops.forEach((s, k) => {
      if (k === i) return;
      s.querySelectorAll("h2, h3, p, [class*=name], [class*=kicker]").forEach((t) => {
        if (visible(t) && hit(cr, t.getBoundingClientRect())) overlaps.push(`${s.dataset.name}`);
      });
    });

    // 3. faintest inactive stop text on screen
    let minContrast = 99, minPx = 99;
    stops.forEach((s, k) => {
      if (k === i) return;
      s.querySelectorAll("h2, p").forEach((t) => {
        if (!visible(t)) return;
        const r = t.getBoundingClientRect();
        if (r.bottom < 70 || r.top > innerHeight) return;
        const cs = getComputedStyle(t);
        const [cr_, cg, cb, ca = 1] = rgba(cs.color);
        const o = effOpacity(t) * ca;
        const eff = [cr_ * o + bg[0] * (1 - o), cg * o + bg[1] * (1 - o), cb * o + bg[2] * (1 - o)];
        const L1 = lum(eff), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        // rendered size includes transforms (scale) on ancestors
        const px = parseFloat(cs.fontSize) * (r.height / (t.offsetHeight || r.height));
        minContrast = Math.min(minContrast, ratio);
        minPx = Math.min(minPx, px);
      });
    });
    return {
      stop: i + 1,
      name: stops[i].dataset.name,
      visibleLabels: labels.length,
      collisions: collisions.length,
      collisionPairs: collisions.slice(0, 8),
      cardOverlaps: [...new Set(overlaps)],
      inactiveMinContrast: minContrast === 99 ? null : +minContrast.toFixed(2),
      inactiveMinPx: minPx === 99 ? null : +minPx.toFixed(1),
    };
  }, i));
}
await browser.close();

writeFileSync(join(out, `layout-audit-${w}.json`), JSON.stringify(rows, null, 2));
let totalCollisions = 0, totalOverlaps = 0;
for (const r of rows) {
  totalCollisions += r.collisions;
  totalOverlaps += r.cardOverlaps.length;
  console.log(`${String(r.stop).padStart(2)} ${r.name.padEnd(22)} labels ${String(r.visibleLabels).padStart(2)} · collisions ${String(r.collisions).padStart(2)} · card over [${r.cardOverlaps.join(", ")}] · faint text ${r.inactiveMinPx}px @ ${r.inactiveMinContrast}:1`);
}
console.log(`TOTAL @${w}×${h}: ${totalCollisions} label collisions, ${totalOverlaps} card/neighbour overlaps`);
