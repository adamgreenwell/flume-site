import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * The docs collection, populated by `npm run sync:docs` from the app repo's
 * `docs/` directory. Files here are generated — edit them in `flume/docs/`
 * and re-run the sync.
 */
const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/docs" }),
  schema: z.object({
    /** Display title, taken from the page's own `# ` heading. */
    title: z.string(),
    /** Sidebar group. `More` collects anything not placed in NAV. */
    section: z.string(),
    /** Position within the section. */
    order: z.number(),
    /** Path in the app repo, so the page can link to its source. */
    source: z.string(),
  }),
});

export const collections = { docs };
