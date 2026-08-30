/**
 * Release data, fetched from the GitHub API at build time.
 *
 * Build time rather than in the browser: the download buttons are the point of
 * the site, and they should work with JavaScript disabled, render with real
 * filenames and sizes in the initial HTML, and never spend a visitor's
 * unauthenticated rate limit. The cost is that the site has to be rebuilt when
 * a release is published. `release.yml` in the app repository pings a Sevalla
 * deploy hook to do that, when `SEVALLA_DEPLOY_HOOK` is configured; without it
 * the site simply serves whatever it was last built with.
 *
 * Nothing here throws. A rate-limited or offline build must still produce a
 * site; it just produces one that points at the GitHub releases page instead
 * of at specific files.
 */

const REPO = "adamgreenwell/flume";
const API = `https://api.github.com/repos/${REPO}`;

/** Operating systems Flume ships installers for. */
export type Os = "macos" | "windows" | "linux";

/** CPU architectures within an OS. `universal` is macOS's lipo of both. */
export type Arch = "universal" | "x64" | "arm64";

/** One downloadable file from a release. */
export interface Asset {
  /** Filename as attached to the release. */
  name: string;
  /** Direct download URL. */
  url: string;
  /** Size in bytes, as reported by GitHub. */
  size: number;
  /** Download count, as reported by GitHub. */
  downloads: number;
  os: Os;
  arch: Arch;
  /** Package format, uppercased for display — `DMG`, `MSI`, `DEB`. */
  format: string;
  /**
   * What this format is for, in one clause. Shown beside the button so a
   * visitor does not have to know what an AppImage is.
   */
  blurb: string;
}

/** A published release with its assets grouped by platform. */
export interface Release {
  /** Tag name, e.g. `v1.0.0`. */
  tag: string;
  /** Version without the leading `v`. */
  version: string;
  /** Release title. */
  name: string;
  /** ISO 8601 publication timestamp. */
  publishedAt: string;
  /** Markdown release notes. */
  body: string;
  /** Human URL for the release. */
  url: string;
  /** Whether GitHub flags this as a pre-release. */
  prerelease: boolean;
  /** Every recognised installer, in display order. */
  assets: Asset[];
  /**
   * URL of the release's `SHA256SUMS` file, or `null` when it has none.
   *
   * Worth surfacing rather than filtering away with the other non-installers.
   * Windows builds carry no signature at all, so checking a hash is the only
   * verification available to someone who wants one — and a link they cannot
   * find is the same as no link. Older releases have one and `v1.0.0-rc.1`
   * does not, which is exactly why this is optional rather than assumed.
   */
  checksums: string | null;
}

/** Shape of the bits of GitHub's release payload this module reads. */
interface GhRelease {
  tag_name: string;
  name: string | null;
  published_at: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: {
    name: string;
    browser_download_url: string;
    size: number;
    download_count: number;
  }[];
}

/**
 * How each package format is described to a visitor.
 *
 * `.msi` and the NSIS `.exe` both install Flume on Windows; the difference
 * only matters to someone deploying it, so the blurb says which is which
 * rather than leaving two unexplained buttons side by side.
 *
 * Nothing here says "pick this one". A blurb is per *format*, and each format
 * ships for two architectures — so a recommendation written here appears on
 * both rows and is wrong on one of them. Which build a visitor wants is a
 * question about their machine, and it is answered by `platform.ts` at
 * runtime or not at all.
 */
const FORMATS: Record<string, string> = {
  dmg: "Disk image — drag to Applications",
  msi: "Windows Installer, for managed deployment",
  exe: "Standard installer",
  deb: "Debian, Ubuntu, and derivatives",
  rpm: "Fedora, RHEL, Rocky, and AlmaLinux",
  appimage: "No install — chmod +x and run",
};

/** Display order: the format most people want first, within each OS. */
const FORMAT_RANK = ["dmg", "exe", "msi", "deb", "rpm", "appimage"];

/**
 * Classifies a release asset by filename.
 *
 * Tauri's bundlers name files predictably but not uniformly — the `.rpm`
 * bundler uses `x86_64`/`aarch64` where the `.deb` one uses `amd64`/`arm64`,
 * and the macOS build is a single `universal` lipo. Rather than encode each
 * bundler's convention, this matches on whichever architecture token is
 * present and falls back to x64, which is what every bundler omits the token
 * for when it builds only one architecture.
 *
 * @param name - The asset filename.
 * @param url - Its download URL.
 * @param size - Its size in bytes.
 * @param downloads - Its download count.
 * @returns The classified asset, or `null` if the extension is not an
 *   installer — signatures, checksums and updater manifests all land here.
 */
function classify(
  name: string,
  url: string,
  size: number,
  downloads: number,
): Asset | null {
  const lower = name.toLowerCase();

  const ext = FORMAT_RANK.find((f) => lower.endsWith(`.${f}`));
  if (!ext) return null;

  const os: Os =
    ext === "dmg"
      ? "macos"
      : ext === "msi" || ext === "exe"
        ? "windows"
        : "linux";

  const arch: Arch = lower.includes("universal")
    ? "universal"
    : /arm64|aarch64/.test(lower)
      ? "arm64"
      : "x64";

  return {
    name,
    url,
    size,
    downloads,
    os,
    arch,
    format: ext === "appimage" ? "AppImage" : ext.toUpperCase(),
    blurb: FORMATS[ext] ?? "",
  };
}

/**
 * Sorts assets into the order the download page lists them.
 *
 * Format rank first so the recommended download for each OS leads, then
 * architecture so x64 precedes arm64 — the more common machine first, since
 * someone on an arm64 box generally knows it and someone on x64 may not.
 */
function order(a: Asset, b: Asset): number {
  const byFormat =
    FORMAT_RANK.indexOf(a.format.toLowerCase()) -
    FORMAT_RANK.indexOf(b.format.toLowerCase());
  if (byFormat !== 0) return byFormat;

  const rank = { universal: 0, x64: 1, arm64: 2 };
  return rank[a.arch] - rank[b.arch];
}

/**
 * Calls the GitHub API, returning `null` rather than throwing.
 *
 * A build must not fail because GitHub is slow, rate-limited, or down. The
 * caller renders a reduced page in that case.
 *
 * @param path - Path appended to the repo API root.
 * @returns The parsed body, or `null` on any failure.
 */
async function get<T>(path: string): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "flume-site-build",
  };

  // Optional. Unauthenticated builds get 60 requests an hour per IP, which is
  // plenty for two calls — but shared CI egress addresses can exhaust it, so
  // the token is honoured when one is configured.
  const token = import.meta.env.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${API}${path}`, { headers });
    if (!response.ok) {
      console.warn(
        `[releases] GitHub returned ${response.status} for ${path} — ` +
          `falling back to the releases page.`,
      );
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn(`[releases] Could not reach GitHub for ${path}:`, error);
    return null;
  }
}

/** Converts a GitHub payload into the shape the pages render. */
function toRelease(gh: GhRelease): Release {
  return {
    tag: gh.tag_name,
    version: gh.tag_name.replace(/^v/, ""),
    name: gh.name ?? gh.tag_name,
    publishedAt: gh.published_at,
    body: gh.body ?? "",
    url: gh.html_url,
    prerelease: gh.prerelease,
    assets: gh.assets
      .map((a) =>
        classify(a.name, a.browser_download_url, a.size, a.download_count),
      )
      .filter((a): a is Asset => a !== null)
      .sort(order),
    checksums:
      gh.assets.find((a) => /^SHA256SUMS/i.test(a.name))
        ?.browser_download_url ?? null,
  };
}

/**
 * A stand-in release, used when `FLUME_FAKE_RELEASE=1` is set.
 *
 * Keeps CI builds hermetic: the site's own workflow must not fail because
 * GitHub is slow, rate-limited, or mid-release, and must not depend on what
 * happens to be published at the time it runs.
 *
 * The filenames here are exactly what `release.yml`'s bundlers emit, which
 * makes this a real exercise of {@link classify} rather than a mock built to
 * agree with it. Update them when the bundlers change.
 */
function fixture(): GhRelease {
  const asset = (name: string, size: number) => ({
    name,
    browser_download_url: `https://github.com/${REPO}/releases/download/v1.0.0-rc.1/${name}`,
    size,
    download_count: 0,
  });

  return {
    tag_name: "v1.0.0-rc.1",
    name: "Flume 1.0.0",
    published_at: new Date().toISOString(),
    body: "## Fixture\n\nSet `FLUME_FAKE_RELEASE=1` to render this.",
    html_url: `https://github.com/${REPO}/releases/tag/v1.0.0-rc.1`,
    draft: false,
    prerelease: true,
    // Copied from the real v1.0.0-rc.1, byte sizes included — including what
    // it is missing. Both .rpm jobs failed on that run and no SHA256SUMS was
    // produced, so this fixture has neither.
    //
    // That is deliberate, and it is the reason the fixture is worth having.
    // The unauthenticated CI job hits the live API, which currently answers
    // with v0.1.0-rc.4 and does carry rpms and a checksums file, so that job
    // already exercises the complete path. This one exercises the degraded
    // one: a release missing a platform's package, with nothing to verify
    // against. Those branches are the ones that would otherwise ship untested
    // and promise a Fedora package that is not there.
    assets: [
      asset("Flume_1.0.0_universal.dmg", 17_943_870),
      asset("Flume_1.0.0_x64-setup.exe", 5_760_403),
      asset("Flume_1.0.0_x64_en-US.msi", 8_126_464),
      asset("Flume_1.0.0_arm64-setup.exe", 5_232_610),
      asset("Flume_1.0.0_arm64_en-US.msi", 7_786_496),
      asset("Flume_1.0.0_amd64.deb", 11_043_366),
      asset("Flume_1.0.0_arm64.deb", 11_467_648),
      asset("Flume_1.0.0_amd64.AppImage", 87_792_120),
      asset("Flume_1.0.0_aarch64.AppImage", 86_366_728),
    ],
  };
}

/** Whether the build was asked to use {@link fixture}. */
function faking(): boolean {
  return (
    (import.meta.env.FLUME_FAKE_RELEASE ?? process.env.FLUME_FAKE_RELEASE) ===
    "1"
  );
}

/**
 * The newest release a visitor can actually download.
 *
 * Prefers a stable release via `/releases/latest`, which GitHub defines as the
 * newest non-draft, non-prerelease. When there is no stable release at all,
 * that endpoint returns 404 — and Flume was in exactly that state while
 * shipping release candidates, so the download page rendered its
 * nothing-published fallback while real, downloadable installers existed.
 *
 * So it falls back to the newest published pre-release. Callers must check
 * {@link Release.prerelease} and say so: offering a release candidate is
 * right, offering one while implying it is stable is not.
 *
 * Drafts are never returned. GitHub omits them from anonymous responses, and
 * a draft is by definition something nobody should be downloading yet.
 *
 * @returns The newest downloadable release, or `null` if none is published.
 */
export async function latestRelease(): Promise<Release | null> {
  if (faking()) return toRelease(fixture());

  const stable = await get<GhRelease>("/releases/latest");
  if (stable) return toRelease(stable);

  const all = await get<GhRelease[]>("/releases?per_page=10");
  const newest = all?.find((r) => !r.draft);
  return newest ? toRelease(newest) : null;
}

/**
 * Every published release, newest first, for the changelog.
 *
 * Drafts are excluded — release.yml publishes as a draft so builds can be
 * smoke-tested per OS first, and an unreleased draft must not appear on the
 * site. Pre-releases are kept: they are real things people can download, and
 * the changelog marks them as such.
 *
 * @param limit - How many to request. GitHub caps a page at 100.
 * @returns The releases, or an empty array if the API was unreachable.
 */
export async function allReleases(limit = 30): Promise<Release[]> {
  if (faking()) return [toRelease(fixture())];

  const gh = await get<GhRelease[]>(`/releases?per_page=${limit}`);
  if (!gh) return [];

  return gh.filter((r) => !r.draft).map(toRelease);
}

/**
 * Formats a byte count using decimal units.
 *
 * Mirrors `formatBytes` in the app — decimal because that is what disks and
 * ISPs quote, three significant figures because fewer loses real distinctions
 * and more is noise. Download sizes here are tens of megabytes, so this only
 * ever renders the MB step, but it stays faithful to the app's rule.
 *
 * @param bytes - A non-negative byte count.
 * @returns A string such as `"17.4 MB"`.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1000)),
    units.length - 1,
  );
  const value = bytes / 1000 ** exponent;

  if (exponent === 0) return `${Math.round(value)} B`;
  return `${value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)} ${units[exponent]}`;
}
