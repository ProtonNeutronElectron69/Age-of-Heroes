import type { Board } from "./board";
import { hexKey, hexLine, hexNeighbors, hexToWorld, type Hex } from "./hex";
import { HEX_SIZE, HIT_BAND_FROM, LEVEL_HEIGHT, TOKEN_RADIUS } from "./world";

/**
 * Line of sight in world space. Terrain cells are hexagonal prisms one level
 * tall; figures are upright cylinders as tall as their Height. A shot is
 * clear if a straight segment from the attacker's eye point reaches at least
 * one sample point on the target without passing through anything solid.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Token {
  readonly hex: Hex;
  /** Elevation of the surface the figure stands on, in levels. */
  readonly elevation: number;
  /** Figure Height in levels. */
  readonly height: number;
}

export interface SightOptions {
  /**
   * Strict (Advanced): aim at the hit band, and other figures block.
   * Forgiving (Basic): aim at any part of the target, only terrain blocks.
   */
  readonly strict: boolean;
  /** Figures that can block the view (ignored when not strict). Exclude attacker and target. */
  readonly blockers?: readonly Token[];
}

const INRADIUS = (HEX_SIZE * Math.sqrt(3)) / 2;
/** Hex side normals for a pointy-top hex, in the x-z plane. */
const NORMALS: readonly [number, number][] = [
  [1, 0],
  [0.5, Math.sqrt(3) / 2],
  [-0.5, Math.sqrt(3) / 2],
];
const EPS = 1e-4;

export function eyePoint(t: Token): Vec3 {
  const { x, z } = hexToWorld(t.hex, HEX_SIZE);
  return { x, y: (t.elevation + t.height) * LEVEL_HEIGHT - 0.02, z };
}

/** Points on the target that the attacker tries to see. */
export function targetPoints(t: Token, strict: boolean): Vec3[] {
  const { x, z } = hexToWorld(t.hex, HEX_SIZE);
  const fractions = strict ? [HIT_BAND_FROM + 0.05, 0.8, 0.95] : [0.1, 0.35, 0.6, 0.85, 0.98];
  const r = TOKEN_RADIUS * 0.75;
  const offsets: [number, number][] = [[0, 0]];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k;
    offsets.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const points: Vec3[] = [];
  for (const f of fractions) {
    const y = (t.elevation + t.height * f) * LEVEL_HEIGHT;
    for (const [dx, dz] of offsets) points.push({ x: x + dx, y, z: z + dz });
  }
  return points;
}

/** Narrow the parameter interval [t0, t1] to where lo <= d0 + t*dd <= hi. */
function clip(d0: number, dd: number, lo: number, hi: number, span: [number, number]): boolean {
  if (Math.abs(dd) < 1e-12) return d0 >= lo && d0 <= hi;
  let ta = (lo - d0) / dd;
  let tb = (hi - d0) / dd;
  if (ta > tb) [ta, tb] = [tb, ta];
  span[0] = Math.max(span[0], ta);
  span[1] = Math.min(span[1], tb);
  return span[0] <= span[1];
}

export function segmentHitsHexPrism(a: Vec3, b: Vec3, cx: number, cz: number, yMin: number, yMax: number): boolean {
  const span: [number, number] = [0, 1];
  if (!clip(a.y, b.y - a.y, yMin + EPS, yMax - EPS, span)) return false;
  const r = INRADIUS - EPS;
  for (const [nx, nz] of NORMALS) {
    const d0 = nx * (a.x - cx) + nz * (a.z - cz);
    const dd = nx * (b.x - a.x) + nz * (b.z - a.z);
    if (!clip(d0, dd, -r, r, span)) return false;
  }
  return true;
}

export function segmentHitsCylinder(
  a: Vec3,
  b: Vec3,
  cx: number,
  cz: number,
  radius: number,
  yMin: number,
  yMax: number,
): boolean {
  const span: [number, number] = [0, 1];
  if (!clip(a.y, b.y - a.y, yMin, yMax, span)) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const ox = a.x - cx;
  const oz = a.z - cz;
  const A = dx * dx + dz * dz;
  const B = 2 * (dx * ox + dz * oz);
  const C = ox * ox + oz * oz - radius * radius;
  if (A < 1e-12) return C <= 0;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return false;
  const s = Math.sqrt(disc);
  const t0 = (-B - s) / (2 * A);
  const t1 = (-B + s) / (2 * A);
  return Math.max(span[0], t0) <= Math.min(span[1], t1);
}

/** Hexes that a segment between two hexes could pass through. */
function corridor(a: Hex, b: Hex): Hex[] {
  const seen = new Map<string, Hex>();
  for (const h of hexLine(a, b)) {
    seen.set(hexKey(h), h);
    for (const n of hexNeighbors(h)) seen.set(hexKey(n), n);
  }
  return [...seen.values()];
}

function segmentBlocked(board: Board, from: Token, to: Token, eye: Vec3, target: Vec3, cells: Hex[], opts: SightOptions): boolean {
  const fromKey = hexKey(from.hex);
  const toKey = hexKey(to.hex);
  for (const h of cells) {
    const key = hexKey(h);
    const { x, z } = hexToWorld(h, HEX_SIZE);
    for (const cell of board.column(h)) {
      // The ground a figure stands on never blocks its own view or its being seen.
      if (key === fromKey && cell.layer < from.elevation) continue;
      if (key === toKey && cell.layer < to.elevation) continue;
      if (segmentHitsHexPrism(eye, target, x, z, cell.layer * LEVEL_HEIGHT, (cell.layer + 1) * LEVEL_HEIGHT)) {
        return true;
      }
    }
  }
  if (opts.strict) {
    for (const t of opts.blockers ?? []) {
      const { x, z } = hexToWorld(t.hex, HEX_SIZE);
      const y0 = t.elevation * LEVEL_HEIGHT;
      if (segmentHitsCylinder(eye, target, x, z, TOKEN_RADIUS, y0, y0 + t.height * LEVEL_HEIGHT)) return true;
    }
  }
  return false;
}

export function hasLineOfSight(board: Board, from: Token, to: Token, opts: SightOptions): boolean {
  const eye = eyePoint(from);
  const cells = corridor(from.hex, to.hex);
  return targetPoints(to, opts.strict).some((p) => !segmentBlocked(board, from, to, eye, p, cells, opts));
}
