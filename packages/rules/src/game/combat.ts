import { rollCombat } from "../dice";
import { hexDistance } from "../hex";
import { hasLineOfSight, type Token } from "../los";
import { Rng } from "../rng";
import type { Tuning } from "../tuning";
import { engagedEnemies, spotsEngaged } from "./engagement";
import { fail } from "./errors";
import { figureSpots, standingElevation, tuningOf } from "./placement";
import { cardOf, findFigure, statsOf } from "./queries";
import { checkGameOver, woundFigure } from "./rounds";
import type { GameEvent, GameState, PlayerId, RulesContext, Step } from "./types";

/**
 * Extra dice for higher ground (Advanced). The figure standing higher gets
 * +1 (attack if attacking, defense if defending), and another +1 when the
 * difference is at least the lower figure's Height.
 */
export function elevationBonus(
  attackerElevation: number,
  attackerHeight: number,
  defenderElevation: number,
  defenderHeight: number,
  tuning: Tuning,
): { attackBonus: number; defenseBonus: number } {
  const diff = attackerElevation - defenderElevation;
  const { higher, extreme } = tuning.elevationBonus;
  if (diff > 0) return { attackBonus: higher + (diff >= defenderHeight ? extreme : 0), defenseBonus: 0 };
  if (diff < 0) return { attackBonus: 0, defenseBonus: higher + (-diff >= attackerHeight ? extreme : 0) };
  return { attackBonus: 0, defenseBonus: 0 };
}

const tokens = (spots: readonly Step[], height: number): Token[] => spots.map((s) => ({ ...s, height }));

function minDistance(a: readonly Step[], b: readonly Step[]): number {
  let best = Infinity;
  for (const x of a) for (const y of b) best = Math.min(best, hexDistance(x.hex, y.hex));
  return best;
}

/** Why this attack is not allowed, or null if it is. */
export function attackProblem(state: GameState, attackerId: string, targetId: string, ctx: RulesContext): string | null {
  const active = state.active;
  if (state.phase !== "turns" || !active) return "No turn is in progress";
  const a = findFigure(state, attackerId);
  if (!a || a.figure.destroyed || !a.figure.position) return "That figure is not on the battlefield";
  if (a.unit.id !== active.unitId) return "Only the activated unit can attack this turn";
  if (active.attacked.includes(attackerId)) return "That figure has already attacked this turn";
  const t = findFigure(state, targetId);
  if (!t || t.figure.destroyed || !t.figure.position) return "That target is not on the battlefield";
  if (t.unit.owner === a.unit.owner) return "You cannot attack your own figures";

  const mode = state.config.mode;
  const aCard = cardOf(a.unit, ctx);
  const tCard = cardOf(t.unit, ctx);
  const aStats = statsOf(aCard, mode);
  const tStats = statsOf(tCard, mode);
  const aSpots = figureSpots(a.figure, aCard.footprint, aStats.height, ctx);
  const tSpots = figureSpots(t.figure, tCard.footprint, tStats.height, ctx);
  const distance = minDistance(aSpots, tSpots);
  if (distance > aStats.range) return `Out of range (${distance} hexes, range ${aStats.range})`;

  const strict = mode === "advanced";
  if (strict) {
    const engaged = engagedEnemies(state, a.unit.owner, aSpots, aStats.height, ctx);
    const withTarget = spotsEngaged(aSpots, aStats.height, tSpots, tStats.height);
    if (engaged.length > 0 && !withTarget) return "An engaged figure can only attack enemies it is engaged with";
    if (aStats.range === 1 && !withTarget) return "Too far above or below to reach";
  }

  const blockers: Token[] = [];
  if (strict) {
    for (const unit of state.units) {
      const card = ctx.cards.get(unit.cardId);
      if (!card) continue;
      for (const figure of unit.figures) {
        if (figure.id === attackerId || figure.id === targetId) continue;
        blockers.push(...tokens(figureSpots(figure, card.footprint, card.height, ctx), card.height));
      }
    }
  }
  if (!hasLineOfSight(ctx.board, tokens(aSpots, aStats.height), tokens(tSpots, tStats.height), { strict, blockers })) {
    return "No line of sight";
  }
  return null;
}

/** Enemy figures this figure could attack right now. */
export function attackTargets(state: GameState, figureId: string, ctx: RulesContext): string[] {
  const a = findFigure(state, figureId);
  if (!a) return [];
  const targets: string[] = [];
  for (const unit of state.units) {
    if (unit.owner === a.unit.owner) continue;
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position) continue;
      if (attackProblem(state, figureId, figure.id, ctx) === null) targets.push(figure.id);
    }
  }
  return targets;
}

/** The dice an attack would roll, including height bonuses. */
export function attackDice(
  state: GameState,
  attackerId: string,
  targetId: string,
  ctx: RulesContext,
): { attack: number; defense: number; attackBonus: number; defenseBonus: number } {
  const a = findFigure(state, attackerId) ?? fail(`Unknown figure "${attackerId}"`);
  const t = findFigure(state, targetId) ?? fail(`Unknown figure "${targetId}"`);
  const mode = state.config.mode;
  const aCard = cardOf(a.unit, ctx);
  const tCard = cardOf(t.unit, ctx);
  const aStats = statsOf(aCard, mode);
  const tStats = statsOf(tCard, mode);
  let bonus = { attackBonus: 0, defenseBonus: 0 };
  if (mode === "advanced") {
    const aElev = standingElevation(figureSpots(a.figure, aCard.footprint, aStats.height, ctx));
    const tElev = standingElevation(figureSpots(t.figure, tCard.footprint, tStats.height, ctx));
    bonus = elevationBonus(aElev, aStats.height, tElev, tStats.height, tuningOf(ctx));
  }
  return {
    attack: aStats.attack + bonus.attackBonus,
    defense: tStats.defense + bonus.defenseBonus,
    ...bonus,
  };
}

export function attack(
  state: GameState,
  player: PlayerId,
  figureId: string,
  targetId: string,
  events: GameEvent[],
  ctx: RulesContext,
): void {
  if (state.active && state.active.player !== player) fail("It is not your turn");
  const problem = attackProblem(state, figureId, targetId, ctx);
  if (problem) fail(problem);

  const t = findFigure(state, targetId)!;
  const tStats = statsOf(cardOf(t.unit, ctx), state.config.mode);
  const dice = attackDice(state, figureId, targetId, ctx);

  const rng = new Rng(state.rng);
  const roll = rollCombat(rng, dice.attack, dice.defense);
  state.rng = rng.state;
  state.active!.attacked.push(figureId);
  events.push({
    type: "attackRolled",
    source: "attack",
    attackerId: figureId,
    targetId,
    attack: roll.attack,
    defense: roll.defense,
    hits: roll.hits,
    blocks: roll.blocks,
    wounds: roll.wounds,
    attackBonus: dice.attackBonus,
    defenseBonus: dice.defenseBonus,
  });
  woundFigure(state, t.unit, t.figure, roll.wounds, tStats.life, "attack", events);
  checkGameOver(state, events, ctx);
}

/** End-of-turn terrain damage (swamp) for every figure of the unit that just acted. */
export function endOfTurnTerrain(state: GameState, unitId: string, events: GameEvent[], ctx: RulesContext): void {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return;
  const card = cardOf(unit, ctx);
  const stats = statsOf(card, state.config.mode);
  const rng = new Rng(state.rng);
  for (const figure of unit.figures) {
    const spots = figureSpots(figure, card.footprint, stats.height, ctx);
    // A figure rolls once, however many of its hexes are on swamp.
    const effect = spots
      .map((s) => ctx.board.surfaceAt(s.hex, s.elevation)?.terrain)
      .map((id) => (id ? ctx.terrain.get(id)?.endTurnSelfAttack : undefined))
      .find((e) => e !== undefined);
    if (!effect) continue;
    const roll = rollCombat(rng, effect.attackDice, effect.defenseDice);
    events.push({
      type: "attackRolled",
      source: "swamp",
      attackerId: null,
      targetId: figure.id,
      attack: roll.attack,
      defense: roll.defense,
      hits: roll.hits,
      blocks: roll.blocks,
      wounds: roll.wounds,
      attackBonus: 0,
      defenseBonus: 0,
    });
    woundFigure(state, unit, figure, roll.wounds, stats.life, "swamp", events);
  }
  state.rng = rng.state;
}
