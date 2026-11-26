import { decodeHitShape, placeShape, placedSamples, shapeFrame, type HitShape, type PlacedShape } from "../hitShapes";
import { hasLineOfSight, shareInSight, type ShapedTarget, type SightOptions, type Token } from "../los";
import { DEFAULT_TUNING } from "../tuning";
import { HIT_BAND_FROM, LEVEL_HEIGHT, TOKEN_RADIUS } from "../world";
import type { Combatant } from "./abilities";
import { baseFacing } from "./facing";
import { figureSpots, tuningOf } from "./placement";
import type { FigureState, GameState, RulesContext, Step, UnitState } from "./types";
import type { UnitCard } from "../schema";

/**
 * Line of sight for the game: which figures block the view, and whether one figure sees another
 * or a hex. Games with `hitZones` see each figure by its hit shape (boxes from its model); older
 * games by its token.
 */

export const tokens = (spots: readonly Step[], height: number): Token[] => spots.map((s) => ({ ...s, height }));

/** Whether the game sees figures by their hit shapes. */
export function hasHitZones(state: GameState): boolean {
  return state.config.hitZones === "models";
}

/** A token-sized box for a unit without a hit shape: the old hit band is its body. */
function tokenShape(card: UnitCard): HitShape {
  const h = card.height * LEVEL_HEIGHT;
  const r = Math.round(TOKEN_RADIUS * 1000);
  const band = Math.round((h * (1 - HIT_BAND_FROM) * 1000) / 2);
  const below = Math.round((h * HIT_BAND_FROM * 1000) / 2);
  return decodeHitShape([1, 0, below, 0, r, below, r, 0, 0, 0, 1000, 0, 0, Math.round(h * HIT_BAND_FROM * 1000) + band, 0, r, band, r, 0, 0, 0, 1000]);
}

/** Which way a figure's shape is turned: its facing, else along its base, else the way models face by default. */
function shapeFacing(figure: FigureState, card: UnitCard): number {
  if (figure.facing !== undefined) return figure.facing;
  const pos = figure.position;
  if (pos && card.footprint !== "1") return baseFacing(card.footprint, pos.hex, pos.rotation);
  return 0;
}

/** A figure's hit shape: its pose's boxes (a squad's figures take the poses in turn, as the models do). */
export function hitShapeOf(unit: UnitState, figure: FigureState, card: UnitCard, ctx: RulesContext): HitShape {
  const poses = ctx.hitShapes?.get(card.id);
  if (!poses || poses.length === 0) return tokenShape(card);
  const index = Math.max(0, unit.figures.indexOf(figure));
  return poses[index % poses.length]!;
}

/** A figure's hit shape on the board, or null when it is off the board. */
export function placedShapeOf(unit: UnitState, figure: FigureState, card: UnitCard, ctx: RulesContext): PlacedShape | null {
  const spots = figureSpots(figure, card.footprint, card.height, ctx);
  if (spots.length === 0) return null;
  return placeShape(hitShapeOf(unit, figure, card, ctx), shapeFrame(spots, shapeFacing(figure, card)));
}

/** Every figure on the board but those in `except`, as the things that block the view. */
export function sightBlockers(state: GameState, ctx: RulesContext, except: readonly string[]): SightOptions {
  const shaped = hasHitZones(state);
  const blockers: Token[] = [];
  const shapes: PlacedShape[] = [];
  for (const unit of state.units) {
    const card = ctx.cards.get(unit.cardId);
    if (!card) continue;
    for (const figure of unit.figures) {
      if (except.includes(figure.id)) continue;
      if (shaped) {
        const shape = placedShapeOf(unit, figure, card, ctx);
        if (shape) shapes.push(shape);
      } else {
        blockers.push(...tokens(figureSpots(figure, card.footprint, card.height, ctx), card.height));
      }
    }
  }
  return shaped ? { shapes } : { blockers };
}

/** A figure as a target for line of sight with hit zones. */
export function shapedTarget(target: Combatant, ctx: RulesContext): ShapedTarget {
  const shape = hitShapeOf(target.unit, target.figure, target.card, ctx);
  const frame = shapeFrame(target.spots, shapeFacing(target.figure, target.card));
  return { tokens: tokens(target.spots, target.card.height), shape: placeShape(shape, frame), samples: placedSamples(shape, frame) };
}

/** The least share of a target's body an attacker must see (games with hit zones). */
export function sightShareNeeded(ctx: RulesContext): number {
  return tuningOf(ctx).sightShare ?? DEFAULT_TUNING.sightShare ?? 0.2;
}

/**
 * Can one figure see another, past the terrain and every figure but those in `except` (the two
 * themselves are always left out)? With hit zones it must see enough of the target's body.
 */
export function figureInSight(state: GameState, ctx: RulesContext, from: Combatant, to: Combatant, except: readonly string[] = []): boolean {
  const opts = sightBlockers(state, ctx, [from.figure.id, to.figure.id, ...except]);
  const eyes = tokens(from.spots, from.card.height);
  if (!hasHitZones(state)) return hasLineOfSight(ctx.board, eyes, tokens(to.spots, to.card.height), opts);
  const need = sightShareNeeded(ctx);
  return shareInSight(ctx.board, eyes, shapedTarget(to, ctx), opts, need) >= need - 1e-9;
}

/** The share of a target's body one figure sees (games with hit zones), or null in a game without them. */
export function figureShareInSight(state: GameState, ctx: RulesContext, from: Combatant, to: Combatant): number | null {
  if (!hasHitZones(state)) return null;
  const opts = sightBlockers(state, ctx, [from.figure.id, to.figure.id]);
  return shareInSight(ctx.board, tokens(from.spots, from.card.height), shapedTarget(to, ctx), opts);
}

/**
 * Is a spot in sight: could a figure of Height 1 standing there be seen? From the figure's own
 * hexes (or `eyes`), past every figure but those in `except`.
 */
export function spotInSight(
  state: GameState,
  ctx: RulesContext,
  eyes: readonly Token[],
  at: Step,
  except: readonly string[],
): boolean {
  return hasLineOfSight(ctx.board, eyes, [{ ...at, height: 1 }], sightBlockers(state, ctx, except));
}
