// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { lastmodFor } from "./scripts/lastmod.mjs";

export default defineConfig({
  site: "https://flume.adamgreenwell.com",
  integrations: [
    sitemap({
      /**
       * `lastmod` per URL, from the git history of the source that renders it.
       *
       * `scripts/lastmod.mjs` explains the reasoning, including why it returns
       * nothing rather than guessing — a URL with no `lastmod` says "no
       * information", which is honest, whereas a wrong one spends the
       * credibility of every other entry in the file.
       */
      serialize(item) {
        const lastmod = lastmodFor(new URL(item.url).pathname);
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],
  build: { format: "directory" },
});
