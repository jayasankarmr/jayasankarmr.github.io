// Journey interaction checks: the magnetic dwell (wheel a little past a stop, let go), a rail
// jump (click), rail keyboard navigation (arrows + Enter), the live announcement, and scrolling
// back. Prints PASS/FAIL per check.
//   node scripts/qa/journey-interact.mjs [baseUrl]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4321";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const issues = [];
page.on("console", (m) => ["error", "warning"].includes(m.type()) && issues.push(m.text().slice(0, 160)));
page.on("pageerror", (e) => issues.push(e.message));
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.documentElement.classList.contains("is-loaded"));
await page.waitForTimeout(2500);

const state = () => page.evaluate(() => ({ y: Math.round(scrollY), active: window.__atlasQA.director.active, live: document.querySelector("[data-live]")?.textContent ?? "" }));
const stopY = (i) => page.evaluate((i) => Math.round(window.__atlasQA.stopY(i)), i);
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " · " + detail : ""}`); };

// 1. magnetic dwell: from stop 4's dwell, wheel ~20% into the next leg and let go
await page.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), await stopY(3));
await page.waitForTimeout(1200);
await page.mouse.move(900, 450);
const y3 = await stopY(3), y4 = await stopY(4);
for (let k = 0; k < 6; k++) { await page.mouse.wheel(0, Math.round(((y4 - y3) * 0.42) / 6)); await page.waitForTimeout(16); }
await page.waitForTimeout(2600);
let s = await state();
check("magnetic dwell glides on to the next stop", s.active === 4 && Math.abs(s.y - y4) < 6, `active ${s.active}, y ${s.y} vs ${y4}`);

// 2. …and a small nudge back out of the dwell (just into the previous leg) settles back
for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, -Math.round(((y4 - y3) * 0.19) / 4)); await page.waitForTimeout(16); }
await page.waitForTimeout(2600);
s = await state();
check("a small nudge back settles on the same stop", s.active === 4 && Math.abs(s.y - y4) < 6, `active ${s.active}, y ${s.y}`);

// 3. rail jump: click Varanasi (stop 15)
await page.locator("[data-rail-stop='14']").click();
await page.waitForTimeout(3400);
s = await state();
const y14 = await stopY(14);
check("rail click flies to the stop", s.active === 14 && Math.abs(s.y - y14) < 6, `active ${s.active}, y ${s.y} vs ${y14}`);
check("the destination is announced", /Stop 15 of 19: Varanasi/.test(s.live), JSON.stringify(s.live));

// 4. keyboard: the rail's roving tab stop is the current stop; arrows move, Enter flies
await page.locator("[data-rail-stop='14']").focus();
await page.keyboard.press("ArrowDown");
await page.keyboard.press("ArrowDown");
const focused = await page.evaluate(() => document.activeElement?.getAttribute("data-rail-stop"));
await page.keyboard.press("Enter");
await page.waitForTimeout(2600);
s = await state();
check("arrow keys move along the rail", focused === "16", `focused ${focused}`);
check("Enter flies to the focused stop", s.active === 16, `active ${s.active}`);

// 5. scrolling back reverses the journey
await page.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), await stopY(9));
await page.waitForTimeout(1800);
s = await state();
check("scrolling back lands on the earlier stop", s.active === 9, `active ${s.active}`);
const routes = await page.evaluate(() => window.__atlasQA.director.routes.state.map((r) => r.progress));
check("later legs un-draw on the way back", routes.slice(9).every((p) => p === 0) && routes.slice(0, 9).every((p) => p === 1), routes.map((p) => p.toFixed(1)).join(" "));

// 6. the hero: back to the top, no card, globe in hero framing
await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(1500);
s = await state();
check("top of the page is the hero again", s.active === -1, `active ${s.active}`);

await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed · console issues: ${issues.length}`);
issues.slice(0, 5).forEach((i) => console.log("  " + i));
