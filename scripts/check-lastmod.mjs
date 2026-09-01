/**
 * Fails the build when the sitemap's `lastmod` does not match what the clone
 * can actually support.
 *
 * `lastmod.mjs` has two correct outcomes and they look nothing alike. Given
 * real history it emits a date per URL; given a shallow clone — where every
 * file resolves to the single fetched commit — it emits nothing at all,
 * because a uniform date that looks plausible and means nothing is worse than
 * an absent one.
 *
 * That second branch is why a green build proves less than it appears to. CI
 * checks out with `fetch-depth: 1` by default, so the guard fires, the sitemap
 * ships with no dates, and every existing assertion still passes. The feature
 * could break entirely and nothing would say so.
 *
 * So this asserts against the clone it is actually running in rather than
 * against a fixed expectation. Both branches are exercised in CI: one job
 * checks out shallow and one with full history, and this script is the same in
 * each. It also means the check stays correct if `actions/checkout` ever
 * changes its default.
 *
 * Run against `dist/` after a build.
 */

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const SITEMAP = "dist/sitemap-0.xml";

/** Whether git can support a per-file date here. Mirrors `lastmod.mjs`. */
function shallow() {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true"
    );
  } catch {
    // No git at all. Same expectation as a shallow clone: no dates.
    return true;
  }
}

let xml;
try {
  xml = await readFile(SITEMAP, "utf8");
} catch {
  console.error(`\n  ${SITEMAP} is missing. Did the build run?\n`);
  process.exit(1);
}

const urls = [...xml.matchAll(/<url>(.*?)<\/url>/g)].map((m) => ({
  loc: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "(no loc)",
  lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? null,
}));

if (urls.length === 0) {
  console.error("\n  The sitemap contains no URLs at all.\n");
  process.exit(1);
}

const withDate = urls.filter((u) => u.lastmod);
const withoutDate = urls.filter((u) => !u.lastmod);

if (shallow()) {
  /*
   * Shallow: the guard must have suppressed every date. A date here would mean
   * the guard failed and the file is now asserting something git cannot back.
   */
  if (withDate.length > 0) {
    console.error(
      `\n  Shallow clone, but ${withDate.length} URL(s) carry a lastmod.` +
        `\n  The guard in scripts/lastmod.mjs is not firing, so these dates` +
        `\n  all come from the one fetched commit and mean nothing:\n`,
    );
    for (const u of withDate) console.error(`    ${u.loc}  ${u.lastmod}`);
    console.error("");
    process.exit(1);
  }
  console.log(`  Shallow clone — no lastmod emitted, as intended.`);
  process.exit(0);
}

/*
 * Full history: every URL should carry a date. One that does not is either a
 * page missing from the SOURCES map in `lastmod.mjs` — which fails quietly by
 * design, so nothing else would report it — or a source with no commits yet.
 */
if (withoutDate.length > 0) {
  console.error(
    `\n  Full history, but ${withoutDate.length} URL(s) have no lastmod:\n`,
  );
  for (const u of withoutDate) console.error(`    ${u.loc}`);
  console.error(
    `\n  Either the route is missing from SOURCES in scripts/lastmod.mjs,` +
      `\n  or its source has not been committed yet.\n`,
  );
  process.exit(1);
}

/*
 * A date on every URL is necessary but not sufficient. If they are all
 * identical the file communicates nothing, which is the failure the whole
 * approach exists to avoid — and the shape it takes when chrome creeps back
 * into the SOURCES map and swamps every page's own history.
 */
const distinct = new Set(withDate.map((u) => u.lastmod));
if (distinct.size === 1 && withDate.length > 1) {
  console.error(
    `\n  All ${withDate.length} URLs share one lastmod (${[...distinct][0]}).` +
      `\n  A sitemap where every entry changed at the same moment says as much` +
      `\n  as one with no dates. Check that SOURCES in scripts/lastmod.mjs has` +
      `\n  not picked up a layout or component every page includes.\n`,
  );
  process.exit(1);
}

console.log(
  `  ${withDate.length} URLs, each with a lastmod, ${distinct.size} distinct dates.`,
);
process.exit(0);
