import { hexDistance, hexKey } from "../hex";
import { Rng } from "../rng";
import { isSquad } from "../schema";
import { DEFAULT_GLYPHS, type GlyphTuning } from "../tuning";
import { fail } from "./errors";
import { figureSpots, placementSpots, tuningOf, type Placement } from "./placement";
import { cardOf, findFigure, findUnit, isUnitAlive, occupancy, statsOf, stepKey } from "./queries";
import { checkGameOver, destroyFigure, woundFigure } from "./rounds";
import {
  GLYPH_KINDS,
  STAT_GLYPHS,
  type FigurePlacement,
  type FigureState,
  type GameEvent,
  type GameState,
  type GlyphKind,
  type PlayerId,
  type RulesContext,
  type Step,
  type UnitState,
} from "./types";

/**
 * Glyphs. When deployment ends, `config.glyphs` of them (one of each kind at most) are laid face
 * down on open standard terrain away from the start zones. A figure that ends a move on one picks
 * it up. A trap acts on that figure at once: the pit wounds it, the curse kills it at the end of
 * its player's turn `curseTurns` turns later. Any other glyph is held by the player and used on
 * their own turn (`useGlyph`): a stat glyph boosts one of their units while it lives (one glyph per
 * unit), Healer heals one of their units, Summoning brings back one of their destroyed units,
 * Wound hurts an enemy unit, and Negation cancels the stat glyph on an enemy unit.
 */

export function glyphTuning(ctx: RulesContext): GlyphTuning {
  return tuningOf(ctx).glyphs ?? DEFAULT_GLYPHS;
}

/** Lay the game's glyphs face down on the battlefield (when deployment ends). */
export function scatterGlyphs(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  const count = Math.min(GLYPH_KINDS.length, Math.max(0, Math.floor(state.config.glyphs ?? 0)));
  if (count === 0) return;
  const rng = new Rng(state.rng);
  const kinds = [...GLYPH_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  // Open standard terrain on top of each hex, out of every start zone, with no figure or scenery.
  // Every player's start zone, as grown to fit their army.
  const zoned = new Set(state.players.flatMap((p) => state.zones?.[p.id] ?? ctx.board.startZone(p.zone ?? -1)).map(hexKey));
  const occ = occupancy(state, ctx);
  const open: Step[] = [];
  for (const h of ctx.board.hexes()) {
    const top = ctx.board.topSurface(h);
    if (!top || zoned.has(hexKey(h))) continue;
    if (ctx.terrain.get(top.terrain)?.category !== "standard") continue;
    const step = { hex: h, elevation: top.elevation };
    if (ctx.board.sceneryAt(h, top.elevation) || occ.has(stepKey(step))) continue;
    open.push(step);
  }
  open.sort((a, b) => hexKey(a.hex).localeCompare(hexKey(b.hex)));
  // Spread them out: never within 2 hexes of another while there is room.
  const chosen: Step[] = [];
  for (let n = 0; n < count && open.length > 0; n++) {
    const apart = open.filter((s) => chosen.every((c) => hexDistance(c.hex, s.hex) > 2));
    const from = apart.length > 0 ? apart : open;
    const pick = from[rng.int(0, from.length - 1)]!;
    chosen.push(pick);
    open.splice(open.indexOf(pick), 1);
  }
  state.rng = rng.state;
  const onBoard = chosen.map((s, i) => ({ id: `g${i + 1}`, kind: kinds[i]!, hex: s.hex, elevation: s.elevation }));
  state.glyphs = { onBoard, held: Object.fromEntries(state.players.map((p) => [p.id, []])), boosts: [], curses: [] };
  events.push({ type: "glyphsPlaced", glyphs: onBoard.map(({ id, hex, elevation }) => ({ id, hex, elevation })) });
}

/** A figure has ended its move: it picks up any glyph under it. */
export function pickUpGlyphs(state: GameState, unit: UnitState, figure: FigureState, events: GameEvent[], ctx: RulesContext): void {
  const g = state.glyphs;
  if (!g || g.onBoard.length === 0 || figure.destroyed || !figure.position) return;
  const card = cardOf(unit, ctx);
  const t = glyphTuning(ctx);
  for (const s of figureSpots(figure, card.footprint, card.height, ctx)) {
    const i = g.onBoard.findIndex((o) => hexKey(o.hex) === hexKey(s.hex) && o.elevation === s.elevation);
    if (i < 0) continue;
    const glyph = g.onBoard[i]!;
    g.onBoard.splice(i, 1);
    const kind = glyph.kind!;
    const base = { type: "glyphTaken" as const, player: unit.owner, figureId: figure.id, glyphId: glyph.id };
    if (kind === "pit") {
      events.push({ ...base, trap: kind });
      woundFigure(state, unit, figure, t.pitWounds, statsOf(card).life, "glyph", events);
    } else if (kind === "curse") {
      events.push({ ...base, trap: kind });
      // The turn it is picked up in does not count.
      g.curses.push({ glyphId: glyph.id, figureId: figure.id, player: unit.owner, turnsLeft: t.curseTurns + 1 });
    } else {
      (g.held[unit.owner] ??= []).push({ id: glyph.id, kind });
      events.push(base);
    }
    if (figure.destroyed) return;
  }
}

/** A player has ended a turn: their cursed figures come one turn nearer the end. */
export function curseTurnEnded(state: GameState, player: PlayerId, events: GameEvent[]): void {
  const g = state.glyphs;
  if (!g) return;
  for (const c of [...g.curses]) {
    if (c.player !== player) continue;
    c.turnsLeft -= 1;
    if (c.turnsLeft > 0) continue;
    g.curses.splice(g.curses.indexOf(c), 1);
    const hit = findFigure(state, c.figureId);
    if (!hit || hit.figure.destroyed) continue;
    events.push({ type: "curseStruck", figureId: c.figureId });
    destroyFigure(hit.unit, hit.figure, "glyph", events);
  }
}

/** The stat glyph on a unit, if it still lives. */
export function glyphOn(state: GameState, unitId: string): GlyphKind | null {
  const boost = state.glyphs?.boosts.find((b) => b.unitId === unitId);
  if (!boost) return null;
  const unit = findUnit(state, unitId);
  return unit && isUnitAlive(unit) ? boost.kind : null;
}

/** What a stat glyph adds to one of a unit's stats. */
export function glyphBonus(state: GameState, unitId: string, stat: "attack" | "defense" | "range" | "move", ctx: RulesContext): number {
  return glyphOn(state, unitId) === stat ? glyphTuning(ctx)[stat] : 0;
}

/**
 * What a player adds to this round's initiative rolls: a glyph of initiative on a living unit,
 * played in an earlier round. It counts for one roll-off only (`spendInitiativeGlyphs`).
 */
export function initiativeBonus(state: GameState, player: PlayerId, ctx?: RulesContext): number {
  const g = state.glyphs;
  if (!g) return 0;
  const per = (ctx ? glyphTuning(ctx) : DEFAULT_GLYPHS).initiative;
  return g.boosts.filter((b) => b.kind === "initiative" && findUnit(state, b.unitId)?.owner === player && glyphOn(state, b.unitId) === "initiative").length * per;
}

/** Initiative has been rolled: every glyph of initiative has had its one roll and is gone. */
export function spendInitiativeGlyphs(state: GameState, events: GameEvent[]): void {
  const g = state.glyphs;
  if (!g) return;
  for (const b of g.boosts.filter((x) => x.kind === "initiative")) {
    events.push({ type: "glyphSpent", glyphId: b.glyphId, kind: b.kind, unitId: b.unitId });
  }
  g.boosts = g.boosts.filter((x) => x.kind !== "initiative");
}

/** Why a held glyph cannot be used on this unit now, or null. */
export function glyphProblem(state: GameState, player: PlayerId, glyphId: string, unitId: string, ctx: RulesContext): string | null {
  if (state.phase !== "turns" || !state.active) return "Glyphs are used during your turn";
  if (state.active.player !== player) return "It is not your turn";
  const held = state.glyphs?.held[player]?.find((h) => h.id === glyphId);
  if (!held || !held.kind) return "You do not hold that glyph";
  const unit = findUnit(state, unitId);
  if (!unit) return "Choose a unit";
  const own = unit.owner === player;
  const alive = isUnitAlive(unit);
  switch (held.kind) {
    case "attack":
    case "defense":
    case "initiative":
    case "range":
    case "move":
      if (!own) return "A stat glyph goes on one of your own units";
      if (!alive) return "That unit has been destroyed";
      if (glyphOn(state, unitId)) return "That unit already has a glyph";
      if (held.kind === "range" && statsOf(cardOf(unit, ctx)).range <= 1) return "The Glyph of the Hawk goes only on a unit with a Range above 1";
      return null;
    case "heal":
      if (!own) return "Healing is for one of your own units";
      if (!alive) return "That unit has been destroyed";
      if (!unit.figures.some((f) => !f.destroyed && f.wounds > 0)) return "That unit has no wounds to heal";
      return null;
    case "summon":
      if (!own) return "Summoning brings back one of your own units";
      if (alive) return "Only a unit that has been destroyed can be summoned";
      return null;
    case "wound":
    case "negate":
      if (own) return "Choose an enemy unit";
      if (!alive) return "That unit has been destroyed";
      if (held.kind === "negate" && !glyphOn(state, unitId)) return "That unit has no glyph to cancel";
      return null;
    default:
      return "That glyph cannot be used";
  }
}

/** Where a summoned figure may stand: within reach of another of the player's figures, free and fitting. */
export function summonProblem(state: GameState, player: PlayerId, unitId: string, placements: readonly FigurePlacement[], ctx: RulesContext): string | null {
  const unit = findUnit(state, unitId)!;
  const card = cardOf(unit, ctx);
  if (placements.length !== unit.figures.length || !unit.figures.every((f) => placements.some((p) => p.figureId === f.id))) {
    return "Place every figure of the unit";
  }
  const reach = glyphTuning(ctx).summonRange;
  const friends = state.units
    .filter((u) => u.owner === player && u.id !== unitId)
    .flatMap((u) => u.figures.flatMap((f) => figureSpots(f, cardOf(u, ctx).footprint, cardOf(u, ctx).height, ctx)));
  if (friends.length === 0) return "No figure of yours is on the battlefield to summon beside";
  const occ = occupancy(state, ctx);
  const taken = new Set<string>();
  for (const p of placements) {
    const spots = placementSpots(card.footprint, card.height, { hex: p.hex, elevation: p.elevation, rotation: p.rotation ?? 0 }, ctx);
    if (!spots) return "A figure does not fit there";
    for (const s of spots) {
      if (occ.has(stepKey(s)) || taken.has(stepKey(s))) return "That spot is taken";
      taken.add(stepKey(s));
    }
    if (!spots.some((s) => friends.some((f) => hexDistance(f.hex, s.hex) <= reach))) {
      return `Each figure must be within ${reach} hexes of another of your figures`;
    }
  }
  return null;
}

/**
 * Where one more figure of a destroyed unit being resurrected may go: free spots that fit it,
 * within reach of another of the player's figures, nearest first. `extraTaken` holds the spots
 * of its figures already placed. Empty when there is no figure to place it beside.
 */
export function summonOptions(
  state: GameState,
  player: PlayerId,
  unitId: string,
  ctx: RulesContext,
  extraTaken: readonly Step[] = [],
): { placement: Placement; spots: Step[] }[] {
  const unit = findUnit(state, unitId);
  if (!unit) return [];
  const card = cardOf(unit, ctx);
  const reach = glyphTuning(ctx).summonRange;
  const friends = state.units
    .filter((u) => u.owner === player && u.id !== unitId)
    .flatMap((u) => u.figures.flatMap((f) => figureSpots(f, cardOf(u, ctx).footprint, cardOf(u, ctx).height, ctx)));
  if (friends.length === 0) return [];
  const near = (h: { q: number; r: number }) => Math.min(...friends.map((f) => hexDistance(f.hex, h)));
  const taken = new Set([...occupancy(state, ctx).keys(), ...extraTaken.map(stepKey)]);
  const rotations = card.footprint === "1" ? [0] : [0, 1, 2, 3, 4, 5];
  const out: { placement: Placement; spots: Step[]; gap: number }[] = [];
  for (const h of ctx.board.hexes()) {
    // A figure's other hexes lie at most 3 further than the one it is placed by.
    if (near(h) > reach + 3) continue;
    for (const s of ctx.board.surfaces(h)) {
      for (const rotation of rotations) {
        const placement = { hex: h, elevation: s.elevation, rotation };
        const spots = placementSpots(card.footprint, card.height, placement, ctx);
        if (!spots || spots.some((p) => taken.has(stepKey(p)))) continue;
        const gap = Math.min(...spots.map((p) => near(p.hex)));
        if (gap <= reach) out.push({ placement, spots, gap });
      }
    }
  }
  out.sort((a, b) => a.gap - b.gap || hexKey(a.placement.hex).localeCompare(hexKey(b.placement.hex)) || a.placement.elevation - b.placement.elevation);
  return out.map(({ placement, spots }) => ({ placement, spots }));
}

/**
 * Spots for every figure of a destroyed unit being resurrected, each the nearest still free.
 * Null when there is no room for the whole unit.
 */
export function summonPlacements(state: GameState, player: PlayerId, unitId: string, ctx: RulesContext): FigurePlacement[] | null {
  const unit = findUnit(state, unitId);
  if (!unit) return null;
  const big = cardOf(unit, ctx).footprint !== "1";
  const taken: Step[] = [];
  const out: FigurePlacement[] = [];
  for (const f of unit.figures) {
    const next = summonOptions(state, player, unitId, ctx, taken)[0];
    if (!next) return null;
    taken.push(...next.spots);
    const { hex, elevation, rotation } = next.placement;
    out.push(big ? { figureId: f.id, hex, elevation, rotation } : { figureId: f.id, hex, elevation });
  }
  return summonProblem(state, player, unitId, out, ctx) === null ? out : null;
}

/** Use a held glyph on a unit. */
export function useGlyph(
  state: GameState,
  player: PlayerId,
  glyphId: string,
  unitId: string,
  placements: readonly FigurePlacement[] | undefined,
  events: GameEvent[],
  ctx: RulesContext,
): void {
  const problem = glyphProblem(state, player, glyphId, unitId, ctx);
  if (problem) fail(problem);
  const g = state.glyphs!;
  const held = g.held[player]!;
  const glyph = held.find((h) => h.id === glyphId)!;
  const kind = glyph.kind!;
  const unit = findUnit(state, unitId)!;
  const card = cardOf(unit, ctx);
  if (kind === "summon") {
    const where = summonProblem(state, player, unitId, placements ?? [], ctx);
    if (where) fail(where);
  }
  held.splice(held.indexOf(glyph), 1);
  events.push({ type: "glyphUsed", player, glyphId, kind, unitId });

  if (STAT_GLYPHS.includes(kind)) {
    g.boosts = g.boosts.filter((b) => b.unitId !== unitId);
    g.boosts.push({ glyphId, kind, unitId });
    return;
  }
  switch (kind) {
    case "heal":
      for (const f of unit.figures) {
        if (f.destroyed || f.wounds === 0) continue;
        events.push({ type: "figureHealed", figureId: f.id, amount: f.wounds, total: 0 });
        f.wounds = 0;
      }
      return;
    case "summon":
      // A unit comes back whole; any glyph it had ended with it.
      g.boosts = g.boosts.filter((b) => b.unitId !== unitId);
      for (const f of unit.figures) {
        const p = placements!.find((x) => x.figureId === f.id)!;
        f.destroyed = false;
        f.wounds = 0;
        f.position = { hex: p.hex, elevation: p.elevation, rotation: p.rotation ?? 0 };
        events.push({ type: "figureRevived", figureId: f.id, at: { hex: p.hex, elevation: p.elevation } });
      }
      return;
    case "wound": {
      const life = statsOf(card).life;
      for (const f of unit.figures) {
        if (f.destroyed || !f.position) continue;
        // A squad: a wound on every figure. A hero: half the Life it has left, at least 1.
        const wounds = isSquad(card) ? 1 : Math.max(1, Math.floor((life - f.wounds) / 2));
        woundFigure(state, unit, f, wounds, life, "glyph", events);
      }
      checkGameOver(state, events, ctx);
      return;
    }
    case "negate": {
      const boost = g.boosts.find((b) => b.unitId === unitId)!;
      g.boosts = g.boosts.filter((b) => b !== boost);
      events.push({ type: "glyphCancelled", glyphId: boost.glyphId, kind: boost.kind, unitId });
      return;
    }
  }
}
