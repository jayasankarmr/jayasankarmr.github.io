// Lighthouse (mobile + desktop) against a built dist/, served over HTTP/2 like GitHub Pages
// (scripts/qa/serve-h2.mjs). Run `npm run build` first. Lighthouse runs through npx; it isn't
// a project dependency.
//
// Simulated throttling swings a single run by 10+ points, so each profile runs RUNS times
// (default 3) and the median run by performance score is reported and kept.
//
//   node scripts/qa/lighthouse.mjs <outDir> [path=/] [dist=dist]
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const [out = ".revamp/latest", path = "/", dist = "dist"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const PORT = 4443;
const url = `https://localhost:${PORT}${path}`;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // readiness probe against the self-signed cert

const preview = spawn("node", ["scripts/qa/serve-h2.mjs", dist, String(PORT)], { stdio: "ignore", detached: true });
const stop = () => { try { process.kill(-preview.pid); } catch {} };
process.on("exit", stop);

for (let i = 0; i < 60; i++) {
  try { if ((await fetch(url)).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

const env = { ...process.env, CHROME_PATH: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" };
const rows = [];
const RUNS = +(process.env.RUNS ?? 3);
const MODES = (process.env.MODES ?? "mobile,desktop").split(","); // e.g. MODES=mobile for quick A/B checks
for (const mode of MODES) {
  const base = join(out, `lighthouse-${mode}`);
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const path = `${base}-run${i}`;
    execFileSync("npx", ["-y", "lighthouse@13.5.0", url, ...(mode === "desktop" ? ["--preset=desktop"] : []),
      "--only-categories=performance,accessibility,best-practices,seo", "--output=json", "--output=html",
      `--output-path=${path}`, "--chrome-flags=--headless=new --ignore-certificate-errors", "--quiet"], { env, stdio: "ignore" });
    runs.push({ path, score: JSON.parse(readFileSync(`${path}.report.json`, "utf8")).categories.performance.score });
  }
  runs.sort((a, b) => a.score - b.score);
  const median = runs[runs.length >> 1];
  for (const run of runs) {
    if (run === median) { renameSync(`${run.path}.report.json`, `${base}.report.json`); renameSync(`${run.path}.report.html`, `${base}.report.html`); }
    else { rmSync(`${run.path}.report.json`); rmSync(`${run.path}.report.html`); }
  }
  const r = JSON.parse(readFileSync(`${base}.report.json`, "utf8"));
  const a = r.audits, c = r.categories;
  const fails = Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && !["informative", "notApplicable", "manual"].includes(x.scoreDisplayMode)).map((x) => x.id);
  rows.push({
    mode,
    perf: Math.round(c.performance.score * 100), a11y: Math.round(c.accessibility.score * 100),
    bp: Math.round(c["best-practices"].score * 100), seo: Math.round(c.seo.score * 100),
    fcp: a["first-contentful-paint"].displayValue, lcp: a["largest-contentful-paint"].displayValue,
    tbt: a["total-blocking-time"].displayValue, cls: a["cumulative-layout-shift"].displayValue,
    si: a["speed-index"].displayValue, bytes: a["total-byte-weight"].displayValue,
    fails: fails.join(", "),
    spread: runs.map((x) => Math.round(x.score * 100)).join("/"),
  });
}
stop();
for (const r of rows) {
  console.log(`${r.mode.padEnd(7)} perf ${r.perf} (runs ${r.spread}) · a11y ${r.a11y} · bp ${r.bp} · seo ${r.seo} | FCP ${r.fcp} · LCP ${r.lcp} · TBT ${r.tbt} · CLS ${r.cls} · SI ${r.si} · ${r.bytes}`);
  console.log(`        below 0.9: ${r.fails || "none"}`);
}
process.exit(0);
