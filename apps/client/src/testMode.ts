declare global {
  interface Window {
    /** Set by the browser tests before the page loads; never by the game. */
    __aohTest?: boolean;
  }
}

/**
 * True when a browser test runs the game (it sets `window.__aohTest` with
 * Playwright's `addInitScript`, before any of the game's code). Players never
 * have it. Under it the game draws a simpler gaming table, which is much
 * quicker without a graphics card, and keeps the camera's narrower zoom limits.
 */
export const TEST_MODE = typeof window !== "undefined" && window.__aohTest === true;
