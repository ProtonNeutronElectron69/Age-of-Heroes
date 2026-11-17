import { hexKey } from "../hex";
import type { UnitCard } from "../schema";
import { fail } from "./errors";
import { figureSpots } from "./placement";
import { TOKEN_IDS, type FigureState, type GameState, type PlayerId, type RulesContext, type Step, type UnitState } from "./types";

/** A card's stats, with its Height alongside. */
export interface EffectiveStats {
  /** Wounds needed to destroy a figure. */
  readonly life: number;
  readonly move: number;
  readonly range: number;
  readonly attack: number;
  readonly defense: number;
  readonly height: number;
}

export function statsOf(card: UnitCard): EffectiveStats {
  const { life, move, range, attack, defense } = card;
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

/**
 * How many activation tokens a player places this round: all four, except that under the
 * "onePerUnit" rule each token needs a unit of its own, so a player with fewer living units
 * places one on each.
 */
export function tokensToPlace(state: GameState, player: PlayerId): number {
  if (state.config.tokenRule !== "onePerUnit") return TOKEN_IDS.length;
  return Math.min(TOKEN_IDS.length, livingUnitsOf(state, player).length);
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

export interface Occupant {
  readonly unit: UnitState;
  readonly figure: FigureState;
}

/** Every figure on the battlefield, keyed by each spot it covers (big figures cover several). */
export function occupancy(state: GameState, ctx: RulesContext): Map<string, Occupant> {
  const map = new Map<string, Occupant>();
  for (const unit of state.units) {
    const card = ctx.cards.get(unit.cardId);
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position) continue;
      const spots = card ? figureSpots(figure, card.footprint, card.height, ctx) : [figure.position];
      for (const s of spots) map.set(stepKey(s), { unit, figure });
    }
  }
  return map;
}

/** The spots a figure covers right now. */
export function spotsOf(unit: UnitState, figure: FigureState, ctx: RulesContext): Step[] {
  const card = cardOf(unit, ctx);
  return figureSpots(figure, card.footprint, card.height, ctx);
}

/**
 * Score of what a player still has on the board: its point value, with
 * squads counting in proportion to their surviving figures.
 */
export function scoreOf(state: GameState, player: PlayerId, ctx: RulesContext): number {
  let score = 0;
  for (const unit of unitsOf(state, player)) {
    const alive = unit.figures.filter((f) => !f.destroyed).length;
    if (alive === 0) continue;
    // Each figure is worth its share of the card's points (a controlled squad figure counts once).
    const card = ctx.cards.get(unit.cardId);
    if (card) score += Math.floor((card.points * alive) / card.figureCount);
  }
  return score;
}
