/**
 * IndexNow submission, run after a production build.
 *
 * One POST reaches Bing, Yandex, Seznam, Naver and Yep — they share a single
 * submission pool, so this is the whole non-Google half of "get indexed
 * everywhere" in one request. Google does not participate in IndexNow and
 * never has; it is reached through Search Console and ordinary crawling, so
 * nothing here should be read as covering it.
 *
 * The URL list is read from the built sitemap rather than hardcoded. The
 * sitemap is already generated from the routes that actually shipped, and a
 * second hand-maintained list of pages is exactly the kind of pair that drifts
 * — the same reason `robots.txt.ts` reads `site` from the Astro config instead
 * of repeating the domain.
 *
 * The key is not a secret. IndexNow works by having the caller prove control
 * of the host, and it does that by serving the key publicly at
 * `/<key>.txt` — which is why the file sits in `public/` and is committed.
 *
 * This never fails the build. A release that cannot reach the IndexNow
 * endpoint is still a release; it just gets crawled on the engines' own
 * schedule instead of being announced.
 */
import { readFile } from "node:fs/promises";

const KEY = "50044b0a0da7d2908d7db9948ed053a9";
const HOST = "flume.adamgreenwell.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const SITEMAP = new URL("../dist/sitemap-0.xml", import.meta.url);

/** Pull every `<loc>` out of the built sitemap. */
async function urlsFromSitemap() {
  const xml = await readFile(SITEMAP, "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  /*
   * Opt *in*, not out. This runs as `postbuild`, so without the guard every
   * `npm run build` on a laptop would announce the production URLs — including
   * builds of half-finished work, and builds made with `FLUME_FAKE_RELEASE=1`.
   * `INDEXNOW=1` is set in Sevalla's environment and nowhere else, so the
   * announcement happens exactly when the site is actually being published.
   */
  if (process.env.INDEXNOW !== "1") {
    console.log("indexnow: skipped (set INDEXNOW=1 to submit)");
    return;
  }

  let urlList;
  try {
    urlList = await urlsFromSitemap();
  } catch {
    console.log("indexnow: no sitemap in dist/, nothing to submit");
    return;
  }

  if (urlList.length === 0) {
    console.log("indexnow: sitemap contained no URLs");
    return;
  }

  const body = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList,
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });

    /*
     * 200 and 202 both mean accepted. 422 is the one worth reading aloud: it
     * means the key file did not validate, which on this site means
     * `public/<key>.txt` was deleted or renamed without updating KEY above.
     */
    if (res.ok) {
      console.log(`indexnow: submitted ${urlList.length} URLs (${res.status})`);
    } else {
      console.log(`indexnow: endpoint returned ${res.status} — not fatal`);
    }
  } catch (error) {
    console.log(
      `indexnow: could not reach endpoint (${error.message}) — not fatal`,
    );
  }
}

await main();
