/**
 * Hex grid math using axial coordinates (q, r) on a pointy-top layout.
 * The implicit third cube coordinate is s = -q - r.
 *
 * World mapping: +q runs along +x, +r runs along +z (rows step "down" the map).
 */

export interface Hex {
  readonly q: number;
  readonly r: number;
}

/** Create a hex, normalising -0 to 0 so equality and keys stay stable. */
export function hex(q: number, r: number): Hex {
  return { q: q + 0, r: r + 0 };
}

export const ORIGIN: Hex = hex(0, 0);

/** The six neighbour offsets, ordered counter-clockwise starting East. */
export const DIRECTIONS: readonly Hex[] = [
  hex(1, 0), // E
  hex(1, -1), // NE
  hex(0, -1), // NW
  hex(-1, 0), // W
  hex(-1, 1), // SW
  hex(0, 1), // SE
];

export function hexS(h: Hex): number {
  return -h.q - h.r + 0;
}

export function hexEquals(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: Hex, b: Hex): Hex {
  return hex(a.q + b.q, a.r + b.r);
}

export function hexSub(a: Hex, b: Hex): Hex {
  return hex(a.q - b.q, a.r - b.r);
}

export function hexScale(a: Hex, k: number): Hex {
  return hex(a.q * k, a.r * k);
}

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function parseHexKey(key: string): Hex {
  const [q, r] = key.split(",").map(Number);
  if (q === undefined || r === undefined || Number.isNaN(q) || Number.isNaN(r)) {
    throw new Error(`Invalid hex key: ${key}`);
  }
  return hex(q, r);
}

export function hexDistance(a: Hex, b: Hex): number {
  const d = hexSub(a, b);
  return (Math.abs(d.q) + Math.abs(d.r) + Math.abs(hexS(d))) / 2;
}

export function hexNeighbor(h: Hex, direction: number): Hex {
  const d = DIRECTIONS[((direction % 6) + 6) % 6]!;
  return hexAdd(h, d);
}

export function hexNeighbors(h: Hex): Hex[] {
  return DIRECTIONS.map((d) => hexAdd(h, d));
}

export function isAdjacent(a: Hex, b: Hex): boolean {
  return hexDistance(a, b) === 1;
}

/**
 * Rotate a hex around the origin by `steps` x 60 degrees counter-clockwise
 * (in the direction DIRECTIONS is ordered). Negative steps rotate clockwise.
 */
export function hexRotate(h: Hex, steps: number): Hex {
  const n = ((steps % 6) + 6) % 6;
  let q = h.q;
  let r = h.r;
  for (let i = 0; i < n; i++) {
    const s = -q - r;
    // One step along DIRECTIONS order: (q, r, s) -> (-s, -q, -r)
    const nq = -s;
    const nr = -q;
    q = nq;
    r = nr;
  }
  return hex(q, r);
}

/** Round fractional axial coordinates to the nearest hex. */
export function hexRound(fq: number, fr: number): Hex {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) {
    q = -r - s;
  } else if (dr > ds) {
    r = -q - s;
  }
  return hex(q, r);
}

/** All hexes on a straight line from a to b, inclusive. */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b);
  if (n === 0) return [a];
  const results: Hex[] = [];
  // Nudge to avoid ambiguous rounding exactly on hex edges.
  const aq = a.q + 1e-6;
  const ar = a.r + 1e-6;
  const bq = b.q + 1e-6;
  const br = b.r + 1e-6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    results.push(hexRound(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return results;
}

export function hexRing(center: Hex, radius: number): Hex[] {
  if (radius === 0) return [center];
  const results: Hex[] = [];
  let h = hexAdd(center, hexScale(DIRECTIONS[4]!, radius));
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      results.push(h);
      h = hexNeighbor(h, side);
    }
  }
  return results;
}

export function hexSpiral(center: Hex, radius: number): Hex[] {
  const results: Hex[] = [];
  for (let k = 0; k <= radius; k++) results.push(...hexRing(center, k));
  return results;
}

/** Centre of a hex in world units (x, z) for a given circumradius. */
export function hexToWorld(h: Hex, size = 1): { x: number; z: number } {
  return {
    x: size * Math.sqrt(3) * (h.q + h.r / 2),
    z: size * 1.5 * h.r,
  };
}

export function worldToHex(x: number, z: number, size = 1): Hex {
  const fq = ((Math.sqrt(3) / 3) * x - (1 / 3) * z) / size;
  const fr = ((2 / 3) * z) / size;
  return hexRound(fq, fr);
}
