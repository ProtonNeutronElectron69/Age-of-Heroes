import { hexKey } from "../hex";
import type { UnitCard } from "../schema";
import { fail } from "./errors";
import type { FigureState, GameState, PlayerId, RulesContext, RulesMode, Step, UnitState } from "./types";

/** Stats in effect for the chosen rule set. */
export interface EffectiveStats {
  /** Wounds needed to destroy a figure. In the Basic game any wound destroys. */
  readonly life: number;
  readonly move: number;
  readonly range: number;
  readonly attack: number;
  readonly defense: number;
  readonly height: number;
}

export function statsOf(card: UnitCard, mode: RulesMode): EffectiveStats {
  if (mode === "basic") {
    return { life: 1, ...card.basic, height: card.height };
  }
  const { life, move, range, attack, defense } = card.advanced;
  return { life, move, range, attack, defense, height: card.height };
}

export function stepKey(step: Step): string {
  return `${hexKey(step.hex)}@${step.elevation}`;
}

export function sameStep(a: Step, b: Step): boolean {
  return a.hex.q === b.hex.q && a.hex.r === b.hex.r && a.elevation === b.elevation;
}

export function isUnitAlive(unit: UnitState): boolean {
  return unit.figures.some((f) => !f.destroyed);
}

export function unitsOf(state: GameState, player: PlayerId): UnitState[] {
  return state.units.filter((u) => u.owner === player);
}

export function livingUnitsOf(state: GameState, player: PlayerId): UnitState[] {
  return unitsOf(state, player).filter(isUnitAlive);
}

export function activePlayers(state: GameState): PlayerId[] {
  return state.players.filter((p) => !p.eliminated).map((p) => p.id);
}

export function findUnit(state: GameState, unitId: string): UnitState | undefined {
  return state.units.find((u) => u.id === unitId);
}

export function findFigure(state: GameState, figureId: string): { unit: UnitState; figure: FigureState } | undefined {
  for (const unit of state.units) {
    const figure = unit.figures.find((f) => f.id === figureId);
    if (figure) return { unit, figure };
  }
  return undefined;
}

export function cardOf(unit: UnitState, ctx: RulesContext): UnitCard {
  return ctx.cards.get(unit.cardId) ?? fail(`Unknown card "${unit.cardId}"`);
}

/** Every figure on the battlefield, keyed by the spot it stands on. */
export function occupancy(state: GameState): Map<string, { unit: UnitState; figure: FigureState }> {
  const map = new Map<string, { unit: UnitState; figure: FigureState }>();
  for (const unit of state.units) {
    for (const figure of unit.figures) {
      if (!figure.destroyed && figure.position) map.set(stepKey(figure.position), { unit, figure });
    }
  }
  return map;
}

export function terrainAt(step: Step, ctx: RulesContext): string | undefined {
  return ctx.board.surfaceAt(step.hex, step.elevation)?.terrain;
}

/**
 * Score of what a player still has on the board. Advanced: point value, with
 * squads counting in proportion to their surviving figures. Basic (no point
 * costs): number of surviving figures.
 */
export function scoreOf(state: GameState, player: PlayerId, ctx: RulesContext): number {
  let score = 0;
  for (const unit of unitsOf(state, player)) {
    const alive = unit.figures.filter((f) => !f.destroyed).length;
    if (alive === 0) continue;
    if (state.config.mode === "basic") {
      score += alive;
    } else {
      const card = ctx.cards.get(unit.cardId);
      if (card) score += Math.floor((card.advanced.points * alive) / unit.figures.length);
    }
  }
  return score;
}
