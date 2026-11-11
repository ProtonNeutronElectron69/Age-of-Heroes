import { describe, expect, it } from "vitest";
import { createGame, currentDeployment, deploymentPlacements, hex, playerZone, type GameEvent } from "../src";
import { CARDS, makeCtx, rowMap, setup, testCard } from "./fixtures";

const flat = Array.from({ length: 6 }, () => ["grass", 1] as [string, number]);
const block = testCard("block", { footprint: "2x2", size: "huge", height: 6 });
const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe("start zones", () => {
  it("leaves out a unit that cannot fit anywhere, instead of stalling deployment", () => {
    // The test map's zones are a single row of 4 hexes: a 2x2 figure never fits.
    const ctx = makeCtx(rowMap(flat), [...CARDS, block]);
    const { state, events } = createGame(setup(2, { mapId: "test-row", armies: { p1: ["block"], p2: ["hero"] } }), ctx);
    expect(ofType(events, "unitNotDeployed")).toEqual([{ type: "unitNotDeployed", player: "p1", unitId: "p1:0" }]);
    expect(state.units.find((u) => u.id === "p1:0")!.figures.every((f) => f.destroyed)).toBe(true);
    expect(currentDeployment(state)).toMatchObject({ unitId: "p2:0" });
  });

  it("grows a zone, taking free hexes next to it, when the map allows", () => {
    // Two players in zones 0 (q 0..3) and 2 (q 8..11), leaving q 4..7 free between them.
    const map = { ...rowMap(flat), growZones: true, layouts: { "2": [0, 2] } };
    // A 5-hex army does not fit in 4 hexes, so seat 0 grows along the strip.
    const wide = testCard("wide", { unitType: "commonSquad", figureCount: 4 });
    const ctx = makeCtx(map, [...CARDS, wide]);
    const { state, events } = createGame(setup(2, { mapId: "test-row", armies: { p1: ["wide", "hero"], p2: ["hero"] } }), ctx);
    const grown = ofType(events, "startZoneGrown");
    expect(grown.map((e) => e.player)).toEqual(["p1"]);
    const zone = playerZone(state, "p1", ctx);
    expect(zone.length).toBeGreaterThan(4);
    // It never takes the other player's zone.
    const other = new Set(playerZone(state, "p2", ctx).map((h) => `${h.q},${h.r}`));
    expect(zone.some((h) => other.has(`${h.q},${h.r}`))).toBe(false);
    expect(deploymentPlacements(state, "p1", wide, ctx).length).toBeGreaterThan(0);
    expect(zone).toContainEqual(hex(0, 3));
  });
});
