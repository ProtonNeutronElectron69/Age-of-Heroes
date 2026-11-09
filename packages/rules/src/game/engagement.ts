import { isAdjacent } from "../hex";
import { figureSpots } from "./placement";
import type { Occupant } from "./queries";
import type { GameState, PlayerId, RulesContext, Step } from "./types";

/**
 * Two figures are engaged when a hex of one is next to a hex of the other and
 * the height difference between those hexes is less than the Height of the
 * lower figure (too big a drop and they cannot reach each other).
 */
export function spotsEngaged(a: readonly Step[], aHeight: number, b: readonly Step[], bHeight: number): boolean {
  for (const sa of a) {
    for (const sb of b) {
      if (!isAdjacent(sa.hex, sb.hex)) continue;
      const lowerHeight = sa.elevation <= sb.elevation ? aHeight : bHeight;
      if (Math.abs(sa.elevation - sb.elevation) < lowerHeight) return true;
    }
  }
  return false;
}

/**
 * Enemy figures engaged with a figure of `owner` standing on `spots`.
 * Engagement only exists in the Advanced game.
 */
export function engagedEnemies(
  state: GameState,
  owner: PlayerId,
  spots: readonly Step[],
  height: number,
  ctx: RulesContext,
): Occupant[] {
  if (state.config.mode !== "advanced" || spots.length === 0) return [];
  const result: Occupant[] = [];
  for (const unit of state.units) {
    if (unit.owner === owner) continue;
    const card = ctx.cards.get(unit.cardId);
    if (!card) continue;
    for (const figure of unit.figures) {
      const theirs = figureSpots(figure, card.footprint, card.height, ctx);
      if (theirs.length > 0 && spotsEngaged(spots, height, theirs, card.height)) result.push({ unit, figure });
    }
  }
  return result;
}
