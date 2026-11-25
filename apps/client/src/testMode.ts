declare global {
  interface Window {
    /** Set by the browser tests before the page loads; never by the game. */
    __aohTest?: boolean;
    /** Set by the graphics test with `__aohTest`: draw at high quality even in test mode. */
    __aohHighGraphics?: boolean;
  }
}

/**
 * True when a browser test runs the game (it sets `window.__aohTest` with
 * Playwright's `addInitScript`, before any of the game's code). Players never
 * have it. Under it the game draws a simpler gaming table, which is much
 * quicker without a graphics card, keeps the camera's narrower zoom limits, and
 * draws at low graphics quality (`useGraphics` in settings.ts) unless the test also
 * sets `__aohHighGraphics`.
 */
export const TEST_MODE = typeof window !== "undefined" && window.__aohTest === true;
