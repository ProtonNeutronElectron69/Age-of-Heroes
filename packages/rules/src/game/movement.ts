import { ATTACK_DIE, countFaces, rollDice } from "../dice";
import { DIRECTIONS, hexAdd, hexDistance, hexEquals, hexSub, isAdjacent } from "../hex";
import { Rng } from "../rng";
import type { UnitCard } from "../schema";
import type { Footprint } from "../shapes";
import { moveCostOf, type TerrainRules } from "../terrain";
import { canTrample, hasAbility, trampleRoll } from "./abilities";
import { spotsEngaged } from "./engagement";
import { fail } from "./errors";
import { figureSpots, placementKey, placementSpots, standingElevation, tuningOf, type Placement } from "./placement";
import { cardOf, findFigure, occupancy, statsOf, stepKey, type EffectiveStats, type Occupant } from "./queries";
import { checkGameOver, destroyFigure, woundFigure } from "./rounds";
import type { FigureState, GameEvent, GameState, PathStep, PlayerId, RulesContext, Step, UnitState } from "./types";

/** A reachable destination and the path the engine suggests to get there. */
export interface MoveOption {
  /** Where the front hex ends up, and the facing for multi-hex figures. */
  readonly to: PathStep;
  /** Every spot the figure covers at the destination. */
  readonly spots: Step[];
  /** Steps after the start, ending at `to`. */
  readonly path: PathStep[];
  readonly cost: number;
  /** Risky moments on the path: lava and ice rolls, falls and passing strikes. */
  readonly hazards: number;
}

interface Mover {
  readonly unit: UnitState;
  readonly figure: FigureState;
  readonly card: UnitCard;
  readonly stats: EffectiveStats;
  readonly footprint: Footprint;
  readonly start: Placement;
  readonly startSpots: Step[];
  /** Movement points available: Move, or a bonus move after attacking (Smoke Step). */
  readonly budget: number;
  /** A bonus move draws no passing strikes. */
  readonly noStrikes: boolean;
  /** Flying figures move straight to any spot within range, ignoring what is between. */
  readonly flying: boolean;
  /** Trample: may move through Small and Medium enemies. */
  readonly trample: boolean;
}

/** An enemy figure, with the spots it covers, for engagement checks. */
interface Enemy extends Occupant {
  readonly spots: Step[];
  readonly height: number;
}

function terrainOf(step: Step, ctx: RulesContext): TerrainRules | undefined {
  const id = ctx.board.surfaceAt(step.hex, step.elevation)?.terrain;
  return id ? ctx.terrain.get(id) : undefined;
}

/** Entering water or swamp from outside the "wet" group ends movement. */
export function stopsMovement(from: Step, to: Step, ctx: RulesContext): boolean {
  const group = terrainOf(to, ctx)?.stopGroup;
  return group !== undefined && terrainOf(from, ctx)?.stopGroup !== group;
}

/**
 * Can a figure physically step between two adjacent spots? The destination
 * must have room for the figure and no scenery, climbing needs headroom in
 * the current hex, and dropping needs headroom in the destination. In the
 * Advanced game a single step may not climb more levels than the figure's Height.
 */
export function canStep(from: Step, to: Step, height: number, ctx: RulesContext, mode: GameState["config"]["mode"]): boolean {
  if (!isAdjacent(from.hex, to.hex)) return false;
  const dest = ctx.board.surfaceAt(to.hex, to.elevation);
  const here = ctx.board.surfaceAt(from.hex, from.elevation);
  if (!dest || !here) return false;
  if (ctx.board.sceneryAt(to.hex, to.elevation)) return false;
  const rise = to.elevation - from.elevation;
  if (dest.clearance < Math.max(height, -rise)) return false;
  if (rise > 0 && here.clearance < rise) return false;
  if (mode === "advanced" && rise > height) return false;
  return true;
}

function moverFor(state: GameState, figureId: string, ctx: RulesContext): Mover {
  const found = findFigure(state, figureId) ?? fail(`Unknown figure "${figureId}"`);
  const { unit, figure } = found;
  if (figure.destroyed || !figure.position) fail("That figure is not on the battlefield");
  const card = cardOf(unit, ctx);
  const stats = statsOf(card, state.config.mode);
  const pos = figure.position;
  const start: Placement = { hex: pos.hex, elevation: pos.elevation, rotation: card.footprint === "1" ? 0 : pos.rotation };
  const active = state.active;
  const bonus = active && active.attacked.includes(figureId) ? active.bonusMoves[figureId] : undefined;
  return {
    unit,
    figure,
    card,
    stats,
    footprint: card.footprint,
    start,
    startSpots: figureSpots(figure, card.footprint, stats.height, ctx),
    budget: bonus ?? stats.move,
    noStrikes: bonus !== undefined,
    flying: card.footprint === "1" && hasAbility(state, card, "flying"),
    trample: hasAbility(state, card, "trample"),
  };
}

function enemiesOf(state: GameState, mover: Mover, ctx: RulesContext): Enemy[] {
  if (state.config.mode !== "advanced") return [];
  const result: Enemy[] = [];
  for (const unit of state.units) {
    if (unit.owner === mover.unit.owner) continue;
    const card = ctx.cards.get(unit.cardId);
    if (!card) continue;
    for (const figure of unit.figures) {
      const spots = figureSpots(figure, card.footprint, card.height, ctx);
      if (spots.length > 0) result.push({ unit, figure, spots, height: card.height });
    }
  }
  return result;
}

function engagedIds(enemies: readonly Enemy[], spots: readonly Step[], height: number): Set<string> {
  const ids = new Set<string>();
  for (const e of enemies) if (spotsEngaged(spots, height, e.spots, e.height)) ids.add(e.figure.id);
  return ids;
}

/** What happens on one step of a move. */
interface StepInfo {
  readonly to: Placement;
  readonly spots: Step[];
  readonly cost: number;
  readonly stops: boolean;
  /** Spots newly covered on this step. */
  readonly entered: Step[];
  readonly lava: number;
  readonly ice: number;
  /** Levels dropped (positive) by the figure's highest hex. */
  readonly drop: number;
  /** Enemies the figure walks away from (Advanced passing strikes). */
  readonly strikes: Enemy[];
  /** Enemies the figure moves through with Trample. */
  readonly trampled: Occupant[];
}

function fallDice(drop: number, height: number, state: GameState, ctx: RulesContext): number {
  if (state.config.mode !== "advanced" || drop < height) return 0;
  const { minorDice, majorDice } = tuningOf(ctx).falling;
  return drop >= height * 2 ? majorDice : minorDice;
}

function hazardsOf(info: StepInfo, mover: Mover, state: GameState, ctx: RulesContext): number {
  return info.lava + info.ice + info.strikes.length + (fallDice(info.drop, mover.stats.height, state, ctx) > 0 ? 1 : 0);
}

/**
 * Work out one step from `from` to `to`: either a move of the front hex to an
 * adjacent hex (keeping the facing), or, for multi-hex figures, a turn of 60
 * degrees in place. Returns a reason string when the step is not allowed.
 */
function evaluateStep(
  state: GameState,
  mover: Mover,
  from: Placement,
  fromSpots: readonly Step[],
  to: Placement,
  occ: Map<string, Occupant>,
  enemies: readonly Enemy[],
  ctx: RulesContext,
): StepInfo | string {
  const single = mover.footprint === "1";
  const turning = hexEquals(from.hex, to.hex) && from.elevation === to.elevation;
  if (turning) {
    const diff = (((to.rotation - from.rotation) % 6) + 6) % 6;
    if (single || (diff !== 1 && diff !== 5)) return "The figure cannot move that way";
  } else if (!isAdjacent(from.hex, to.hex) || to.rotation !== from.rotation) {
    return "The figure cannot move that way";
  }
  const height = mover.stats.height;
  const spots = placementSpots(mover.footprint, height, to, ctx);
  if (!spots) return "The figure does not fit there";
  if (!turning) {
    for (let i = 0; i < spots.length; i++) {
      if (!canStep(fromSpots[i]!, spots[i]!, height, ctx, state.config.mode)) return "The figure cannot move that way";
    }
  }
  const trampled: Occupant[] = [];
  for (const s of spots) {
    const o = occ.get(stepKey(s));
    if (o && o.figure.id !== mover.figure.id && o.unit.owner !== mover.unit.owner) {
      const victim = ctx.cards.get(o.unit.cardId);
      if (!victim || !canTrample(state, mover.card, victim)) return "The path goes through an enemy figure";
      if (!fromSpots.some((f) => hexEquals(f.hex, s.hex)) && !trampled.some((t) => t.figure.id === o.figure.id)) {
        trampled.push(o);
      }
    }
  }

  const entered = spots.filter((s) => !fromSpots.some((f) => hexEquals(f.hex, s.hex)));
  const extra = Math.max(0, ...entered.map((s) => moveCostOf(terrainOf(s, ctx)) - 1));
  const climb = Math.max(0, ...spots.map((s, i) => s.elevation - fromSpots[i]!.elevation));
  const stops = spots.some((s, i) => entered.includes(s) && stopsMovement(fromSpots[i]!, s, ctx));
  const before = engagedIds(enemies, fromSpots, height);
  const after = engagedIds(enemies, spots, height);
  return {
    to,
    spots,
    cost: (turning ? 0 : 1) + extra + climb,
    stops,
    entered,
    lava: entered.filter((s) => terrainOf(s, ctx)?.entryDestroyOnOrBelow !== undefined).length,
    ice: single ? entered.filter((s) => terrainOf(s, ctx)?.slip !== undefined).length : 0,
    drop: standingElevation(fromSpots) - standingElevation(spots),
    strikes: mover.noStrikes ? [] : enemies.filter((e) => before.has(e.figure.id) && !after.has(e.figure.id)),
    trampled,
  };
}

/** Placements reachable in one step: shifts in all six directions, and turns for multi-hex figures. */
function nextPlacements(from: Placement, footprint: Footprint, ctx: RulesContext): Placement[] {
  const result: Placement[] = [];
  for (const d of DIRECTIONS) {
    const hex = hexAdd(from.hex, d);
    for (const s of ctx.board.surfaces(hex)) result.push({ hex, elevation: s.elevation, rotation: from.rotation });
  }
  if (footprint !== "1") {
    result.push({ ...from, rotation: (from.rotation + 1) % 6 }, { ...from, rotation: (from.rotation + 5) % 6 });
  }
  return result;
}

/** The extra move a figure gets for staying on bonus terrain (road), if all of it starts there. */
function stayOnBonus(spots: readonly Step[], ctx: RulesContext): { terrain: string; bonus: number } | null {
  const first = terrainOf(spots[0]!, ctx);
  if (!first?.stayOnBonusMove) return null;
  if (!spots.every((s) => terrainOf(s, ctx)?.id === first.id)) return null;
  return { terrain: first.id, bonus: first.stayOnBonusMove };
}

function asPathStep(p: Placement, footprint: Footprint): PathStep {
  return footprint === "1" ? { hex: p.hex, elevation: p.elevation } : { hex: p.hex, elevation: p.elevation, rotation: p.rotation };
}

interface Label {
  readonly placement: Placement;
  readonly spots: Step[];
  readonly cost: number;
  readonly hazards: number;
  readonly stopped: boolean;
  readonly prev: Label | null;
}

/**
 * Search every placement the figure can reach within `budget`. For each
 * placement keep, per cost, the path with the fewest hazards, so a slightly
 * longer path that avoids lava or a passing strike is still offered.
 */
function search(
  state: GameState,
  mover: Mover,
  budget: number,
  onlyTerrain: string | null,
  ctx: RulesContext,
): Map<string, MoveOption> {
  const occ = occupancy(state, ctx);
  const enemies = enemiesOf(state, mover, ctx);
  const labels = new Map<string, Label>();
  const buckets: Label[][] = Array.from({ length: budget + 1 }, () => []);
  buckets[0]!.push({ placement: mover.start, spots: mover.startSpots, cost: 0, hazards: 0, stopped: false, prev: null });

  for (let c = 0; c <= budget; c++) {
    // Turning costs nothing, so labels can be appended to the bucket being read.
    for (const label of buckets[c]!) {
      if (label.stopped) continue;
      for (const to of nextPlacements(label.placement, mover.footprint, ctx)) {
        const info = evaluateStep(state, mover, label.placement, label.spots, to, occ, enemies, ctx);
        if (typeof info === "string") continue;
        if (onlyTerrain && !info.spots.every((s) => terrainOf(s, ctx)?.id === onlyTerrain)) continue;
        const cost = c + info.cost;
        if (cost > budget) continue;
        const next: Label = {
          placement: to,
          spots: info.spots,
          cost,
          hazards: label.hazards + hazardsOf(info, mover, state, ctx),
          stopped: info.stops,
          prev: label,
        };
        const key = `${placementKey(to)}|${cost}|${next.stopped}`;
        const existing = labels.get(key);
        if (existing && existing.hazards <= next.hazards) continue;
        labels.set(key, next);
        buckets[cost]!.push(next);
      }
    }
  }

  const startKey = placementKey(mover.start);
  const best = new Map<string, MoveOption>();
  for (const label of labels.values()) {
    const key = placementKey(label.placement);
    if (key === startKey) continue;
    // A figure cannot end its move on another figure.
    if (label.spots.some((s) => {
      const o = occ.get(stepKey(s));
      return o !== undefined && o.figure.id !== mover.figure.id;
    })) {
      continue;
    }
    const current = best.get(key);
    if (current && (current.hazards < label.hazards || (current.hazards === label.hazards && current.cost <= label.cost))) {
      continue;
    }
    const path: PathStep[] = [];
    for (let l: Label | null = label; l && l.prev; l = l.prev) path.unshift(asPathStep(l.placement, mover.footprint));
    best.set(key, {
      to: asPathStep(label.placement, mover.footprint),
      spots: label.spots,
      path,
      cost: label.cost,
      hazards: label.hazards,
    });
  }
  return best;
}

/**
 * Flying: every free spot within Move hexes (counted straight across), at
 * any height. Terrain and figures in between do not matter; only where the
 * figure lands does.
 */
function flightOptions(state: GameState, mover: Mover, ctx: RulesContext): Map<string, MoveOption> {
  const occ = occupancy(state, ctx);
  const enemies = enemiesOf(state, mover, ctx);
  const before = engagedIds(enemies, mover.startSpots, mover.stats.height);
  const options = new Map<string, MoveOption>();
  for (const hex of ctx.board.hexes()) {
    const cost = hexDistance(mover.start.hex, hex);
    if (cost > mover.budget) continue;
    for (const s of ctx.board.surfaces(hex)) {
      const to: Placement = { hex, elevation: s.elevation, rotation: 0 };
      if (placementKey(to) === placementKey(mover.start)) continue;
      const spots = placementSpots("1", mover.stats.height, to, ctx);
      if (!spots) continue;
      const o = occ.get(stepKey(spots[0]!));
      if (o && o.figure.id !== mover.figure.id) continue;
      const after = engagedIds(enemies, spots, mover.stats.height);
      const strikes = mover.noStrikes ? 0 : [...before].filter((id) => !after.has(id)).length;
      const lava = ctx.terrain.get(s.terrain)?.entryDestroyOnOrBelow !== undefined ? 1 : 0;
      const dest = asPathStep(to, "1");
      options.set(placementKey(to), { to: dest, spots, path: [dest], cost, hazards: strikes + lava });
    }
  }
  return options;
}

/** Every placement the figure could move to this turn, keyed by placementKey, with a suggested path. */
export function moveOptions(state: GameState, figureId: string, ctx: RulesContext): Map<string, MoveOption> {
  const mover = moverFor(state, figureId, ctx);
  if (mover.flying) return flightOptions(state, mover, ctx);
  const options = search(state, mover, mover.budget, null, ctx);
  const bonus = mover.noStrikes ? null : stayOnBonus(mover.startSpots, ctx);
  if (bonus) {
    for (const [key, opt] of search(state, mover, mover.budget + bonus.bonus, bonus.terrain, ctx)) {
      const current = options.get(key);
      if (!current || opt.hazards < current.hazards || (opt.hazards === current.hazards && opt.cost < current.cost)) {
        options.set(key, opt);
      }
    }
  }
  return options;
}

/** Can this figure act now? Returns the active turn and mover, or throws. */
function activeMover(state: GameState, player: PlayerId, figureId: string, ctx: RulesContext) {
  const active = state.active;
  if (state.phase !== "turns" || !active) fail("No turn is in progress");
  if (active.player !== player) fail("It is not your turn");
  const mover = moverFor(state, figureId, ctx);
  if (mover.unit.id !== active.unitId) fail("Only the activated unit can act this turn");
  if (active.attacked.includes(figureId)) {
    // Smoke Step allows one short move after attacking, even after moving before.
    if (!active.bonusMoves[figureId]) fail("A figure cannot move after attacking");
  } else if (active.moved.includes(figureId)) {
    fail("That figure has already moved this turn");
  }
  return { active, mover };
}

function toPlacement(step: PathStep, current: Placement, footprint: Footprint): Placement {
  return { hex: step.hex, elevation: step.elevation, rotation: footprint === "1" ? 0 : (step.rotation ?? current.rotation) };
}

/** Check a requested path step by step. */
function validatePath(state: GameState, mover: Mover, path: readonly PathStep[], ctx: RulesContext): void {
  if (path.length === 0) fail("The path is empty");
  if (mover.flying) {
    if (path.length !== 1) fail("A flying figure moves straight to where it lands");
    const dest = toPlacement(path[0]!, mover.start, "1");
    const option = flightOptions(state, mover, ctx).get(placementKey(dest));
    if (!option) {
      const cost = hexDistance(mover.start.hex, dest.hex);
      if (cost > mover.budget) fail(`That move costs ${cost} but the figure only has ${mover.budget}`);
      fail("The figure cannot land there");
    }
    return;
  }
  const occ = occupancy(state, ctx);
  const enemies = enemiesOf(state, mover, ctx);
  let from = mover.start;
  let fromSpots = mover.startSpots;
  let cost = 0;
  let allBonusTerrain = true;
  const bonus = stayOnBonus(mover.startSpots, ctx);
  path.forEach((raw, i) => {
    const to = toPlacement(raw, from, mover.footprint);
    const info = evaluateStep(state, mover, from, fromSpots, to, occ, enemies, ctx);
    if (typeof info === "string") fail(info);
    if (info.stops && i < path.length - 1) fail("Entering water or swamp ends movement");
    if (bonus && !info.spots.every((s) => terrainOf(s, ctx)?.id === bonus.terrain)) allBonusTerrain = false;
    cost += info.cost;
    from = to;
    fromSpots = info.spots;
  });
  for (const s of fromSpots) {
    const o = occ.get(stepKey(s));
    if (o && o.figure.id !== mover.figure.id) fail("A figure cannot end its move on another figure");
  }
  if (placementKey(from) === placementKey(mover.start)) fail("The figure must end somewhere new");
  const budget = mover.budget + (bonus && allBonusTerrain && !mover.noStrikes ? bonus.bonus : 0);
  if (cost > budget) fail(`That move costs ${cost} but the figure only has ${budget}`);
}

/** Roll attack dice against a figure with no defense roll (falls and passing strikes). */
function unblockable(
  state: GameState,
  rng: Rng,
  dice: number,
  mover: Mover,
  source: "fall" | "passingStrike",
  attackerId: string | null,
  events: GameEvent[],
): void {
  const attack = rollDice(rng, ATTACK_DIE, dice);
  const hits = countFaces(attack, "skull");
  events.push({
    type: "attackRolled",
    source,
    attackerId,
    targetId: mover.figure.id,
    attack,
    defense: [],
    hits,
    blocks: 0,
    wounds: hits,
    attackBonus: 0,
    defenseBonus: 0,
  });
  woundFigure(state, mover.unit, mover.figure, hits, mover.stats.life, source, events);
}

export function moveFigure(
  state: GameState,
  player: PlayerId,
  figureId: string,
  path: readonly PathStep[],
  events: GameEvent[],
  ctx: RulesContext,
): void {
  const { active, mover } = activeMover(state, player, figureId, ctx);
  validatePath(state, mover, path, ctx);
  if (!active.moved.includes(figureId)) active.moved.push(figureId);
  if (mover.noStrikes) delete active.bonusMoves[figureId];

  const rng = new Rng(state.rng);
  const { figure, unit } = mover;
  const single = mover.footprint === "1";
  const occ = occupancy(state, ctx);
  const enemies = enemiesOf(state, mover, ctx);
  const traversed: PathStep[] = [];
  const after: GameEvent[] = [];
  let from = mover.start;
  let fromSpots = mover.startSpots;

  const lavaRolls = (spots: readonly Step[]): boolean => {
    for (const s of spots) {
      const t = terrainOf(s, ctx);
      if (t?.entryDestroyOnOrBelow === undefined) continue;
      const roll = rng.d20();
      const destroyed = roll <= t.entryDestroyOnOrBelow;
      after.push({ type: "terrainRoll", figureId, terrain: t.id, roll, outcome: destroyed ? "destroyed" : "safe" });
      if (destroyed) {
        destroyFigure(unit, figure, "lava", after);
        return true;
      }
    }
    return false;
  };

  if (mover.flying) {
    flyTo(state, mover, toPlacement(path[0]!, from, "1"), rng, enemies, after, traversed, lavaRolls, ctx);
    state.rng = rng.state;
    events.push({ type: "figureMoved", figureId, from: asPathStep(mover.start, mover.footprint), path: traversed }, ...after);
    checkGameOver(state, events, ctx);
    return;
  }

  const trampledSoFar = new Set<string>();
  const self = { unit, figure, card: mover.card, spots: fromSpots };
  for (const raw of path) {
    const to = toPlacement(raw, from, mover.footprint);
    const info = evaluateStep(state, mover, from, fromSpots, to, occ, enemies, ctx);
    if (typeof info === "string") break; // validated above; cannot happen

    // 1. Enemies left behind strike as the figure walks away.
    for (const e of info.strikes) {
      unblockable(state, rng, tuningOf(ctx).passingStrikeDice, mover, "passingStrike", e.figure.id, after);
      if (figure.destroyed) break;
    }
    if (figure.destroyed) break;

    // 2. Move, trampling anything small in the way.
    figure.position = { hex: to.hex, elevation: to.elevation, rotation: to.rotation };
    traversed.push(asPathStep(to, mover.footprint));
    for (const victim of info.trampled) {
      if (trampledSoFar.has(victim.figure.id) || victim.figure.destroyed) continue;
      trampledSoFar.add(victim.figure.id);
      trampleRoll(state, rng, { ...self, spots: info.spots }, victim, ctx, after);
    }

    // 3. Falling (Advanced).
    const dice = fallDice(info.drop, mover.stats.height, state, ctx);
    if (dice > 0) {
      unblockable(state, rng, dice, mover, "fall", null, after);
      if (figure.destroyed) break;
    }

    // 4. Lava.
    if (lavaRolls(info.entered)) break;

    // 5. Ice (single-hex figures only).
    if (info.ice > 0) {
      const t = terrainOf(info.spots[0]!, ctx)!;
      const roll = rng.d20();
      const slipped = roll <= t.slip!.onOrBelow;
      after.push({ type: "terrainRoll", figureId, terrain: t.id, roll, outcome: slipped ? "slipped" : "safe" });
      if (slipped) {
        const slide = slideTarget(mover, fromSpots[0]!, info.spots[0]!, occ, ctx);
        if (slide) {
          after.push({ type: "figureSlid", figureId, to: slide });
          figure.position = { hex: slide.hex, elevation: slide.elevation, rotation: 0 };
          lavaRolls([slide]); // a slide can carry a figure into lava, but never slips twice
        }
        break;
      }
    }
    from = to;
    fromSpots = info.spots;
  }

  // A slip can leave a single-hex figure on a spot it was only passing through.
  if (single && !figure.destroyed && figure.position) {
    const here = occ.get(stepKey(figure.position));
    if (here && here.figure.id !== figure.id) {
      const fallback = [...traversed].reverse().find((s) => {
        const o = occ.get(stepKey(s));
        return !o || o.figure.id === figure.id;
      });
      const back = fallback ?? mover.start;
      figure.position = { hex: back.hex, elevation: back.elevation, rotation: 0 };
      after.push({ type: "figureSlid", figureId, to: { hex: back.hex, elevation: back.elevation } });
    }
  }

  state.rng = rng.state;
  events.push({ type: "figureMoved", figureId, from: asPathStep(mover.start, mover.footprint), path: traversed }, ...after);
  checkGameOver(state, events, ctx);
}

/** A flight: passing strikes on take-off, then only the landing hex matters (lava). */
function flyTo(
  state: GameState,
  mover: Mover,
  to: Placement,
  rng: Rng,
  enemies: readonly Enemy[],
  after: GameEvent[],
  traversed: PathStep[],
  lavaRolls: (spots: readonly Step[]) => boolean,
  ctx: RulesContext,
): void {
  const spots = placementSpots("1", mover.stats.height, to, ctx)!;
  if (!mover.noStrikes) {
    const before = engagedIds(enemies, mover.startSpots, mover.stats.height);
    const landed = engagedIds(enemies, spots, mover.stats.height);
    for (const e of enemies) {
      if (!before.has(e.figure.id) || landed.has(e.figure.id)) continue;
      unblockable(state, rng, tuningOf(ctx).passingStrikeDice, mover, "passingStrike", e.figure.id, after);
      if (mover.figure.destroyed) return;
    }
  }
  mover.figure.position = { hex: to.hex, elevation: to.elevation, rotation: 0 };
  traversed.push(asPathStep(to, "1"));
  lavaRolls(spots);
}

/**
 * Where a slipping figure slides: one hex further in its direction of travel,
 * onto the highest surface there that is not above it, if it fits and is free.
 */
function slideTarget(mover: Mover, from: Step, at: Step, occ: Map<string, Occupant>, ctx: RulesContext): Step | null {
  const dir = hexSub(at.hex, from.hex);
  const hex = hexAdd(at.hex, dir);
  const candidates = ctx.board
    .surfaces(hex)
    .filter((s) => s.elevation <= at.elevation)
    .sort((a, b) => b.elevation - a.elevation);
  const s = candidates[0];
  if (!s) return null;
  const step = { hex, elevation: s.elevation };
  if (ctx.board.sceneryAt(hex, s.elevation)) return null;
  if (s.clearance < Math.max(mover.stats.height, at.elevation - s.elevation)) return null;
  const occupant = occ.get(stepKey(step));
  if (occupant && occupant.figure.id !== mover.figure.id) return null;
  return step;
}
