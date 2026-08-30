# Contributing to the Flume website

This repository is the site at [flume.adamgreenwell.com](https://flume.adamgreenwell.com).
The application itself lives at
[adamgreenwell/flume](https://github.com/adamgreenwell/flume) — bug reports and
feature requests about **Flume** belong there, not here.

Issues that belong here: something on the site is wrong, broken, unreadable,
inaccessible, or out of date.

## Getting set up

Node 22.12 or later; `.nvmrc` pins 26 to match the app repo.

```bash
npm install
npm run dev
```

Before opening a PR, the same gate CI runs:

```bash
npm run check && npm run build
```

## Where content actually comes from

Two things on this site are **generated**. Editing them here is wasted work.

**The documentation** under `src/content/docs/` is copied from the app repo's
`docs/` directory, which is also the source for the GitHub Wiki. Fix the wording
there, then re-sync:

```bash
npm run sync:docs -- ../flume
```

**Release data** — versions, filenames, sizes on the download and changelog
pages — is fetched from the GitHub API during the build. There is nothing to
edit; if it looks wrong, the release is wrong or the classifier in
`src/lib/releases.ts` is.

Because there is no tagged release yet, every build takes the "nothing
published" path. To work on those pages, copy `.env.example` to `.env` — the
fixture's filenames are exactly what the release workflow emits.

## Design rules

The palette, radii and control heights are transcribed from the app's
`src/app/globals.css` and are the same vocabulary on purpose. The site and the
product should not hold two ideas about what "accent" means.

1. **Never introduce a colour that is not a token.** If a step is genuinely
   missing, derive it in OKLCH at fixed chroma and hue. The palette was built
   that way and converted to sRGB, so interpolating between two existing values
   in sRGB gives the wrong answer.
2. **Both themes are real.** Light is a re-step of the same roles, not an
   inversion. Anything you add gets checked on both grounds.
3. **Numbers that sit in a column are `.num`** — mono with tabular figures, so
   the column does not jitter when a digit changes width. Numbers inside a
   sentence are not; mono turns "1.0.0" into "1 . 0 . 0" mid-prose.
4. **Motion is opt-out.** Anything that moves respects
   `prefers-reduced-motion`, and the page must be complete and correct when it
   does not run.
5. **The hero window is a replica, not a decoration.** Its geometry is
   transcribed from the app's real components. If the app's rows or piece strip
   change, that replica is wrong and should change too.

Two deliberate divergences from the app, both documented where they happen in
`src/styles/global.css`: the type ramp is built against a 16.5px base rather
than the app's 13px, and `font-display` is `swap` rather than `block`.

## Standards

- Prettier is authoritative — `npm run format` before committing.
- `astro check` must be clean. Warnings are treated as failures worth fixing.
- Comments explain **why**, not what. A comment restating the code is noise; a
  comment recording the reason a value is what it is, or why the obvious
  approach was rejected, is the point.
- [Conventional Commits](https://www.conventionalcommits.org), small and
  frequent, matching the app repo.

## Accessibility

Not optional, and not a final pass:

- Every interactive element reachable and operable by keyboard, with a visible
  focus ring.
- Text meets WCAG AA against its own background, in **both** themes.
- Status is never colour alone — a dot, a word, and where there is room, a
  sentence.
- Images that carry meaning have alt text; images that repeat adjacent text
  have empty alt so they are not announced twice.

## Code of Conduct

The app repo's
[Code of Conduct](https://github.com/adamgreenwell/flume/blob/main/CODE_OF_CONDUCT.md)
applies here too.

## Licence

Contributions are accepted under [Apache-2.0](LICENSE). Note that the Flume
name and logo are **not** covered by that grant — see [NOTICE](NOTICE).
