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

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Dev server on :4321                                  |
| `npm run build`     | Static build to `dist/`                              |
| `npm run preview`   | Serve the built output                               |
| `npm run check`     | `astro check` plus a Prettier format check           |
| `npm run sync:docs` | Copy the wiki source out of the app repo — see below |

## Where the content comes from

**Release data** is fetched from the GitHub API during `astro build` and baked
into the HTML, so the download buttons work with JavaScript off and cost a
visitor nothing at runtime. The build never fails on a GitHub outage — it falls
back to linking the releases page.

Because it is resolved at build time, **publishing a release does not update the
site on its own**. `.github/workflows/release.yml` in the app repo pings a
Sevalla deploy hook after a release is published; see `docs/deploy.md`.

> Until 1.0 is tagged there is nothing to fetch, so every build takes the
> "nothing published yet" path. To work on the download and changelog pages
> before then, set `FLUME_FAKE_RELEASE=1` (in `.env` or the environment) to
> render a fixture whose filenames match exactly what the release workflow's
> bundlers emit. Delete `fixture()` in `src/lib/releases.ts` once 1.0 ships.

**Documentation** is copied from the app repo's `docs/` directory, which is
also the source for the GitHub Wiki. It is not fetched at build time: the app
repo is private, and giving this build a repo-scoped token just to read
documentation is more credential than the convenience is worth. Re-sync after
changing anything under `flume/docs/`:

```bash
npm run sync:docs -- ../flume
```

The copy under `src/content/docs/` is generated and committed. Reviewing its
diff is how you see what changed in the docs.

## Brand

`brand/` holds the mark. `mark.svg` is the logo (a channel that also reads as
the product's initial), `app-icon.svg` and `app-icon.png` are the 1024px
application icon on its tile.

To replace the app's icon set — Flume still ships Tauri's default placeholder —
run this from the app repo:

```bash
npm run tauri icon ../flume-site/brand/app-icon.png
```

## Design

The palette, radii and control heights are transcribed from the app's
`src/app/globals.css` and are the same vocabulary deliberately. Two things
diverge on purpose, both documented in `src/styles/global.css`: the type ramp
is rebuilt against a 16.5px base rather than the app's 13px, and `font-display`
is `swap` rather than `block` because the fonts arrive over a network here.

Never introduce a colour that is not a token. A genuinely missing step is
derived in OKLCH at fixed chroma and hue, never interpolated in sRGB.
