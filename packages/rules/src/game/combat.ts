import { rollCombat } from "../dice";
import { hexDistance } from "../hex";
import { hasLineOfSight, type Token } from "../los";
import { Rng } from "../rng";
import { fail } from "./errors";
import { cardOf, findFigure, occupancy, statsOf } from "./queries";
import { checkGameOver, woundFigure } from "./rounds";
import type { GameEvent, GameState, PlayerId, RulesContext } from "./types";

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
  const aStats = statsOf(cardOf(a.unit, ctx), mode);
  const tStats = statsOf(cardOf(t.unit, ctx), mode);
  const distance = hexDistance(a.figure.position.hex, t.figure.position.hex);
  if (distance > aStats.range) return `Out of range (${distance} hexes, range ${aStats.range})`;

  const from: Token = { ...a.figure.position, height: aStats.height };
  const to: Token = { ...t.figure.position, height: tStats.height };
  const strict = mode === "advanced";
  const blockers: Token[] = [];
  if (strict) {
    for (const { unit, figure } of occupancy(state).values()) {
      if (figure.id === attackerId || figure.id === targetId || !figure.position) continue;
      blockers.push({ ...figure.position, height: statsOf(cardOf(unit, ctx), mode).height });
    }
  }
  if (!hasLineOfSight(ctx.board, from, to, { strict, blockers })) return "No line of sight";
  return null;
}

/** Enemy figures this figure could attack right now. */
export function attackTargets(state: GameState, figureId: string, ctx: RulesContext): string[] {
  const a = findFigure(state, figureId);
  if (!a) return [];
  const targets: string[] = [];
  for (const { unit, figure } of occupancy(state).values()) {
    if (unit.owner === a.unit.owner) continue;
    if (attackProblem(state, figureId, figure.id, ctx) === null) targets.push(figure.id);
  }
  return targets;
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

  const a = findFigure(state, figureId)!;
  const t = findFigure(state, targetId)!;
  const mode = state.config.mode;
  const aStats = statsOf(cardOf(a.unit, ctx), mode);
  const tStats = statsOf(cardOf(t.unit, ctx), mode);

  const rng = new Rng(state.rng);
  const roll = rollCombat(rng, aStats.attack, tStats.defense);
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
  });
  woundFigure(state, t.unit, t.figure, roll.wounds, tStats.life, "attack", events);
  checkGameOver(state, events, ctx);
}

/** End-of-turn terrain damage (swamp) for every figure of the unit that just acted. */
export function endOfTurnTerrain(state: GameState, unitId: string, events: GameEvent[], ctx: RulesContext): void {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return;
  const stats = statsOf(cardOf(unit, ctx), state.config.mode);
  const rng = new Rng(state.rng);
  for (const figure of unit.figures) {
    if (figure.destroyed || !figure.position) continue;
    const terrainId = ctx.board.surfaceAt(figure.position.hex, figure.position.elevation)?.terrain;
    const effect = terrainId ? ctx.terrain.get(terrainId)?.endTurnSelfAttack : undefined;
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
    });
    woundFigure(state, unit, figure, roll.wounds, stats.life, "swamp", events);
  }
  state.rng = rng.state;
}
