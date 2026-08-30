// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://flume.adamgreenwell.com",
  integrations: [sitemap()],
  build: { format: "directory" },
});
