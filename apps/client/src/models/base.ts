import { HEX_SIZE, hexToWorld, type Footprint } from "@aoh/rules";
import { BASE_HEIGHT, prism } from "./build";
import { baseFrame } from "./measure";
import type { Part, V3 } from "./types";

/** Radius of a figure's base: a circle a little smaller than its hex, which is 0.87 from middle to side. */
export const BASE_RADIUS = 0.8 * HEX_SIZE;
/** How much narrower the top of the base is than the bottom. */
const BEVEL = 0.04;

interface Point {
  readonly x: number;
  readonly z: number;
}

/** Convex hull, counter-clockwise; points in a line collapse to the two ends. */
function hull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const build = (list: readonly Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 1e-9) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = build(sorted);
  const upper = build([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Corners in a full circle of the outline. */
const ROUND = 28;

/** The outline `radius` away from a set of points: a circle round one, a rounded shape round several. */
function outline(points: readonly Point[], radius: number, y: number): V3[] {
  const corners = hull(points);
  const step = (Math.PI * 2) / ROUND;
  const out: V3[] = [];
  if (corners.length === 1) {
    for (let i = 0; i < ROUND; i++) out.push([corners[0]!.x + radius * Math.cos(i * step), y, corners[0]!.z + radius * Math.sin(i * step)]);
    return out;
  }
  const facing = (a: Point, b: Point) => Math.atan2(-(b.x - a.x), b.z - a.z);
  corners.forEach((corner, i) => {
    const from = facing(corners[(i - 1 + corners.length) % corners.length]!, corner);
    let to = facing(corner, corners[(i + 1) % corners.length]!);
    while (to < from) to += Math.PI * 2;
    const steps = Math.max(1, Math.round((to - from) / step));
    for (let k = 0; k <= steps; k++) {
      const a = from + ((to - from) * k) / steps;
      out.push([corner.x + radius * Math.cos(a), y, corner.z + radius * Math.sin(a)]);
    }
  });
  return out;
}

/**
 * The base a figure stands on: a low disc a little smaller than its hex, or
 * one rounded slab over all the hexes of a larger footprint. It is written
 * in the figure's own frame, like the model that stands on it.
 */
export function baseParts(footprint: Footprint): Part[] {
  const frame = baseFrame(footprint);
  const cos = Math.cos(frame.yaw);
  const sin = Math.sin(frame.yaw);
  const centres = frame.cells.map((cell) => {
    const w = hexToWorld(cell, HEX_SIZE);
    const dx = w.x - frame.x;
    const dz = w.z - frame.z;
    return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
  });
  return [prism(outline(centres, BASE_RADIUS, 0), outline(centres, BASE_RADIUS - BEVEL, BASE_HEIGHT), "base")];
}
