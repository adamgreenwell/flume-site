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

Add `flume.adamgreenwell.com` under the site's **Domains** tab and create the
`CNAME` record Sevalla shows you at your DNS provider. Let it issue the
certificate before announcing the URL anywhere.

`astro.config.mjs` already has `site: "https://flume.adamgreenwell.com"`, which
is what makes the sitemap and canonical URLs absolute. If the domain ever
changes, change it there too.

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
