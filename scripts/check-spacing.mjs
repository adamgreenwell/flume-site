/**
 * Fails the build when two words have been glued together by markup.
 *
 * Astro trims the whitespace around a newline that sits between text and an
 * inline element, so this:
 *
 *     ... works out the
 *     <em>rarest</em> piece ...
 *
 * renders as "works out therarest piece". It is invisible in the source, it
 * survives Prettier, `astro check` has no opinion on it, and it is only ever
 * caught by someone reading the rendered page closely. It bit three separate
 * times while this site was being written, which is what this script is for.
 *
 * The fix at the call site is `{" "}` at the end of the text line.
 *
 * Run against `dist/` after a build.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DIST = "dist";

/**
 * A word character butted straight against an inline tag, then another word
 * character. Restricted to inline elements — a paragraph or a list item
 * legitimately begins right after a block tag.
 */
const GLUED = /[a-z0-9](<(?:a|span|em|strong|code|b|i)\b[^>]*>)([A-Za-z0-9])/g;

/** Every `.html` file under a directory. */
async function pages(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await pages(path)));
    else if (entry.name.endsWith(".html")) out.push(path);
  }
  return out;
}

const found = [];

for (const page of await pages(DIST)) {
  const html = await readFile(page, "utf8");
  for (const match of html.matchAll(GLUED)) {
    const context = html
      .slice(Math.max(0, match.index - 50), match.index + match[0].length + 30)
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    found.push({ page, context });
  }
}

if (found.length === 0) {
  console.log("  No glued words.");
  process.exit(0);
}

console.error(`\n  ${found.length} place(s) where markup ate a space:\n`);
for (const { page, context } of found) {
  console.error(`    ${page}`);
  console.error(`      …${context}…\n`);
}
console.error('  Add {" "} at the end of the text line before the element.\n');
process.exit(1);
