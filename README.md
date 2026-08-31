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
