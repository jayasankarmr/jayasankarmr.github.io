// Contact sheet: tiles screenshots into one labelled image for quick review.
//   node scripts/qa/sheet.mjs <out.png> <cols> <tileWidth> <img...>
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";

const [out, cols = "4", tile = "360", ...imgs] = process.argv.slice(2);
const cells = imgs
  .map((p) => {
    const src = `data:image/png;base64,${readFileSync(p).toString("base64")}`;
    const label = `${basename(dirname(p))}/${basename(p, ".png")}`;
    return `<figure><img src="${src}"><figcaption>${label}</figcaption></figure>`;
  })
  .join("");
const html = `<!doctype html><style>
  body{margin:0;background:#222;font:12px ui-monospace,monospace;color:#ddd}
  main{display:grid;grid-template-columns:repeat(${cols},${tile}px);gap:8px;padding:8px;width:max-content}
  figure{margin:0} img{width:100%;display:block;border:1px solid #444} figcaption{padding:2px 0}
</style><main>${cells}</main>`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.setContent(html, { waitUntil: "load" });
await page.locator("main").screenshot({ path: out });
await browser.close();
console.log(out);
