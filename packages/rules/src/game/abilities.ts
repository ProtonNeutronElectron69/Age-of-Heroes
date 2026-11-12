import { DEFENSE_DIE, countFaces, rollDice } from "../dice";
import { hexDistance, isAdjacent } from "../hex";
import { Rng } from "../rng";
import type { Ability, UnitCard } from "../schema";
import { isSquad } from "../schema";
import { figureSpots, placementSpots } from "./placement";
import type { Occupant } from "./queries";
import { woundFigure } from "./rounds";
import type { FigureState, GameEvent, GameState, RulesContext, Step, UnitState } from "./types";

/**
 * Special abilities. Cards name their abilities by id (with tunable numbers
 * in `params`); the code for each id lives here and is called from the rule
 * steps it changes. Abilities only exist in the Advanced game.
 *
 * Ability ids:
 * - Movement: flying, trample, smoke-step, war-drums (aura), corpse-feast (a move after a kill)
 * - Attack bonuses: massed-volley, grove-song (aura), command-the-dead (aura), charge, pack-hunt, duelist,
 *   steady-aim, longshot, bloodrage, fury, smite-the-unholy, piercing (one fewer defense die)
 * - Defense bonuses: rally-the-line (aura), deflector-field (aura), hidden-in-the-leaves, moss-armor, brace, shield-wall
 * - Who can be attacked: will-o-wisp (not from afar), challenge (neighbours must attack this figure)
 * - Reactions: answering-blade, thick-hide, salvage-protocol, soul-reap, reboot, pin (no move next turn),
 *   shove (push back 1 hex), last-stand (strike back when destroyed), volatile-core (bursts when destroyed)
 * - End of turn: field-dressing, reassemble, regrowth, mending-hymn
 * - Special actions (used instead of a normal attack): ember-spit, mortar-barrage, arc-lightning (area attacks),
 *   lantern-gaze (mind control), grapple-line (pull an enemy close), fae-step (swap places with a friend)
 */

/** Species that Smite the Unholy is aimed at. */
export const UNHOLY_SPECIES: readonly string[] = ["Undead", "Oni"];

export function abilityOf(card: UnitCard, id: string): Ability | undefined {
  return card.advanced.abilities.find((a) => a.id === id);
}

/** Does this card have the ability, and is it in play (Advanced game)? */
export function hasAbility(state: GameState, card: UnitCard, id: string): boolean {
  return state.config.mode === "advanced" && abilityOf(card, id) !== undefined;
}

export function param(ability: Ability | undefined, key: string, fallback: number): number {
  return ability?.params?.[key] ?? fallback;
}

/** A figure on the battlefield with everything abilities need to know about it. */
export interface Combatant {
  readonly unit: UnitState;
  readonly figure: FigureState;
  readonly card: UnitCard;
  readonly spots: Step[];
}

export function combatant(unit: UnitState, figure: FigureState, ctx: RulesContext): Combatant {
  const card = ctx.cards.get(unit.cardId)!;
  return { unit, figure, card, spots: figureSpots(figure, card.footprint, card.height, ctx) };
}

export function spotDistance(a: readonly Step[], b: readonly Step[]): number {
  let best = Infinity;
  for (const x of a) for (const y of b) best = Math.min(best, hexDistance(x.hex, y.hex));
  return best;
}

/** Living figures of one player (other than `except`) whose card has the ability. */
function friendsWith(state: GameState, owner: string, id: string, ctx: RulesContext, except?: string): Combatant[] {
  const result: Combatant[] = [];
  for (const unit of state.units) {
    if (unit.owner !== owner) continue;
    const card = ctx.cards.get(unit.cardId);
    if (!card || !hasAbility(state, card, id)) continue;
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position || figure.id === except) continue;
      result.push(combatant(unit, figure, ctx));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Attack and defense modifiers

export interface Modifiers {
  attack: number;
  defense: number;
  notes: string[];
}

/**
 * Extra dice from abilities for one attack (Advanced only). Auras of the same
 * kind do not stack: a figure gets each named bonus at most once.
 */
export function abilityModifiers(
  state: GameState,
  ctx: RulesContext,
  attacker: Combatant,
  defender: Combatant,
  distance: number,
): Modifiers {
  const mods: Modifiers = { attack: 0, defense: 0, notes: [] };
  if (state.config.mode !== "advanced") return mods;
  const add = (kind: "attack" | "defense", amount: number, name: string) => {
    if (amount <= 0) return;
    mods[kind] += amount;
    mods.notes.push(`${name} +${amount} ${kind}`);
  };

  // Massed Volley: the third (or later) attack by the same squad on one target this turn.
  const volley = abilityOf(attacker.card, "massed-volley");
  if (volley && state.active) {
    const squadmates = new Set(attacker.unit.figures.map((f) => f.id));
    const earlier = state.active.attackLog.filter(
      (a) => squadmates.has(a.attackerId) && a.targetId === defender.figure.id,
    ).length;
    if (earlier + 1 >= param(volley, "attacks", 3)) add("attack", param(volley, "bonus", 2), volley.name);
  }

  // Grove Song: other friendly Elves near the singer attack harder.
  if (attacker.card.species === "Elf") {
    const singer = friendsWith(state, attacker.unit.owner, "grove-song", ctx, attacker.figure.id).find(
      (s) => spotDistance(s.spots, attacker.spots) <= param(abilityOf(s.card, "grove-song"), "range", 3),
    );
    if (singer) {
      const a = abilityOf(singer.card, "grove-song")!;
      add("attack", param(a, "bonus", 1), a.name);
    }
  }

  // Command the Dead: other friendly Undead near the necromancer attack harder.
  if (attacker.card.species === "Undead") {
    const master = friendsWith(state, attacker.unit.owner, "command-the-dead", ctx, attacker.figure.id).find(
      (s) => spotDistance(s.spots, attacker.spots) <= param(abilityOf(s.card, "command-the-dead"), "range", 4),
    );
    if (master) {
      const a = abilityOf(master.card, "command-the-dead")!;
      add("attack", param(a, "bonus", 1), a.name);
    }
  }

  const moved = state.active?.moved.includes(attacker.figure.id) ?? false;

  // Charge: a melee attack straight after moving.
  const charge = abilityOf(attacker.card, "charge");
  if (charge && distance <= 1 && moved) add("attack", param(charge, "bonus", 1), charge.name);

  // Steady Aim: the figure has not moved this turn.
  const aim = abilityOf(attacker.card, "steady-aim");
  if (aim && !moved) add("attack", param(aim, "bonus", 1), aim.name);

  // Longshot: a distant target.
  const longshot = abilityOf(attacker.card, "longshot");
  if (longshot && distance >= param(longshot, "minDistance", 5)) add("attack", param(longshot, "bonus", 1), longshot.name);

  // Pack Hunt: another figure of the same squad is next to the target.
  const pack = abilityOf(attacker.card, "pack-hunt");
  if (pack) {
    const flanked = attacker.unit.figures.some(
      (f) =>
        f.id !== attacker.figure.id &&
        !f.destroyed &&
        f.position &&
        spotDistance(figureSpots(f, attacker.card.footprint, attacker.card.height, ctx), defender.spots) <= 1,
    );
    if (flanked) add("attack", param(pack, "bonus", 1), pack.name);
  }

  // Duelist: a melee attack on a hero.
  const duelist = abilityOf(attacker.card, "duelist");
  if (duelist && distance <= 1 && !isSquad(defender.card)) add("attack", param(duelist, "bonus", 1), duelist.name);

  // Bloodrage: the squad has lost at least one figure.
  const rage = abilityOf(attacker.card, "bloodrage");
  if (rage && attacker.unit.figures.some((f) => f.destroyed)) add("attack", param(rage, "bonus", 1), rage.name);

  // Fury: the figure is wounded.
  const fury = abilityOf(attacker.card, "fury");
  if (fury && attacker.figure.wounds > 0) add("attack", param(fury, "bonus", 1), fury.name);

  // Smite the Unholy: against the undead and demons.
  const smite = abilityOf(attacker.card, "smite-the-unholy");
  if (smite && UNHOLY_SPECIES.includes(defender.card.species)) add("attack", param(smite, "bonus", 2), smite.name);

  // Shield Wall: a squadmate stands next to the defender.
  const wall = abilityOf(defender.card, "shield-wall");
  if (wall) {
    const braced = defender.unit.figures.some(
      (f) =>
        f.id !== defender.figure.id &&
        !f.destroyed &&
        f.position &&
        spotDistance(figureSpots(f, defender.card.footprint, defender.card.height, ctx), defender.spots) <= 1,
    );
    if (braced) add("defense", param(wall, "bonus", 1), wall.name);
  }

  // Rally the Line: friendly Disciplined squads near the commander defend better.
  if (isSquad(defender.card) && defender.card.personality === "Disciplined") {
    const leader = friendsWith(state, defender.unit.owner, "rally-the-line", ctx, defender.figure.id).find(
      (s) => spotDistance(s.spots, defender.spots) <= param(abilityOf(s.card, "rally-the-line"), "range", 4),
    );
    if (leader) {
      const a = abilityOf(leader.card, "rally-the-line")!;
      add("defense", param(a, "bonus", 1), a.name);
    }
  }

  // Deflector Field: friends next to the guardian are shielded from long-range attacks.
  const shield = friendsWith(state, defender.unit.owner, "deflector-field", ctx, defender.figure.id).find((s) => {
    const a = abilityOf(s.card, "deflector-field");
    return spotDistance(s.spots, defender.spots) <= 1 && distance >= param(a, "minDistance", 3);
  });
  if (shield) {
    const a = abilityOf(shield.card, "deflector-field")!;
    add("defense", param(a, "bonus", 1), a.name);
  }

  // Hidden in the Leaves: in forest, hard to hit from afar.
  const leaves = abilityOf(defender.card, "hidden-in-the-leaves");
  if (leaves && distance >= param(leaves, "minDistance", 4)) {
    const inForest = defender.spots.some((s) => ctx.board.surfaceAt(s.hex, s.elevation)?.terrain === "forest");
    if (inForest) add("defense", param(leaves, "bonus", 2), leaves.name);
  }

  // Moss Armor: thick hide against distant attacks.
  const moss = abilityOf(defender.card, "moss-armor");
  if (moss && distance >= param(moss, "minDistance", 4)) add("defense", param(moss, "bonus", 1), moss.name);

  // Brace: set against an enemy that charged in this turn.
  const brace = abilityOf(defender.card, "brace");
  if (brace && distance <= 1 && state.active?.moved.includes(attacker.figure.id)) {
    add("defense", param(brace, "bonus", 2), brace.name);
  }

  // Piercing: the target rolls fewer defense dice.
  const piercing = abilityOf(attacker.card, "piercing");
  if (piercing) {
    const cut = param(piercing, "reduce", 1);
    mods.defense -= cut;
    mods.notes.push(`${piercing.name} -${cut} defense`);
  }
  return mods;
}

/**
 * Why abilities stop `attacker` from targeting `target` with an attack or a
 * special action, or null. Will-o'-the-Wisp cannot be targeted from afar, and
 * a figure next to an enemy with Challenge may only attack that enemy.
 */
export function targetingProblem(
  state: GameState,
  ctx: RulesContext,
  attacker: Combatant,
  target: Combatant,
  distance: number,
): string | null {
  if (state.config.mode !== "advanced") return null;
  const wisp = abilityOf(target.card, "will-o-wisp");
  if (wisp && distance > param(wisp, "maxDistance", 4)) {
    return `${wisp.name}: it cannot be targeted from more than ${param(wisp, "maxDistance", 4)} hexes away`;
  }
  const challengers: Combatant[] = [];
  for (const unit of state.units) {
    if (unit.owner === attacker.unit.owner) continue;
    const card = ctx.cards.get(unit.cardId);
    if (!card || !hasAbility(state, card, "challenge")) continue;
    for (const figure of unit.figures) {
      if (figure.destroyed || !figure.position) continue;
      const c = combatant(unit, figure, ctx);
      if (spotDistance(c.spots, attacker.spots) <= 1) challengers.push(c);
    }
  }
  if (challengers.length > 0 && !challengers.some((c) => c.figure.id === target.figure.id)) {
    const c = challengers[0]!;
    return `${abilityOf(c.card, "challenge")!.name}: it must attack ${c.card.name} first`;
  }
  return null;
}

/** Extra Move from auras (War Drums: other friendly Orcs that start a move near the drummer). */
export function moveBonus(state: GameState, ctx: RulesContext, mover: Combatant): { bonus: number; notes: string[] } {
  if (state.config.mode !== "advanced") return { bonus: 0, notes: [] };
  if (mover.card.species !== "Orc") return { bonus: 0, notes: [] };
  const drummer = friendsWith(state, mover.unit.owner, "war-drums", ctx, mover.figure.id).find(
    (s) => spotDistance(s.spots, mover.spots) <= param(abilityOf(s.card, "war-drums"), "range", 3),
  );
  if (!drummer) return { bonus: 0, notes: [] };
  const a = abilityOf(drummer.card, "war-drums")!;
  return { bonus: param(a, "move", 2), notes: [`${a.name} +${param(a, "move", 2)} move`] };
}

/** Is this figure pinned (it cannot move this turn)? */
export function isPinned(state: GameState, figureId: string): boolean {
  return state.pinned?.includes(figureId) ?? false;
}

/** Wounds after defensive abilities that reduce damage (Thick Hide). */
export function reduceWounds(
  state: GameState,
  defender: Combatant,
  distance: number,
  wounds: number,
  notes: string[],
): number {
  const hide = hasAbility(state, defender.card, "thick-hide") ? abilityOf(defender.card, "thick-hide") : undefined;
  if (hide && wounds > 0 && distance >= param(hide, "minDistance", 3)) {
    const cut = Math.min(wounds, param(hide, "reduce", 1));
    notes.push(`${hide.name} -${cut} wound${cut === 1 ? "" : "s"}`);
    return wounds - cut;
  }
  return wounds;
}

/** Reactions after an attack has been resolved against a defender. */
export function afterAttack(
  state: GameState,
  ctx: RulesContext,
  rng: Rng,
  attacker: Combatant,
  defender: Combatant,
  distance: number,
  hits: number,
  blocks: number,
  wounds: number,
  events: GameEvent[],
): void {
  if (state.config.mode !== "advanced") return;

  // Pin: a figure wounded (and still standing) cannot move on its next turn.
  const pin = abilityOf(attacker.card, "pin");
  if (pin && wounds > 0 && !defender.figure.destroyed && !isPinned(state, defender.figure.id)) {
    state.pinned = [...(state.pinned ?? []), defender.figure.id];
    events.push({
      type: "abilityUsed",
      ability: pin.id,
      figureId: attacker.figure.id,
      targetId: defender.figure.id,
      detail: `${pin.name}: ${defender.card.name} cannot move on its next turn`,
    });
  }

  // Volatile Core: a destroyed machine bursts, hitting every figure next to where it stood.
  const core = abilityOf(defender.card, "volatile-core");
  if (core && defender.figure.destroyed && defender.unit.figures.includes(defender.figure)) {
    for (const unit of state.units) {
      const card = ctx.cards.get(unit.cardId);
      if (!card) continue;
      for (const figure of unit.figures) {
        if (figure.destroyed || !figure.position || figure.id === defender.figure.id) continue;
        if (spotDistance(figureSpots(figure, card.footprint, card.height, ctx), defender.spots) > 1) continue;
        const dice = rollDice(rng, DEFENSE_DIE, param(core, "defenseDice", 1));
        const safe = countFaces(dice, "shield") > 0;
        events.push({
          type: "abilityUsed",
          ability: core.id,
          figureId: defender.figure.id,
          targetId: figure.id,
          detail: safe ? `${core.name}: ${card.name} shields itself` : `${core.name}: ${card.name} takes 1 wound`,
        });
        if (!safe) woundFigure(state, unit, figure, param(core, "wounds", 1), card.advanced.life, "ability", events);
      }
    }
  }

  // Reboot: a destroyed machine may get straight back up where it fell.
  const reboot = abilityOf(defender.card, "reboot");
  const fell = defender.spots[0];
  if (reboot && defender.card.footprint === "1" && defender.figure.destroyed && fell && defender.unit.figures.includes(defender.figure)) {
    const roll = rng.d20();
    const needed = param(reboot, "needed", 17);
    events.push({
      type: "abilityRoll",
      ability: reboot.id,
      figureId: defender.figure.id,
      targetId: defender.figure.id,
      roll,
      needed,
      success: roll >= needed,
    });
    if (roll >= needed) {
      defender.figure.destroyed = false;
      defender.figure.wounds = 0;
      defender.figure.position = { hex: fell.hex, elevation: fell.elevation, rotation: 0 };
      events.push({ type: "figureRevived", figureId: defender.figure.id, at: fell });
    }
  }

  // Soul Reap: a kill restores the reaper.
  const reap = abilityOf(attacker.card, "soul-reap");
  if (reap && defender.figure.destroyed && !attacker.figure.destroyed && attacker.figure.wounds > 0) {
    const amount = Math.min(attacker.figure.wounds, param(reap, "heal", 1));
    attacker.figure.wounds -= amount;
    events.push({ type: "figureHealed", figureId: attacker.figure.id, amount, total: attacker.figure.wounds });
    events.push({
      type: "abilityUsed",
      ability: reap.id,
      figureId: attacker.figure.id,
      detail: `${reap.name}: ${amount} wound removed`,
    });
  }

  // Answering Blade: a parried melee attack cuts the attacker.
  const blade = abilityOf(defender.card, "answering-blade");
  if (blade && !defender.figure.destroyed && distance <= 1 && blocks > hits && !attacker.figure.destroyed) {
    events.push({
      type: "abilityUsed",
      ability: blade.id,
      figureId: defender.figure.id,
      targetId: attacker.figure.id,
      detail: `${blade.name}: the attacker takes ${param(blade, "wounds", 1)} wound`,
    });
    woundFigure(state, attacker.unit, attacker.figure, param(blade, "wounds", 1), attacker.card.advanced.life, "ability", events);
  }

  // Salvage Protocol: a kill brings a fallen squadmate back.
  const salvage = abilityOf(attacker.card, "salvage-protocol");
  if (salvage && defender.figure.destroyed && !attacker.figure.destroyed) {
    const fallen = attacker.unit.figures.find((f) => f.destroyed);
    if (fallen) {
      const spot = freeSpotNear(state, ctx, attacker.spots, attacker.card);
      if (spot) {
        fallen.destroyed = false;
        fallen.wounds = 0;
        fallen.position = { hex: spot.hex, elevation: spot.elevation, rotation: 0 };
        events.push({ type: "figureRevived", figureId: fallen.id, at: spot });
        events.push({
          type: "abilityUsed",
          ability: salvage.id,
          figureId: attacker.figure.id,
          targetId: fallen.id,
          detail: `${salvage.name}: a fallen squadmate returns`,
        });
      }
    }
  }
}

/** A free spot next to some hexes where a single-hex figure of this card could stand. */
export function freeSpotNear(state: GameState, ctx: RulesContext, around: readonly Step[], card: UnitCard): Step | null {
  const taken = new Set<string>();
  for (const unit of state.units) {
    const c = ctx.cards.get(unit.cardId);
    if (!c) continue;
    for (const f of unit.figures) for (const s of figureSpots(f, c.footprint, c.height, ctx)) taken.add(key(s));
  }
  for (const h of ctx.board.hexes()) {
    if (!around.some((a) => isAdjacent(a.hex, h))) continue;
    for (const s of ctx.board.surfaces(h)) {
      const spot = { hex: h, elevation: s.elevation };
      if (taken.has(key(spot))) continue;
      if (placementSpots("1", card.height, { ...spot, rotation: 0 }, ctx)) return spot;
    }
  }
  return null;
}

const key = (s: Step) => `${s.hex.q},${s.hex.r}@${s.elevation}`;

// ---------------------------------------------------------------------------
// End of turn

/**
 * End-of-turn abilities of the unit that just acted: Field Dressing (the medic patches
 * up the most wounded hero next to her, or herself) and Reassemble (a fallen figure of
 * the squad may pull itself together).
 */
export function endOfTurnAbilities(state: GameState, unitId: string, ctx: RulesContext, events: GameEvent[]): void {
  if (state.config.mode !== "advanced") return;
  const unit = state.units.find((u) => u.id === unitId);
  const card = unit ? ctx.cards.get(unit.cardId) : undefined;
  if (!unit || !card) return;
  // Pins last for one turn of the pinned figure's unit.
  if (state.pinned) {
    const mine = new Set(unit.figures.map((f) => f.id));
    state.pinned = state.pinned.filter((id) => !mine.has(id));
    if (state.pinned.length === 0) delete state.pinned;
  }
  reassemble(state, unit, card, ctx, events);
  regrowth(state, unit, card, ctx, events);
  mendingHymn(state, unit, card, ctx, events);
  const dressing = abilityOf(card, "field-dressing");
  if (!dressing) return;
  for (const medic of unit.figures) {
    if (medic.destroyed || !medic.position) continue;
    const medicSpots = figureSpots(medic, card.footprint, card.height, ctx);
    const patients: { unit: UnitState; figure: FigureState }[] = [];
    for (const u of state.units) {
      if (u.owner !== unit.owner) continue;
      const c = ctx.cards.get(u.cardId);
      if (!c || c.figureCount !== 1) continue;
      for (const f of u.figures) {
        if (f.destroyed || f.wounds === 0) continue;
        const near = f.id === medic.id || spotDistance(figureSpots(f, c.footprint, c.height, ctx), medicSpots) <= 1;
        if (near) patients.push({ unit: u, figure: f });
      }
    }
    patients.sort((a, b) => b.figure.wounds - a.figure.wounds || a.figure.id.localeCompare(b.figure.id));
    const patient = patients[0];
    if (!patient) continue;
    const amount = Math.min(patient.figure.wounds, param(dressing, "heal", 1));
    patient.figure.wounds -= amount;
    events.push({ type: "figureHealed", figureId: patient.figure.id, amount, total: patient.figure.wounds });
    events.push({
      type: "abilityUsed",
      ability: dressing.id,
      figureId: medic.id,
      targetId: patient.figure.id,
      detail: `${dressing.name}: ${amount} wound removed`,
    });
  }
}

/** Heal one figure and log it. */
function heal(figure: FigureState, amount: number, ability: Ability, by: string, events: GameEvent[]): void {
  const n = Math.min(figure.wounds, amount);
  if (n <= 0) return;
  figure.wounds -= n;
  events.push({ type: "figureHealed", figureId: figure.id, amount: n, total: figure.wounds });
  events.push({
    type: "abilityUsed",
    ability: ability.id,
    figureId: by,
    ...(by !== figure.id ? { targetId: figure.id } : {}),
    detail: `${ability.name}: ${n} wound removed`,
  });
}

/** Regrowth: each wounded figure of the unit standing on the right terrain (forest) heals. */
function regrowth(state: GameState, unit: UnitState, card: UnitCard, ctx: RulesContext, events: GameEvent[]): void {
  const ability = abilityOf(card, "regrowth");
  if (!ability) return;
  for (const f of unit.figures) {
    if (f.destroyed || !f.position || f.wounds === 0) continue;
    const spots = figureSpots(f, card.footprint, card.height, ctx);
    const onForest = spots.some((s) => ctx.board.surfaceAt(s.hex, s.elevation)?.terrain === "forest");
    if (onForest) heal(f, param(ability, "heal", 1), ability, f.id, events);
  }
}

/** Mending Hymn: the most wounded friendly hero within range of any figure of the unit heals. */
function mendingHymn(state: GameState, unit: UnitState, card: UnitCard, ctx: RulesContext, events: GameEvent[]): void {
  const ability = abilityOf(card, "mending-hymn");
  if (!ability) return;
  const singers = unit.figures.filter((f) => !f.destroyed && f.position);
  if (singers.length === 0) return;
  const range = param(ability, "range", 3);
  let best: { figure: FigureState; singer: string } | null = null;
  for (const u of state.units) {
    if (u.owner !== unit.owner) continue;
    const c = ctx.cards.get(u.cardId);
    if (!c || c.figureCount !== 1) continue;
    for (const f of u.figures) {
      if (f.destroyed || !f.position || f.wounds === 0) continue;
      const spots = figureSpots(f, c.footprint, c.height, ctx);
      const singer = singers.find((s) => spotDistance(figureSpots(s, card.footprint, card.height, ctx), spots) <= range);
      if (!singer) continue;
      if (!best || f.wounds > best.figure.wounds || (f.wounds === best.figure.wounds && f.id < best.figure.id)) {
        best = { figure: f, singer: singer.id };
      }
    }
  }
  if (best) heal(best.figure, param(ability, "heal", 1), ability, best.singer, events);
}

/** Reassemble: roll for one destroyed figure; on a high roll it returns next to a living squadmate. */
function reassemble(state: GameState, unit: UnitState, card: UnitCard, ctx: RulesContext, events: GameEvent[]): void {
  const ability = abilityOf(card, "reassemble");
  if (!ability) return;
  const fallen = unit.figures.find((f) => f.destroyed);
  const living = unit.figures.filter((f) => !f.destroyed && f.position);
  if (!fallen || living.length === 0) return;
  const rng = new Rng(state.rng);
  const roll = rng.d20();
  state.rng = rng.state;
  const needed = param(ability, "needed", 15);
  const success = roll >= needed;
  events.push({ type: "abilityRoll", ability: ability.id, figureId: living[0]!.id, targetId: fallen.id, roll, needed, success });
  if (!success) return;
  const around = living.flatMap((f) => figureSpots(f, card.footprint, card.height, ctx));
  const spot = freeSpotNear(state, ctx, around, card);
  if (!spot) return;
  fallen.destroyed = false;
  fallen.wounds = 0;
  fallen.position = { hex: spot.hex, elevation: spot.elevation, rotation: 0 };
  events.push({ type: "figureRevived", figureId: fallen.id, at: spot });
}

// ---------------------------------------------------------------------------
// Trample

/** Trample: each Small or Medium enemy the behemoth moves through rolls 1 defense die; a blank is a wound. */
export function canTrample(state: GameState, mover: UnitCard, victim: UnitCard): boolean {
  return hasAbility(state, mover, "trample") && (victim.size === "small" || victim.size === "medium");
}

export function trampleRoll(
  state: GameState,
  rng: Rng,
  mover: Combatant,
  victim: Occupant,
  ctx: RulesContext,
  events: GameEvent[],
): void {
  const ability = abilityOf(mover.card, "trample")!;
  const card = ctx.cards.get(victim.unit.cardId)!;
  const dice = rollDice(rng, DEFENSE_DIE, param(ability, "defenseDice", 1));
  const safe = countFaces(dice, "shield") > 0;
  events.push({
    type: "abilityUsed",
    ability: ability.id,
    figureId: mover.figure.id,
    targetId: victim.figure.id,
    detail: safe ? `${ability.name}: dodged` : `${ability.name}: trampled for 1 wound`,
  });
  if (!safe) woundFigure(state, victim.unit, victim.figure, 1, card.advanced.life, "ability", events);
}

// ---------------------------------------------------------------------------
// Special actions

export interface AreaAttackSpec {
  readonly id: string;
  readonly name: string;
  readonly range: number;
  readonly minRange: number;
  readonly dice: number;
  readonly splashDice: number;
  readonly ignoresSight: boolean;
}

export interface MindControlSpec {
  readonly id: string;
  readonly name: string;
  readonly range: number;
  /** d20 roll needed (or higher). */
  readonly needed: number;
}

export interface ReachSpec {
  readonly id: string;
  readonly name: string;
  readonly range: number;
}

const AREA_IDS = ["ember-spit", "mortar-barrage", "arc-lightning"] as const;
const MIND_IDS = ["lantern-gaze"] as const;
const PULL_IDS = ["grapple-line"] as const;
const SWAP_IDS = ["fae-step"] as const;

function reachOf(card: UnitCard, id: string, ids: readonly string[], range: number): ReachSpec | undefined {
  if (!ids.includes(id)) return undefined;
  const a = abilityOf(card, id);
  return a ? { id, name: a.name, range: param(a, "range", range) } : undefined;
}

/** Grapple Line: pull an enemy into a hex next to the figure. */
export function pullOf(card: UnitCard, id: string): ReachSpec | undefined {
  return reachOf(card, id, PULL_IDS, 3);
}

/** Fae Step: swap places with a friendly single-hex figure. */
export function swapOf(card: UnitCard, id: string): ReachSpec | undefined {
  return reachOf(card, id, SWAP_IDS, 5);
}

export type SpecialKind = "area" | "mindControl" | "pull" | "swap";

function specialKind(card: UnitCard, id: string): SpecialKind | null {
  if (areaAttackOf(card, id)) return "area";
  if (mindControlOf(card, id)) return "mindControl";
  if (pullOf(card, id)) return "pull";
  if (swapOf(card, id)) return "swap";
  return null;
}

export function areaAttackOf(card: UnitCard, id: string): AreaAttackSpec | undefined {
  if (!(AREA_IDS as readonly string[]).includes(id)) return undefined;
  const a = abilityOf(card, id);
  if (!a) return undefined;
  return {
    id,
    name: a.name,
    range: param(a, "range", 3),
    minRange: param(a, "minRange", 1),
    dice: param(a, "dice", 2),
    splashDice: param(a, "splashDice", 1),
    ignoresSight: param(a, "ignoresSight", 0) === 1,
  };
}

export function mindControlOf(card: UnitCard, id: string): MindControlSpec | undefined {
  if (!(MIND_IDS as readonly string[]).includes(id)) return undefined;
  const a = abilityOf(card, id);
  if (!a) return undefined;
  return { id, name: a.name, range: param(a, "range", 4), needed: param(a, "needed", 16) };
}

/** Special actions a card can use instead of a normal attack (Advanced only). */
export function specialActions(state: GameState, card: UnitCard): { id: string; name: string; kind: SpecialKind }[] {
  if (state.config.mode !== "advanced") return [];
  const result: { id: string; name: string; kind: SpecialKind }[] = [];
  for (const a of card.advanced.abilities) {
    const kind = specialKind(card, a.id);
    if (kind) result.push({ id: a.id, name: a.name, kind });
  }
  return result;
}
