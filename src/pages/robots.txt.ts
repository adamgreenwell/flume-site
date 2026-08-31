import type { APIRoute } from "astro";

/**
 * `robots.txt`, generated rather than checked in as a static file.
 *
 * The only thing it really has to carry is the sitemap URL, and that has to be
 * absolute. Writing it by hand means a second place holding the production
 * domain, which is exactly the kind of pair that drifts — `astro.config.mjs`
 * already declares `site`, so this reads it and the two cannot disagree.
 *
 * Nothing is disallowed. There is no admin area, no search-result pages and
 * nothing generated per visitor; `/docs` is a set of 301s to the wiki, and a
 * crawler should follow those rather than be told to skip them, because that
 * is what passes the ranking those URLs still hold.
 */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("sitemap-index.xml", site).href;

  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${sitemap}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
