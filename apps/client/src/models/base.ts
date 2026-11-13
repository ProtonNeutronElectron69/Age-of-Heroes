import { HEX_SIZE, hexToWorld, type Footprint } from "@aoh/rules";
import { BASE_HEIGHT, hoop, plate } from "./build";
import { baseFrame } from "./measure";
import type { Part, V3 } from "./types";

/** Radius of a figure's base: a circle a little smaller than its hex, which is 0.87 from middle to side. */
export const BASE_RADIUS = 0.8 * HEX_SIZE;
/** How wide the bevelled edge of a base is, seen from above. It is the ring that carries a colour. */
export const BASE_BEVEL = 0.12;
/**
 * How far the lobes of a larger base melt into each other. With it, the base
 * narrows between two hexes to about half its width.
 */
const BLEND = 0.65;

interface Point {
  readonly x: number;
  readonly z: number;
}

/** Roughly how far a point is outside a base made of a circle on each centre (negative inside). */
function outside(x: number, z: number, centres: readonly Point[]): number {
  let d = Infinity;
  for (const c of centres) {
    const next = Math.hypot(x - c.x, z - c.z) - BASE_RADIUS;
    // A smooth minimum: where two circles are near each other they join in a waist.
    const h = Math.max(BLEND - Math.abs(d - next), 0) / BLEND;
    d = Math.min(d, next) - (h * h * BLEND) / 4;
  }
  return d;
}

/** Which way is out of the base at a point, as a unit vector. */
function outward(x: number, z: number, centres: readonly Point[]): Point {
  const e = 1e-3;
  const gx = outside(x + e, z, centres) - outside(x - e, z, centres);
  const gz = outside(x, z + e, centres) - outside(x, z - e, centres);
  const length = Math.hypot(gx, gz) || 1;
  return { x: gx / length, z: gz / length };
}

/** About how far apart the corners of an outline are. */
const SPACING = 0.11;

/**
 * The edge of a base as evenly spaced points, each with the way out of the
 * base there: a circle round one hex centre, a row of lobes with waists
 * between them round several.
 */
function edge(centres: readonly Point[]): { at: Point; out: Point }[] {
  if (centres.length === 1) {
    const corners = 28;
    return Array.from({ length: corners }, (_, i) => {
      const a = (i / corners) * Math.PI * 2;
      const out = { x: Math.cos(a), z: Math.sin(a) };
      return { at: { x: centres[0]!.x + BASE_RADIUS * out.x, z: centres[0]!.z + BASE_RADIUS * out.z }, out };
    });
  }
  // A rough edge first: the furthest point of the base along each of many rays from its middle.
  const reach = Math.max(...centres.map((c) => Math.hypot(c.x, c.z))) + BASE_RADIUS;
  const rough: Point[] = [];
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    let r = reach;
    while (r > 0 && outside(r * Math.cos(a), r * Math.sin(a), centres) > 0) r -= 0.01;
    rough.push({ x: r * Math.cos(a), z: r * Math.sin(a) });
  }
  // Then step round it evenly, pulling each point onto the true edge.
  const lengths = rough.map((p, i) => Math.hypot(rough[(i + 1) % rough.length]!.x - p.x, rough[(i + 1) % rough.length]!.z - p.z));
  const around = lengths.reduce((a, b) => a + b, 0);
  const corners = Math.round(around / SPACING);
  const out: { at: Point; out: Point }[] = [];
  let i = 0;
  let passed = 0;
  for (let k = 0; k < corners; k++) {
    const want = (k / corners) * around;
    while (passed + lengths[i]! < want) passed += lengths[i++]!;
    const t = (want - passed) / (lengths[i]! || 1);
    const next = rough[(i + 1) % rough.length]!;
    let x = rough[i]!.x + (next.x - rough[i]!.x) * t;
    let z = rough[i]!.z + (next.z - rough[i]!.z) * t;
    for (let n = 0; n < 4; n++) {
      const way = outward(x, z, centres);
      const d = outside(x, z, centres);
      x -= way.x * d;
      z -= way.z * d;
    }
    out.push({ at: { x, z }, out: outward(x, z, centres) });
  }
  return out;
}

/**
 * The base a figure stands on, in two parts: its top (`base`) and its
 * bevelled edge (`rim`). On one hex it is a disc a little smaller than the
 * hex; on a larger footprint it is one piece with a lobe on each hex, thinner
 * where it passes from hex to hex. It is written in the figure's own frame,
 * like the model that stands on it.
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
  const points = edge(centres);
  // The bevel slopes in from the foot of the base to the edge of its top.
  const inner = points.map((p) => ({ x: p.at.x - p.out.x * BASE_BEVEL, z: p.at.z - p.out.z * BASE_BEVEL }));
  const foot = points.map((p): V3 => [p.at.x, 0, p.at.z]);
  const shoulder = inner.map((p): V3 => [p.x, BASE_HEIGHT, p.z]);
  const under = inner.map((p): V3 => [p.x, 0, p.z]);
  return [
    plate(
      inner.map((p) => [p.x, p.z] as const),
      BASE_HEIGHT,
      "top",
      BASE_HEIGHT / 2,
      "base",
    ),
    hoop([foot, shoulder, under], "rim"),
  ];
}
