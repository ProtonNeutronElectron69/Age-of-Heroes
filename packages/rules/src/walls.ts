import { DIRECTIONS, hexAdd, hexKey, hexScale, hexToWorld, type Hex } from "./hex";
import { HEX_SIZE } from "./world";

/**
 * Walls between hexes. Such a wall runs straight along the boundary between two rows of
 * hexes, like a wall set into the notches of a hex board: the hexes on both sides stay open.
 *
 * A wall placed at `hex` with `rotation` r and `length` n covers the row of n hexes
 * hex, hex + d, hex + 2d ... (d = DIRECTIONS[r]) and stands on that row's side toward
 * DIRECTIONS[r + 1]. It blocks the 2n hex edges on that side: between each row hex and its
 * neighbours in directions r + 1 and r + 2.
 */
export interface WallLine {
  /** The row of hexes the wall runs along (the side it stands on is theirs). */
  readonly row: readonly Hex[];
  /** The pairs of neighbouring hexes it stands between. */
  readonly edges: readonly (readonly [Hex, Hex])[];
  /** Its centre line in world space (x, z), end to end. */
  readonly from: { readonly x: number; readonly z: number };
  readonly to: { readonly x: number; readonly z: number };
}

/** Half a wall's thickness for line of sight, in world units. */
export const WALL_HALF_THICKNESS = 0.09 * HEX_SIZE;

export function wallLine(origin: Hex, rotation: number, length: number): WallLine {
  const r = ((rotation % 6) + 6) % 6;
  const d = DIRECTIONS[r]!;
  const side1 = DIRECTIONS[(r + 1) % 6]!;
  const side2 = DIRECTIONS[(r + 2) % 6]!;
  const row = Array.from({ length }, (_, i) => hexAdd(origin, hexScale(d, i)));
  const edges = row.flatMap((h) => [[h, hexAdd(h, side1)] as const, [h, hexAdd(h, side2)] as const]);
  // The line halfway between the two rows' centres, from the near corner of the first hex to the far corner of the last.
  const c = hexToWorld(origin, HEX_SIZE);
  const along = hexToWorld(d, HEX_SIZE);
  const across = hexToWorld(side1, HEX_SIZE);
  const ox = 0.5 * (across.x - 0.5 * along.x);
  const oz = 0.5 * (across.z - 0.5 * along.z);
  return {
    row,
    edges,
    from: { x: c.x - 0.5 * along.x + ox, z: c.z - 0.5 * along.z + oz },
    to: { x: c.x + (length - 0.5) * along.x + ox, z: c.z + (length - 0.5) * along.z + oz },
  };
}

/** The same key for an edge whichever way round its two hexes are given. */
export function edgeKey(a: Hex, b: Hex): string {
  const ka = hexKey(a);
  const kb = hexKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** Do two segments in the ground plane cross (touching ends count)? */
export function segmentsCross(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number },
): boolean {
  const cross = (p: { x: number; z: number }, q: { x: number; z: number }, s: { x: number; z: number }) =>
    (q.x - p.x) * (s.z - p.z) - (q.z - p.z) * (s.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  const EPS = 1e-9;
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}
