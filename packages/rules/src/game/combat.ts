import { rollCombat } from "../dice";
import { DIRECTIONS, hexAdd, hexDistance, hexEquals, hexKey, hexSub, isAdjacent } from "../hex";
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
  isPinned,
  mindControlOf,
  param,
  pullOf,
  reduceWounds,
  spotDistance,
  swapOf,
  targetingProblem,
  type Combatant,
  type ReachSpec,
} from "./abilities";
import { engagedEnemies, spotsEngaged } from "./engagement";
import { fail } from "./errors";
import { forcedMove, freeSpotFor } from "./movement";
import { figureSpots, placementSpots, standingElevation, tuningOf } from "./placement";
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
  const blocked = targetingProblem(state, ctx, combatant(a.unit, a.figure, ctx), combatant(t.unit, t.figure, ctx), distance);
  if (blocked) return blocked;

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
  const pull = pullOf(card, ability);
  if (pull) {
    const t = findFigure(state, targetId);
    if (t && t.unit.owner !== a.unit.owner) {
      const tCard = cardOf(t.unit, ctx);
      if (tCard.footprint !== "1" || (tCard.size !== "small" && tCard.size !== "medium")) {
        return "Only Small or Medium single-hex figures can be pulled";
      }
    }
    const problem = actionProblem(state, attackerId, targetId, ctx, { range: pull.range, minRange: 2, ignoresSight: false });
    if (problem) return problem;
    if (!pullSpot(state, ctx, combatant(a.unit, a.figure, ctx), combatant(t!.unit, t!.figure, ctx))) {
      return `There is no free hex next to ${card.name}`;
    }
    return null;
  }
  const swap = swapOf(card, ability);
  if (swap) return swapProblem(state, attackerId, targetId, ctx, swap);
  return "That power is not an attack";
}

/** Why a figure cannot swap places with a friend (Fae Step), or null if it can. */
function swapProblem(state: GameState, figureId: string, friendId: string, ctx: RulesContext, spec: ReachSpec): string | null {
  const active = state.active;
  if (state.phase !== "turns" || !active) return "No turn is in progress";
  const a = findFigure(state, figureId);
  if (!a || a.figure.destroyed || !a.figure.position) return "That figure is not on the battlefield";
  if (a.unit.id !== active.unitId) return "Only the activated unit can act this turn";
  if (active.attacked.includes(figureId)) return "That figure has already attacked this turn";
  const f = findFigure(state, friendId);
  if (!f || f.figure.destroyed || !f.figure.position || friendId === figureId) return "Choose another friendly figure";
  if (f.unit.owner !== a.unit.owner) return `${spec.name} only swaps places with a friendly figure`;
  const aCard = cardOf(a.unit, ctx);
  const fCard = cardOf(f.unit, ctx);
  if (aCard.footprint !== "1" || fCard.footprint !== "1") return "Only single-hex figures can swap places";
  if (isPinned(state, figureId) || isPinned(state, friendId)) return "A pinned figure cannot move";
  const distance = hexDistance(a.figure.position.hex, f.figure.position.hex);
  if (distance > spec.range) return `Out of range (${distance} hexes, range ${spec.range})`;
  const fits = (pos: Step, height: number) => placementSpots("1", height, { ...pos, rotation: 0 }, ctx) !== null;
  if (!fits(f.figure.position, aCard.height) || !fits(a.figure.position, fCard.height)) {
    return "One of them does not fit where the other stands";
  }
  return null;
}

/** Where Grapple Line drags its target: the free hex next to the puller closest to where the target stands. */
function pullSpot(state: GameState, ctx: RulesContext, puller: Combatant, target: Combatant): Step | null {
  const from = target.spots[0];
  if (!from) return null;
  let best: { step: Step; score: number[] } | null = null;
  for (const h of ctx.board.hexes()) {
    if (!puller.spots.some((s) => isAdjacent(s.hex, h)) || puller.spots.some((s) => hexEquals(s.hex, h))) continue;
    for (const surface of ctx.board.surfaces(h)) {
      const step = { hex: h, elevation: surface.elevation };
      if (!freeSpotFor(state, step, target.card.height, ctx, target.figure.id)) continue;
      const score = [hexDistance(h, from.hex), Math.abs(surface.elevation - from.elevation)];
      const better =
        !best ||
        score[0]! < best.score[0]! ||
        (score[0] === best.score[0] && (score[1]! < best.score[1]! || (score[1] === best.score[1] && hexKey(h) < hexKey(best.step.hex))));
      if (better) best = { step, score };
    }
  }
  return best?.step ?? null;
}

/** Where Shoulder Barge shoves a single-hex figure: one hex straight back, onto ground no higher than it stands. */
function shoveSpot(state: GameState, ctx: RulesContext, attacker: Combatant, target: Combatant): Step | null {
  const a = attacker.spots[0];
  const t = target.spots[0];
  if (!a || !t || attacker.spots.length !== 1 || target.spots.length !== 1) return null;
  const dir = hexSub(t.hex, a.hex);
  if (!DIRECTIONS.some((d) => hexEquals(d, dir))) return null;
  const hex = hexAdd(t.hex, dir);
  const height = target.card.height;
  const surface = ctx.board
    .surfaces(hex)
    .filter((s) => s.elevation <= t.elevation)
    .sort((x, y) => y.elevation - x.elevation)[0];
  if (!surface || surface.clearance < t.elevation - surface.elevation + height) return null;
  const step = { hex, elevation: surface.elevation };
  return freeSpotFor(state, step, height, ctx) ? step : null;
}

/** Can a figure (even one just destroyed) reach another with a normal attack? Used by Last Stand. */
function canReach(state: GameState, ctx: RulesContext, from: Combatant, to: Combatant): boolean {
  const mode = state.config.mode;
  const range = statsOf(from.card, mode).range;
  if (spotDistance(from.spots, to.spots) > range) return false;
  const strict = mode === "advanced";
  if (strict && range === 1 && !spotsEngaged(from.spots, from.card.height, to.spots, to.card.height)) return false;
  const blockers: Token[] = [];
  if (strict) {
    for (const unit of state.units) {
      const card = ctx.cards.get(unit.cardId);
      if (!card) continue;
      for (const figure of unit.figures) {
        if (figure.id === from.figure.id || figure.id === to.figure.id) continue;
        blockers.push(...tokens(figureSpots(figure, card.footprint, card.height, ctx), card.height));
      }
    }
  }
  return hasLineOfSight(ctx.board, tokens(from.spots, from.card.height), tokens(to.spots, to.card.height), { strict, blockers });
}

/** Enemy figures this figure could attack right now (with a special action, if given). */
export function attackTargets(state: GameState, figureId: string, ctx: RulesContext, ability?: string): string[] {
  const a = findFigure(state, figureId);
  if (!a) return [];
  const friendly = ability !== undefined && swapOf(cardOf(a.unit, ctx), ability) !== undefined;
  const targets: string[] = [];
  for (const unit of state.units) {
    if ((unit.owner === a.unit.owner) !== friendly) continue;
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
    defense: Math.max(0, tStats.defense + defenseBonus),
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
  afterAttack(state, ctx, rng, attacker, defender, distance, roll.hits, roll.blocks, wounds, events);

  // Last Stand: a destroyed figure strikes back at its attacker as it falls.
  const stand = hasAbility(state, defender.card, "last-stand") ? abilityOf(defender.card, "last-stand") : undefined;
  if (stand && defender.figure.destroyed && !attacker.figure.destroyed && attacker.figure.position && canReach(state, ctx, defender, attacker)) {
    events.push({
      type: "abilityUsed",
      ability: stand.id,
      figureId: defender.figure.id,
      targetId: attacker.figure.id,
      detail: `${stand.name}: strikes back as it falls`,
    });
    resolve(state, ctx, rng, defender, attacker, statsOf(defender.card, state.config.mode).attack, stand.id, events);
  }
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
  const pull = ability ? pullOf(attacker.card, ability) : undefined;
  const swap = ability ? swapOf(attacker.card, ability) : undefined;

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
  } else if (pull) {
    const spot = pullSpot(state, ctx, attacker, defender)!;
    events.push({
      type: "abilityUsed",
      ability: pull.id,
      figureId,
      targetId,
      detail: `${pull.name}: ${defender.card.name} is pulled in`,
    });
    forcedMove(state, defender.unit, defender.figure, spot, rng, events, ctx);
  } else if (swap) {
    const here = a.figure.position!;
    const there = t.figure.position!;
    a.figure.position = { hex: there.hex, elevation: there.elevation, rotation: 0 };
    t.figure.position = { hex: here.hex, elevation: here.elevation, rotation: 0 };
    events.push({
      type: "abilityUsed",
      ability: swap.id,
      figureId,
      targetId,
      detail: `${swap.name}: swaps places with ${defender.card.name}`,
    });
  } else {
    resolve(state, ctx, rng, attacker, defender, statsOf(attacker.card, state.config.mode).attack, undefined, events);
    // Shoulder Barge: a melee hit shoves the target one hex back.
    const shove = hasAbility(state, attacker.card, "shove") ? abilityOf(attacker.card, "shove") : undefined;
    if (shove && !attacker.figure.destroyed && !defender.figure.destroyed && defender.card.size !== "huge" && spotDistance(attacker.spots, defender.spots) <= 1) {
      const spot = shoveSpot(state, ctx, attacker, defender);
      events.push({
        type: "abilityUsed",
        ability: shove.id,
        figureId,
        targetId,
        detail: spot ? `${shove.name}: ${defender.card.name} is shoved back` : `${shove.name}: ${defender.card.name} has nowhere to go`,
      });
      if (spot) forcedMove(state, defender.unit, defender.figure, spot, rng, events, ctx);
    }
  }

  state.rng = rng.state;
  const active = state.active!;
  active.attacked.push(figureId);
  active.attackLog.push({ attackerId: figureId, targetId });
  // Smoke Step: a short move after attacking.
  if (!attacker.figure.destroyed && hasAbility(state, attacker.card, "smoke-step")) {
    active.bonusMoves[figureId] = param(abilityOf(attacker.card, "smoke-step"), "move", 2);
  }
  // Corpse Feast: a kill earns a short move.
  if (!attacker.figure.destroyed && t.figure.destroyed && !ability && hasAbility(state, attacker.card, "corpse-feast")) {
    active.bonusMoves[figureId] = param(abilityOf(attacker.card, "corpse-feast"), "move", 2);
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
