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

1. In Sevalla, open the site → **Settings → Deploy hooks**, and create one.
   Copy the URL.
2. In the **app** repo (`adamgreenwell/flume`), add it as a repository secret
   named `SEVALLA_DEPLOY_HOOK`.
3. Add this job to `.github/workflows/release.yml`:

```yaml
# Release data is baked into the site at build time, so a published release
# is invisible until the site rebuilds. Fires once, after every platform has
# attached its artifacts.
#
# `if` guards a fork or a repo without the secret configured: an unset secret
# would otherwise POST to an empty URL and fail the workflow over something
# that is not the release's problem.
refresh-site:
  name: Rebuild flume.adamgreenwell.com
  runs-on: ubuntu-latest
  needs: [build, rpm]
  if: ${{ !cancelled() && vars.SEVALLA_DEPLOY_HOOK_CONFIGURED == 'true' }}
  steps:
    - name: Trigger Sevalla deploy
      run: curl -fsS -X POST "${{ secrets.SEVALLA_DEPLOY_HOOK }}"
```

Set the repository **variable** `SEVALLA_DEPLOY_HOOK_CONFIGURED` to `true`
alongside the secret. A secret cannot be tested for existence in an `if`, so
the variable is what makes the guard possible.

`needs: [build, rpm]` with `!cancelled()` means the rebuild runs even if one
platform's build failed — a release with four of five installers still wants
its download page refreshed.

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
