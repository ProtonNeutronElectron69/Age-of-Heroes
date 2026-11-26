import type { Board } from "./board";
import { hexKey, hexLine, hexNeighbors, hexToWorld, type Hex } from "./hex";
import { segmentHitsShape, type PlacedShape } from "./hitShapes";
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
  /** Figures that can block the view, as tokens. Exclude the attacker and the target. */
  readonly blockers?: readonly Token[];
  /** Figures that block the view with their hit shapes (games with hit zones): their body and gear. */
  readonly shapes?: readonly PlacedShape[];
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

/** Points on the target's hit band that the attacker tries to see. */
export function targetPoints(t: Token): Vec3[] {
  const { x, z } = hexToWorld(t.hex, HEX_SIZE);
  const fractions = [HIT_BAND_FROM + 0.05, 0.8, 0.95];
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

export function segmentHitsHexPrism(
  a: Vec3,
  b: Vec3,
  cx: number,
  cz: number,
  yMin: number,
  yMax: number,
  inradius = INRADIUS,
): boolean {
  const span: [number, number] = [0, 1];
  if (!clip(a.y, b.y - a.y, yMin + EPS, yMax - EPS, span)) return false;
  const r = inradius - EPS;
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

/** The ground under each hex of a figure, which never blocks its own view or its being seen. */
function groundUnder(tokens: readonly Token[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tokens) map.set(hexKey(t.hex), Math.max(map.get(hexKey(t.hex)) ?? 0, t.elevation));
  return map;
}

function segmentBlocked(
  board: Board,
  ground: Map<string, number>,
  eye: Vec3,
  target: Vec3,
  cells: Hex[],
  opts: SightOptions,
): boolean {
  for (const h of cells) {
    const key = hexKey(h);
    const below = ground.get(key);
    const { x, z } = hexToWorld(h, HEX_SIZE);
    for (const cell of board.column(h)) {
      if (below !== undefined && cell.layer < below) continue;
      if (segmentHitsHexPrism(eye, target, x, z, cell.layer * LEVEL_HEIGHT, (cell.layer + 1) * LEVEL_HEIGHT)) {
        return true;
      }
    }
    // Scenery counts as terrain.
    for (const { placement, rules } of board.sceneryIn(h)) {
      const y0 = placement.elevation * LEVEL_HEIGHT;
      const y1 = y0 + rules.height * LEVEL_HEIGHT;
      const hit =
        rules.shape === "prism"
          ? segmentHitsHexPrism(eye, target, x, z, y0, y1)
          : segmentHitsCylinder(eye, target, x, z, (rules.radius ?? 0.6) * HEX_SIZE, y0, y1);
      if (hit) return true;
    }
  }
  for (const t of opts.blockers ?? []) {
    const { x, z } = hexToWorld(t.hex, HEX_SIZE);
    const y0 = t.elevation * LEVEL_HEIGHT;
    if (segmentHitsCylinder(eye, target, x, z, TOKEN_RADIUS, y0, y0 + t.height * LEVEL_HEIGHT)) return true;
  }
  for (const shape of opts.shapes ?? []) if (segmentHitsShape(eye, target, shape)) return true;
  return false;
}

/**
 * Can `from` see `to`? Each side is one token, or one token per hex for a
 * multi-hex figure: the attacker may look from any of its hexes and needs to
 * see part of the target's hit band. Other figures in `blockers` block the view.
 */
export function hasLineOfSight(
  board: Board,
  from: Token | readonly Token[],
  to: Token | readonly Token[],
  opts: SightOptions = {},
): boolean {
  const viewers: readonly Token[] = Array.isArray(from) ? from : [from as Token];
  const targets: readonly Token[] = Array.isArray(to) ? to : [to as Token];
  const ground = groundUnder([...viewers, ...targets]);
  for (const v of viewers) {
    const eye = eyePoint(v);
    for (const t of targets) {
      const cells = corridor(v.hex, t.hex);
      if (targetPoints(t).some((p) => !segmentBlocked(board, ground, eye, p, cells, opts))) return true;
    }
  }
  return false;
}

/** A target as line of sight sees it in games with hit zones. */
export interface ShapedTarget {
  /** The hexes it stands on, as tokens: their ground never blocks the view. */
  readonly tokens: readonly Token[];
  /** Its boxes on the board: its gear (a shield, a weapon) hides its body. */
  readonly shape: PlacedShape;
  /** Points spread through its body, on the board. */
  readonly samples: readonly Vec3[];
}

/**
 * Hit zones: the share of the target's body the viewer can see, from 0 to 1. A line from the
 * viewer's eye point to each sample point of the body counts if terrain, scenery, the other
 * figures' shapes and the target's own gear all leave it clear (the body itself never hides its
 * own points, so the share is of the body's whole outline). A multi-hex viewer sees from the best
 * of its hexes. With `atLeast`, the count stops as soon as the answer to "is the share at least
 * this?" is known, and the result is then only good for that question.
 */
export function shareInSight(
  board: Board,
  from: Token | readonly Token[],
  target: ShapedTarget,
  opts: SightOptions = {},
  atLeast?: number,
): number {
  const viewers: readonly Token[] = Array.isArray(from) ? from : [from as Token];
  const n = target.samples.length;
  if (n === 0 || viewers.length === 0) return 0;
  const need = atLeast === undefined ? Infinity : Math.max(1, Math.ceil(atLeast * n - 1e-9));
  const ground = groundUnder([...viewers, ...target.tokens]);
  let best = 0;
  for (const v of viewers) {
    const eye = eyePoint(v);
    const seen = new Map<string, Hex>();
    for (const t of target.tokens) for (const h of corridor(v.hex, t.hex)) seen.set(hexKey(h), h);
    const cells = [...seen.values()];
    let clear = 0;
    let hidden = 0;
    for (const p of target.samples) {
      const blocked = segmentHitsShape(eye, p, target.shape, true) || segmentBlocked(board, ground, eye, p, cells, opts);
      if (blocked) hidden++;
      else clear++;
      if (clear >= need) return clear / n;
      if (atLeast !== undefined && n - hidden < need) break;
    }
    best = Math.max(best, clear / n);
  }
  return best;
}
