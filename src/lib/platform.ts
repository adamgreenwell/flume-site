/**
 * Guessing which download a visitor wants.
 *
 * This is the only client-side logic on the download page. Everything else is
 * rendered at build time; this runs once on load to promote one card and
 * demote the rest. It must degrade to "show everything, promote nothing" —
 * a wrong guess that hides the right download is worse than no guess.
 */

import type { Arch, Os } from "./releases";

/** What detection concluded. */
export interface Guess {
  /** The visitor's OS, or `null` if it could not be determined. */
  os: Os | null;
  /**
   * The visitor's CPU architecture, or `null` if unknown.
   *
   * Frequently `null` on purpose — see {@link detect}. macOS does not need it
   * at all, because Flume ships one universal binary there.
   */
  arch: Arch | null;
}

/**
 * `navigator.userAgentData`, which TypeScript's DOM library does not yet
 * declare. Chromium-only; Safari and Firefox have both declined to ship it.
 */
interface UserAgentData {
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<{ architecture?: string }>;
}

/** Narrows `navigator` to whether it carries `userAgentData`. */
export function userAgentData(): UserAgentData | null {
  const nav = navigator as Navigator & { userAgentData?: UserAgentData };
  return nav.userAgentData ?? null;
}

/**
 * Reads the OS out of the classic user-agent string.
 *
 * Deliberately conservative. Every token matched here has been stable for
 * fifteen years or more; anything ambiguous returns `null` so the caller shows
 * the full list rather than promoting a guess.
 *
 * iOS and Android return `null` rather than a desktop OS — Flume is a desktop
 * app, and offering a phone user a `.dmg` is worse than offering them nothing.
 *
 * @param ua - The user-agent string, injectable for testing.
 * @returns The detected OS, or `null`.
 */
export function osFromUserAgent(ua: string): Os | null {
  if (/android/i.test(ua)) return null;
  if (/iphone|ipad|ipod/i.test(ua)) return null;

  if (/mac os x|macintosh/i.test(ua)) return "macos";
  if (/windows/i.test(ua)) return "windows";
  if (/linux|x11|cros/i.test(ua)) return "linux";

  return null;
}

/**
 * Reads the architecture from the high-entropy client hints.
 *
 * Chromium only. Safari and Firefox have both declined to ship
 * `userAgentData`, and this is the one fact the classic user-agent string
 * cannot supply: an Apple Silicon Mac reports `MacIntel`, and Windows on ARM
 * reports an x64 UA deliberately so that x64 downloads keep working. Sniffing
 * it produces a confidently wrong answer, and for a 6 MB installer a wrong
 * answer is one that will not run.
 *
 * So this asks the only source that actually knows, and returns `null`
 * everywhere else rather than guessing.
 *
 * @param uad - The `userAgentData` object, when the browser has one.
 * @returns The architecture, or `null` if it cannot be established.
 */
async function archFromHints(uad: UserAgentData): Promise<Arch | null> {
  try {
    const hints = await uad.getHighEntropyValues(["architecture"]);
    if (hints.architecture === "arm") return "arm64";
    if (hints.architecture === "x86") return "x64";
  } catch {
    // The call can reject — a permissions policy, or a Chromium old enough to
    // lack the hint. Not knowing is a supported outcome.
  }
  return null;
}

/**
 * Determines the visitor's platform, to promote one download card.
 *
 * The OS half is reliable. `userAgentData.platform` is a clean token where it
 * exists; otherwise {@link osFromUserAgent} matches on strings that have been
 * stable for fifteen years and returns `null` for anything ambiguous.
 *
 * The architecture half is deliberately partial, and that is the honest shape
 * rather than a compromise:
 *
 *   - **macOS never asks.** Flume ships one universal `.dmg`, so there is no
 *     choice to get wrong and no reason to pay for an async round trip.
 *   - **Chromium is asked properly**, via {@link archFromHints}.
 *   - **Everyone else gets `null`**, and the page shows both architectures for
 *     their OS — one extra decision, rather than a wrong download.
 *
 * Async because the hints API is. Nothing waits on it: the page is complete
 * when it renders, and this only reorders and labels afterwards.
 *
 * @returns The visitor's platform, with `null` for anything not established.
 */
export async function detect(): Promise<Guess> {
  const uad = userAgentData();

  const os = uad
    ? (osFromUserAgent(uad.platform) ?? osFromUserAgent(navigator.userAgent))
    : osFromUserAgent(navigator.userAgent);

  if (os === null) return { os: null, arch: null };
  if (os === "macos") return { os, arch: "universal" };

  return { os, arch: uad ? await archFromHints(uad) : null };
}

/**
 * Human label for a platform, used in the promoted card's heading.
 *
 * @param os - The detected OS.
 * @returns A display name such as `"macOS"`.
 */
export function osLabel(os: Os): string {
  return { macos: "macOS", windows: "Windows", linux: "Linux" }[os];
}
