import { hexDistance, hexKey, hexNeighbors, type Hex } from "../hex";
import type { UnitCard } from "../schema";
import { fail } from "./errors";
import { placementSpots, type Placement } from "./placement";
import { cardSpace } from "./draft";
import { cardOf, findUnit, occupancy, statsOf, stepKey } from "./queries";
import { startRound } from "./rounds";
import type { FigurePlacement, GameEvent, GameState, PlayerId, RulesContext, Step } from "./types";

/**
 * Units are deployed one at a time. After a draft the order follows the
 * picks; with preset armies it goes round the table by seat, one unit each.
 */
export function startDeployment(state: GameState, events: GameEvent[], _ctx: RulesContext): void {
  let queue: { player: PlayerId; unitId: string }[];
  if (state.draft) {
    queue = state.draft.picks.map((p) => ({ player: p.player, unitId: p.unitId }));
  } else {
    queue = [];
    const bySeat = [...state.players].sort((a, b) => a.seat - b.seat);
    const longest = Math.max(...bySeat.map((p) => state.units.filter((u) => u.owner === p.id).length));
    for (let i = 0; i < longest; i++) {
      for (const p of bySeat) {
        const unit = state.units.filter((u) => u.owner === p.id)[i];
        if (unit) queue.push({ player: p.id, unitId: unit.id });
      }
    }
  }
  state.phase = "deploy";
  state.deploy = { queue, index: 0 };
  events.push({ type: "deploymentStarted" });
  growZonesToFit(state, events, _ctx);
  advanceDeployment(state, events, _ctx);
}

/** Move to the next unit that can be deployed, growing or skipping as needed, or end deployment. */
export function advanceDeployment(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  for (;;) {
    skipDepartedDeployers(state);
    const current = currentDeployment(state);
    if (!current) return finishDeployment(state, events);
    const unit = findUnit(state, current.unitId);
    if (!unit) return finishDeployment(state, events);
    if (ensureRoom(state, current.player, cardOf(unit, ctx), events, ctx)) return;
    // Not even a grown zone has room: the unit sits this game out rather than stalling it.
    for (const f of unit.figures) {
      f.destroyed = true;
      f.position = null;
    }
    events.push({ type: "unitNotDeployed", player: current.player, unitId: unit.id });
    state.deploy!.index += 1;
  }
}

// ---------------------------------------------------------------------------
// Start zones

/** A player's start zone: the map's zone, or the zone grown to fit their army. */
export function playerZone(state: GameState, player: PlayerId, ctx: RulesContext): Hex[] {
  const grown = state.zones?.[player];
  if (grown) return grown;
  return ctx.board.startZone(state.players.find((p) => p.id === player)?.zone ?? -1);
}

/** Can a figure stand on this hex at all (some surface with room and no scenery)? */
function standable(h: Hex, ctx: RulesContext): boolean {
  return ctx.board.surfaces(h).some((s) => s.clearance >= 1 && !ctx.board.sceneryAt(h, s.elevation));
}

/** Hexes an army needs, with slack so multi-hex figures still find room for their shape. */
function hexesWanted(state: GameState, player: PlayerId, ctx: RulesContext): number {
  const space = state.units
    .filter((u) => u.owner === player)
    .reduce((n, u) => n + (ctx.cards.get(u.cardId) ? cardSpace(ctx.cards.get(u.cardId)!) : u.figures.length), 0);
  return space + Math.ceil(space / 4) + 2;
}

/** Hexes in every player's zone, which a growing zone may not take. */
function claimed(state: GameState, ctx: RulesContext): Set<string> {
  const keys = new Set<string>();
  for (const p of state.players) for (const h of playerZone(state, p.id, ctx)) keys.add(hexKey(h));
  return keys;
}

function centre(hexes: readonly Hex[]): Hex {
  if (hexes.length === 0) return { q: 0, r: 0 };
  const q = hexes.reduce((n, h) => n + h.q, 0) / hexes.length;
  const r = hexes.reduce((n, h) => n + h.r, 0) / hexes.length;
  return { q: Math.round(q), r: Math.round(r) };
}

/**
 * The next hex a growing zone takes: next to the zone, standable, unclaimed,
 * nearest the zone's own centre, then farthest from the other players' zones.
 */
function nextZoneHex(state: GameState, player: PlayerId, taken: Set<string>, ctx: RulesContext): Hex | null {
  const zone = playerZone(state, player, ctx);
  const own = centre(zone);
  const others = state.players.filter((p) => p.id !== player).map((p) => centre(playerZone(state, p.id, ctx)));
  const onBoard = new Set(ctx.board.hexes().map(hexKey));
  let best: { h: Hex; near: number; far: number; key: string } | null = null;
  for (const z of zone) {
    for (const h of hexNeighbors(z)) {
      const key = hexKey(h);
      if (taken.has(key) || !onBoard.has(key) || !standable(h, ctx)) continue;
      const near = hexDistance(h, own);
      const far = others.length ? Math.min(...others.map((o) => hexDistance(h, o))) : 0;
      if (!best || near < best.near || (near === best.near && (far > best.far || (far === best.far && key < best.key)))) {
        best = { h, near, far, key };
      }
    }
  }
  return best?.h ?? null;
}

function addToZone(state: GameState, player: PlayerId, h: Hex, ctx: RulesContext): void {
  state.zones = { ...(state.zones ?? {}), [player]: [...playerZone(state, player, ctx), h] };
}

/**
 * Maps with `growZones`: once the draft is over, every zone that is too small for
 * its army grows one hex at a time, players taking turns, so nobody grabs the
 * middle of the map first.
 */
function growZonesToFit(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  if (!ctx.board.growsZones()) return;
  const wanted = new Map(state.players.map((p) => [p.id, hexesWanted(state, p.id, ctx)]));
  const added = new Map<PlayerId, number>();
  const taken = claimed(state, ctx);
  const seats = [...state.players].sort((a, b) => a.seat - b.seat);
  const room = (p: PlayerId) => playerZone(state, p, ctx).filter((h) => standable(h, ctx)).length;
  for (let progress = true; progress; ) {
    progress = false;
    for (const p of seats) {
      if (p.eliminated || room(p.id) >= wanted.get(p.id)!) continue;
      const h = nextZoneHex(state, p.id, taken, ctx);
      if (!h) continue;
      addToZone(state, p.id, h, ctx);
      taken.add(hexKey(h));
      added.set(p.id, (added.get(p.id) ?? 0) + 1);
      progress = true;
    }
  }
  for (const p of seats) if (added.get(p.id)) events.push({ type: "startZoneGrown", player: p.id, added: added.get(p.id)! });
}

/**
 * Make sure the unit about to deploy has somewhere to go. On maps whose zones
 * grow, a zone keeps growing until the unit fits. Returns false if it cannot.
 */
function ensureRoom(state: GameState, player: PlayerId, card: UnitCard, events: GameEvent[], ctx: RulesContext): boolean {
  if (deploymentPlacements(state, player, card, ctx).length > 0) return true;
  if (!ctx.board.growsZones()) return false;
  const taken = claimed(state, ctx);
  let added = 0;
  for (let i = 0; i < 40; i++) {
    const h = nextZoneHex(state, player, taken, ctx);
    if (!h) break;
    addToZone(state, player, h, ctx);
    taken.add(hexKey(h));
    added += 1;
    if (deploymentPlacements(state, player, card, ctx).length > 0) {
      events.push({ type: "startZoneGrown", player, added });
      return true;
    }
  }
  if (added > 0) events.push({ type: "startZoneGrown", player, added });
  return false;
}

export function currentDeployment(state: GameState): { player: PlayerId; unitId: string } | null {
  const d = state.deploy;
  if (!d) return null;
  return d.queue[d.index] ?? null;
}

export function skipDepartedDeployers(state: GameState): void {
  const d = state.deploy;
  if (!d) return;
  while (d.index < d.queue.length) {
    const entry = d.queue[d.index]!;
    const p = state.players.find((x) => x.id === entry.player);
    if (p && !p.eliminated) return;
    d.index += 1;
  }
}

function finishDeployment(state: GameState, events: GameEvent[]): void {
  events.push({ type: "deploymentEnded" });
  startRound(state, events);
}

/** Spots in a player's start zone where a single-hex figure of the given Height could stand. */
export function deploymentSpots(state: GameState, player: PlayerId, height: number, ctx: RulesContext): Step[] {
  const taken = occupancy(state, ctx);
  const spots: Step[] = [];
  for (const h of playerZone(state, player, ctx)) {
    for (const s of ctx.board.surfaces(h)) {
      const step = { hex: h, elevation: s.elevation };
      if (s.clearance >= height && !taken.has(stepKey(step)) && !ctx.board.sceneryAt(h, s.elevation)) spots.push(step);
    }
  }
  return spots;
}

/**
 * Every placement in a player's start zone where a figure of this card could
 * be set up right now: all its hexes in the zone, free, with room to stand.
 * Multi-hex figures may face any of the six directions.
 */
export function deploymentPlacements(
  state: GameState,
  player: PlayerId,
  card: UnitCard,
  ctx: RulesContext,
  extraTaken: readonly Step[] = [],
): { placement: Placement; spots: Step[] }[] {
  const zoneHexes = playerZone(state, player, ctx);
  const zone = new Set(zoneHexes.map(hexKey));
  const taken = occupancy(state, ctx);
  const extra = new Set(extraTaken.map(stepKey));
  const rotations = card.footprint === "1" ? [0] : [0, 1, 2, 3, 4, 5];
  const result: { placement: Placement; spots: Step[] }[] = [];
  for (const h of zoneHexes) {
    for (const s of ctx.board.surfaces(h)) {
      for (const rotation of rotations) {
        const placement = { hex: h, elevation: s.elevation, rotation };
        const spots = placementSpots(card.footprint, card.height, placement, ctx);
        if (!spots) continue;
        if (spots.every((x) => zone.has(hexKey(x.hex)) && !taken.has(stepKey(x)) && !extra.has(stepKey(x)))) {
          result.push({ placement, spots });
        }
      }
    }
  }
  return result;
}

export function deployUnit(
  state: GameState,
  player: PlayerId,
  unitId: string,
  placements: readonly FigurePlacement[],
  events: GameEvent[],
  ctx: RulesContext,
): void {
  const current = currentDeployment(state);
  if (state.phase !== "deploy" || !current) fail("Deployment is over");
  if (current.player !== player) fail("It is not your turn to deploy");
  if (current.unitId !== unitId) fail("Deploy your units in draft order");
  const unit = findUnit(state, unitId) ?? fail(`Unknown unit "${unitId}"`);
  const card = cardOf(unit, ctx);
  const { height } = statsOf(card, state.config.mode);

  const ids = new Set(unit.figures.map((f) => f.id));
  if (placements.length !== ids.size || !placements.every((p) => ids.has(p.figureId))) {
    fail("Place every figure of the unit exactly once");
  }
  const zone = new Set(playerZone(state, player, ctx).map(hexKey));
  const taken = occupancy(state, ctx);
  const used = new Set<string>();
  const rotationOf = (p: FigurePlacement) => (card.footprint === "1" ? 0 : (((p.rotation ?? 0) % 6) + 6) % 6);
  for (const p of placements) {
    if (!ctx.board.surfaceAt(p.hex, p.elevation)) fail("There is no ground there");
    const spots = placementSpots(card.footprint, height, { hex: p.hex, elevation: p.elevation, rotation: rotationOf(p) }, ctx);
    if (!spots) {
      if (ctx.board.sceneryAt(p.hex, p.elevation)) fail("Scenery is in the way");
      fail("The figure does not fit there");
    }
    for (const s of spots) {
      if (!zone.has(hexKey(s.hex))) fail("Figures must start in your start zone");
      const key = stepKey(s);
      if (taken.has(key) || used.has(key)) fail("That spot is already taken");
      used.add(key);
    }
  }

  for (const p of placements) {
    const figure = unit.figures.find((f) => f.id === p.figureId)!;
    figure.position = { hex: p.hex, elevation: p.elevation, rotation: rotationOf(p) };
  }
  events.push({
    type: "unitDeployed",
    player,
    unitId,
    placements: placements.map((p) => ({
      figureId: p.figureId,
      hex: p.hex,
      elevation: p.elevation,
      ...(card.footprint === "1" ? {} : { rotation: rotationOf(p) }),
    })),
  });
  state.deploy!.index += 1;
  advanceDeployment(state, events, ctx);
}
