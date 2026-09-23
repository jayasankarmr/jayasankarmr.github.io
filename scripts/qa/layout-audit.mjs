// Layout audit for the journey, stop by stop:
//  - label collisions: pairs of visible globe labels / cluster badges whose boxes intersect
//  - label vs UI: labels overlapping the active pass card, the rail or the nav
//  - card vs rail: the active card overlapping any rail text
//  - rail legibility: smallest rendered size and effective contrast of rail text
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
await page.evaluate(() => { if (window.__atlasQA) window.__atlasQA.noSnap = true; });

const count = await page.evaluate(() => window.__atlasQA?.stops ?? document.querySelectorAll("[data-card]").length);
const rows = [];
for (let i = -1; i < count; i++) {
  await page.evaluate((i) => window.scrollTo({ top: i < 0 ? 0 : window.__atlasQA.stopY(i), behavior: "instant" }), i);
  await page.waitForTimeout(i < 0 ? 1500 : 2300);
  rows.push(await page.evaluate((i) => {
    const lum = ([r, g, b]) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const bg = [4, 5, 13];
    const effOpacity = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r }; };
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const shown = (el) => effOpacity(el) > 0.5 && getComputedStyle(el).visibility !== "hidden" && el.getBoundingClientRect().width > 0;

    const labels = [...document.querySelectorAll(".lbl")].filter(shown).map((el) => ({ name: el.textContent.trim(), b: box(el) }));
    const collisions = [];
    for (let a = 0; a < labels.length; a++)
      for (let b = a + 1; b < labels.length; b++)
        if (hit(labels[a].b, labels[b].b)) collisions.push(`${labels[a].name} × ${labels[b].name}`);

    const card = document.querySelector(".pass.is-current");
    const cardB = card && shown(card) ? box(card) : null;
    const rail = document.querySelector("[data-rail]");
    const railText = rail ? [...rail.querySelectorAll(".jr-rail__name, .jr-rail__date")].filter((e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0) : [];
    const nav = { x: 0, y: 0, w: innerWidth, h: 70 };
    const labelOverUI = [];
    for (const l of labels) {
      if (cardB && hit(l.b, cardB)) labelOverUI.push(`${l.name}→card`);
      if (hit(l.b, nav)) labelOverUI.push(`${l.name}→nav`);
      for (const t of railText) if (hit(l.b, box(t))) { labelOverUI.push(`${l.name}→rail`); break; }
    }
    const cardOverRail = cardB ? railText.filter((t) => hit(box(t), cardB)).map((t) => t.textContent.trim()) : [];

    let minContrast = 99, minPx = 99;
    for (const t of railText) {
      const cs = getComputedStyle(t.closest("button") ?? t);
      const [r, g, b, a = 1] = rgba(cs.color);
      const o = effOpacity(t) * a;
      const eff = [r * o + bg[0] * (1 - o), g * o + bg[1] * (1 - o), b * o + bg[2] * (1 - o)];
      const ratio = (Math.max(lum(eff), lum(bg)) + 0.05) / (Math.min(lum(eff), lum(bg)) + 0.05);
      minContrast = Math.min(minContrast, ratio);
      minPx = Math.min(minPx, parseFloat(cs.fontSize));
    }
    return {
      stop: i + 1,
      name: i < 0 ? "(hero)" : document.querySelectorAll("[data-card]")[i]?.querySelector(".pass__name")?.textContent,
      active: window.__atlasQA?.director?.active,
      visibleLabels: labels.length,
      collisions: collisions.length,
      collisionPairs: collisions.slice(0, 6),
      labelOverUI,
      cardOverRail,
      railMinContrast: railText.length ? +minContrast.toFixed(2) : null,
      railMinPx: railText.length ? minPx : null,
    };
  }, i));
}
await browser.close();

writeFileSync(join(out, `layout-audit-${w}.json`), JSON.stringify(rows, null, 2));
let tc = 0, tu = 0, tr = 0, wrongActive = 0;
for (const r of rows) {
  tc += r.collisions; tu += r.labelOverUI.length; tr += r.cardOverRail.length;
  if (r.stop > 0 && r.active !== r.stop - 1) wrongActive++;
  console.log(`${String(r.stop).padStart(2)} ${String(r.name).padEnd(22)} labels ${String(r.visibleLabels).padStart(2)} · collisions ${r.collisions}${r.collisions ? ` [${r.collisionPairs.join(", ")}]` : ""} · label/UI ${r.labelOverUI.length ? r.labelOverUI.join(",") : 0} · card/rail ${r.cardOverRail.length} · rail ${r.railMinPx}px @ ${r.railMinContrast}:1`);
}
console.log(`TOTAL @${w}×${h}: ${tc} label collisions, ${tu} label/UI overlaps, ${tr} card/rail overlaps, ${wrongActive} stops with the wrong active card`);
