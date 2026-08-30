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
correct. **Check the Node version it selects.** Astro 7 refuses to run below
22.12, and the failure is a build error rather than a warning.

Leave the SPA **Index file** and **Error file** fields blank. This is a
multi-page static site, not a single-page app — pointing every 404 at
`index.html` would serve the home page under every wrong URL and tell search
engines it exists at all of them.

## Domain

`flume.adamgreenwell.com` is a **subdomain**, so this is a `CNAME`, not an `A`
record. Sevalla serves static sites from its own edge and the address behind it
is not a fixed IP worth pinning; use whatever the site's **Domains** tab shows.

Sevalla asks for two things:

1. A **verification** record, `_cf-custom-hostname.flume`, with the exact value
   it displays.
2. A **CNAME** for `flume` pointing at Sevalla's edge hostname.

### The Cloudflare-specific part

`adamgreenwell.com` is on Cloudflare, and that changes two steps.

**Add the verification record as DNS only — the grey cloud, not the orange
one.** A proxied record does not resolve publicly, so Sevalla's check cannot
see it and verification never completes. This is the single most common way
this goes wrong, and the symptom is a domain that sits on "pending" forever
with nothing obviously misconfigured.

**Delete any stale `_cf-custom-hostname` or `_acme-challenge` records for this
name first.** A leftover from an earlier attempt is matched instead of the
current one and verification fails against a value that looks correct.

Copy the values rather than retyping them. A trailing space or one missing
character fails the check, and the error does not say which.

Leave the `CNAME` itself on **DNS only** until the domain shows as active and
the certificate has issued. You can turn the proxy on afterwards if you want
Cloudflare's analytics or WAF in front — but note that Sevalla's edge is itself
Cloudflare, so proxying puts one Cloudflare zone in front of another. It works,
and it is a hop you do not need. Unless you want something specific from it,
grey is the simpler answer.

Sevalla issues a free certificate per custom domain. Wait for it before
announcing the URL; a visitor who arrives to a certificate warning does not come
back to check whether you fixed it.

`astro.config.mjs` already has `site: "https://flume.adamgreenwell.com"`, which
is what makes the sitemap and canonical URLs absolute. If the domain ever
changes, change it there too.

### Checking it landed

```bash
dig +short flume.adamgreenwell.com CNAME
dig +short _cf-custom-hostname.flume.adamgreenwell.com TXT
curl -sI https://flume.adamgreenwell.com | head -1
```

The first two should return what Sevalla displayed. If `dig` returns nothing
for a record you have definitely created, it is almost always the orange cloud.

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
