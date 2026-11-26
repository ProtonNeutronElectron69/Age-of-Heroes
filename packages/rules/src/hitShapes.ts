import { hexToWorld, type Hex } from "./hex";
import type { Vec3 } from "./los";
import { HEX_SIZE, LEVEL_HEIGHT } from "./world";

/**
 * Hit shapes (games with `hitZones`): each figure is a set of boxes taken from its model, in place
 * of the plain token. Body boxes (head, torso, arms, legs, a mount) can be hit; gear boxes (weapons,
 * shields, flight stands) cannot, but they block the view as the body does. The boxes come from
 * each unit's detailed model and are stored as data (`hitShapes.json` in `@aoh/content`), so the
 * rules never read a model. This file is the geometry; `los.ts` uses it.
 */

type V3 = Vec3;

/** What a box is: part of the figure, which can be hit, or something it holds, which only blocks. */
export type HitKind = "body" | "gear";

/**
 * One box, in the figure's own frame: from the middle of its base on the ground, facing +z, its
 * left +x, in world units. `axes` are the box's own directions, `half` its half sizes along them.
 */
export interface HitBox {
  readonly kind: HitKind;
  readonly centre: V3;
  readonly half: V3;
  readonly axes: readonly [V3, V3, V3];
}

/** One figure's boxes: one pose of a unit. */
export type HitShape = readonly HitBox[];

/** Each unit's poses by card id; a squad's figures take the poses in turn, as the models do. */
export type HitShapes = ReadonlyMap<string, readonly HitShape[]>;

/** Numbers per box in the stored form: kind (0 body, 1 gear), centre, half sizes, a rotation (x, y, z, w), all in thousandths. */
export const HIT_BOX_NUMBERS = 11;

function rotate(q: readonly [number, number, number, number], v: readonly [number, number, number]): V3 {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  // v + 2w(q x v) + 2 q x (q x v)
  const cx = y * vz - z * vy;
  const cy = z * vx - x * vz;
  const cz = x * vy - y * vx;
  const ccx = y * cz - z * cy;
  const ccy = z * cx - x * cz;
  const ccz = x * cy - y * cx;
  return { x: vx + 2 * (w * cx + ccx), y: vy + 2 * (w * cy + ccy), z: vz + 2 * (w * cz + ccz) };
}

/** Read one pose from its stored form. */
export function decodeHitShape(numbers: readonly number[]): HitShape {
  const boxes: HitBox[] = [];
  for (let i = 0; i + HIT_BOX_NUMBERS <= numbers.length; i += HIT_BOX_NUMBERS) {
    const n = (k: number) => numbers[i + k]! / 1000;
    const q: [number, number, number, number] = [n(7), n(8), n(9), n(10)];
    const len = Math.hypot(...q) || 1;
    for (let k = 0; k < 4; k++) q[k]! /= len;
    boxes.push({
      kind: numbers[i] === 0 ? "body" : "gear",
      centre: { x: n(1), y: n(2), z: n(3) },
      half: { x: n(4), y: n(5), z: n(6) },
      axes: [rotate(q, [1, 0, 0]), rotate(q, [0, 1, 0]), rotate(q, [0, 0, 1])],
    });
  }
  return boxes;
}

/** Read every unit's poses from their stored form. */
export function decodeHitShapes(data: Readonly<Record<string, readonly (readonly number[])[]>>): HitShapes {
  return new Map(Object.entries(data).map(([id, poses]) => [id, poses.map(decodeHitShape)]));
}

/** A box on the board. */
export interface PlacedBox {
  readonly kind: HitKind;
  readonly centre: V3;
  readonly half: V3;
  readonly axes: readonly [V3, V3, V3];
}

/** A figure's boxes on the board, with a sphere round them all for a quick first check. */
export interface PlacedShape {
  readonly boxes: readonly PlacedBox[];
  readonly centre: V3;
  readonly radius: number;
}

/** Where a figure stands: the middle of its hexes, the ground under its highest hex, and its facing in degrees. */
export interface ShapeFrame {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
}

/** The frame of a figure on these hexes (front first), at this height, facing this way (degrees from +z towards +x). */
export function shapeFrame(spots: readonly { readonly hex: Hex; readonly elevation: number }[], facing: number): ShapeFrame {
  const at = spots.map((s) => hexToWorld(s.hex, HEX_SIZE));
  return {
    x: at.reduce((n, p) => n + p.x, 0) / at.length,
    z: at.reduce((n, p) => n + p.z, 0) / at.length,
    y: Math.max(...spots.map((s) => s.elevation)) * LEVEL_HEIGHT,
    facing,
  };
}

/** Turn a point of the figure's frame about the y axis by `yaw` (radians), as the client turns a model. */
function turn(v: V3, cos: number, sin: number): V3 {
  return { x: v.x * cos + v.z * sin, y: v.y, z: -v.x * sin + v.z * cos };
}

/** Put a figure's boxes on the board. */
export function placeShape(shape: HitShape, frame: ShapeFrame): PlacedShape {
  const yaw = (frame.facing * Math.PI) / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const boxes: PlacedBox[] = shape.map((b) => {
    const c = turn(b.centre, cos, sin);
    return {
      kind: b.kind,
      centre: { x: frame.x + c.x, y: frame.y + c.y, z: frame.z + c.z },
      half: b.half,
      axes: [turn(b.axes[0], cos, sin), turn(b.axes[1], cos, sin), turn(b.axes[2], cos, sin)],
    };
  });
  let lo = { x: Infinity, y: Infinity, z: Infinity };
  let hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const b of boxes) {
    const r = Math.hypot(b.half.x, b.half.y, b.half.z);
    lo = { x: Math.min(lo.x, b.centre.x - r), y: Math.min(lo.y, b.centre.y - r), z: Math.min(lo.z, b.centre.z - r) };
    hi = { x: Math.max(hi.x, b.centre.x + r), y: Math.max(hi.y, b.centre.y + r), z: Math.max(hi.z, b.centre.z + r) };
  }
  if (boxes.length === 0) return { boxes, centre: { x: frame.x, y: frame.y, z: frame.z }, radius: 0 };
  const centre = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
  return { boxes, centre, radius: Math.hypot(hi.x - centre.x, hi.y - centre.y, hi.z - centre.z) };
}

const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Does the segment from `a` to `b` pass through the box? */
export function segmentHitsBox(a: V3, b: V3, box: PlacedBox): boolean {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const o = { x: a.x - box.centre.x, y: a.y - box.centre.y, z: a.z - box.centre.z };
  const half = [box.half.x, box.half.y, box.half.z];
  let t0 = 0;
  let t1 = 1;
  for (let k = 0; k < 3; k++) {
    const axis = box.axes[k]!;
    const p = dot(o, axis);
    const v = dot(d, axis);
    const h = half[k]!;
    if (Math.abs(v) < 1e-12) {
      if (p < -h || p > h) return false;
      continue;
    }
    let ta = (-h - p) / v;
    let tb = (h - p) / v;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** Does the segment come within `radius` of `centre`? */
function segmentNearPoint(a: V3, b: V3, centre: V3, radius: number): boolean {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = dot(d, d);
  const t = len < 1e-12 ? 0 : Math.max(0, Math.min(1, dot({ x: centre.x - a.x, y: centre.y - a.y, z: centre.z - a.z }, d) / len));
  const dx = a.x + d.x * t - centre.x;
  const dy = a.y + d.y * t - centre.y;
  const dz = a.z + d.z * t - centre.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/** Does the segment pass through any of the figure's boxes (only its gear with `gearOnly`)? */
export function segmentHitsShape(a: V3, b: V3, shape: PlacedShape, gearOnly = false): boolean {
  if (!segmentNearPoint(a, b, shape.centre, shape.radius)) return false;
  for (const box of shape.boxes) {
    if (gearOnly && box.kind !== "gear") continue;
    if (segmentHitsBox(a, b, box)) return true;
  }
  return false;
}

/** How many points a body is sampled at, about: the share of a body in sight counts the lines that reach them. */
export const BODY_SAMPLES = 96;

const samplesOf = new WeakMap<HitShape, readonly V3[]>();

function inside(p: V3, b: HitBox): boolean {
  const o = { x: p.x - b.centre.x, y: p.y - b.centre.y, z: p.z - b.centre.z };
  return Math.abs(dot(o, b.axes[0])) <= b.half.x && Math.abs(dot(o, b.axes[1])) <= b.half.y && Math.abs(dot(o, b.axes[2])) <= b.half.z;
}

/**
 * The points a body is sampled at, in the figure's frame: an even grid through its body boxes
 * (so a bigger part counts for more, and overlaps count once), plus the middle of any body box
 * the grid misses, so a thin arm still counts. Ordered so that any run of them is spread over
 * the whole body, which lets a check stop early.
 */
export function bodySamples(shape: HitShape): readonly V3[] {
  const known = samplesOf.get(shape);
  if (known) return known;
  const body = shape.filter((b) => b.kind === "body");
  const points: V3[] = [];
  if (body.length > 0) {
    let lo = { x: Infinity, y: Infinity, z: Infinity };
    let hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    let volume = 0;
    for (const b of body) {
      volume += 8 * b.half.x * b.half.y * b.half.z;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const p = {
              x: b.centre.x + sx * b.half.x * b.axes[0].x + sy * b.half.y * b.axes[1].x + sz * b.half.z * b.axes[2].x,
              y: b.centre.y + sx * b.half.x * b.axes[0].y + sy * b.half.y * b.axes[1].y + sz * b.half.z * b.axes[2].y,
              z: b.centre.z + sx * b.half.x * b.axes[0].z + sy * b.half.y * b.axes[1].z + sz * b.half.z * b.axes[2].z,
            };
            lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) };
            hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) };
          }
        }
      }
    }
    // The grid step: overlaps make the body smaller than the sum of its boxes, so start a little
    // fine and widen the step until the grid holds no more than about BODY_SAMPLES points.
    let step = Math.cbrt(volume / BODY_SAMPLES) * 0.8;
    let grid: V3[] = [];
    for (let tries = 0; tries < 8; tries++) {
      grid = [];
      const nx = Math.max(1, Math.floor((hi.x - lo.x) / step));
      const ny = Math.max(1, Math.floor((hi.y - lo.y) / step));
      const nz = Math.max(1, Math.floor((hi.z - lo.z) / step));
      const ox = (hi.x + lo.x) / 2 - ((nx - 1) * step) / 2;
      const oy = (hi.y + lo.y) / 2 - ((ny - 1) * step) / 2;
      const oz = (hi.z + lo.z) / 2 - ((nz - 1) * step) / 2;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          for (let k = 0; k < nz; k++) {
            const p = { x: ox + i * step, y: oy + j * step, z: oz + k * step };
            if (body.some((b) => inside(p, b))) grid.push(p);
          }
        }
      }
      if (grid.length <= BODY_SAMPLES * 1.25) break;
      step *= 1.12;
    }
    points.push(...grid);
    for (const b of body) if (!grid.some((p) => inside(p, b))) points.push(b.centre);
  }
  // A fixed spread order: walk the list by a step that shares no factor with its length.
  const n = points.length;
  let stride = Math.max(1, Math.round(n * 0.618));
  while (n > 1 && gcd(stride, n) !== 1) stride++;
  const ordered = points.map((_, i) => points[(i * stride) % n]!);
  samplesOf.set(shape, ordered);
  return ordered;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A figure's body sample points on the board. */
export function placedSamples(shape: HitShape, frame: ShapeFrame): V3[] {
  const yaw = (frame.facing * Math.PI) / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return bodySamples(shape).map((p) => {
    const t = turn(p, cos, sin);
    return { x: frame.x + t.x, y: frame.y + t.y, z: frame.z + t.z };
  });
}
