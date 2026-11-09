/**
 * Physical scale shared by line of sight and the renderer, so what players
 * see matches what the engine checks.
 */

/** Hex circumradius in world units. */
export const HEX_SIZE = 1;
/** Height of one terrain level in world units. A Height 5 figure is 5 levels tall. */
export const LEVEL_HEIGHT = 0.3;
/** Radius of a single-hex figure token in world units. */
export const TOKEN_RADIUS = 0.55;
/** The hit band covers the top part of a token, as a fraction of its height. */
export const HIT_BAND_FROM = 0.6;
