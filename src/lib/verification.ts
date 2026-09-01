/**
 * Search-engine ownership verification tokens.
 *
 * Each webmaster console wants proof you control the domain before it will
 * show you index coverage or accept a sitemap. Several accept a `<meta>` tag,
 * which is the only method that survives a static rebuild without a file
 * having to be remembered in `public/` — so that is the method used here.
 *
 * These are *not* secrets. They are served in the HTML of every page; that is
 * the entire mechanism. They live in the repository rather than in the
 * environment for the same reason the IndexNow key does — a token that only
 * exists in a deploy dashboard is one nobody can find again.
 *
 * ── Google is deliberately absent ──
 * Search Console can verify through the Google Analytics tag already in
 * `Base.astro` (property G-KNGWP21KK5), provided the same Google account has
 * edit access to it. Adding a second Google token would be a third place the
 * relationship is recorded, so verify through GA and leave this alone.
 *
 * An empty string means "not verified yet" and renders no tag at all — an
 * empty `content` attribute is worse than an absent tag, because the console
 * reads it as a failed check rather than an absent one.
 */
export interface Verification {
  /** Bing Webmaster Tools — `msvalidate.01`. Also covers Yahoo and DuckDuckGo. */
  bing: string;
  /** Yandex Webmaster — `yandex-verification`. */
  yandex: string;
  /** Naver Search Advisor — `naver-site-verification`. Reached by IndexNow too. */
  naver: string;
}

export const verification: Verification = {
  bing: "",
  yandex: "",
  naver: "",
};

/** The tags that have a token, ready to render. Empty entries are dropped. */
export function verificationTags(): { name: string; content: string }[] {
  const names: Record<keyof Verification, string> = {
    bing: "msvalidate.01",
    yandex: "yandex-verification",
    naver: "naver-site-verification",
  };

  return (Object.keys(names) as (keyof Verification)[])
    .filter((key) => verification[key].trim() !== "")
    .map((key) => ({ name: names[key], content: verification[key].trim() }));
}
