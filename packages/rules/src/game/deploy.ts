import { hexKey } from "../hex";
import type { UnitCard } from "../schema";
import { fail } from "./errors";
import { placementSpots, type Placement } from "./placement";
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
  skipDepartedDeployers(state);
  if (!currentDeployment(state)) finishDeployment(state, events);
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
  const zone = state.players.find((p) => p.id === player)?.zone ?? -1;
  const taken = occupancy(state, ctx);
  const spots: Step[] = [];
  for (const h of ctx.board.startZone(zone)) {
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
  const zoneId = state.players.find((p) => p.id === player)?.zone ?? -1;
  const zone = new Set(ctx.board.startZone(zoneId).map(hexKey));
  const taken = occupancy(state, ctx);
  const extra = new Set(extraTaken.map(stepKey));
  const rotations = card.footprint === "1" ? [0] : [0, 1, 2, 3, 4, 5];
  const result: { placement: Placement; spots: Step[] }[] = [];
  for (const h of ctx.board.startZone(zoneId)) {
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
  const zoneId = state.players.find((p) => p.id === player)!.zone;
  const zone = new Set(ctx.board.startZone(zoneId).map(hexKey));
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
  skipDepartedDeployers(state);
  if (!currentDeployment(state)) finishDeployment(state, events);
}
