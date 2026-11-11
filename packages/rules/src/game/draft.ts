import { Rng } from "../rng";
import { isUnique } from "../schema";
import { fail } from "./errors";
import { deploymentSpots, startDeployment } from "./deploy";
import { footprintSize, tuningOf } from "./placement";
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

/** A points draft goes on until every player has passed or cannot afford anything; this caps its length. */
const POINTS_DRAFT_ROUNDS = 40;

export function startDraft(state: GameState, armySize: number | null, events: GameEvent[]): void {
  const rng = new Rng(state.rng);
  const { order, rolls } = rollOff(state, rng);
  state.rng = rng.state;
  state.phase = "draft";
  state.draft = { order: snakeOrder(order, armySize ?? POINTS_DRAFT_ROUNDS), index: 0, rolls, picks: [], passed: [] };
  events.push({ type: "draftStarted", rolls, order });
}

/** Points a player has spent in a points draft. */
export function pointsSpent(state: GameState, player: PlayerId, ctx: RulesContext): number {
  return state.units
    .filter((u) => u.owner === player)
    .reduce((n, u) => n + (ctx.cards.get(u.cardId)?.advanced.points ?? 0), 0);
}

/** The faction a player is locked into in faction-pure mode, if any. */
export function lockedFaction(state: GameState, player: PlayerId, ctx: RulesContext): string | null {
  if (!state.config.factionPure) return null;
  const first = state.units.find((u) => u.owner === player);
  return first ? (ctx.cards.get(first.cardId)?.faction ?? null) : null;
}

/** Who picks next. */
export function currentDrafter(state: GameState): PlayerId | null {
  const d = state.draft;
  if (!d) return null;
  return d.order[d.index] ?? null;
}

/**
 * How many hexes of figures a player may draft. On maps whose start zones grow
 * to fit each army, that is the tuning limit (or the zone, if bigger).
 */
export function zoneCapacity(state: GameState, player: PlayerId, ctx: RulesContext): number {
  const drawn = deploymentSpots(state, player, 1, ctx).length;
  return ctx.board.growsZones() ? Math.max(drawn, tuningOf(ctx).grownZoneSize ?? 40) : drawn;
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
 * any common card. With a player given, only cards whose figures still fit in
 * that player's start zone, that they can afford (points draft), and of their
 * faction (faction-pure mode).
 */
export function draftableCards(state: GameState, ctx: RulesContext, player?: PlayerId): string[] {
  return [...ctx.cards.keys()].filter((id) => pickProblem(state, ctx, id, player) === null);
}

/** Why a card cannot be drafted, or null if it can. */
export function pickProblem(state: GameState, ctx: RulesContext, cardId: string, player?: PlayerId): string | null {
  const card = ctx.cards.get(cardId);
  if (!card) return `Unknown card "${cardId}"`;
  if (isUnique(card) && state.units.some((u) => u.cardId === cardId)) {
    return `${card.name} is unique and has already been drafted`;
  }
  if (!player) return null;
  const room = zoneCapacity(state, player, ctx) - spaceNeeded(state, player, ctx);
  if (cardSpace(card) > room) return `Your start zone only has room for ${room} more hexes of figures`;
  const budget = state.config.budget;
  if (budget !== null) {
    const left = budget - pointsSpent(state, player, ctx);
    if (card.advanced.points > left) return `${card.name} costs ${card.advanced.points} points; you have ${left} left`;
  }
  const faction = lockedFaction(state, player, ctx);
  if (faction && card.faction !== faction) return `Your army is ${faction} only`;
  return null;
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
  const problem = pickProblem(state, ctx, cardId, player);
  if (problem) fail(problem);
  const unit = createUnit(state, player, cardId, ctx);
  state.draft.picks.push({ player, cardId, unitId: unit.id });
  events.push({ type: "cardDrafted", player, cardId, unitId: unit.id });
  state.draft.index += 1;
  continueDraft(state, events, ctx);
}

/** Points draft only: a player stops drafting for the rest of the draft. */
export function draftPass(state: GameState, player: PlayerId, events: GameEvent[], ctx: RulesContext): void {
  if (state.phase !== "draft" || !state.draft) fail("The draft is over");
  if (state.config.budget === null) fail("Every player drafts the same number of cards; there is no passing");
  if (currentDrafter(state) !== player) fail("It is not your pick");
  state.draft.passed.push(player);
  events.push({ type: "draftPassed", player });
  state.draft.index += 1;
  continueDraft(state, events, ctx);
}

/**
 * Move past picks that cannot happen (the player has left the game or
 * passed, or no card fits their zone, budget and faction any more), and end
 * the draft when nobody can pick.
 */
export function continueDraft(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  const d = state.draft;
  if (!d) return;
  const canPick = new Set(
    state.players
      .filter((p) => !p.eliminated && !d.passed.includes(p.id) && draftableCards(state, ctx, p.id).length > 0)
      .map((p) => p.id),
  );
  while (d.index < d.order.length && canPick.size > 0) {
    if (canPick.has(d.order[d.index]!)) return;
    d.index += 1;
  }
  d.index = d.order.length;
  events.push({ type: "draftEnded" });
  startDeployment(state, events, ctx);
}
