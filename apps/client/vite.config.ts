import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

/** The game's version: `version` in this package's package.json. Raise it when a release is made. */
const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

/**
 * When the game last changed: the date of the latest commit (YYYY-MM-DD), so every build of
 * the same code says the same. Without git (a source download), the day it was built.
 */
function lastUpdated(): string {
  try {
    const day = execFileSync("git", ["log", "-1", "--format=%cs"], { encoding: "utf8" }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  } catch {
    // No git here: fall back to today.
  }
  return new Date().toISOString().slice(0, 10);
}

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works under any GitHub Pages sub-path.
  base: "./",
  build: {
    chunkSizeWarningLimit: 2000,
  },
  // Shown in a corner of the main menu (src/version.ts).
  define: {
    __GAME_VERSION__: JSON.stringify(version),
    __LAST_UPDATED__: JSON.stringify(lastUpdated()),
  },
});
