import { hexAdd, hexNeighbors, hexSub, isAdjacent } from "../hex";
import { Rng } from "../rng";
import type { UnitCard } from "../schema";
import { moveCostOf, type TerrainRules } from "../terrain";
import { fail } from "./errors";
import { cardOf, findFigure, occupancy, sameStep, statsOf, stepKey, type EffectiveStats } from "./queries";
import { destroyFigure } from "./rounds";
import type { FigureState, GameEvent, GameState, PlayerId, RulesContext, Step, UnitState } from "./types";

/** A reachable destination and the path the engine suggests to get there. */
export interface MoveOption {
  readonly to: Step;
  /** Steps after the start, ending at `to`. */
  readonly path: Step[];
  readonly cost: number;
  /** Lava and ice hexes on the path (each one means a d20 roll). */
  readonly hazards: number;
}

interface Mover {
  readonly unit: UnitState;
  readonly figure: FigureState;
  readonly card: UnitCard;
  readonly stats: EffectiveStats;
  readonly start: Step;
}

function terrainOf(step: Step, ctx: RulesContext): TerrainRules | undefined {
  const id = ctx.board.surfaceAt(step.hex, step.elevation)?.terrain;
  return id ? ctx.terrain.get(id) : undefined;
}

/** Movement points to step from one spot to an adjacent one. */
export function stepCost(from: Step, to: Step, ctx: RulesContext): number {
  return moveCostOf(terrainOf(to, ctx)) + Math.max(0, to.elevation - from.elevation);
}

/** Entering water or swamp from outside the "wet" group ends movement. */
export function stopsMovement(from: Step, to: Step, ctx: RulesContext): boolean {
  const group = terrainOf(to, ctx)?.stopGroup;
  return group !== undefined && terrainOf(from, ctx)?.stopGroup !== group;
}

function isHazard(step: Step, ctx: RulesContext): boolean {
  const t = terrainOf(step, ctx);
  return t?.entryDestroyOnOrBelow !== undefined || t?.slip !== undefined;
}

/**
 * Can a figure physically step between two adjacent spots? The destination
 * must have room for the figure, climbing needs headroom in the current hex,
 * and dropping needs headroom in the destination. In the Advanced game a
 * single step may not climb more levels than the figure's Height.
 */
export function canStep(from: Step, to: Step, height: number, ctx: RulesContext, mode: GameState["config"]["mode"]): boolean {
  if (!isAdjacent(from.hex, to.hex)) return false;
  const dest = ctx.board.surfaceAt(to.hex, to.elevation);
  const here = ctx.board.surfaceAt(from.hex, from.elevation);
  if (!dest || !here) return false;
  const rise = to.elevation - from.elevation;
  if (dest.clearance < Math.max(height, -rise)) return false;
  if (rise > 0 && here.clearance < rise) return false;
  if (mode === "advanced" && rise > height) return false;
  return true;
}

function neighborsOf(step: Step, ctx: RulesContext): Step[] {
  const result: Step[] = [];
  for (const h of hexNeighbors(step.hex)) {
    for (const s of ctx.board.surfaces(h)) result.push({ hex: h, elevation: s.elevation });
  }
  return result;
}

function moverFor(state: GameState, figureId: string, ctx: RulesContext): Mover {
  const found = findFigure(state, figureId) ?? fail(`Unknown figure "${figureId}"`);
  const { unit, figure } = found;
  if (figure.destroyed || !figure.position) fail("That figure is not on the battlefield");
  const card = cardOf(unit, ctx);
  if (card.footprint !== "1") fail("Multi-hex figures arrive with the Advanced rules");
  const start: Step = { hex: figure.position.hex, elevation: figure.position.elevation };
  return { unit, figure, card, stats: statsOf(card, state.config.mode), start };
}

/** The extra move a figure gets for staying on bonus terrain (road), if it starts there. */
function stayOnBonus(start: Step, ctx: RulesContext): { terrain: string; bonus: number } | null {
  const t = terrainOf(start, ctx);
  return t?.stayOnBonusMove ? { terrain: t.id, bonus: t.stayOnBonusMove } : null;
}

interface Label {
  readonly step: Step;
  readonly cost: number;
  readonly hazards: number;
  readonly stopped: boolean;
  readonly prev: Label | null;
}

/**
 * Search every spot the figure can reach within `budget`. For each spot keep,
 * per cost, the path with the fewest hazards, so a slightly longer path that
 * avoids lava is still offered.
 */
function search(
  state: GameState,
  mover: Mover,
  budget: number,
  onlyTerrain: string | null,
  ctx: RulesContext,
): Map<string, MoveOption> {
  const occ = occupancy(state);
  const owner = mover.unit.owner;
  const labels = new Map<string, Label>();
  const buckets: Label[][] = Array.from({ length: budget + 1 }, () => []);
  const startLabel: Label = { step: mover.start, cost: 0, hazards: 0, stopped: false, prev: null };
  buckets[0]!.push(startLabel);

  for (let c = 0; c <= budget; c++) {
    for (const label of buckets[c]!) {
      if (label.stopped) continue;
      for (const to of neighborsOf(label.step, ctx)) {
        if (onlyTerrain && terrainOf(to, ctx)?.id !== onlyTerrain) continue;
        if (!canStep(label.step, to, mover.stats.height, ctx, state.config.mode)) continue;
        const occupant = occ.get(stepKey(to));
        if (occupant && occupant.figure.id !== mover.figure.id && occupant.unit.owner !== owner) continue;
        const cost = c + stepCost(label.step, to, ctx);
        if (cost > budget) continue;
        const next: Label = {
          step: to,
          cost,
          hazards: label.hazards + (isHazard(to, ctx) ? 1 : 0),
          stopped: stopsMovement(label.step, to, ctx),
          prev: label,
        };
        const key = `${stepKey(to)}|${cost}|${next.stopped}`;
        const existing = labels.get(key);
        if (existing && existing.hazards <= next.hazards) continue;
        labels.set(key, next);
        buckets[cost]!.push(next);
      }
    }
  }

  const best = new Map<string, MoveOption>();
  for (const label of labels.values()) {
    if (sameStep(label.step, mover.start)) continue;
    const key = stepKey(label.step);
    if (occ.has(key)) continue; // cannot end on another figure
    const current = best.get(key);
    if (
      current &&
      (current.hazards < label.hazards || (current.hazards === label.hazards && current.cost <= label.cost))
    ) {
      continue;
    }
    const path: Step[] = [];
    for (let l: Label | null = label; l && l.prev; l = l.prev) path.unshift(l.step);
    best.set(key, { to: label.step, path, cost: label.cost, hazards: label.hazards });
  }
  return best;
}

/** Every destination the figure could move to this turn, with a suggested path. */
export function moveOptions(state: GameState, figureId: string, ctx: RulesContext): Map<string, MoveOption> {
  const mover = moverFor(state, figureId, ctx);
  const options = search(state, mover, mover.stats.move, null, ctx);
  const bonus = stayOnBonus(mover.start, ctx);
  if (bonus) {
    for (const [key, opt] of search(state, mover, mover.stats.move + bonus.bonus, bonus.terrain, ctx)) {
      const current = options.get(key);
      if (!current || opt.hazards < current.hazards || (opt.hazards === current.hazards && opt.cost < current.cost)) {
        options.set(key, opt);
      }
    }
  }
  return options;
}

/** Can this figure act now? Returns the active turn and mover, or throws. */
function activeMover(state: GameState, player: PlayerId, figureId: string, ctx: RulesContext) {
  const active = state.active;
  if (state.phase !== "turns" || !active) fail("No turn is in progress");
  if (active.player !== player) fail("It is not your turn");
  const mover = moverFor(state, figureId, ctx);
  if (mover.unit.id !== active.unitId) fail("Only the activated unit can act this turn");
  if (active.moved.includes(figureId)) fail("That figure has already moved this turn");
  if (active.attacked.includes(figureId)) fail("A figure cannot move after attacking");
  return { active, mover };
}

/** Check a requested path step by step and return its total cost. */
function validatePath(state: GameState, mover: Mover, path: readonly Step[], ctx: RulesContext): number {
  if (path.length === 0) fail("The path is empty");
  const occ = occupancy(state);
  let from = mover.start;
  let cost = 0;
  path.forEach((to, i) => {
    if (!canStep(from, to, mover.stats.height, ctx, state.config.mode)) fail("The figure cannot move that way");
    const occupant = occ.get(stepKey(to));
    if (occupant && occupant.figure.id !== mover.figure.id && occupant.unit.owner !== mover.unit.owner) {
      fail("The path goes through an enemy figure");
    }
    if (stopsMovement(from, to, ctx) && i < path.length - 1) fail("Entering water or swamp ends movement");
    cost += stepCost(from, to, ctx);
    from = to;
  });
  const last = path[path.length - 1]!;
  const endOccupant = occ.get(stepKey(last));
  if (endOccupant && endOccupant.figure.id !== mover.figure.id) fail("A figure cannot end its move on another figure");
  if (sameStep(last, mover.start)) fail("The figure must end somewhere new");

  let budget = mover.stats.move;
  const bonus = stayOnBonus(mover.start, ctx);
  if (bonus && path.every((s) => terrainOf(s, ctx)?.id === bonus.terrain)) budget += bonus.bonus;
  if (cost > budget) fail(`That move costs ${cost} but the figure only has ${budget}`);
  return cost;
}

export function moveFigure(
  state: GameState,
  player: PlayerId,
  figureId: string,
  path: readonly Step[],
  events: GameEvent[],
  ctx: RulesContext,
): void {
  const { active, mover } = activeMover(state, player, figureId, ctx);
  validatePath(state, mover, path, ctx);
  active.moved.push(figureId);

  const rng = new Rng(state.rng);
  const { figure, unit } = mover;
  const traversed: Step[] = [];
  const after: GameEvent[] = [];
  let prev = mover.start;

  const enter = (step: Step, canSlip: boolean): "ok" | "destroyed" | "slipped" => {
    figure.position = { hex: step.hex, elevation: step.elevation, rotation: 0 };
    const t = terrainOf(step, ctx);
    if (t?.entryDestroyOnOrBelow !== undefined) {
      const roll = rng.d20();
      const destroyed = roll <= t.entryDestroyOnOrBelow;
      after.push({ type: "terrainRoll", figureId, terrain: t.id, roll, outcome: destroyed ? "destroyed" : "safe" });
      if (destroyed) {
        destroyFigure(unit, figure, "lava", after);
        return "destroyed";
      }
    }
    if (t?.slip && canSlip) {
      const roll = rng.d20();
      const slipped = roll <= t.slip.onOrBelow;
      after.push({ type: "terrainRoll", figureId, terrain: t.id, roll, outcome: slipped ? "slipped" : "safe" });
      if (slipped) return "slipped";
    }
    return "ok";
  };

  for (const step of path) {
    traversed.push(step);
    const outcome = enter(step, true);
    if (outcome === "destroyed") break;
    if (outcome === "slipped") {
      const slide = slideTarget(state, mover, prev, step, ctx);
      if (slide) {
        after.push({ type: "figureSlid", figureId, to: slide });
        enter(slide, false); // a slide can carry a figure into lava, but never slips twice
      }
      break;
    }
    prev = step;
  }

  // A slip can leave a figure on a spot it was only passing through.
  if (!figure.destroyed && figure.position) {
    const occ = occupancy(state);
    const here = occ.get(stepKey(figure.position));
    if (here && here.figure.id !== figure.id) {
      const fallback = [...traversed].reverse().find((s) => {
        const o = occ.get(stepKey(s));
        return !o || o.figure.id === figure.id;
      });
      const back = fallback ?? mover.start;
      figure.position = { hex: back.hex, elevation: back.elevation, rotation: 0 };
      after.push({ type: "figureSlid", figureId, to: back });
    }
  }

  state.rng = rng.state;
  events.push({ type: "figureMoved", figureId, from: mover.start, path: traversed }, ...after);
}

/**
 * Where a slipping figure slides: one hex further in its direction of travel,
 * onto the highest surface there that is not above it, if it fits and is free.
 */
function slideTarget(state: GameState, mover: Mover, from: Step, at: Step, ctx: RulesContext): Step | null {
  const dir = hexSub(at.hex, from.hex);
  const hex = hexAdd(at.hex, dir);
  const occ = occupancy(state);
  const candidates = ctx.board
    .surfaces(hex)
    .filter((s) => s.elevation <= at.elevation)
    .sort((a, b) => b.elevation - a.elevation);
  const s = candidates[0];
  if (!s) return null;
  const step = { hex, elevation: s.elevation };
  if (s.clearance < Math.max(mover.stats.height, at.elevation - s.elevation)) return null;
  const occupant = occ.get(stepKey(step));
  if (occupant && occupant.figure.id !== mover.figure.id) return null;
  return step;
}
