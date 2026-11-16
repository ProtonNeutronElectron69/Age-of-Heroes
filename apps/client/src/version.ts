/**
 * The game's version and when it last changed, for the corner of the main menu.
 * The build fills them in (`define` in vite.config.ts): the version from this
 * package's package.json, the date from the latest commit.
 */

declare const __GAME_VERSION__: string | undefined;
declare const __LAST_UPDATED__: string | undefined;

/** "1.0.0" reads "v1.0"; a patch release shows its third number ("v1.0.2"). */
export function versionLabel(version: string): string {
  const [major = "0", minor = "0", patch = "0"] = version.split(".");
  return `v${major}.${minor}${patch !== "0" ? `.${patch}` : ""}`;
}

/** "2026-11-16" reads "11/16/2026" (MM/DD/YYYY). */
export function dateLabel(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : isoDay;
}

export const GAME_VERSION = versionLabel(typeof __GAME_VERSION__ === "string" ? __GAME_VERSION__ : "0.0.0");
export const LAST_UPDATED = typeof __LAST_UPDATED__ === "string" ? dateLabel(__LAST_UPDATED__) : "";
