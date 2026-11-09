import { hexKey, type Hex } from "../hex";
import { footprintCells, type Footprint } from "../shapes";
import { DEFAULT_TUNING, type Tuning } from "../tuning";
import type { FigureState, PathStep, RulesContext, Step } from "./types";

/**
 * Where a figure stands: its front hex and the elevation there, plus which
 * way it faces. A single-hex figure always has rotation 0.
 */
export interface Placement {
  readonly hex: Hex;
  readonly elevation: number;
  readonly rotation: number;
}

export function tuningOf(ctx: RulesContext): Tuning {
  return ctx.tuning ?? DEFAULT_TUNING;
}

export function placementKey(p: PathStep): string {
  return `${hexKey(p.hex)}@${p.elevation}/${p.rotation ?? 0}`;
}

export function footprintSize(footprint: Footprint): number {
  return footprintCells(footprint, { q: 0, r: 0 }).length;
}

/**
 * The spots a figure covers at a placement, front hex first, or null if it
 * cannot stand there. Every hex needs ground with room for the figure's
 * Height and no scenery. The front hex stands at the placement's elevation;
 * the others use the ground closest to it, at most `maxStraddle` levels away.
 */
export function placementSpots(
  footprint: Footprint,
  height: number,
  p: Placement,
  ctx: RulesContext,
): Step[] | null {
  const board = ctx.board;
  const fits = (h: Hex, elevation: number) => {
    const s = board.surfaceAt(h, elevation);
    return s !== undefined && s.clearance >= height && board.sceneryAt(h, elevation) === undefined;
  };
  if (!fits(p.hex, p.elevation)) return null;
  const cells = footprintCells(footprint, p.hex, p.rotation);
  const spots: Step[] = [{ hex: p.hex, elevation: p.elevation }];
  const straddle = tuningOf(ctx).maxStraddle;
  for (const h of cells.slice(1)) {
    const candidates = board
      .surfaces(h)
      .filter((s) => Math.abs(s.elevation - p.elevation) <= straddle && fits(h, s.elevation))
      .sort((a, b) => Math.abs(a.elevation - p.elevation) - Math.abs(b.elevation - p.elevation) || a.elevation - b.elevation);
    const best = candidates[0];
    if (!best) return null;
    spots.push({ hex: h, elevation: best.elevation });
  }
  return spots;
}

/** Spots a figure on the battlefield covers (empty if it is not on the board). */
export function figureSpots(figure: FigureState, footprint: Footprint, height: number, ctx: RulesContext): Step[] {
  const pos = figure.position;
  if (figure.destroyed || !pos) return [];
  if (footprint === "1") return [{ hex: pos.hex, elevation: pos.elevation }];
  return placementSpots(footprint, height, pos, ctx) ?? [{ hex: pos.hex, elevation: pos.elevation }];
}

/** The height a figure stands at: its highest hex. */
export function standingElevation(spots: readonly Step[]): number {
  return Math.max(...spots.map((s) => s.elevation));
}
