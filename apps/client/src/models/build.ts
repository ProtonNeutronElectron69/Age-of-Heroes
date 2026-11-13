import { LEVEL_HEIGHT } from "@aoh/rules";
import { Euler, IcosahedronGeometry, Matrix4, Quaternion, ShapeUtils, Vector2, Vector3 } from "three";
import type { FigureModel, Part, Role, V3 } from "./types";

/**
 * Helpers for building low-polygon figure models out of a few solid shapes.
 * A model is written in whatever units suit it (a standing human is 1 tall in
 * `human.ts`), facing +z with its feet on y = 0; `figure` then sizes it to the
 * card's Height.
 */

type Tri = readonly [V3, V3, V3];

function signedVolume(tris: readonly number[]): number {
  let v = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.slice(i, i + 9) as [number, number, number, number, number, number, number, number, number];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

function flip(tris: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < tris.length; i += 9) {
    out.push(tris[i]!, tris[i + 1]!, tris[i + 2]!, tris[i + 6]!, tris[i + 7]!, tris[i + 8]!, tris[i + 3]!, tris[i + 4]!, tris[i + 5]!);
  }
  return out;
}

/** A part from loose triangles: drops the ones with no area and makes the faces point outwards. */
function solid(list: readonly Tri[], role: Role): Part {
  const tris: number[] = [];
  for (const [a, b, c] of list) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area > 1e-9) tris.push(...a, ...b, ...c);
  }
  return { role, tris: signedVolume(tris) < 0 ? flip(tris) : tris };
}

/** Join two rings of the same length with a band of triangles. */
function band(out: Tri[], a: readonly V3[], b: readonly V3[]): void {
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    out.push([a[i]!, a[j]!, b[j]!], [a[i]!, b[j]!, b[i]!]);
  }
}

/** Close a ring with a fan to its middle. */
function cap(out: Tri[], ring: readonly V3[], reverse: boolean): void {
  const n = ring.length;
  const mid: V3 = [
    ring.reduce((s, p) => s + p[0], 0) / n,
    ring.reduce((s, p) => s + p[1], 0) / n,
    ring.reduce((s, p) => s + p[2], 0) / n,
  ];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push(reverse ? [mid, ring[j]!, ring[i]!] : [mid, ring[i]!, ring[j]!]);
  }
}

/** A closed ring: outlines with the same number of corners, joined each to the next and the last to the first. */
export function hoop(outlines: readonly (readonly V3[])[], role: Role = "body"): Part {
  const out: Tri[] = [];
  outlines.forEach((ring, i) => band(out, ring, outlines[(i + 1) % outlines.length]!));
  return solid(out, role);
}

/** A box of the given size, centred on `at`. */
export function box(size: V3, at: V3 = [0, 0, 0], role: Role = "body"): Part {
  const [w, h, d] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const lower: V3[] = [
    [at[0] - w, at[1] - h, at[2] - d],
    [at[0] + w, at[1] - h, at[2] - d],
    [at[0] + w, at[1] - h, at[2] + d],
    [at[0] - w, at[1] - h, at[2] + d],
  ];
  const upper = lower.map((p): V3 => [p[0], p[1] + size[1], p[2]]);
  const out: Tri[] = [];
  band(out, lower, upper);
  cap(out, lower, true);
  cap(out, upper, false);
  return solid(out, role);
}

/** A straight, round limb from `a` to `b`, `ra` thick at the start and `rb` at the end. */
export function limb(a: V3, b: V3, ra: number, rb = ra, sides = 6, role: Role = "body"): Part {
  const from = new Vector3(...a);
  const axis = new Vector3(...b).sub(from);
  const dir = axis.clone().normalize();
  const side = Math.abs(dir.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(dir, side).normalize();
  const v = new Vector3().crossVectors(dir, u);
  const ring = (centre: Vector3, r: number): V3[] =>
    Array.from({ length: sides }, (_, i) => {
      const t = (i / sides) * Math.PI * 2;
      const p = centre.clone().addScaledVector(u, Math.cos(t) * r).addScaledVector(v, Math.sin(t) * r);
      return [p.x, p.y, p.z];
    });
  const start = ring(from, ra);
  const end = ring(from.clone().add(axis), rb);
  const out: Tri[] = [];
  band(out, start, end);
  cap(out, start, true);
  cap(out, end, false);
  return solid(out, role);
}

/** A ball, or an egg when given three radii. `detail` 0 has 20 faces and 1 has 80. */
export function ball(at: V3, radius: number | V3, detail = 1, role: Role = "body"): Part {
  const r: V3 = typeof radius === "number" ? [radius, radius, radius] : radius;
  const geo = new IcosahedronGeometry(1, detail);
  const p = geo.getAttribute("position");
  const out: Tri[] = [];
  const point = (i: number): V3 => [at[0] + p.getX(i) * r[0], at[1] + p.getY(i) * r[1], at[2] + p.getZ(i) * r[2]];
  for (let i = 0; i < p.count; i += 3) out.push([point(i), point(i + 1), point(i + 2)]);
  geo.dispose();
  return solid(out, role);
}

/** A cross-section of a `spine`: where it is along z and y, half its width, and half its thickness. */
export type Section = readonly [z: number, y: number, halfWidth: number, halfThickness: number];

interface SpineOptions {
  /** Corners in each cross-section. */
  sides?: number;
  /** Sideways shift, for a limb that is not on the centre line. */
  x?: number;
  role?: Role;
}

/**
 * A body swept along a line in the figure's middle plane: a torso, a neck, a
 * horse's barrel, a bent leg. Each section is an oval across the line, as wide
 * as `halfWidth` to each side.
 */
export function spine(sections: readonly Section[], options: SpineOptions = {}): Part {
  const { sides = 8, x = 0, role = "body" } = options;
  const rings = sections.map(([z, y, rx, rn], i) => {
    const prev = sections[Math.max(0, i - 1)]!;
    const next = sections[Math.min(sections.length - 1, i + 1)]!;
    const len = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
    const tz = (next[0] - prev[0]) / len;
    const ty = (next[1] - prev[1]) / len;
    // The oval's second axis is square to the line, in the middle plane.
    return Array.from({ length: sides }, (_, k): V3 => {
      const t = ((k + 0.5) / sides) * Math.PI * 2;
      const n = Math.sin(t) * rn;
      return [x + Math.cos(t) * rx, y + n * tz, z - n * ty];
    });
  });
  const out: Tri[] = [];
  for (let i = 0; i + 1 < rings.length; i++) band(out, rings[i]!, rings[i + 1]!);
  cap(out, rings[0]!, true);
  cap(out, rings[rings.length - 1]!, false);
  return solid(out, role);
}

/**
 * A flat plate cut to an outline, `thickness` thick.
 * - `side`: the outline is drawn in z and y, as seen from the figure's side.
 * - `front`: in x and y, as seen from the front.
 * - `top`: in x and z, as seen from above.
 */
export function plate(
  outline: readonly (readonly [number, number])[],
  thickness: number,
  plane: "side" | "front" | "top" = "side",
  offset = 0,
  role: Role = "body",
): Part {
  const to = (p: readonly [number, number], d: number): V3 =>
    plane === "side" ? [d, p[1], p[0]] : plane === "front" ? [p[0], p[1], d] : [p[0], d, p[1]];
  const near = outline.map((p) => to(p, offset - thickness / 2));
  const far = outline.map((p) => to(p, offset + thickness / 2));
  const out: Tri[] = [];
  band(out, near, far);
  const faces = ShapeUtils.triangulateShape(outline.map((p) => new Vector2(p[0], p[1])), []);
  for (const [a, b, c] of faces as [number, number, number][]) {
    out.push([near[a]!, near[c]!, near[b]!], [far[a]!, far[b]!, far[c]!]);
  }
  return solid(out, role);
}

interface Placement {
  /** Move by this much, after turning. */
  at?: V3;
  /** Turn about x, then y, then z, in degrees. */
  turn?: V3;
  scale?: number | V3;
}

/** Turn, scale and move parts. */
export function place(parts: readonly Part[], { at = [0, 0, 0], turn = [0, 0, 0], scale = 1 }: Placement): Part[] {
  const s: V3 = typeof scale === "number" ? [scale, scale, scale] : scale;
  const rad = Math.PI / 180;
  const m = new Matrix4().compose(
    new Vector3(...at),
    new Quaternion().setFromEuler(new Euler(turn[0] * rad, turn[1] * rad, turn[2] * rad, "ZYX")),
    new Vector3(...s),
  );
  const v = new Vector3();
  return parts.map((part) => {
    const tris: number[] = [];
    for (let i = 0; i < part.tris.length; i += 3) {
      v.set(part.tris[i]!, part.tris[i + 1]!, part.tris[i + 2]!).applyMatrix4(m);
      tris.push(v.x, v.y, v.z);
    }
    return { role: part.role, tris: s[0] * s[1] * s[2] < 0 ? flip(tris) : tris };
  });
}

/** The same parts on the figure's other side. */
export function mirror(parts: readonly Part[]): Part[] {
  return place(parts, { scale: [-1, 1, 1] });
}

/** Parts and their mirror image: a pair of legs from one. */
export function both(parts: readonly Part[]): Part[] {
  return [...parts, ...mirror(parts)];
}

/** Mark parts as something the figure holds. */
export function gear(parts: readonly Part[]): Part[] {
  return parts.map((p) => ({ ...p, role: "gear" as const }));
}

function top(parts: readonly Part[], role: Role): number {
  let y = 0;
  for (const part of parts) {
    if (part.role !== role) continue;
    for (let i = 1; i < part.tris.length; i += 3) y = Math.max(y, part.tris[i]!);
  }
  return y;
}

/** How thick a figure's base is, in world units. The base counts towards the figure's Height. */
export const BASE_HEIGHT = 0.07;

/** Move parts up or down so that their lowest point is on the ground. */
function grounded(parts: readonly Part[]): readonly Part[] {
  let lowest = Infinity;
  for (const part of parts) for (let i = 1; i < part.tris.length; i += 3) lowest = Math.min(lowest, part.tris[i]!);
  return lowest === 0 || lowest === Infinity ? parts : place(parts, { at: [0, -lowest, 0] });
}

/**
 * Finish a figure: stand it on its base and size it so that base and body
 * together are as tall as the card's Height (in terrain levels), which is the
 * height line of sight uses. `tall` is the body height, in the model's own
 * units, that should come out at that Height; it defaults to this figure's.
 */
export function figure(parts: readonly Part[], height: number, tall?: number): FigureModel {
  const standing = grounded(parts);
  const scale = (height * LEVEL_HEIGHT - BASE_HEIGHT) / (tall ?? top(standing, "body"));
  return { parts: place(standing, { scale, at: [0, BASE_HEIGHT, 0] }) };
}

/**
 * Finish a squad's poses to one scale: the tallest pose stands the card's
 * Height, and a crouching or kneeling one comes out shorter.
 */
export function squad(poses: readonly (readonly Part[])[], height: number): FigureModel[] {
  const standing = poses.map(grounded);
  const tall = Math.max(...standing.map((parts) => top(parts, "body")));
  return standing.map((parts) => figure(parts, height, tall));
}
