/**
 * Release data, fetched from the GitHub API at build time.
 *
 * Build time rather than in the browser: the download buttons are the point of
 * the site, and they should work with JavaScript disabled, render with real
 * filenames and sizes in the initial HTML, and never spend a visitor's
 * unauthenticated rate limit. The cost is that the site has to be rebuilt when
 * a release is published — `.github/workflows/release.yml` pings a Sevalla
 * deploy hook to do exactly that.
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
  };
}

/**
 * A stand-in release, used when `FLUME_FAKE_RELEASE=1` is set.
 *
 * Flume has not cut 1.0 yet, so every build takes the "nothing published"
 * path and the download page's actual content — the part that matters — never
 * renders. The filenames here are exactly what `release.yml`'s bundlers emit,
 * which makes this a real test of {@link classify} rather than a mock built
 * to agree with it.
 *
 * Delete this once 1.0 is out and the live API answers.
 */
function fixture(): GhRelease {
  const asset = (name: string, size: number) => ({
    name,
    browser_download_url: `https://github.com/${REPO}/releases/download/v1.0.0/${name}`,
    size,
    download_count: 0,
  });

  return {
    tag_name: "v1.0.0",
    name: "Flume 1.0.0",
    published_at: new Date().toISOString(),
    body: "## Fixture\n\nSet `FLUME_FAKE_RELEASE=1` to render this.",
    html_url: `https://github.com/${REPO}/releases/tag/v1.0.0`,
    draft: false,
    prerelease: false,
    assets: [
      asset("Flume_1.0.0_universal.dmg", 17_400_000),
      asset("Flume_1.0.0_x64-setup.exe", 9_100_000),
      asset("Flume_1.0.0_x64_en-US.msi", 9_600_000),
      asset("Flume_1.0.0_arm64-setup.exe", 8_800_000),
      asset("Flume_1.0.0_arm64_en-US.msi", 9_300_000),
      asset("Flume_1.0.0_amd64.deb", 8_700_000),
      asset("Flume_1.0.0_arm64.deb", 8_400_000),
      asset("Flume-1.0.0-1.x86_64.rpm", 8_900_000),
      asset("Flume-1.0.0-1.aarch64.rpm", 8_600_000),
      asset("Flume_1.0.0_amd64.AppImage", 92_000_000),
      // Not an installer. Must be filtered out rather than listed.
      asset("Flume_1.0.0_universal.dmg.sig", 566),
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
 * The current stable release.
 *
 * Uses `/releases/latest`, which GitHub defines as the newest non-draft,
 * non-prerelease release — so a tagged release candidate does not become the
 * headline download.
 *
 * @returns The latest release, or `null` if none is published yet.
 */
export async function latestRelease(): Promise<Release | null> {
  if (faking()) return toRelease(fixture());

  const gh = await get<GhRelease>("/releases/latest");
  return gh ? toRelease(gh) : null;
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
