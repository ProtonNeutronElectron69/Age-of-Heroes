import { rollCombat } from "../dice";
import { hexNeighbors, hexToWorld } from "../hex";
import { hasLineOfSight, segmentHitsHexPrism, type Token } from "../los";
import { Rng } from "../rng";
import type { Tuning } from "../tuning";
import { HEX_SIZE } from "../world";
import { abilityModifiers, abilityOf, afterAttack, combatant, hasAbility, reduceWounds, shieldbearerFor, spotDistance, type Combatant } from "./abilities";
import { spotsEngaged } from "./engagement";
import { facingOf, seesAny } from "./facing";
import { glyphBonus } from "./glyphs";
import { fail } from "./errors";
import { figureSpots, standingElevation, tuningOf } from "./placement";
import { findFigure, statsOf } from "./queries";
import { woundFigure } from "./rounds";
import type { GameEvent, GameState, RulesContext, Step } from "./types";

/**
 * One attack, from dice to wounds: the dice an attacker and a defender roll (height, cover,
 * glyphs, a strike from behind and abilities), and rolling and applying one attack. Shared by
 * the attack actions (`combat.ts`) and by moves (`movement.ts`), where a Prowler's passing
 * strike is a full attack (Harry).
 */

/**
 * Extra dice for higher ground. The figure standing higher gets
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

export const tokens = (spots: readonly Step[], height: number): Token[] => spots.map((s) => ({ ...s, height }));

/**
 * Can a figure (even one just destroyed) reach another with a normal attack? Used by Last Stand,
 * and by Lurk, which strikes at whatever ends a move beside it whichever way it faces (`anyFacing`).
 */
export function canReach(state: GameState, ctx: RulesContext, from: Combatant, to: Combatant, anyFacing = false): boolean {
  const range = statsOf(from.card).range + glyphBonus(state, from.unit.id, "range", ctx);
  if (spotDistance(from.spots, to.spots) > range) return false;
  if (range === 1 && !spotsEngaged(from.spots, from.card.height, to.spots, to.card.height)) return false;
  const facing = facingOf(state, from.figure);
  if (!anyFacing && facing !== null && !seesAny(facing, from.spots, to.spots)) return false;
  const blockers: Token[] = [];
  for (const unit of state.units) {
    const card = ctx.cards.get(unit.cardId);
    if (!card) continue;
    for (const figure of unit.figures) {
      if (figure.id === from.figure.id || figure.id === to.figure.id) continue;
      blockers.push(...tokens(figureSpots(figure, card.footprint, card.height, ctx), card.height));
    }
  }
  return hasLineOfSight(ctx.board, tokens(from.spots, from.card.height), tokens(to.spots, to.card.height), { blockers });
}

/**
 * Cover from scenery that gives it (a low wall): the defender stands on a hex next to one of
 * the wall's hexes, below its top, the attack comes from range (not from a neighbouring hex),
 * and the line from the attacker to the defender passes over that hex of the wall. Several
 * walls do not add up.
 */
export function coverFrom(
  attackerSpots: readonly Step[],
  defenderSpots: readonly Step[],
  ctx: RulesContext,
): { dice: number; name: string } | null {
  if (attackerSpots.length === 0 || defenderSpots.length === 0) return null;
  if (spotDistance(attackerSpots, defenderSpots) <= 1) return null;
  let best: { dice: number; name: string } | null = null;
  for (const d of defenderSpots) {
    const to = hexToWorld(d.hex, HEX_SIZE);
    for (const n of hexNeighbors(d.hex)) {
      for (const s of ctx.board.sceneryIn(n)) {
        const dice = s.rules.cover ?? 0;
        if (dice <= (best?.dice ?? 0)) continue;
        const base = s.placement.elevation;
        if (d.elevation < base || d.elevation >= base + s.rules.height) continue;
        const wall = hexToWorld(n, HEX_SIZE);
        // In the ground plane: a flat segment through a hex prism from y 0 to 1.
        const crosses = attackerSpots.some((a) => {
          const from = hexToWorld(a.hex, HEX_SIZE);
          return segmentHitsHexPrism({ x: from.x, y: 0.5, z: from.z }, { x: to.x, y: 0.5, z: to.z }, wall.x, wall.z, 0, 1);
        });
        if (crosses) best = { dice, name: s.rules.name };
      }
    }
  }
  return best;
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

export function diceFor(state: GameState, ctx: RulesContext, attacker: Combatant, defender: Combatant, baseAttack?: number) {
  const aStats = statsOf(attacker.card);
  const tStats = statsOf(defender.card);
  const notes: string[] = [];
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
  const cover = coverFrom(attacker.spots, defender.spots, ctx);
  const glyphAttack = glyphBonus(state, attacker.unit.id, "attack", ctx);
  const glyphDefense = glyphBonus(state, defender.unit.id, "defense", ctx);
  if (glyphAttack) notes.push(`Glyph +${glyphAttack} attack`);
  if (glyphDefense) notes.push(`Glyph +${glyphDefense} defense`);
  const behind = behindBonus(state, ctx, attacker, defender);
  if (behind) notes.push(`From behind +${behind} attack`);
  const attackBonus = height.attackBonus + mods.attack + glyphAttack + behind;
  const defenseBonus = height.defenseBonus + mods.defense + (cover?.dice ?? 0) + glyphDefense;
  notes.push(...mods.notes);
  if (cover) notes.push(`Behind a ${cover.name.toLowerCase()} +${cover.dice} defense`);
  return {
    attack: (baseAttack ?? aStats.attack) + attackBonus,
    defense: Math.max(0, tStats.defense + defenseBonus),
    attackBonus,
    defenseBonus,
    notes,
  };
}

/**
 * Strike from behind (games with facing): a melee attack by a figure wholly outside the
 * defender's front cone rolls extra attack dice. It adds to the higher-ground bonus. With
 * `strikeFromBehind: "meleeOnly"`, a unit whose Range is above 1 never gets it, even next to its target.
 */
function behindBonus(state: GameState, ctx: RulesContext, attacker: Combatant, defender: Combatant): number {
  if (state.config.strikeFromBehind === "meleeOnly" && statsOf(attacker.card).range > 1) return 0;
  const facing = facingOf(state, defender.figure);
  if (facing === null || spotDistance(attacker.spots, defender.spots) > 1) return 0;
  if (seesAny(facing, defender.spots, attacker.spots)) return 0;
  return tuningOf(ctx).behindBonus ?? 0;
}

/**
 * Roll one attack against one defender and apply the result. Returns the wounds the defender
 * took (after Thick Hide, Mist Form and a Shieldbearer taking one).
 */
export function resolve(
  state: GameState,
  ctx: RulesContext,
  rng: Rng,
  attacker: Combatant,
  defender: Combatant,
  baseAttack: number,
  ability: string | undefined,
  events: GameEvent[],
  numbedBy?: string,
  extraNotes: readonly string[] = [],
): number {
  const dice = diceFor(state, ctx, attacker, defender, baseAttack);
  // Numbing Glare: the target rolls no defense dice at all.
  const defense = numbedBy ? 0 : dice.defense;
  const roll = rollCombat(rng, Math.max(0, dice.attack), defense);
  const distance = spotDistance(attacker.spots, defender.spots);
  const notes = [...extraNotes, ...dice.notes, ...(numbedBy ? [`${numbedBy}: no defense dice`] : [])];
  let wounds = reduceWounds(defender, distance, roll.wounds, notes, roll.blocks);
  // Shieldbearers: a Pikeman next to a friendly hero takes one of its wounds.
  const bearer = wounds > 0 ? shieldbearerFor(state, ctx, defender) : undefined;
  if (bearer) {
    wounds -= 1;
    notes.push(`${abilityOf(bearer.card, "shieldbearers")!.name}: a Pikeman takes 1 wound`);
  }
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
  const life = statsOf(defender.card).life;
  if (bearer) woundFigure(state, bearer.unit, bearer.figure, 1, statsOf(bearer.card).life, "attack", events, ctx);
  woundFigure(state, defender.unit, defender.figure, wounds, life, "attack", events, ctx);
  afterAttack(state, ctx, rng, attacker, defender, distance, roll.hits, roll.blocks, wounds, events);

  // Last Stand: a destroyed figure strikes back at its attacker as it falls.
  const stand = hasAbility(defender.card, "last-stand") ? abilityOf(defender.card, "last-stand") : undefined;
  if (stand && defender.figure.destroyed && !attacker.figure.destroyed && attacker.figure.position && canReach(state, ctx, defender, attacker)) {
    events.push({
      type: "abilityUsed",
      ability: stand.id,
      figureId: defender.figure.id,
      targetId: attacker.figure.id,
      detail: `${stand.name}: strikes back as it falls`,
    });
    resolve(state, ctx, rng, defender, attacker, statsOf(defender.card).attack, stand.id, events);
  }
  return wounds;
}

