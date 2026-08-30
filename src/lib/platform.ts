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
 * Determines the visitor's platform, to promote one download card.
 *
 * TODO(you): implement this. The OS half is straightforward — call
 * {@link osFromUserAgent}, and prefer `userAgentData()!.platform` when it
 * exists since it is a clean token rather than a string to be sniffed.
 *
 * The architecture half is the real decision, and it is a product call rather
 * than a technical one:
 *
 *   - `navigator.userAgent` cannot answer it. An Apple Silicon Mac reports
 *     `MacIntel`, and Windows on ARM reports an x64 UA in most browsers,
 *     specifically so that x64 downloads keep working. Sniffing it produces a
 *     confidently wrong answer, which for a 30 MB installer means a download
 *     that simply will not run.
 *   - `userAgentData.getHighEntropyValues(["architecture"])` does answer it,
 *     accurately, but it is async and Chromium-only — so Safari and Firefox
 *     visitors get nothing from it.
 *   - macOS does not need it either way: Flume ships one universal `.dmg`.
 *
 * So the choice is roughly: return `arch: null` always and let the Windows and
 * Linux cards show both architectures side by side (honest, one extra decision
 * for the visitor); or make {@link detect} async, await the high-entropy hint
 * where it exists, and fall back to `null` elsewhere (better for most Windows
 * visitors, more moving parts, and a brief flash before the promotion lands).
 *
 * The return type already allows either, and `download.astro` awaits the
 * result, so going async is a change to this function alone — mark it `async`
 * and nothing else has to move.
 *
 * @returns The visitor's platform, with `null` for anything not established.
 */
export function detect(): Guess | Promise<Guess> {
  // TODO(you): 5–10 lines. Return `{ os, arch }`.
  return { os: null, arch: null };
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
