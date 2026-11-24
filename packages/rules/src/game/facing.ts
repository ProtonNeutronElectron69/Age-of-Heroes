import { hexEquals, hexToWorld, type Hex } from "../hex";
import { footprintCells, type Footprint } from "../shapes";
import { HEX_SIZE } from "../world";
import { fail } from "./errors";
import { cardOf, findFigure } from "./queries";
import type { FigurePosition, FigureState, GameEvent, GameState, PathStep, PlayerId, RulesContext, Step } from "./types";

/**
 * Facing (games with `config.facing`): which way a figure looks, in whole degrees turned from the
 * board's +z axis towards +x, the same turn the client draws a model with (`atan2(x, z)`). A
 * single-hex figure faces one of eight directions; a figure on several hexes faces along its base.
 * Its front cone is the half of the board in front of it, the side line included.
 */
export const FACING_STEP = 45;

const DEGREES = 180 / Math.PI;
const whole = (degrees: number) => ((Math.round(degrees) % 360) + 360) % 360;

/** The middle of some hexes, in world units. */
export function centreOf(hexes: readonly Hex[]): { x: number; z: number } {
  const at = hexes.map((h) => hexToWorld(h, HEX_SIZE));
  return { x: at.reduce((n, p) => n + p.x, 0) / at.length, z: at.reduce((n, p) => n + p.z, 0) / at.length };
}

/** The bearing from one point to another, in degrees. */
function bearing(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return whole(Math.atan2(to.x - from.x, to.z - from.z) * DEGREES);
}

/** The nearest of the eight facings to a bearing. */
export function snapFacing(degrees: number): number {
  return whole(Math.round(degrees / FACING_STEP) * FACING_STEP);
}

/** A figure on several hexes faces along its base, from its middle to its front hex. */
export function baseFacing(footprint: Footprint, origin: Hex, rotation: number): number {
  const cells = footprintCells(footprint, origin, rotation);
  return bearing(centreOf(cells), hexToWorld(cells[0]!, HEX_SIZE));
}

/** Whether a point is in front of a figure at `from` facing `facing`: within 90 degrees of it, the side line included. */
function inFront(facing: number, from: { x: number; z: number }, to: { x: number; z: number }): boolean {
  const a = facing / DEGREES;
  return (to.x - from.x) * Math.sin(a) + (to.z - from.z) * Math.cos(a) >= -1e-9;
}

/** Whether any of `target`'s hexes is in the front cone of a figure on `spots` facing `facing`. */
export function seesAny(facing: number, spots: readonly Step[], target: readonly Step[]): boolean {
  const from = centreOf(spots.map((s) => s.hex));
  return target.some((t) => inFront(facing, from, hexToWorld(t.hex, HEX_SIZE)));
}

/** The facing a figure has in this game, or null when the game has no facing. */
export function facingOf(state: GameState, figure: FigureState): number | null {
  return state.config.facing && figure.facing !== undefined ? figure.facing : null;
}

/** Face a figure placed without a move (deployed or brought back): towards the middle of the battlefield. */
export function faceTowardsMiddle(state: GameState, figure: FigureState, footprint: Footprint, ctx: RulesContext): void {
  const pos = figure.position;
  if (!state.config.facing || !pos) return;
  if (footprint !== "1") {
    figure.facing = baseFacing(footprint, pos.hex, pos.rotation);
    return;
  }
  const here = hexToWorld(pos.hex, HEX_SIZE);
  const middle = centreOf(ctx.board.hexes());
  figure.facing = Math.hypot(middle.x - here.x, middle.z - here.z) < 1e-6 ? 0 : snapFacing(bearing(here, middle));
}

/**
 * Face a figure after a move: a single-hex figure along its last step (the hexes it went
 * through, `route`, start first), snapped to the nearest eighth; a larger one along its base.
 * A figure that ended where it started keeps its facing.
 */
export function faceAfterMove(state: GameState, figure: FigureState, footprint: Footprint, route: readonly Hex[]): void {
  const pos: FigurePosition | null = figure.position;
  if (!state.config.facing || !pos || figure.destroyed) return;
  if (footprint !== "1") {
    figure.facing = baseFacing(footprint, pos.hex, pos.rotation);
    return;
  }
  let i = route.length - 1;
  while (i >= 0 && !hexEquals(route[i]!, pos.hex)) i--;
  const before = i > 0 ? route[i - 1]! : undefined;
  if (!before) return;
  figure.facing = snapFacing(bearing(hexToWorld(before, HEX_SIZE), hexToWorld(pos.hex, HEX_SIZE)));
}

/**
 * The way a figure will face once it has moved along `path` from `start` (games with facing): a
 * multi-hex figure along its base where the path ends, a single-hex one along its last step,
 * as `faceAfterMove` turns it. Null for an empty path. The play screen shows it before the move.
 */
export function endFacing(footprint: Footprint, start: Hex, path: readonly PathStep[]): number | null {
  const last = path[path.length - 1];
  if (!last) return null;
  if (footprint !== "1") return baseFacing(footprint, last.hex, last.rotation ?? 0);
  const before = path.length > 1 ? path[path.length - 2]!.hex : start;
  if (hexEquals(before, last.hex)) return null;
  return snapFacing(bearing(hexToWorld(before, HEX_SIZE), hexToWorld(last.hex, HEX_SIZE)));
}

/** Whether a figure on several hexes, facing `facing`, shifting from one hex to the next, goes forward: within 30 degrees of its facing. */
export function shiftsForward(facing: number, from: Hex, to: Hex): boolean {
  const turn = Math.abs(((bearing(hexToWorld(from, HEX_SIZE), hexToWorld(to, HEX_SIZE)) - facing + 540) % 360) - 180);
  return turn <= 31;
}

/** Why a figure cannot be turned to `facing` now, or null if it can. */
export function faceProblem(state: GameState, player: PlayerId, figureId: string, facing: number, ctx: RulesContext): string | null {
  if (!state.config.facing) return "This game has no facing";
  const active = state.active;
  if (state.phase !== "turns" || !active) return "No turn is in progress";
  if (active.player !== player) return "It is not your turn";
  const found = findFigure(state, figureId);
  if (!found || found.figure.destroyed || !found.figure.position) return "That figure is not on the battlefield";
  if (found.unit.id !== active.unitId) return "Only the activated unit's figures can turn";
  if (cardOf(found.unit, ctx).footprint !== "1") return "A figure on several hexes faces along its base";
  // Before it moves or after, until it attacks (a move after attacking, such as Smoke Step's, allows it again).
  if (!(active.turnable ?? []).includes(figureId) && active.attacked.includes(figureId)) return "A figure cannot turn once it has attacked";
  if (!Number.isInteger(facing) || facing < 0 || facing >= 360 || facing % FACING_STEP !== 0) return "Facing is one of eight directions (0 to 315 degrees, in steps of 45)";
  return null;
}

/** Turn a figure of the acting unit that has not attacked (or has moved since). */
export function faceFigure(state: GameState, player: PlayerId, figureId: string, facing: number, events: GameEvent[], ctx: RulesContext): void {
  const problem = faceProblem(state, player, figureId, facing, ctx);
  if (problem) fail(problem);
  findFigure(state, figureId)!.figure.facing = facing;
  events.push({ type: "figureFaced", figureId, facing });
}

