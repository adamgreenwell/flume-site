# Deploying to Sevalla

The site is a static build. Sevalla clones this repo, runs the build, and
serves `dist/` from its edge network.

## Creating the site

In the Sevalla dashboard, **Static Sites → Add site**, then:

| Field                        | Value                                                |
| ---------------------------- | ---------------------------------------------------- |
| Repository                   | `adamgreenwell/flume-site`                           |
| Branch                       | `main`                                               |
| Build site before publishing | On                                                   |
| Node version                 | `22` or later — **not** the default if that is older |
| Build command                | `npm run build`                                      |
| Publish directory            | `dist`                                               |
| Root directory               | _(blank)_                                            |

Sevalla auto-detects Astro and proposes `npm run build` with `dist`, which is
correct. Two things about that:

**It fills the fields as you pick the repository, and typing appends rather
than replaces.** Selecting the repo populated both Name and Publish directory,
and typing into them produced `flume-siteflume-site` and `distdist`. Select all
before typing, or just leave the detected values alone.

**Check the Node version.** `lts` is the default and works — Astro 7 refuses to
run below 22.12, and `lts` is comfortably above it. Do not pick the bare `22`
option on the assumption it means the newest 22.x; `lts` is the safer choice
and is what this site runs on.

Leave the SPA **Index file** and **Error file** fields blank. This is a
multi-page static site, not a single-page app — pointing every 404 at
`index.html` would serve the home page under every wrong URL and tell search
engines it exists at all of them.

## Domain

`flume.adamgreenwell.com` is a **subdomain**, so this is a `CNAME`, not an `A`
record. There is no IP to point at: Sevalla serves static sites from its own
edge behind a shared hostname.

Adding the domain in the site's **Domains** tab produces the records to create.
For this site they were:

| Stage  | Type    | Name                    | Value                              |
| ------ | ------- | ----------------------- | ---------------------------------- |
| Verify | `CNAME` | `flume`                 | `fallback.kinsta.page`             |
| Verify | `TXT`   | `_acme-challenge.flume` | a one-time token Sevalla generates |

The `TXT` record does not appear until the `CNAME` exists — Sevalla reveals it
on the next check — so this is two passes through the DNS editor, not one.
A third stage, **Point domain**, stays greyed out until both verify.

Take the token from the dashboard rather than retyping it. A trailing space or
one wrong character fails the check and the error does not say which.

### The Cloudflare-specific part

`adamgreenwell.com` is on Cloudflare, and Sevalla's own troubleshooting calls
this out: **set both records to DNS only — the grey cloud, not the orange
one.** A proxied record does not resolve publicly, so Sevalla's check cannot
see it and the domain sits pending with nothing visibly misconfigured. The
`CNAME` defaults to Proxied in Cloudflare's dialog, so it has to be switched
off deliberately.

Also delete any stale `_acme-challenge` records for this name before starting.
A leftover from an earlier attempt is matched instead of the current token and
verification fails against a value that looks right.

You can turn the proxy on after the domain is active. Note that Sevalla's edge
is itself Cloudflare, so proxying puts one Cloudflare zone in front of another
— it works, and it is a hop you do not need. Unless you want the WAF or
analytics in front, leave it grey.

Sevalla issues a free certificate per custom domain. Wait for it before
announcing the URL.

`astro.config.mjs` already has `site: "https://flume.adamgreenwell.com"`, which
is what makes the sitemap and canonical URLs absolute. If the domain ever
changes, change it there too.

### Checking it landed

```bash
dig +short flume.adamgreenwell.com CNAME
dig +short _acme-challenge.flume.adamgreenwell.com TXT
curl -sI https://flume.adamgreenwell.com | head -1
```

The first two should return exactly what Sevalla displayed. If `dig` returns
nothing for a record you have definitely created, it is almost always the
orange cloud.

A `404` from the third with valid TLS is normal while verification is still
pending: DNS and the certificate are working, and Kinsta's edge simply has no
site attached to that hostname yet. It becomes a `200` when Sevalla finishes.

## Pull request previews

Optional, and worth turning on — but note Sevalla's own warning that previews
consume build minutes and bandwidth.

## Rebuilding when a release is published

Release data is resolved at build time, so publishing a GitHub release does
**not** update the download page by itself. The site has to rebuild.

Auto-deploy covers pushes to `flume-site`, but a release happens in the _app_
repo, which pushes nothing here — so that case needs something explicit.

**Sevalla static sites have no "deploy hook" URL.** The Settings page offers
Source, Auto-deploy, Git LFS, Deploy paths, PR previews, Build strategy and
Pretty URLs, and nothing else; the earlier version of this document described a
Deploy hooks section that does not exist. `release.yml` in the app repo still
has a step that POSTs to `SEVALLA_DEPLOY_HOOK`. That secret is unset, so the
step prints "No SEVALLA_DEPLOY_HOOK configured; skipping site rebuild" and
exits zero — harmless, but it is wired to a mechanism this platform does not
provide.

Three real options, in order of how much they cost to set up:

1. **Do nothing.** The next push to `flume-site` rebuilds and picks the release
   up. In practice the site is usually touched around a release anyway. The
   download page is stale until then.
2. **The official GitHub Action**, [`sevalla-hosting/sevalla-deploy`][action].
   Needs a Sevalla API token as a repo secret, plus the static site's ID —
   which is on the Settings page under Details: `6cade71a-c6ce-4f69-8ef3-e082a74e2039`.
   Replace the `SEVALLA_DEPLOY_HOOK` step with it.
3. **An empty commit** pushed to `flume-site` from `release.yml`, which trips
   auto-deploy. No API token, but it needs write access to this repo from the
   app repo's workflow and it puts noise in the history.

Option 2 is the right one if this matters; option 1 is what is in force today.

[action]: https://github.com/sevalla-hosting/sevalla-deploy

## Settings worth knowing

**Pretty URLs is disabled, and that is fine.** Astro is configured with
`build.format: "directory"`, so every page is emitted as `index.html` inside its
own folder. Both `/download` and `/download/` return 200 as it stands, so the
redirect Pretty URLs would add is not needed.

**Leave Index file and Error file alone.** Sevalla's documentation is explicit
that both are single-page-application settings: they route all navigation
through one file. Setting **Error file** to `404.html` on this multi-page site
was tried and changed nothing, before and after a redeploy — the response still
carried Sevalla's own `svid` header, so it was their edge answering rather than
anything cached in front of it.

Pointing **Index file** at `index.html` is worse than useless here. That is the
SPA behaviour: it would serve the home page under every wrong URL with a `200`,
telling search engines each of them is a real page.

**The custom 404 comes from `_redirects` instead**, with the standard catch-all:

```
/*    /404.html    404
```

It has to be the last rule, because the first match wins and this one matches
everything. It is deliberately **not** forced — without the bang a rule only
applies when no file exists at that path, so every real page still serves
itself and only genuine misses fall through, with a `404` status rather than a
`200`.

Check both halves after any change to that file, because a forced catch-all
would silently swallow the whole site:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://flume.adamgreenwell.com/download/
curl -s https://flume.adamgreenwell.com/definitely-not-a-page | grep -o '<title>[^<]*'
```

The first must be `200`. The second must read `Page not found — Flume`.

## Note on the private repository

Both the release fetch and, if you ever switch to fetching them, the docs
require `adamgreenwell/flume` to be **public** — or a token in the build
environment. While the repo is private the GitHub API returns 404 to an
unauthenticated build, which the site handles by rendering its "not published
yet" state.

If you want real download links before the repo goes public, add a
fine-grained personal access token with read-only `Contents` access as a
`GITHUB_TOKEN` environment variable in Sevalla. `src/lib/releases.ts` picks it
up automatically.
