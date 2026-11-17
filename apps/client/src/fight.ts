import {
  areaAttackOf,
  figureSpots,
  findFigure,
  hexDistance,
  statsOf,
  type FigurePosition,
  type GameEvent,
  type GameState,
  type RulesContext,
  type Step,
} from "@aoh/rules";

/**
 * What one command did in a fight, read from its events for the board to show:
 * who attacked whom (the attack intro), the wounds each figure took (the
 * floating numbers) and where destroyed figures fell. Presentation only: the
 * rules have already settled everything.
 */

export type AttackRoll = Extract<GameEvent, { type: "attackRolled" }> & { readonly attackerId: string };

/** The rolls in a command that are shown as attacks: those made by a figure (not falls or swamps). */
export function attackRollsIn(events: readonly GameEvent[]): AttackRoll[] {
  return events.filter((e): e is AttackRoll => e.type === "attackRolled" && e.attackerId !== null);
}

/** An attacker and the figure it attacked, for the intro's arrow and icon. */
export interface FightPair {
  readonly attackerId: string;
  readonly targetId: string;
  /** A shot from range (a bow), rather than a blow in melee (sword and shield). */
  readonly ranged: boolean;
}

export interface Fight {
  /** The arrow: the attacker to the first figure it attacked (a blast hits several). */
  readonly pairs: readonly FightPair[];
  readonly attackers: readonly string[];
  /** Every figure the attacker attacked. */
  readonly targets: readonly string[];
}

/**
 * Was this roll made from range? A normal attack on an adjacent figure is a blow in melee,
 * whatever the attacker's Range; otherwise a normal attack uses the card's Range, a special
 * attack its own, and a range of 1 is melee. Passing strikes are always melee. `state` is
 * the game as the attack began, so a figure it destroyed still has its place.
 */
export function isRanged(roll: AttackRoll, state: GameState, ctx: RulesContext): boolean {
  if (roll.source !== "attack") return false;
  const hit = findFigure(state, roll.attackerId);
  const card = hit ? ctx.cards.get(hit.unit.cardId) : undefined;
  if (!hit || !card) return false;
  if (!roll.ability && adjacent(roll.attackerId, roll.targetId, state, ctx)) return false;
  const range = (roll.ability ? areaAttackOf(card, roll.ability)?.range : undefined) ?? statsOf(card).range;
  return range > 1;
}

/** Do the two figures stand on neighbouring hexes (any hex of each, for larger figures)? */
function adjacent(aId: string, bId: string, state: GameState, ctx: RulesContext): boolean {
  const spotsOf = (id: string): readonly Step[] => {
    const hit = findFigure(state, id);
    const card = hit ? ctx.cards.get(hit.unit.cardId) : undefined;
    return hit && card && hit.figure.position ? figureSpots(hit.figure, card.footprint, card.height, ctx) : [];
  };
  const b = spotsOf(bId);
  return spotsOf(aId).some((s) => b.some((t) => hexDistance(s.hex, t.hex) <= 1));
}

/**
 * The fight in a command's events, or null if nobody attacked: the first attacker and every
 * figure it attacked. Rolls by anyone else come from the result (a figure that strikes back as it
 * falls), so the intro leaves them out rather than give the result away; the dice show them.
 */
export function fightIn(events: readonly GameEvent[], state: GameState, ctx: RulesContext): Fight | null {
  const first = attackRollsIn(events)[0];
  if (!first) return null;
  const rolls = attackRollsIn(events).filter((r) => r.attackerId === first.attackerId);
  return {
    pairs: [{ attackerId: first.attackerId, targetId: first.targetId, ranged: isRanged(first, state, ctx) }],
    attackers: [first.attackerId],
    targets: [...new Set(rolls.map((r) => r.targetId))],
  };
}

/** What a figure took from one command. */
export interface WoundMark {
  readonly figureId: string;
  /** The number to float over the figure: its wounds, 0 for an attack that did no damage, or null for none (a fall into lava). */
  readonly wounds: number | null;
  readonly destroyed: boolean;
}

/**
 * The wounds each figure took in a command, in the order they happened. Every figure
 * attacked gets a number, 0 included; other damage (falls, passing strikes, terrain,
 * abilities) shows when it wounds. A figure destroyed without a wound has no number.
 */
export function woundMarksIn(events: readonly GameEvent[]): WoundMark[] {
  const marks = new Map<string, { wounds: number; numbered: boolean; destroyed: boolean }>();
  const mark = (id: string) => {
    let m = marks.get(id);
    if (!m) marks.set(id, (m = { wounds: 0, numbered: false, destroyed: false }));
    return m;
  };
  for (const e of events) {
    if (e.type === "attackRolled" && e.attackerId !== null) mark(e.targetId).numbered = true;
    else if (e.type === "figureWounded") {
      const m = mark(e.figureId);
      m.wounds += e.wounds;
      m.numbered = true;
    } else if (e.type === "figureDestroyed") mark(e.figureId).destroyed = true;
  }
  return [...marks].map(([figureId, m]) => ({ figureId, wounds: m.numbered ? m.wounds : null, destroyed: m.destroyed }));
}

/**
 * Where each figure destroyed in a command was standing when it fell: its place before
 * the command, moved along by the command's moves and slides. The rules have already
 * taken it off the board; the board keeps drawing it there for a moment.
 */
export function fallenSpots(before: GameState, events: readonly GameEvent[], ctx: RulesContext): Map<string, Step[]> {
  const where = new Map<string, FigurePosition>();
  const placeOf = (id: string) => where.get(id) ?? findFigure(before, id)?.figure.position ?? null;
  const fallen = new Map<string, Step[]>();
  for (const e of events) {
    if (e.type === "figureMoved" && e.path.length > 0) {
      const last = e.path[e.path.length - 1]!;
      const was = placeOf(e.figureId);
      where.set(e.figureId, { hex: last.hex, elevation: last.elevation, rotation: last.rotation ?? was?.rotation ?? 0 });
    } else if (e.type === "figureSlid") {
      where.set(e.figureId, { hex: e.to.hex, elevation: e.to.elevation, rotation: placeOf(e.figureId)?.rotation ?? 0 });
    } else if (e.type === "figureDestroyed") {
      const position = placeOf(e.figureId);
      const hit = findFigure(before, e.figureId);
      const card = hit ? ctx.cards.get(hit.unit.cardId) : undefined;
      if (!position || !hit || !card) continue;
      fallen.set(e.figureId, figureSpots({ ...hit.figure, destroyed: false, position }, card.footprint, card.height, ctx));
    }
  }
  return fallen;
}
