# flume-site

The marketing and documentation site for [Flume](https://github.com/adamgreenwell/flume),
a modern cross-platform BitTorrent client.

Live at **https://flume.adamgreenwell.com**. Astro, static output, hosted on
Sevalla.

## Running it

Needs Node 22.12 or later (`.nvmrc` pins 26, matching the app repo).

```bash
npm install
npm run dev
```

| Command           | What it does                               |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | Dev server on :4321                        |
| `npm run build`   | Static build to `dist/`                    |
| `npm run preview` | Serve the built output                     |
| `npm run check`   | `astro check` plus a Prettier format check |

## Where the content comes from

**Release data** is fetched from the GitHub API during `astro build` and baked
into the HTML, so the download buttons work with JavaScript off and cost a
visitor nothing at runtime. The build never fails on a GitHub outage — it falls
back to linking the releases page.

Because it is resolved at build time, **publishing a release does not update the
site on its own**. `.github/workflows/site-deploy.yml` in the app repo calls
Sevalla's API when a release is _published_ — publishing the draft, not pushing
the tag, is what deploys the site. See `docs/deploy.md`.

> `FLUME_FAKE_RELEASE=1` (in `.env` or the environment) renders a fixture
> instead of calling the API. It mirrors `v1.0.0-rc.1` — a pre-release whose
> `.rpm` jobs failed, so it carries neither an `.rpm` nor a `SHA256SUMS`. That
> is deliberate: those are the branches the live API no longer exercises now
> that `v1.0.0` is complete, and they are the ones that would otherwise promise
> a Fedora package that is not in the release. CI builds both ways.

**Documentation** is not here. The site used to render its own copy of the app
repo's `docs/`, which published the same pages twice under different URLs. The
[wiki](https://github.com/adamgreenwell/flume/wiki) is the one that stays — it
is generated from `docs/` by `wiki-sync.yml` on every push, so it cannot drift
and does not need this site rebuilt to update.

`/docs` and every path under it 301 to the matching wiki page. The rules are in
`_redirects`, which **must stay in the repository root** — Sevalla reads it
from there rather than from `dist/`, and a copy in the publish directory is
silently ignored.

## Search indexing

The site is new, and the name collides badly — with Flume the musician, Flume
Water, Apache Flume, the `flume` crate, `flume.dev`, and most awkwardly with
**Flud**, an established Android torrent client one letter away that currently
holds the category results. Prose cannot fix that, so two mechanisms do.

**`SoftwareApplication` JSON-LD** in `src/components/StructuredData.astro`
declares Flume as an entity, and its `sameAs` list is the load-bearing part:
it asserts which other URLs _are_ this same thing. Add to it whenever the
project gains a canonical presence somewhere. The per-platform pages describe
their own build under their own `@id` — `#app-mac` rather than `#app` — because
three pages claiming a different `operatingSystem` for one `@id` would be three
contradictory statements about one entity rather than three descriptions.

**IndexNow** (`scripts/indexnow.mjs`) announces the URL list after a build. One
POST reaches Bing, Yandex, Seznam, Naver and Yep, which share a submission
pool. Google does not participate and is reached through Search Console and
ordinary crawling instead.

It runs as `postbuild` but is **opt-in**: without `INDEXNOW=1` it prints a line
and exits. That guard is the point — otherwise every local `npm run build`,
including the `FLUME_FAKE_RELEASE=1` ones, would announce production URLs.
Set `INDEXNOW=1` in Sevalla's environment and nowhere else.

The key at `public/<key>.txt` is **not a secret**; serving it publicly is how
IndexNow verifies you control the host. If it is ever renamed, update `KEY` in
the script to match or submissions start failing with a 422.

**Sitemap `lastmod`** (`scripts/lastmod.mjs`) is the committer date of the
source that renders each page, not the build time. Build time would mark every
URL as changed whenever any one of them did, and `lastmod` is a hint a crawler
is free to ignore once it catches you doing that.

Two things about it are deliberate and easy to undo by accident. It counts only
a page's own content sources — adding `Base.astro`, `Header.astro` or
`Footer.astro` back collapses every URL onto one date, because chrome changes
more often than any single page. And it returns nothing rather than guessing:
in a shallow clone every file resolves to the one fetched commit, so
`--depth 1` on a build host would otherwise produce a uniform date that looks
plausible and means nothing. Both cases emit no `lastmod` at all instead.

A page whose source is not yet committed also gets no `lastmod`, which is why a
newly added page has none until its first commit.

`src/lib/verification.ts` holds the webmaster-console ownership tokens. They
are empty until each console is set up, and an empty one renders no tag at all
— an empty `content` attribute reads as a failed check rather than an absent
one. Google is deliberately not in that file: Search Console can verify through
the Google Analytics tag already in `Base.astro`.

## Brand

`brand/flume-logo.png` is the 1600px master. Everything in `public/` is derived
from it, so regenerate rather than editing the copies:

```bash
sips -Z 128 brand/flume-logo.png --out public/logo.png
sips -Z 32  brand/flume-logo.png --out public/favicon-32.png
sips -Z 180 brand/flume-logo.png --out public/apple-touch-icon.png
```

The mark is a raster with gradients and bevels, so it is **not** recoloured per
theme — it is used unmodified on both, having been checked against the dark and
light grounds. `logo.png` is deliberately only 128px: the site never draws it
larger than 34px, and that covers 4× density for 20 KB.

`public/og.png` is a 1200×630 card built by hand; the source that generated it
is not checked in, so redraw it if the headline changes.

To replace the app's icon set — Flume still ships Tauri's default placeholder —
run this from the app repo:

```bash
npm run tauri icon ../flume-site/brand/flume-logo.png
```

## Design

The palette, radii and control heights are transcribed from the app's
`src/app/globals.css` and are the same vocabulary deliberately. Two things
diverge on purpose, both documented in `src/styles/global.css`: the type ramp
is rebuilt against a 16.5px base rather than the app's 13px, and `font-display`
is `swap` rather than `block` because the fonts arrive over a network here.

Never introduce a colour that is not a token. A genuinely missing step is
derived in OKLCH at fixed chroma and hue, never interpolated in sRGB.
