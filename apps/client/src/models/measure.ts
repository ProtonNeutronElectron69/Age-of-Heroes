import { HEX_SIZE, LEVEL_HEIGHT, footprintCells, hex, hexKey, hexRotate, hexToWorld, worldToHex, type Footprint, type Hex } from "@aoh/rules";
import type { FigureModel } from "./types";

/**
 * How far a model's body may hang over the edge of its base. A model over
 * either limit needs a larger base (2x1, 3x1 or 2x2) on its card.
 */
export const OVERHANG_LIMITS = {
  /** The furthest the body may reach past the base, in hex widths. */
  reach: 0.2,
  /** The largest share of the body's outline, seen from above, that may lie off the base. */
  outside: 0.15,
} as const;

/** The most triangles a figure may have at this stage. */
export const TRIANGLE_BUDGET = 1500;

/** How far the top of the body may be from the card's Height, in terrain levels. */
export const HEIGHT_TOLERANCE = 0.05;

/** Where a figure's base is on the board and which way the figure on it faces. */
export interface BaseFrame {
  /** The hexes of the base, front first. */
  readonly cells: readonly Hex[];
  /** The middle of the base, in board coordinates. */
  readonly x: number;
  readonly z: number;
  /** Turn about the y axis that points the model's +z the way the figure faces. */
  readonly yaw: number;
}

/**
 * The base of a figure whose front hex is `origin`. A figure on several hexes
 * faces from the middle of its base to its front hex; a single-hex figure
 * faces the next hex, across a flat side.
 */
export function baseFrame(footprint: Footprint, origin: Hex = hex(0, 0), rotation = 0): BaseFrame {
  const cells = footprintCells(footprint, origin, rotation);
  const at = cells.map((c) => hexToWorld(c, HEX_SIZE));
  const x = at.reduce((s, p) => s + p.x, 0) / at.length;
  const z = at.reduce((s, p) => s + p.z, 0) / at.length;
  const ahead = cells.length > 1 ? { x: at[0]!.x - x, z: at[0]!.z - z } : hexToWorld(hexRotate(hex(-1, 0), rotation), HEX_SIZE);
  return { cells, x, z, yaw: Math.atan2(ahead.x, ahead.z) };
}

/** Distance from a point to a segment, in the plane. */
function toSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

/** Distance from a point to the edge of a hex (the point is outside it). */
function toHex(px: number, pz: number, cell: Hex): number {
  const c = hexToWorld(cell, HEX_SIZE);
  let best = Infinity;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const b = a + Math.PI / 3;
    best = Math.min(
      best,
      toSegment(px, pz, c.x + HEX_SIZE * Math.cos(a), c.z + HEX_SIZE * Math.sin(a), c.x + HEX_SIZE * Math.cos(b), c.z + HEX_SIZE * Math.sin(b)),
    );
  }
  return best;
}

export interface Fit {
  /** Height of the body, in terrain levels. */
  readonly height: number;
  readonly triangles: number;
  /** The furthest the body reaches past its base, in hex widths. */
  readonly reach: number;
  /** The share of the body's outline, seen from above, that lies off its base. */
  readonly outside: number;
  /** Whether the body is within the overhang limits. */
  readonly fits: boolean;
}

/** Grid step for the outline seen from above, in world units. */
const STEP = 0.03;

/** Measure a figure standing on a base of the given footprint. */
export function measure(model: FigureModel, footprint: Footprint): Fit {
  const frame = baseFrame(footprint);
  const base = new Set(frame.cells.map(hexKey));
  const cos = Math.cos(frame.yaw);
  const sin = Math.sin(frame.yaw);
  const covered = new Set<number>();
  let triangles = 0;
  let top = 0;
  let reach = 0;
  for (const part of model.parts) {
    triangles += part.tris.length / 9;
    if (part.role !== "body") continue;
    const t = part.tris;
    for (let i = 0; i < t.length; i += 9) {
      // The triangle's corners on the board, seen from above.
      const px: number[] = [];
      const pz: number[] = [];
      for (let j = 0; j < 9; j += 3) {
        const x = t[i + j]!;
        const z = t[i + j + 2]!;
        top = Math.max(top, t[i + j + 1]!);
        const wx = frame.x + x * cos + z * sin;
        const wz = frame.z - x * sin + z * cos;
        px.push(wx);
        pz.push(wz);
        if (!base.has(hexKey(worldToHex(wx, wz, HEX_SIZE)))) {
          reach = Math.max(reach, Math.min(...frame.cells.map((c) => toHex(wx, wz, c))));
        }
      }
      const [ax, bx, cx] = px as [number, number, number];
      const [az, bz, cz] = pz as [number, number, number];
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(area) < 1e-9) continue;
      // Mark the grid squares whose middle the triangle covers.
      const i0 = Math.floor(Math.min(ax, bx, cx) / STEP);
      const i1 = Math.ceil(Math.max(ax, bx, cx) / STEP);
      const k0 = Math.floor(Math.min(az, bz, cz) / STEP);
      const k1 = Math.ceil(Math.max(az, bz, cz) / STEP);
      for (let gi = i0; gi <= i1; gi++) {
        for (let gk = k0; gk <= k1; gk++) {
          const x = (gi + 0.5) * STEP;
          const z = (gk + 0.5) * STEP;
          const u = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / area;
          const v = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / area;
          if (u >= 0 && v >= 0 && u + v <= 1) covered.add((gi + 4096) * 8192 + gk + 4096);
        }
      }
    }
  }
  let off = 0;
  for (const key of covered) {
    const x = (Math.floor(key / 8192) - 4096 + 0.5) * STEP;
    const z = ((key % 8192) - 4096 + 0.5) * STEP;
    if (!base.has(hexKey(worldToHex(x, z, HEX_SIZE)))) off++;
  }
  const width = Math.sqrt(3) * HEX_SIZE;
  const fit = { height: top / LEVEL_HEIGHT, triangles, reach: reach / width, outside: covered.size ? off / covered.size : 0 };
  return { ...fit, fits: fit.reach <= OVERHANG_LIMITS.reach && fit.outside <= OVERHANG_LIMITS.outside };
}
