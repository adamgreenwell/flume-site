/**
 * Per-URL `lastmod` for the sitemap, read from git.
 *
 * The obvious implementation — stamp the build time on every URL — is worse
 * than emitting nothing. This site rebuilds whenever anything is pushed and
 * again on every release, so every page would claim to have changed each time
 * any page did. `lastmod` is a hint a crawler is free to distrust, and that is
 * exactly the pattern that teaches it to. Google has said as much publicly: it
 * uses the value when the site is consistently honest about it and ignores it
 * otherwise.
 *
 * So each URL gets the committer date of the source that actually renders its
 * own content — and nothing else.
 *
 * ── What this deliberately does not capture ──
 * `/download/`, the platform pages and `/changelog/` are built from the GitHub
 * API, so publishing a release changes their content — new filenames, new
 * sizes, new notes — with no commit anywhere in this repository. Their
 * `lastmod` will not move for that.
 *
 * That is an under-claim, and the direction matters: telling a crawler a page
 * is older than it is costs a delayed recrawl, while telling it every page is
 * newer than it is costs the credibility of the whole file. The release case
 * is also already covered — `indexnow.mjs` announces every URL on each build,
 * which is the mechanism actually designed for "this changed just now".
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/*
 * ── Why the layout, header and footer are not counted ──
 *
 * They were, in the first version of this file, on the reasoning that a footer
 * link is content too. The result was every URL sharing one date — whichever
 * of the three had been touched most recently — because chrome changes more
 * often than any single page does. A sitemap where every entry carries the
 * same `lastmod` communicates nothing at all, which is the exact failure this
 * file exists to avoid, reached by a different road.
 *
 * It is also the wrong reading of what `lastmod` means. The value is supposed
 * to mark when a page's *primary content* meaningfully changed; boilerplate
 * edits explicitly do not qualify. So excluding chrome is both the more useful
 * answer and the more correct one.
 *
 * When a chrome change genuinely does matter — the JSON-LD added to `Base` is
 * a fair example — `indexnow.mjs` submits every URL on the next build anyway.
 * The two mechanisms divide the work: this one carries per-page history, that
 * one says "all of this just changed".
 */

/**
 * Route to the sources that render it.
 *
 * Components are listed only where they carry content rather than styling.
 * If a page starts pulling its words from somewhere new, add it here — an
 * entry that is missing makes this quietly under-report rather than fail,
 * which is the failure mode to watch for.
 */
const SOURCES = {
  "/": ["src/pages/index.astro", "src/components/AppWindow.astro"],
  "/download/": ["src/pages/download.astro", "src/components/AssetList.astro"],
  "/download/mac/": [
    "src/pages/download/[os].astro",
    "src/components/AssetList.astro",
  ],
  "/download/windows/": [
    "src/pages/download/[os].astro",
    "src/components/AssetList.astro",
  ],
  "/download/linux/": [
    "src/pages/download/[os].astro",
    "src/components/AssetList.astro",
  ],
  "/changelog/": ["src/pages/changelog.astro"],
  "/contribute/": ["src/pages/contribute.astro"],
  "/privacy/": ["src/pages/privacy.astro"],
};

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/**
 * Whether git can answer this at all.
 *
 * A shallow clone is the case worth catching. `git log -1` still succeeds in
 * one, but every file resolves to the single commit that was fetched, so every
 * page would share one date that means nothing — a plausible-looking answer
 * that is entirely wrong, which is worse than no answer. CI checkouts default
 * to `--depth 1`, so this is the likely state on a build host rather than an
 * exotic one.
 */
const usable = (() => {
  try {
    return git(["rev-parse", "--is-shallow-repository"]) === "false";
  } catch {
    return false; // No git, or not a repository. Emit no lastmod at all.
  }
})();

/** Committer date of a file's last commit, or null. Queried once per file. */
const cache = new Map();
function commitDate(file) {
  if (cache.has(file)) return cache.get(file);

  let value = null;
  try {
    // `--` so a path that also names a branch cannot be read as a revision.
    const out = git(["log", "-1", "--format=%cI", "--", file]);
    value = out === "" ? null : out; // Empty means the file has no commits yet.
  } catch {
    value = null;
  }

  cache.set(file, value);
  return value;
}

/**
 * `lastmod` for one route as a W3C datetime string, or `undefined` when git
 * cannot support a claim.
 *
 * Undefined rather than a guess: the sitemap schema treats `lastmod` as
 * optional, and a URL without one is read as "no information", which is the
 * truth in that case.
 *
 * A string, not a `Date`. `@astrojs/sitemap` types the integration option as a
 * `Date` but `SitemapItem.lastmod` — what `serialize` returns — as a `string`.
 * A `Date` there serialises correctly and fails `astro check`, which is a
 * combination worth not rediscovering.
 */
export function lastmodFor(pathname) {
  if (!usable) return undefined;

  const sources = SOURCES[pathname];
  if (!sources) return undefined;

  const dates = sources.map(commitDate).filter(Boolean);
  if (dates.length === 0) return undefined;

  // ISO 8601 sorts lexicographically, but only with a common offset — these
  // carry the committer's, so compare as instants.
  const newest = dates.reduce((a, b) =>
    Date.parse(a) > Date.parse(b) ? a : b,
  );
  return new Date(newest).toISOString();
}
