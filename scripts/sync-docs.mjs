/**
 * Copies the wiki source out of the app repo into this site's content
 * collection.
 *
 * The docs live in `flume/docs/` because they are mirrored to the GitHub Wiki
 * and are edited in the same commit as the code they describe. This site is a
 * separate repo, so it needs its own copy.
 *
 * Fetching them at build time — the way release data is fetched — is not an
 * option while `adamgreenwell/flume` is private: an unauthenticated build
 * would 404, and giving the site's build a repo-scoped token to read
 * documentation is a lot of credential for a little convenience. Copying makes
 * the site build with no network and no secrets, and the sync produces a real
 * diff in git, so what changed in the docs is reviewable rather than silent.
 *
 * Run it with `npm run sync:docs` after changing anything in `flume/docs/`.
 *
 * Usage:
 *   node scripts/sync-docs.mjs [path-to-flume-repo]
 */

import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../src/content/docs");

const SOURCE = resolve(
  process.argv[2] ?? process.env.FLUME_REPO ?? "../flume",
  "docs",
);

/**
 * Ordering and shelving for the docs sidebar.
 *
 * Explicit rather than alphabetical: a reader arriving at the docs wants
 * Getting Started first, not Architecture. Anything not listed here is still
 * published — it lands in "More" at the end — so adding a page to the wiki
 * never silently drops it from the site.
 */
const NAV = [
  { section: "Using Flume", pages: ["Getting-Started", "User-Guide"] },
  {
    section: "Under the hood",
    pages: ["Architecture", "Torrent-Engine-Notes", "Design-System"],
  },
  {
    section: "Building and shipping",
    pages: [
      "Development-Setup",
      "CI-CD-and-Releases",
      "Signing-and-Distribution",
      "Platform-Notes",
      "Smoke-Test-Checklist",
    ],
  },
  { section: "Project", pages: ["Roadmap"] },
];

/**
 * Pages that exist in the wiki but do not belong on the site.
 *
 * `Home` is the wiki's own index and is replaced here by the docs landing
 * page. `Phase-1-Plan` is a working document about a milestone rather than
 * something a user or contributor needs.
 */
const SKIP = new Set(["Home", "Phase-1-Plan"]);

/** Slug → section, derived from NAV so the two cannot drift. */
const SECTION_OF = new Map(
  NAV.flatMap(({ section, pages }) => pages.map((p) => [p, section])),
);

/** Slug → position, for sorting within a section. */
const ORDER_OF = new Map(
  NAV.flatMap(({ pages }) => pages).map((p, i) => [p, i]),
);

/**
 * Turns a wiki filename into the title shown in the sidebar and the tab.
 *
 * The first `# ` heading in the file wins, because the docs already write good
 * titles — `Signing & Distribution` rather than the filename's
 * `Signing-and-Distribution`. Falls back to de-slugging the filename.
 *
 * @param {string} slug - Filename without extension.
 * @param {string} body - The file's markdown.
 * @returns {string} The display title.
 */
function titleFor(slug, body) {
  const heading = body.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : slug.replace(/-/g, " ");
}

/**
 * Rewrites the markdown for the site.
 *
 * Three transforms:
 *
 *   1. `[[Wiki-Link]]` becomes a real relative link. The wiki syntax renders
 *      as literal brackets anywhere except GitHub's wiki.
 *   2. The leading `# Title` is dropped — the layout renders the title from
 *      frontmatter, and leaving it produces two h1s on the page.
 *   3. GitHub's `> [!NOTE]` callouts are left alone; the docs layout styles
 *      them, so they survive as blockquotes with a recognisable first line.
 *
 * @param {string} body - Raw markdown from the wiki source.
 * @returns {string} Markdown ready for the content collection.
 */
function rewrite(body) {
  return body
    .replace(/\[\[([^\]|]+)\]\]/g, (_, page) => {
      const slug = page.trim();
      const label = slug.replace(/-/g, " ");
      return SKIP.has(slug)
        ? label
        : `[${label}](/docs/${slug.toLowerCase()}/)`;
    })
    .replace(/^#\s+.+\n+/, "")
    .trimEnd();
}

/** Escapes a string for a double-quoted YAML scalar. */
const yaml = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(
      `\n  Could not find the app repo's docs at:\n    ${SOURCE}\n\n` +
        `  Pass the path to the flume checkout:\n` +
        `    npm run sync:docs -- ../flume\n`,
    );
    process.exit(1);
  }

  // Cleared rather than merged: a page deleted from the wiki has to disappear
  // from the site too, and a merge would leave it published forever.
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const files = (await readdir(SOURCE)).filter((f) => f.endsWith(".md"));
  let written = 0;
  const unlisted = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    if (SKIP.has(slug)) continue;

    const raw = await readFile(join(SOURCE, file), "utf8");
    const title = titleFor(slug, raw);
    const section = SECTION_OF.get(slug) ?? "More";
    if (!SECTION_OF.has(slug)) unlisted.push(slug);

    const frontmatter = [
      "---",
      `title: ${yaml(title)}`,
      `section: ${yaml(section)}`,
      `order: ${ORDER_OF.get(slug) ?? 99}`,
      `source: ${yaml(`docs/${file}`)}`,
      "---",
      "",
    ].join("\n");

    await writeFile(
      join(OUT, `${slug.toLowerCase()}.md`),
      frontmatter + rewrite(raw) + "\n",
    );
    written += 1;
  }

  console.log(`  Synced ${written} pages from ${SOURCE}`);
  if (unlisted.length) {
    console.log(
      `  Not in NAV, filed under "More": ${unlisted.join(", ")}\n` +
        `  Add them to NAV in scripts/sync-docs.mjs to place them.`,
    );
  }
}

await main();
