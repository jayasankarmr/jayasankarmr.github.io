// Static HTTP/2 + TLS server for a built dist/, compressed like GitHub Pages serves it.
// `astro preview` speaks HTTP/1.1, which makes Lighthouse model same-origin requests queuing
// on six connections, so it would misreport self-hosted assets that ride one HTTP/2 connection
// in production. The certificate is a throwaway self-signed one (Chrome runs with
// --ignore-certificate-errors).
//
//   node scripts/qa/serve-h2.mjs [dir=dist] [port=4443]
import http2 from "node:http2";
import { readFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, normalize } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const [dir = "dist", port = "4443"] = process.argv.slice(2);
const certDir = "node_modules/.cache/qa-cert";
if (!existsSync(`${certDir}/key.pem`)) {
  mkdirSync(certDir, { recursive: true });
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-subj", "/CN=localhost",
    "-keyout", `${certDir}/key.pem`, "-out", `${certDir}/cert.pem`], { stdio: "ignore" });
}
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif",
  ".woff2": "font/woff2", ".xml": "application/xml", ".txt": "text/plain", ".glsl": "text/plain",
};
const COMPRESS = /^(text\/|application\/(json|xml)|image\/svg)/;
const cache = new Map();

const server = http2.createSecureServer({ key: readFileSync(`${certDir}/key.pem`), cert: readFileSync(`${certDir}/cert.pem`) });
server.on("stream", (stream, headers) => {
  let path = decodeURIComponent((headers[":path"] ?? "/").split("?")[0]);
  let file = normalize(join(dir, path));
  if (!file.startsWith(normalize(dir))) return stream.respond({ ":status": 403 }) || stream.end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) { stream.respond({ ":status": 404 }); return stream.end("not found"); }
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const accept = String(headers["accept-encoding"] ?? "");
  const enc = COMPRESS.test(type) ? (accept.includes("br") ? "br" : accept.includes("gzip") ? "gzip" : null) : null;
  const key = `${file}|${enc}|${statSync(file).mtimeMs}`; // a rebuild must never serve stale bodies
  let body = cache.get(key);
  if (!body) {
    const raw = readFileSync(file);
    body = enc === "br" ? brotliCompressSync(raw) : enc === "gzip" ? gzipSync(raw) : raw;
    cache.set(key, body);
  }
  stream.respond({ ":status": 200, "content-type": type, ...(enc ? { "content-encoding": enc } : {}), "cache-control": "max-age=600" });
  stream.end(body);
});
server.listen(+port, () => console.log(`h2 serving ${dir} on https://localhost:${port}`));
