// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://jayasankarmr.github.io",
  base: "/",
  trailingSlash: "ignore",
  devToolbar: { enabled: false },
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
  integrations: [
    sitemap({
      // prototypes and the legacy redirect are not pages worth indexing
      filter: (page) => !page.includes("/concepts/") && !page.includes("/Photography-Portfolio/"),
    }),
  ],
});
