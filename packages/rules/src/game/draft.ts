import { Rng } from "../rng";
import { isUnique } from "../schema";
import { fail } from "./errors";
import { deploymentSpots, startDeployment } from "./deploy";
import { footprintSize } from "./placement";
import { rollOff } from "./rounds";
import type { UnitCard } from "../schema";
import type { GameEvent, GameState, PlayerId, RulesContext, UnitState } from "./types";

/**
 * Snake draft: a d20 roll-off picks the first drafter, then picks go around
 * the table to the left and reverse direction every round of picks.
 */
export function snakeOrder(firstRound: readonly PlayerId[], rounds: number): PlayerId[] {
  const order: PlayerId[] = [];
  for (let r = 0; r < rounds; r++) {
    order.push(...(r % 2 === 0 ? firstRound : [...firstRound].reverse()));
  }
  return order;
}

export function startDraft(state: GameState, armySize: number, events: GameEvent[]): void {
  const rng = new Rng(state.rng);
  const { order, rolls } = rollOff(state, rng);
  state.rng = rng.state;
  state.phase = "draft";
  state.draft = { order: snakeOrder(order, armySize), index: 0, rolls, picks: [] };
  events.push({ type: "draftStarted", rolls, order });
}

/** Who picks next. */
export function currentDrafter(state: GameState): PlayerId | null {
  const d = state.draft;
  if (!d) return null;
  return d.order[d.index] ?? null;
}

/** How many hexes a player's start zone has room on. */
export function zoneCapacity(state: GameState, player: PlayerId, ctx: RulesContext): number {
  return deploymentSpots(state, player, 1, ctx).length;
}

/** Hexes a card's figures take up: figure count times footprint size. */
export function cardSpace(card: UnitCard): number {
  return card.figureCount * footprintSize(card.footprint);
}

/** Hexes a player's army takes up. */
export function spaceNeeded(state: GameState, player: PlayerId, ctx: RulesContext): number {
  return state.units
    .filter((u) => u.owner === player)
    .reduce((n, u) => n + (ctx.cards.get(u.cardId) ? cardSpace(ctx.cards.get(u.cardId)!) : u.figures.length), 0);
}

/**
 * Cards that can be drafted right now: unique cards nobody has taken yet and
 * any common card. With a player given, only cards whose figures still fit
 * in that player's start zone.
 */
export function draftableCards(state: GameState, ctx: RulesContext, player?: PlayerId): string[] {
  const taken = new Set(state.units.map((u) => u.cardId));
  const room = player ? zoneCapacity(state, player, ctx) - spaceNeeded(state, player, ctx) : Infinity;
  return [...ctx.cards.values()]
    .filter((c) => !(isUnique(c) && taken.has(c.id)) && cardSpace(c) <= room)
    .map((c) => c.id);
}

export function createUnit(state: GameState, player: PlayerId, cardId: string, ctx: RulesContext): UnitState {
  const card = ctx.cards.get(cardId) ?? fail(`Unknown card "${cardId}"`);
  const index = state.units.filter((u) => u.owner === player).length;
  const unitId = `${player}:${index}`;
  const unit: UnitState = {
    id: unitId,
    cardId,
    owner: player,
    figures: Array.from({ length: card.figureCount }, (_, f) => ({
      id: `${unitId}#${f + 1}`,
      wounds: 0,
      destroyed: false,
      position: null,
    })),
  };
  state.units.push(unit);
  return unit;
}

export function draftPick(
  state: GameState,
  player: PlayerId,
  cardId: string,
  events: GameEvent[],
  ctx: RulesContext,
): void {
  if (state.phase !== "draft" || !state.draft) fail("The draft is over");
  if (currentDrafter(state) !== player) fail("It is not your pick");
  const card = ctx.cards.get(cardId) ?? fail(`Unknown card "${cardId}"`);
  if (isUnique(card) && state.units.some((u) => u.cardId === cardId)) {
    fail(`${card.name} is unique and has already been drafted`);
  }
  const room = zoneCapacity(state, player, ctx) - spaceNeeded(state, player, ctx);
  if (cardSpace(card) > room) fail(`Your start zone only has room for ${room} more hexes of figures`);
  const unit = createUnit(state, player, cardId, ctx);
  state.draft.picks.push({ player, cardId, unitId: unit.id });
  events.push({ type: "cardDrafted", player, cardId, unitId: unit.id });
  state.draft.index += 1;
  continueDraft(state, events, ctx);
}

/**
 * Move past picks that cannot happen (the player has left the game, or no
 * card fits in their start zone any more), and end the draft when no picks
 * remain.
 */
export function continueDraft(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  const d = state.draft;
  if (!d) return;
  while (d.index < d.order.length) {
    const player = d.order[d.index]!;
    const p = state.players.find((x) => x.id === player);
    if (p && !p.eliminated && draftableCards(state, ctx, player).length > 0) return;
    d.index += 1;
  }
  events.push({ type: "draftEnded" });
  startDeployment(state, events, ctx);
}
