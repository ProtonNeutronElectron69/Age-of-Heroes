import { rollCombat } from "../dice";
import { hasLineOfSight, type Token } from "../los";
import { Rng } from "../rng";
import { isUnique } from "../schema";
import type { Tuning } from "../tuning";
import {
  abilityModifiers,
  abilityOf,
  afterAttack,
  areaAttackOf,
  combatant,
  hasAbility,
  mindControlOf,
  param,
  reduceWounds,
  spotDistance,
  type Combatant,
} from "./abilities";
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

interface Reach {
  readonly range: number;
  readonly minRange: number;
  readonly ignoresSight: boolean;
}

/** Why an attack-like action from one figure at another is not allowed, or null if it is. */
function actionProblem(state: GameState, attackerId: string, targetId: string, ctx: RulesContext, reach: Reach): string | null {
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
  const aHeight = statsOf(aCard, mode).height;
  const tHeight = statsOf(tCard, mode).height;
  const aSpots = figureSpots(a.figure, aCard.footprint, aHeight, ctx);
  const tSpots = figureSpots(t.figure, tCard.footprint, tHeight, ctx);
  const distance = spotDistance(aSpots, tSpots);
  if (distance > reach.range) return `Out of range (${distance} hexes, range ${reach.range})`;
  if (distance < reach.minRange) return `Too close (needs at least ${reach.minRange} hexes)`;

  const strict = mode === "advanced";
  if (strict) {
    const engaged = engagedEnemies(state, a.unit.owner, aSpots, aHeight, ctx);
    const withTarget = spotsEngaged(aSpots, aHeight, tSpots, tHeight);
    if (engaged.length > 0 && !withTarget) return "An engaged figure can only attack enemies it is engaged with";
    if (reach.range === 1 && !withTarget) return "Too far above or below to reach";
  }
  if (reach.ignoresSight) return null;

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
  if (!hasLineOfSight(ctx.board, tokens(aSpots, aHeight), tokens(tSpots, tHeight), { strict, blockers })) {
    return "No line of sight";
  }
  return null;
}

/**
 * Why this attack is not allowed, or null if it is. With `ability`, the
 * attack uses that special action from the card (area attack or mind control).
 */
export function attackProblem(
  state: GameState,
  attackerId: string,
  targetId: string,
  ctx: RulesContext,
  ability?: string,
): string | null {
  const a = findFigure(state, attackerId);
  if (!a) return "That figure is not on the battlefield";
  const card = cardOf(a.unit, ctx);
  if (!ability) {
    return actionProblem(state, attackerId, targetId, ctx, {
      range: statsOf(card, state.config.mode).range,
      minRange: 1,
      ignoresSight: false,
    });
  }
  if (state.config.mode !== "advanced" || !abilityOf(card, ability)) return "That figure has no such power";
  const area = areaAttackOf(card, ability);
  if (area) return actionProblem(state, attackerId, targetId, ctx, area);
  const mind = mindControlOf(card, ability);
  if (mind) {
    const t = findFigure(state, targetId);
    if (t) {
      const tCard = cardOf(t.unit, ctx);
      if (isUnique(tCard)) return "Unique figures cannot be controlled";
      if (tCard.size !== "small" && tCard.size !== "medium") return "Only Small or Medium figures can be controlled";
    }
    return actionProblem(state, attackerId, targetId, ctx, { range: mind.range, minRange: 1, ignoresSight: false });
  }
  return "That power is not an attack";
}

/** Enemy figures this figure could attack right now (with a special action, if given). */
export function attackTargets(state: GameState, figureId: string, ctx: RulesContext, ability?: string): string[] {
  const a = findFigure(state, figureId);
  if (!a) return [];
  const targets: string[] = [];
  for (const unit of state.units) {
    if (unit.owner === a.unit.owner) continue;
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position) continue;
      if (attackProblem(state, figureId, figure.id, ctx, ability) === null) targets.push(figure.id);
    }
  }
  return targets;
}

/** The dice an attack would roll, with height and ability bonuses and the reasons for them. */
export function attackDice(
  state: GameState,
  attackerId: string,
  targetId: string,
  ctx: RulesContext,
  baseAttack?: number,
): { attack: number; defense: number; attackBonus: number; defenseBonus: number; notes: string[] } {
  const a = findFigure(state, attackerId) ?? fail(`Unknown figure "${attackerId}"`);
  const t = findFigure(state, targetId) ?? fail(`Unknown figure "${targetId}"`);
  return diceFor(state, ctx, combatant(a.unit, a.figure, ctx), combatant(t.unit, t.figure, ctx), baseAttack);
}

function diceFor(state: GameState, ctx: RulesContext, attacker: Combatant, defender: Combatant, baseAttack?: number) {
  const mode = state.config.mode;
  const aStats = statsOf(attacker.card, mode);
  const tStats = statsOf(defender.card, mode);
  let attackBonus = 0;
  let defenseBonus = 0;
  const notes: string[] = [];
  if (mode === "advanced") {
    const height = elevationBonus(
      standingElevation(attacker.spots),
      aStats.height,
      standingElevation(defender.spots),
      tStats.height,
      tuningOf(ctx),
    );
    if (height.attackBonus > 0) notes.push(`Higher ground +${height.attackBonus} attack`);
    if (height.defenseBonus > 0) notes.push(`Higher ground +${height.defenseBonus} defense`);
    const mods = abilityModifiers(state, ctx, attacker, defender, spotDistance(attacker.spots, defender.spots));
    attackBonus = height.attackBonus + mods.attack;
    defenseBonus = height.defenseBonus + mods.defense;
    notes.push(...mods.notes);
  }
  return {
    attack: (baseAttack ?? aStats.attack) + attackBonus,
    defense: tStats.defense + defenseBonus,
    attackBonus,
    defenseBonus,
    notes,
  };
}

/** Roll one attack against one defender and apply the result. */
function resolve(
  state: GameState,
  ctx: RulesContext,
  rng: Rng,
  attacker: Combatant,
  defender: Combatant,
  baseAttack: number,
  ability: string | undefined,
  events: GameEvent[],
): void {
  const dice = diceFor(state, ctx, attacker, defender, baseAttack);
  const roll = rollCombat(rng, dice.attack, dice.defense);
  const distance = spotDistance(attacker.spots, defender.spots);
  const notes = [...dice.notes];
  const wounds = reduceWounds(state, defender, distance, roll.wounds, notes);
  events.push({
    type: "attackRolled",
    source: "attack",
    attackerId: attacker.figure.id,
    targetId: defender.figure.id,
    attack: roll.attack,
    defense: roll.defense,
    hits: roll.hits,
    blocks: roll.blocks,
    wounds,
    attackBonus: dice.attackBonus,
    defenseBonus: dice.defenseBonus,
    ...(notes.length > 0 ? { notes } : {}),
    ...(ability ? { ability } : {}),
  });
  const life = statsOf(defender.card, state.config.mode).life;
  woundFigure(state, defender.unit, defender.figure, wounds, life, "attack", events);
  afterAttack(state, ctx, attacker, defender, distance, roll.hits, roll.blocks, events);
}

export function attack(
  state: GameState,
  player: PlayerId,
  figureId: string,
  targetId: string,
  events: GameEvent[],
  ctx: RulesContext,
  ability?: string,
): void {
  if (state.active && state.active.player !== player) fail("It is not your turn");
  const problem = attackProblem(state, figureId, targetId, ctx, ability);
  if (problem) fail(problem);

  const a = findFigure(state, figureId)!;
  const t = findFigure(state, targetId)!;
  const attacker = combatant(a.unit, a.figure, ctx);
  const defender = combatant(t.unit, t.figure, ctx);
  const rng = new Rng(state.rng);
  const area = ability ? areaAttackOf(attacker.card, ability) : undefined;
  const mind = ability ? mindControlOf(attacker.card, ability) : undefined;

  if (area) {
    // The target takes the full blast; every other figure next to it takes the splash.
    const splashed: Combatant[] = [];
    for (const unit of state.units) {
      for (const figure of unit.figures) {
        if (figure.destroyed || !figure.position || figure.id === targetId || figure.id === figureId) continue;
        const c = combatant(unit, figure, ctx);
        if (spotDistance(c.spots, defender.spots) <= 1) splashed.push(c);
      }
    }
    resolve(state, ctx, rng, attacker, defender, area.dice, area.id, events);
    for (const c of splashed) {
      if (!c.figure.destroyed) resolve(state, ctx, rng, attacker, c, area.splashDice, area.id, events);
    }
  } else if (mind) {
    const roll = rng.d20();
    const success = roll >= mind.needed;
    events.push({ type: "abilityRoll", ability: mind.id, figureId, targetId, roll, needed: mind.needed, success });
    if (success) takeControl(state, player, defender, events);
  } else {
    resolve(state, ctx, rng, attacker, defender, statsOf(attacker.card, state.config.mode).attack, undefined, events);
  }

  state.rng = rng.state;
  const active = state.active!;
  active.attacked.push(figureId);
  active.attackLog.push({ attackerId: figureId, targetId });
  // Smoke Step: a short move after attacking.
  if (!attacker.figure.destroyed && hasAbility(state, attacker.card, "smoke-step")) {
    active.bonusMoves[figureId] = param(abilityOf(attacker.card, "smoke-step"), "move", 2);
  }
  checkGameOver(state, events, ctx);
}

/** Mind control: the figure leaves its unit and joins the controller's army as a unit of its own. */
function takeControl(state: GameState, player: PlayerId, target: Combatant, events: GameEvent[]): void {
  const from = target.unit;
  from.figures = from.figures.filter((f) => f.id !== target.figure.id);
  let n = state.units.filter((u) => u.owner === player).length;
  let id = `${player}:${n}`;
  while (state.units.some((u) => u.id === id)) id = `${player}:${++n}`;
  state.units.push({ id, cardId: from.cardId, owner: player, figures: [target.figure] });
  events.push({ type: "figureControlled", figureId: target.figure.id, fromUnitId: from.id, toUnitId: id, player });
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
