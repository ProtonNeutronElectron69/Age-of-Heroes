import { DEFENSE_DIE, countFaces, rollCombat, rollDice } from "../dice";
import { DIRECTIONS, hexAdd, hexDistance, hexEquals, hexKey, hexSub, isAdjacent, type Hex } from "../hex";
import { hasLineOfSight } from "../los";
import { Rng } from "../rng";
import { isUnique } from "../schema";
import {
  abilityOf,
  areaAttackOf,
  combatant,
  freeSpotNear,
  hasAbility,
  ignoresSwamp,
  isPinned,
  mindControlOf,
  param,
  onWetTerrain,
  POWER_COMMAND_KINDS,
  powerOf,
  pullOf,
  spotDistance,
  swapOf,
  targetingProblem,
  type AreaAttackSpec,
  type Combatant,
  type PowerSpec,
  type ReachSpec,
} from "./abilities";
import { engagedEnemies, spotsEngaged } from "./engagement";
import { faceTowardsMiddle, facingOf, seesAny } from "./facing";
import { glyphBonus } from "./glyphs";
import { fail } from "./errors";
import { forcedMove, freeSpotFor } from "./movement";
import { figureSpots, placementSpots } from "./placement";
import { cardOf, findFigure, statsOf } from "./queries";
import { checkGameOver, destroyFigure, woundFigure } from "./rounds";
import { figureInSight, sightBlockers, spotInSight } from "./sight";
import { canReach, resolve, tokens } from "./strike";
import type { ActiveTurn, GameEvent, GameState, PlayerId, RulesContext, Step, UnitState } from "./types";


interface Reach {
  readonly range: number;
  readonly minRange: number;
  readonly ignoresSight: boolean;
  /** A special action rather than the normal attack (games with `engagedSpecials` let an engaged figure use it). */
  readonly special?: boolean;
  /** Strikes all round, whichever way the figure faces (Circle Cut). */
  readonly anyFacing?: boolean;
}

/**
 * Has the figure already used its attack this turn? An extra attack (Blood Surge, Second Arrow,
 * Twin Cannons) lets it make one more normal attack; special actions never use one.
 */
function attackUsed(active: ActiveTurn, figureId: string, special: boolean): boolean {
  if (!active.attacked.includes(figureId)) return false;
  return special || !((active.extraAttacks?.[figureId] ?? 0) > 0);
}

/** Living figures (other than `except`) that can see the target, for Spotter's Call. */
function seenByFriend(state: GameState, ctx: RulesContext, attacker: Combatant, target: Combatant, range: number): boolean {
  for (const unit of state.units) {
    if (unit.owner !== attacker.unit.owner) continue;
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position || figure.id === attacker.figure.id) continue;
      const friend = combatant(unit, figure, ctx);
      if (spotDistance(friend.spots, target.spots) > range) continue;
      if (inSight(state, ctx, friend, target)) return true;
    }
  }
  return false;
}

/** Can one figure see another past the terrain and every other figure? */
function inSight(state: GameState, ctx: RulesContext, from: Combatant, to: Combatant): boolean {
  return figureInSight(state, ctx, from, to);
}

/** Spotter's Call: a normal attack at an enemy the attacker cannot see but a friend near it can. */
export function spottedAttack(state: GameState, attackerId: string, targetId: string, ctx: RulesContext): boolean {
  const a = findFigure(state, attackerId);
  const t = findFigure(state, targetId);
  if (!a || !t || !a.figure.position || !t.figure.position) return false;
  const attacker = combatant(a.unit, a.figure, ctx);
  const spotter = abilityOf(attacker.card, "spotters-call");
  if (!spotter) return false;
  const target = combatant(t.unit, t.figure, ctx);
  return !inSight(state, ctx, attacker, target) && seenByFriend(state, ctx, attacker, target, param(spotter, "range", 3));
}

/** Why an attack-like action from one figure at another is not allowed, or null if it is. */
function actionProblem(state: GameState, attackerId: string, targetId: string, ctx: RulesContext, reach: Reach): string | null {
  const active = state.active;
  if (state.phase !== "turns" || !active) return "No turn is in progress";
  const a = findFigure(state, attackerId);
  if (!a || a.figure.destroyed || !a.figure.position) return "That figure is not on the battlefield";
  if (a.unit.id !== active.unitId) return "Only the activated unit can attack this turn";
  if (attackUsed(active, attackerId, !!reach.special)) return "That figure has already attacked this turn";
  const t = findFigure(state, targetId);
  if (!t || t.figure.destroyed || !t.figure.position) return "That target is not on the battlefield";
  if (t.unit.owner === a.unit.owner) return "You cannot attack your own figures";

  const aCard = cardOf(a.unit, ctx);
  const tCard = cardOf(t.unit, ctx);
  const aHeight = statsOf(aCard).height;
  const tHeight = statsOf(tCard).height;
  const aSpots = figureSpots(a.figure, aCard.footprint, aHeight, ctx);
  const tSpots = figureSpots(t.figure, tCard.footprint, tHeight, ctx);
  const distance = spotDistance(aSpots, tSpots);
  if (distance > reach.range) return `Out of range (${distance} hexes, range ${reach.range})`;
  if (distance < reach.minRange) return `Too close (needs at least ${reach.minRange} hexes)`;
  const blocked = targetingProblem(state, ctx, combatant(a.unit, a.figure, ctx), combatant(t.unit, t.figure, ctx), distance);
  if (blocked) return blocked;

  const engaged = engagedEnemies(state, a.unit.owner, aSpots, aHeight, ctx);
  const withTarget = spotsEngaged(aSpots, aHeight, tSpots, tHeight);
  // Engagement limits the normal attack; with `engagedSpecials`, not the special actions.
  const freeOfEngagement = reach.special === true && !!state.config.engagedSpecials;
  if (engaged.length > 0 && !withTarget && !freeOfEngagement) return "An engaged figure can only attack enemies it is engaged with";
  if (reach.range === 1 && !withTarget) return "Too far above or below to reach";
  const facing = facingOf(state, a.figure);
  if (!reach.anyFacing && facing !== null && !seesAny(facing, aSpots, tSpots)) return "Out of view: the target must be in front of the attacker";
  if (reach.ignoresSight) return null;

  const attacker = combatant(a.unit, a.figure, ctx);
  const target = combatant(t.unit, t.figure, ctx);
  if (!inSight(state, ctx, attacker, target)) {
    // Spotter's Call: a normal shot may go where a friend near the target can see.
    const spotter = !reach.special ? abilityOf(aCard, "spotters-call") : undefined;
    if (spotter && seenByFriend(state, ctx, attacker, target, param(spotter, "range", 3))) return null;
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
  aim?: Hex,
): string | null {
  const a = findFigure(state, attackerId);
  if (!a) return "That figure is not on the battlefield";
  const card = cardOf(a.unit, ctx);
  if (aim) {
    const area = ability ? areaAttackOf(card, ability) : undefined;
    if (!area) return "Only a blast is aimed at a hex";
    const problem = actionProblem(state, attackerId, targetId, ctx, { ...area, special: true });
    return problem ?? aimProblem(state, attackerId, targetId, aim, ctx, area);
  }
  if (!ability) {
    return actionProblem(state, attackerId, targetId, ctx, {
      range: statsOf(card).range + glyphBonus(state, a.unit.id, "range", ctx),
      minRange: 1,
      ignoresSight: false,
    });
  }
  if (!abilityOf(card, ability)) return "That figure has no such power";
  const area = areaAttackOf(card, ability);
  if (area) return actionProblem(state, attackerId, targetId, ctx, { ...area, special: true });
  const mind = mindControlOf(card, ability);
  if (mind) {
    const t = findFigure(state, targetId);
    if (t) {
      const tCard = cardOf(t.unit, ctx);
      if (isUnique(tCard)) return "Unique figures cannot be controlled";
      if (tCard.size !== "small" && tCard.size !== "medium") return "Only Small or Medium figures can be controlled";
    }
    return actionProblem(state, attackerId, targetId, ctx, { range: mind.range, minRange: 1, ignoresSight: false, special: true });
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
    const problem = actionProblem(state, attackerId, targetId, ctx, { range: pull.range, minRange: 2, ignoresSight: false, special: true });
    if (problem) return problem;
    if (!pullSpot(state, ctx, combatant(a.unit, a.figure, ctx), combatant(t!.unit, t!.figure, ctx))) {
      return `There is no free hex next to ${card.name}`;
    }
    return null;
  }
  const swap = swapOf(card, ability);
  if (swap) return swapProblem(state, attackerId, targetId, ctx, swap);
  const power = powerOf(card, ability);
  if (power) return targetedPowerProblem(state, attackerId, targetId, ctx, power);
  return "That power is not an attack";
}

/** Why a power aimed at a figure (Life Tap, Constrict, Circle Cut, or the target of a Hurl) cannot be used on it. */
function targetedPowerProblem(state: GameState, attackerId: string, targetId: string, ctx: RulesContext, power: PowerSpec): string | null {
  const t = findFigure(state, targetId);
  const tCard = t ? cardOf(t.unit, ctx) : undefined;
  const smallOrMedium = tCard !== undefined && (tCard.size === "small" || tCard.size === "medium");
  switch (power.kind) {
    case "drain":
      return actionProblem(state, attackerId, targetId, ctx, { range: power.range, minRange: 1, ignoresSight: false, special: true });
    case "crush":
      if (tCard && isUnique(tCard)) return `${power.name} cannot destroy a unique figure`;
      if (tCard && !smallOrMedium) return `${power.name} works only on Small or Medium figures`;
      return actionProblem(state, attackerId, targetId, ctx, { range: 1, minRange: 1, ignoresSight: false, special: true });
    case "sweep":
      return actionProblem(state, attackerId, targetId, ctx, { range: 1, minRange: 1, ignoresSight: false, special: true, anyFacing: true });
    case "throw": {
      if (tCard && (tCard.footprint !== "1" || !smallOrMedium)) return `${power.name} works only on Small or Medium single-hex figures`;
      const problem = actionProblem(state, attackerId, targetId, ctx, { range: 1, minRange: 1, ignoresSight: false, special: true });
      if (problem) return problem;
      return hurlSpots(state, attackerId, targetId, ctx).length > 0 ? null : "There is nowhere to throw it";
    }
    default:
      return `${power.name} is not aimed at a figure`;
  }
}

/** Why a blast cannot be aimed at this hex of its target: it must be one of the target's hexes, within the blast's range. */
function aimProblem(state: GameState, attackerId: string, targetId: string, aim: Hex, ctx: RulesContext, area: AreaAttackSpec): string | null {
  const a = findFigure(state, attackerId)!;
  const t = findFigure(state, targetId)!;
  const target = combatant(t.unit, t.figure, ctx);
  const spot = target.spots.find((s) => hexEquals(s.hex, aim));
  if (!spot) return "Aim at one of the target's hexes";
  const distance = spotDistance(combatant(a.unit, a.figure, ctx).spots, [spot]);
  if (distance > area.range) return `That hex is out of range (${distance} hexes, range ${area.range})`;
  if (distance < area.minRange) return `That hex is too close (needs at least ${area.minRange} hexes)`;
  return null;
}

/**
 * Why a blast cannot be aimed at this empty hex, or null if it can. Only a blast that may be aimed at
 * a hex (`hexTarget`) can; the hex must be an empty surface within range, and in sight unless the
 * blast needs none. An engaged figure may only attack the enemies it is engaged with, so it cannot,
 * unless the game lets engaged figures use special actions (`engagedSpecials`).
 */
export function blastProblem(state: GameState, attackerId: string, at: Step, ctx: RulesContext, ability: string): string | null {
  const active = state.active;
  if (state.phase !== "turns" || !active) return "No turn is in progress";
  const a = findFigure(state, attackerId);
  if (!a || a.figure.destroyed || !a.figure.position) return "That figure is not on the battlefield";
  if (a.unit.id !== active.unitId) return "Only the activated unit can attack this turn";
  if (active.attacked.includes(attackerId)) return "That figure has already attacked this turn";
  const card = cardOf(a.unit, ctx);
  if (!abilityOf(card, ability)) return "That figure has no such power";
  const area = areaAttackOf(card, ability);
  if (!area) return "That power is not a blast";
  if (!area.hexTarget) return `${area.name} must be aimed at a figure`;
  if (!ctx.board.surfaces(at.hex).some((s) => s.elevation === at.elevation)) return "There is no ground there";
  if (figuresAt(state, ctx, at.hex).length > 0) return "Someone stands there: aim at the figure instead";
  const attacker = combatant(a.unit, a.figure, ctx);
  const distance = spotDistance(attacker.spots, [at]);
  if (distance > area.range) return `Out of range (${distance} hexes, range ${area.range})`;
  if (distance < area.minRange) return `Too close (needs at least ${area.minRange} hexes)`;
  if (!state.config.engagedSpecials && engagedEnemies(state, a.unit.owner, attacker.spots, attacker.card.height, ctx).length > 0) {
    return "An engaged figure can only attack enemies it is engaged with";
  }
  const facing = facingOf(state, a.figure);
  if (facing !== null && !seesAny(facing, attacker.spots, [at])) return "Out of view: the target must be in front of the attacker";
  if (area.ignoresSight) return null;
  // The hex is in sight if a figure of Height 1 standing there could be seen.
  if (!spotInSight(state, ctx, tokens(attacker.spots, attacker.card.height), at, [attackerId])) {
    return "No line of sight";
  }
  return null;
}

/** Every empty hex a blast that may be aimed at a hex could be aimed at right now. */
export function blastSpots(state: GameState, attackerId: string, ctx: RulesContext, ability: string): Step[] {
  const a = findFigure(state, attackerId);
  if (!a?.figure.position) return [];
  const area = areaAttackOf(cardOf(a.unit, ctx), ability);
  if (!area?.hexTarget) return [];
  const spots: Step[] = [];
  for (const h of ctx.board.hexes()) {
    if (hexDistance(h, a.figure.position.hex) > area.range + 3) continue;
    for (const surface of ctx.board.surfaces(h)) {
      const at = { hex: h, elevation: surface.elevation };
      if (blastProblem(state, attackerId, at, ctx, ability) === null) spots.push(at);
    }
  }
  return spots;
}

/** Living figures with a hex at `h`, at any height. */
function figuresAt(state: GameState, ctx: RulesContext, h: Hex): Combatant[] {
  const found: Combatant[] = [];
  for (const unit of state.units) {
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position) continue;
      const c = combatant(unit, figure, ctx);
      if (c.spots.some((s) => hexEquals(s.hex, h))) found.push(c);
    }
  }
  return found;
}

/**
 * The figures a blast centred on `centre` splashes: every living figure with a hex next to it,
 * except the attacker and those already hit in full. Each figure is hit once, however many of its
 * hexes are near.
 */
function splashedBy(state: GameState, ctx: RulesContext, centre: readonly Step[], except: readonly string[]): Combatant[] {
  const found: Combatant[] = [];
  for (const unit of state.units) {
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position || except.includes(figure.id)) continue;
      const c = combatant(unit, figure, ctx);
      if (spotDistance(c.spots, centre) <= 1) found.push(c);
    }
  }
  return found;
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

export function attack(
  state: GameState,
  player: PlayerId,
  figureId: string,
  targetId: string,
  events: GameEvent[],
  ctx: RulesContext,
  ability?: string,
  aim?: Hex,
): void {
  if (state.active && state.active.player !== player) fail("It is not your turn");
  const problem = attackProblem(state, figureId, targetId, ctx, ability, aim);
  if (problem) fail(problem);

  const a = findFigure(state, figureId)!;
  const t = findFigure(state, targetId)!;
  const attacker = combatant(a.unit, a.figure, ctx);
  const defender = combatant(t.unit, t.figure, ctx);
  const active = state.active!;
  const power = ability ? powerOf(attacker.card, ability) : undefined;
  if (power && (POWER_COMMAND_KINDS as readonly string[]).includes(power.kind)) fail(`${power.name} needs a place to aim it: use the power`);
  const rng = new Rng(state.rng);
  const area = ability ? areaAttackOf(attacker.card, ability) : undefined;
  const mind = ability ? mindControlOf(attacker.card, ability) : undefined;
  const pull = ability ? pullOf(attacker.card, ability) : undefined;
  const swap = ability ? swapOf(attacker.card, ability) : undefined;
  // A second normal attack this turn uses up one of the figure's extra attacks.
  const extra = active.attacked.includes(figureId);
  if (extra) active.extraAttacks![figureId]! -= 1;
  const spotted = !ability && spottedAttack(state, figureId, targetId, ctx);
  const lost = !swap && loseNerve(state, ctx, rng, attacker, events);

  if (lost) {
    // Grave Dread: the attack is lost, but it counts as made.
  } else if (area) {
    // The target takes the full blast; every other figure next to the aimed hex takes the splash, once.
    // Older saves aimed at no hex: their blasts splash round every hex of the target, as they did then.
    const centre = aim ? defender.spots.filter((s) => hexEquals(s.hex, aim)) : defender.spots;
    const splashed = splashedBy(state, ctx, centre, [targetId, figureId]);
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
  } else if (power?.kind === "drain") {
    // Life Tap: the attacker removes a wound for each wound it deals.
    const dealt = resolve(state, ctx, rng, attacker, defender, power.dice, power.id, events);
    const amount = Math.min(dealt, attacker.figure.wounds);
    if (amount > 0 && !attacker.figure.destroyed) {
      attacker.figure.wounds -= amount;
      events.push({ type: "figureHealed", figureId, amount, total: attacker.figure.wounds });
      events.push({ type: "abilityUsed", ability: power.id, figureId, detail: `${power.name}: ${amount} wound${amount === 1 ? "" : "s"} removed` });
    }
  } else if (power?.kind === "crush") {
    // Constrict: a d20; on a high roll the target is destroyed outright.
    const roll = rng.d20();
    const success = roll >= power.needed;
    events.push({ type: "abilityRoll", ability: power.id, figureId, targetId, roll, needed: power.needed, success });
    if (success) destroyFigure(defender.unit, defender.figure, "ability", events);
  } else if (power?.kind === "sweep") {
    // Circle Cut: a normal attack on every enemy next to the figure, one after another.
    const victims = sweepTargets(state, figureId, ctx);
    events.push({ type: "abilityUsed", ability: power.id, figureId, detail: `${power.name}: strikes at ${victims.length} enem${victims.length === 1 ? "y" : "ies"}` });
    for (const id of victims) {
      const v = findFigure(state, id);
      if (!v || v.figure.destroyed || attacker.figure.destroyed) continue;
      resolve(state, ctx, rng, attacker, combatant(v.unit, v.figure, ctx), statsOf(attacker.card).attack, power.id, events);
    }
  } else {
    // Numbing Glare: a d20 before the attack; on a success a Small or Medium target rolls no defense dice.
    const glare = abilityOf(attacker.card, "numbing-glare");
    let numbed: string | undefined;
    if (glare && (defender.card.size === "small" || defender.card.size === "medium")) {
      const roll = rng.d20();
      const needed = param(glare, "needed", 14);
      events.push({ type: "abilityRoll", ability: glare.id, figureId, targetId, roll, needed, success: roll >= needed });
      if (roll >= needed) numbed = glare.name;
    }
    // Spotter's Call: a shot at an enemy only a friend can see rolls fewer dice.
    const spotter = spotted ? abilityOf(attacker.card, "spotters-call") : undefined;
    const cut = spotter ? param(spotter, "reduce", 1) : 0;
    const struckAt = defender.spots.map((s) => ({ ...s }));
    resolve(state, ctx, rng, attacker, defender, statsOf(attacker.card).attack - cut, undefined, events, numbed, spotter ? [`${spotter.name}: a friend spots the target, -${cut} attack`] : []);
    // Shoulder Barge: a melee hit shoves the target one hex back.
    const shove = hasAbility(attacker.card, "shove") ? abilityOf(attacker.card, "shove") : undefined;
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
    // Piercing Bolts: the bolt flies on to the next figure behind the target.
    const bolt = abilityOf(attacker.card, "bolt-through");
    if (bolt && !attacker.figure.destroyed) {
      const next = boltTarget(state, ctx, attacker, struckAt, defender.figure.id);
      if (next) {
        events.push({ type: "abilityUsed", ability: bolt.id, figureId, targetId: next.figure.id, detail: `${bolt.name}: the bolt flies on into ${next.card.name}` });
        resolve(state, ctx, rng, attacker, next, statsOf(attacker.card).attack - param(bolt, "reduce", 1), bolt.id, events);
      }
    }
  }

  // After a normal attack: more attacks this turn (Twin Cannons, Blood Surge, Second Arrow).
  if (!ability && !lost && !attacker.figure.destroyed) grantExtraAttacks(state, rng, attacker, extra, t.figure.destroyed, events);
  state.rng = rng.state;
  if (!active.attacked.includes(figureId)) active.attacked.push(figureId);
  active.attackLog.push({ attackerId: figureId, targetId });
  stopTurning(state, figureId);
  // Smoke Step: a short move after attacking.
  if (!attacker.figure.destroyed && hasAbility(attacker.card, "smoke-step")) {
    active.bonusMoves[figureId] = param(abilityOf(attacker.card, "smoke-step"), "move", 2);
  }
  // Corpse Feast: a kill earns a short move.
  if (!attacker.figure.destroyed && t.figure.destroyed && !ability && hasAbility(attacker.card, "corpse-feast")) {
    active.bonusMoves[figureId] = param(abilityOf(attacker.card, "corpse-feast"), "move", 2);
  }
  checkGameOver(state, events, ctx);
}

/**
 * More normal attacks after one: Twin Cannons (a second, if the figure has not moved), Blood Surge
 * (a d20 after the first, for one more) and Second Arrow (one more after a kill, once a turn).
 */
function grantExtraAttacks(state: GameState, rng: Rng, attacker: Combatant, extra: boolean, killed: boolean, events: GameEvent[]): void {
  const active = state.active!;
  const id = attacker.figure.id;
  const grant = (n: number) => {
    const extras = (active.extraAttacks ??= {});
    extras[id] = (extras[id] ?? 0) + n;
  };
  const once = (key: string): boolean => {
    const used = (active.once ??= []);
    if (used.includes(key)) return false;
    used.push(key);
    return true;
  };
  const twin = abilityOf(attacker.card, "twin-cannons");
  if (twin && !extra && !active.moved.includes(id)) {
    grant(param(twin, "attacks", 2) - 1);
    events.push({ type: "abilityUsed", ability: twin.id, figureId: id, detail: `${twin.name}: it may attack again` });
  }
  const surge = abilityOf(attacker.card, "blood-surge");
  if (surge && !extra && once(`blood-surge:${id}`)) {
    const roll = rng.d20();
    const needed = param(surge, "needed", 15);
    events.push({ type: "abilityRoll", ability: surge.id, figureId: id, targetId: id, roll, needed, success: roll >= needed });
    if (roll >= needed) grant(1);
  }
  const arrow = abilityOf(attacker.card, "second-arrow");
  if (arrow && killed && once(`second-arrow:${id}`)) {
    grant(1);
    events.push({ type: "abilityUsed", ability: arrow.id, figureId: id, detail: `${arrow.name}: it may attack again` });
  }
}

/**
 * Grave Dread: an enemy figure next to a figure with it rolls the d20 before it attacks (or uses a
 * special action), and on a low roll loses its nerve: the attack is lost. Returns true if it was.
 */
function loseNerve(state: GameState, ctx: RulesContext, rng: Rng, attacker: Combatant, events: GameEvent[]): boolean {
  for (const unit of state.units) {
    if (unit.owner === attacker.unit.owner) continue;
    const card = ctx.cards.get(unit.cardId);
    const dread = card ? abilityOf(card, "grave-dread") : undefined;
    if (!card || !dread) continue;
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position) continue;
      if (spotDistance(figureSpots(figure, card.footprint, card.height, ctx), attacker.spots) > 1) continue;
      const failOn = param(dread, "failOnOrBelow", 6);
      const roll = rng.d20();
      const held = roll > failOn;
      events.push({ type: "abilityRoll", ability: dread.id, figureId: figure.id, targetId: attacker.figure.id, roll, needed: failOn + 1, success: held });
      if (!held) {
        events.push({ type: "abilityUsed", ability: dread.id, figureId: figure.id, targetId: attacker.figure.id, detail: `${dread.name}: ${attacker.card.name} loses its nerve and the attack is lost` });
      }
      return !held;
    }
  }
  return false;
}

/** Circle Cut: every enemy figure the figure could strike right now with it, all round. */
export function sweepTargets(state: GameState, figureId: string, ctx: RulesContext): string[] {
  const a = findFigure(state, figureId);
  const power = a ? powerOf(cardOf(a.unit, ctx), "circle-cut") : undefined;
  if (!a || !power) return [];
  const result: string[] = [];
  for (const unit of state.units) {
    if (unit.owner === a.unit.owner) continue;
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position) continue;
      if (spotDistance(combatant(a.unit, a.figure, ctx).spots, combatant(unit, figure, ctx).spots) > 1) continue;
      if (!spotsEngaged(combatant(a.unit, a.figure, ctx).spots, cardOf(a.unit, ctx).height, combatant(unit, figure, ctx).spots, cardOf(unit, ctx).height)) continue;
      result.push(figure.id);
    }
  }
  return result;
}

/**
 * Piercing Bolts: the next figure behind the target, in a straight line from the attacker and within
 * its range and sight, or null. Only a straight line along a row of hexes counts.
 */
function boltTarget(state: GameState, ctx: RulesContext, attacker: Combatant, struckAt: readonly Step[], struckId: string): Combatant | null {
  const from = attacker.spots[0];
  const at = struckAt[0];
  if (!from || !at || attacker.spots.length !== 1 || struckAt.length !== 1) return null;
  const n = hexDistance(from.hex, at.hex);
  const d = hexSub(at.hex, from.hex);
  const dir = { q: d.q / n, r: d.r / n };
  if (!DIRECTIONS.some((x) => x.q === dir.q && x.r === dir.r)) return null;
  const range = statsOf(attacker.card).range + glyphBonus(state, attacker.unit.id, "range", ctx);
  for (let k = n + 1; k <= range; k++) {
    const h = { q: from.hex.q + dir.q * k, r: from.hex.r + dir.r * k };
    if (ctx.board.surfaces(h).length === 0) return null;
    const there = figuresAt(state, ctx, h).filter((c) => c.figure.id !== struckId && c.figure.id !== attacker.figure.id);
    if (there.length === 0) continue;
    const next = there[0]!;
    return figureInSight(state, ctx, attacker, next, [struckId]) ? next : null;
  }
  return null;
}

/** A figure that attacks can no longer be turned this turn. */
function stopTurning(state: GameState, figureId: string): void {
  const active = state.active;
  if (active?.turnable) active.turnable = active.turnable.filter((id) => id !== figureId);
}

/** A blast aimed at an empty hex (`blast` command): every figure next to the hex takes the splash dice, once. */
export function blastHex(
  state: GameState,
  player: PlayerId,
  figureId: string,
  ability: string,
  at: Step,
  events: GameEvent[],
  ctx: RulesContext,
): void {
  if (state.active && state.active.player !== player) fail("It is not your turn");
  const problem = blastProblem(state, figureId, at, ctx, ability);
  if (problem) fail(problem);
  const a = findFigure(state, figureId)!;
  const attacker = combatant(a.unit, a.figure, ctx);
  const area = areaAttackOf(attacker.card, ability)!;
  events.push({ type: "abilityUsed", ability, figureId, detail: `${area.name} lands on an empty hex` });
  const rng = new Rng(state.rng);
  if (!loseNerve(state, ctx, rng, attacker, events)) {
    for (const c of splashedBy(state, ctx, [at], [figureId])) {
      if (!c.figure.destroyed) resolve(state, ctx, rng, attacker, c, area.splashDice, area.id, events);
    }
  }
  state.rng = rng.state;
  const active = state.active!;
  active.attacked.push(figureId);
  stopTurning(state, figureId);
  if (!attacker.figure.destroyed && hasAbility(attacker.card, "smoke-step")) {
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
  const stats = statsOf(card);
  const rng = new Rng(state.rng);
  // Long Strides and Mire Skin: swamp never wounds these figures.
  if (ignoresSwamp(card)) return;
  for (const figure of unit.figures) {
    const spots = figureSpots(figure, card.footprint, stats.height, ctx);
    // A figure rolls once, however many of its hexes are on swamp.
    const terrains = spots.map((s) => ctx.board.surfaceAt(s.hex, s.elevation)?.terrain);
    if (state.config.swampRoll === "d20") {
      const t = terrains.map((id) => (id ? ctx.terrain.get(id) : undefined)).find((r) => r?.endTurnRoll !== undefined);
      if (!t) continue;
      const { woundOnOrBelow, wounds } = t.endTurnRoll!;
      const roll = rng.d20();
      const hurt = roll <= woundOnOrBelow;
      events.push({ type: "terrainRoll", figureId: figure.id, terrain: t.id, roll, outcome: hurt ? "wounded" : "safe" });
      if (hurt) woundFigure(state, unit, figure, wounds, stats.life, "swamp", events);
      continue;
    }
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

// ---------------------------------------------------------------------------
// Powers: special actions with a place or a unit to aim at (the `power` command)

/** What a power is aimed at: a figure (Hurl), a unit (Bonecall, Call to Arms) or a hex (Hurl's landing, Fire Breath's direction). */
export interface PowerAim {
  readonly targetId?: string;
  readonly unitId?: string;
  readonly at?: Step;
}

/** Species Bonecall can raise. */
export const RAISE_SPECIES: readonly string[] = ["Orc", "Undead"];

/** Why the acting figure cannot use a power now, or null. */
function powerBasics(state: GameState, figureId: string, ability: string, ctx: RulesContext): { problem: string } | { power: PowerSpec; actor: Combatant } {
  const active = state.active;
  if (state.phase !== "turns" || !active) return { problem: "No turn is in progress" };
  const a = findFigure(state, figureId);
  if (!a || a.figure.destroyed || !a.figure.position) return { problem: "That figure is not on the battlefield" };
  if (a.unit.id !== active.unitId) return { problem: "Only the activated unit can act this turn" };
  const power = powerOf(cardOf(a.unit, ctx), ability);
  if (!power) return { problem: "That figure has no such power" };
  if (power.kind !== "orders" && active.attacked.includes(figureId)) return { problem: "That figure has already attacked this turn" };
  return { power, actor: combatant(a.unit, a.figure, ctx) };
}

/** Why a power cannot be used this way, or null if it can. */
export function powerProblem(state: GameState, figureId: string, ability: string, aim: PowerAim, ctx: RulesContext): string | null {
  const basics = powerBasics(state, figureId, ability, ctx);
  if ("problem" in basics) return basics.problem;
  const { power, actor } = basics;
  switch (power.kind) {
    case "throw": {
      if (!aim.targetId || !aim.at) return `${power.name} needs a figure to throw and a place to throw it`;
      const problem = attackProblem(state, figureId, aim.targetId, ctx, ability);
      if (problem) return problem;
      return hurlSpots(state, figureId, aim.targetId, ctx).some((s) => sameStep(s, aim.at!)) ? null : "It cannot be thrown there";
    }
    case "stomp":
      return null;
    case "breath":
      if (!aim.at) return `Choose which way ${power.name} goes`;
      return breathLine(state, figureId, aim.at.hex, ctx) ? null : `${power.name} goes along a row of hexes from the figure, in front of it`;
    case "raise":
      if (!aim.unitId) return `Choose a squad for ${power.name}`;
      return raiseUnits(state, figureId, ctx).includes(aim.unitId) ? null : `${power.name} needs a friendly Orc or Undead squad with a fallen figure, and room next to ${actor.card.name}`;
    case "orders":
      if (!aim.unitId) return `Choose a squad for ${power.name}`;
      if ((state.called ?? []).includes(actor.unit.id)) return `${power.name} has been used this round`;
      return callUnits(state, figureId, ctx).includes(aim.unitId) ? null : `${power.name} needs a friendly Disciplined squad within ${power.range} hexes`;
    default:
      return `${power.name} is aimed at a figure: attack with it`;
  }
}

/** Use a power (`power` command). Every power but Call to Arms counts as the figure's attack. */
export function usePower(state: GameState, player: PlayerId, figureId: string, ability: string, aim: PowerAim, events: GameEvent[], ctx: RulesContext): void {
  if (state.active && state.active.player !== player) fail("It is not your turn");
  const problem = powerProblem(state, figureId, ability, aim, ctx);
  if (problem) fail(problem);
  const active = state.active!;
  const a = findFigure(state, figureId)!;
  const actor = combatant(a.unit, a.figure, ctx);
  const power = powerOf(actor.card, ability)!;

  if (power.kind === "orders") {
    active.callUnit = aim.unitId!;
    events.push({ type: "abilityUsed", ability, figureId, detail: `${power.name}: the ${cardName(state, aim.unitId!, ctx)} will take a turn when this one ends` });
    return;
  }

  const rng = new Rng(state.rng);
  const lost = power.kind !== "raise" && loseNerve(state, ctx, rng, actor, events);
  if (!lost) {
    if (power.kind === "throw") hurl(state, ctx, rng, actor, power, aim.targetId!, aim.at!, events);
    else if (power.kind === "stomp") stomp(state, ctx, rng, actor, power, events);
    else if (power.kind === "breath") breathe(state, ctx, rng, actor, power, aim.at!.hex, events);
    else if (power.kind === "raise") raise(state, ctx, actor, power, aim.unitId!, events);
  }
  state.rng = rng.state;
  if (!active.attacked.includes(figureId)) active.attacked.push(figureId);
  stopTurning(state, figureId);
  checkGameOver(state, events, ctx);
}

const sameStep = (x: Step, y: Step) => hexEquals(x.hex, y.hex) && x.elevation === y.elevation;

function cardName(state: GameState, unitId: string, ctx: RulesContext): string {
  const unit = state.units.find((u) => u.id === unitId);
  return unit ? cardOf(unit, ctx).name : "squad";
}

/** Hurl: every free spot the figure could throw the target onto, within the power's reach and in its sight. */
export function hurlSpots(state: GameState, figureId: string, targetId: string, ctx: RulesContext): Step[] {
  const a = findFigure(state, figureId);
  const t = findFigure(state, targetId);
  if (!a?.figure.position || !t?.figure.position) return [];
  const power = powerOf(cardOf(a.unit, ctx), "hurl");
  if (!power) return [];
  const actor = combatant(a.unit, a.figure, ctx);
  const target = combatant(t.unit, t.figure, ctx);
  const blockers = sightBlockers(state, ctx, [figureId, targetId]);
  const spots: Step[] = [];
  for (const h of ctx.board.hexes()) {
    const reach = Math.min(...actor.spots.map((s) => hexDistance(s.hex, h)));
    if (reach < 1 || reach > power.range) continue;
    for (const surface of ctx.board.surfaces(h)) {
      const at = { hex: h, elevation: surface.elevation };
      if (target.spots.some((s) => sameStep(s, at))) continue;
      if (!freeSpotFor(state, at, target.card.height, ctx, targetId)) continue;
      if (!hasLineOfSight(ctx.board, tokens(actor.spots, actor.card.height), [{ ...at, height: 1 }], blockers)) continue;
      spots.push(at);
    }
  }
  return spots;
}

function hurl(state: GameState, ctx: RulesContext, rng: Rng, actor: Combatant, power: PowerSpec, targetId: string, at: Step, events: GameEvent[]): void {
  const t = findFigure(state, targetId)!;
  const card = cardOf(t.unit, ctx);
  events.push({ type: "abilityUsed", ability: power.id, figureId: actor.figure.id, targetId, detail: `${power.name}: ${card.name} is thrown` });
  forcedMove(state, t.unit, t.figure, at, rng, events, ctx);
  if (!t.figure.destroyed) woundFigure(state, t.unit, t.figure, power.wounds, statsOf(card).life, "ability", events, ctx);
}

/** Quake Stomp: every other figure next to the stomper rolls defense dice; on no shield it is wounded and cannot move on its next turn. */
function stomp(state: GameState, ctx: RulesContext, rng: Rng, actor: Combatant, power: PowerSpec, events: GameEvent[]): void {
  events.push({ type: "abilityUsed", ability: power.id, figureId: actor.figure.id, detail: `${power.name}: the ground shakes` });
  const dice = param(abilityOf(actor.card, power.id), "defenseDice", 1);
  for (const c of splashedBy(state, ctx, actor.spots, [actor.figure.id])) {
    if (c.figure.destroyed) continue;
    const roll = rollDice(rng, DEFENSE_DIE, dice);
    const safe = countFaces(roll, "shield") > 0;
    events.push({
      type: "abilityUsed",
      ability: power.id,
      figureId: actor.figure.id,
      targetId: c.figure.id,
      detail: safe ? `${power.name}: ${c.card.name} keeps its feet` : `${power.name}: ${c.card.name} takes ${power.wounds} wound and cannot move on its next turn`,
    });
    if (safe) continue;
    woundFigure(state, c.unit, c.figure, power.wounds, statsOf(c.card).life, "ability", events, ctx);
    if (!c.figure.destroyed && !isPinned(state, c.figure.id)) state.pinned = [...(state.pinned ?? []), c.figure.id];
  }
}

/**
 * Fire Breath: the row of hexes a breath aimed through the neighbouring hex `first` burns, up to
 * the power's length, or null if it cannot go that way (not a neighbour, or behind the figure).
 * Terrain or scenery rising above the breather's head stops the flames.
 */
export function breathLine(state: GameState, figureId: string, first: Hex, ctx: RulesContext): Hex[] | null {
  const a = findFigure(state, figureId);
  if (!a?.figure.position) return null;
  const card = cardOf(a.unit, ctx);
  const power = powerOf(card, "fire-breath");
  if (!power || card.footprint !== "1") return null;
  const from = a.figure.position;
  const dir = hexSub(first, from.hex);
  if (!DIRECTIONS.some((d) => hexEquals(d, dir))) return null;
  const facing = facingOf(state, a.figure);
  if (facing !== null && !seesAny(facing, [{ hex: from.hex, elevation: from.elevation }], [{ hex: first, elevation: from.elevation }])) return null;
  const top = from.elevation + card.height;
  const line: Hex[] = [];
  for (let k = 1; k <= power.range; k++) {
    const h = { q: from.hex.q + dir.q * k, r: from.hex.r + dir.r * k };
    const surfaces = ctx.board.surfaces(h);
    if (surfaces.length === 0) break;
    if (Math.max(...surfaces.map((s) => s.elevation)) > top) break;
    if (ctx.board.sceneryIn(h).some((s) => s.placement.elevation + s.rules.height > top)) break;
    line.push(h);
  }
  return line.length > 0 ? line : null;
}

function breathe(state: GameState, ctx: RulesContext, rng: Rng, actor: Combatant, power: PowerSpec, first: Hex, events: GameEvent[]): void {
  const line = breathLine(state, actor.figure.id, first, ctx)!;
  events.push({ type: "abilityUsed", ability: power.id, figureId: actor.figure.id, detail: `${power.name}: flames along ${line.length} hex${line.length === 1 ? "" : "es"}` });
  const burned = new Set<string>();
  const top = (actor.figure.position?.elevation ?? 0) + actor.card.height;
  for (const h of line) {
    for (const c of figuresAt(state, ctx, h)) {
      if (c.figure.id === actor.figure.id || burned.has(c.figure.id) || c.figure.destroyed) continue;
      if (!c.spots.some((s) => hexEquals(s.hex, h) && s.elevation <= top)) continue;
      burned.add(c.figure.id);
      resolve(state, ctx, rng, actor, c, power.dice, power.id, events);
    }
  }
}

/** Bonecall: friendly Orc or Undead squads with a fallen figure that could return next to the caller. */
export function raiseUnits(state: GameState, figureId: string, ctx: RulesContext): string[] {
  const a = findFigure(state, figureId);
  if (!a?.figure.position) return [];
  const actor = combatant(a.unit, a.figure, ctx);
  return state.units
    .filter((u) => {
      if (u.owner !== a.unit.owner) return false;
      const card = cardOf(u, ctx);
      if (card.figureCount === 1 || !RAISE_SPECIES.includes(card.species) || card.footprint !== "1") return false;
      return u.figures.some((f) => f.destroyed) && freeSpotNear(state, ctx, actor.spots, card) !== null;
    })
    .map((u) => u.id);
}

function raise(state: GameState, ctx: RulesContext, actor: Combatant, power: PowerSpec, unitId: string, events: GameEvent[]): void {
  const unit = state.units.find((u) => u.id === unitId)!;
  const card = cardOf(unit, ctx);
  const fallen = unit.figures.find((f) => f.destroyed)!;
  const spot = freeSpotNear(state, ctx, actor.spots, card)!;
  fallen.destroyed = false;
  fallen.wounds = 0;
  fallen.position = { hex: spot.hex, elevation: spot.elevation, rotation: 0 };
  faceTowardsMiddle(state, fallen, card.footprint, ctx);
  events.push({ type: "figureRevived", figureId: fallen.id, at: spot });
  events.push({ type: "abilityUsed", ability: power.id, figureId: actor.figure.id, targetId: fallen.id, detail: `${power.name}: a fallen ${card.name} figure rises` });
}

/**
 * Call to Arms: friendly Disciplined squads, other than the caller's own unit, with a living figure
 * within the power's range of a living figure of the calling unit.
 */
export function callUnits(state: GameState, figureId: string, ctx: RulesContext): string[] {
  const a = findFigure(state, figureId);
  if (!a?.figure.position) return [];
  const power = powerOf(cardOf(a.unit, ctx), "call-to-arms");
  if (!power) return [];
  return callableFrom(state, a.unit, power.range, ctx);
}

function callableFrom(state: GameState, caller: UnitState, range: number, ctx: RulesContext): string[] {
  const callerCard = cardOf(caller, ctx);
  const callerSpots = caller.figures.filter((f) => !f.destroyed && f.position).flatMap((f) => figureSpots(f, callerCard.footprint, callerCard.height, ctx));
  if (callerSpots.length === 0) return [];
  return state.units
    .filter((u) => {
      if (u.owner !== caller.owner || u.id === caller.id) return false;
      const card = cardOf(u, ctx);
      if (card.figureCount === 1 || card.personality !== "Disciplined") return false;
      return u.figures.some((f) => !f.destroyed && f.position && spotDistance(figureSpots(f, card.footprint, card.height, ctx), callerSpots) <= range);
    })
    .map((u) => u.id);
}

/** As a turn ends: the squad Call to Arms chose, if it may still take a turn now; else null. */
export function calledUnit(state: GameState, ctx: RulesContext): string | null {
  const active = state.active;
  if (!active?.callUnit || active.called) return null;
  const caller = state.units.find((u) => u.id === active.unitId);
  if (!caller || (state.called ?? []).includes(caller.id)) return null;
  const power = powerOf(cardOf(caller, ctx), "call-to-arms");
  if (!power) return null;
  return callableFrom(state, caller, power.range, ctx).includes(active.callUnit) ? active.callUnit : null;
}

// ---------------------------------------------------------------------------
// Reactions to a move

/**
 * Lurk: when an enemy figure ends a move next to a figure with Lurk standing on water or swamp,
 * that figure attacks it at once, whichever way it faces. Each does this at most once a turn.
 */
export function lurkAttacks(state: GameState, moverId: string, events: GameEvent[], ctx: RulesContext): void {
  const active = state.active;
  const m = findFigure(state, moverId);
  if (!active || !m || m.figure.destroyed || !m.figure.position) return;
  const rng = new Rng(state.rng);
  for (const unit of state.units) {
    if (unit.owner === m.unit.owner) continue;
    const card = ctx.cards.get(unit.cardId);
    const lurk = card ? abilityOf(card, "lurk") : undefined;
    if (!card || !lurk) continue;
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position || m.figure.destroyed) continue;
      const lurker = combatant(unit, figure, ctx);
      const mover = combatant(m.unit, m.figure, ctx);
      if (!onWetTerrain(lurker.spots, ctx)) continue;
      if (!spotsEngaged(lurker.spots, card.height, mover.spots, mover.card.height)) continue;
      const key = `lurk:${figure.id}`;
      if ((active.once ?? []).includes(key)) continue;
      if (!canReach(state, ctx, lurker, mover, true)) continue;
      (active.once ??= []).push(key);
      events.push({ type: "abilityUsed", ability: lurk.id, figureId: figure.id, targetId: moverId, detail: `${lurk.name}: ${card.name} strikes from the water` });
      resolve(state, ctx, rng, lurker, mover, statsOf(card).attack, lurk.id, events);
    }
  }
  state.rng = rng.state;
  checkGameOver(state, events, ctx);
}
