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
Pretty URLs, and nothing else. Their API confirms it: there are
`deployment-hook` endpoints under `/v3/applications`, and no equivalent under
`/v3/static-sites`. An earlier version of this document described a Deploy
hooks section that does not exist.

**`release.yml` in the app repo calls the API instead**, in its `notify-site`
job:

```
POST https://api.sevalla.com/v3/static-sites/{id}/deployments
Authorization: Bearer $SEVALLA_API_TOKEN
{"branch":"main"}
```

Two things it needs, both already in place:

| What                | Where it lives                                                                         |
| ------------------- | -------------------------------------------------------------------------------------- |
| `SEVALLA_API_TOKEN` | A repo secret on **`adamgreenwell/flume`** — where the workflow runs, not on this repo |
| The static site ID  | Hardcoded in the step: `6cade71a-c6ce-4f69-8ef3-e082a74e2039`, from Settings → Details |

Create the key at [app.sevalla.com/api-keys](https://app.sevalla.com/api-keys)
and scope it to deploy only; Sevalla's own documentation recommends a
deploy-only key for CI. The value is shown once.

It is deliberately not the official [`sevalla-hosting/sevalla-deploy`][action]
action. That action's static-site path is a thin wrapper around exactly this
request, and `flume` is public, so a plain `curl` is one fewer third party
holding a token that can deploy.

The step never fails the release — a stale website is a warning, not a reason to
red a green build — and it skips silently when the secret is unset, so forks are
unaffected. `401`, `403` and `404` are reported separately because each has a
different fix: a revoked token, a key without the deploy capability, and a wrong
site ID.

**Checking it ran.** The `notify-site` job's log prints the status code. To
confirm from the outside, compare the version on the download page against the
newest release:

```bash
curl -s https://flume.adamgreenwell.com/download/ | grep -o 'Version <strong[^>]*>[^<]*' | sed 's/.*>//'
```

If it lags after a release, deploy manually from the Sevalla dashboard and read
the job log for the warning saying why.

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
