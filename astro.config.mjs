// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://jayasankarmr.github.io",
  base: "/",
  trailingSlash: "ignore",
  devToolbar: { enabled: false },
  // page CSS is small; inlining it removes a render-blocking request ahead of first paint
  build: { inlineStylesheets: "always" },
  vite: {
    // pre-bundle up front so Vite never re-optimises mid-session (a stale
    // optimised dep 504s every script on the page and strands the loader)
    optimizeDeps: {
      include: ["gsap", "gsap/ScrollTrigger", "lenis", "three"],
    },
    plugins: [
      {
        // dev only: serve public/photography/index.html at /photography/ the way
        // GitHub Pages does in production (Astro's dev server doesn't map dirs to index.html)
        name: "public-dir-index",
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            const m = req.url?.match(/^\/photography\/?(\?.*)?$/);
            if (m) req.url = "/photography/index.html" + (m[1] ?? "");
            next();
          });
        },
      },
    ],
  },
  // self-hosted at build time (no render-blocking third-party CSS on these pages); the career
  // page and the concept prototypes still load their own families from Google Fonts
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Fraunces",
      cssVariable: "--font-fraunces",
      weights: ["200 600"],
      styles: ["normal", "italic"],
      subsets: ["latin"],
      fallbacks: ["Georgia", "serif"],
      // optical size stays variable (the hero animates it); SOFT is pinned at 50
      options: { experimental: { variableAxis: { opsz: [["9", "144"]], SOFT: ["50"] } } },
    },
    { provider: fontProviders.google(), name: "Manrope", cssVariable: "--font-manrope", weights: ["400 600"], styles: ["normal"], subsets: ["latin"], fallbacks: ["system-ui", "sans-serif"] },
    { provider: fontProviders.google(), name: "IBM Plex Mono", cssVariable: "--font-plex-mono", weights: [400, 500], styles: ["normal"], subsets: ["latin"], fallbacks: ["ui-monospace", "monospace"] },
    // shared header/footer (public/shared/chrome.css) and the writing pages
    { provider: fontProviders.google(), name: "Inter", cssVariable: "--font-inter", weights: ["400 500"], styles: ["normal"], subsets: ["latin"], fallbacks: ["system-ui", "sans-serif"] },
    { provider: fontProviders.google(), name: "Instrument Serif", cssVariable: "--font-instrument", weights: [400], styles: ["normal", "italic"], subsets: ["latin"], fallbacks: ["Georgia", "serif"] },
  ],
  integrations: [
    sitemap({
      // prototypes and the legacy redirect are not pages worth indexing
      filter: (page) => !page.includes("/concepts/") && !page.includes("/Photography-Portfolio/"),
    }),
  ],
});
