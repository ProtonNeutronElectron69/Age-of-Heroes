import { describe, expect, it } from "vitest";
import {
  Board,
  applyCommand,
  createGame,
  deploymentPlacements,
  engagedEnemies,
  hasLineOfSight,
  hex,
  hexKey,
  moveOptions,
  placementKey,
  placementSpots,
  type GameState,
  type RulesContext,
  type Token,
} from "../src";
import { CARDS, apply, makeCtx, fieldMap, rowMap, setup, turnState } from "./fixtures";

const big = CARDS.find((c) => c.id === "big")!;
const flatRow = (n: number): [string, number][] => Array.from({ length: n }, () => ["grass", 1]);

function bigGame(
  positions: Record<string, { q: number; r: number; elevation: number }>,
  mode: "basic" | "advanced" = "advanced",
  map = fieldMap(),
): { ctx: RulesContext; state: GameState } {
  const ctx = makeCtx(map, CARDS);
  const base = createGame(
    setup(2, { mapId: map.id, mode, armies: { p1: ["big"], p2: ["hero", "hero"] } }),
    ctx,
  ).state;
  return { ctx, state: turnState(base, "p1:0", positions) };
}

describe("multi-hex placement", () => {
  it("covers its footprint, front hex first, facing any of six ways", () => {
    const ctx = makeCtx();
    const spots = (rotation: number) =>
      placementSpots("2x1", 9, { hex: hex(3, 1), elevation: 1, rotation }, ctx)!.map((s) => hexKey(s.hex));
    expect(spots(0)).toEqual(["3,1", "4,1"]);
    expect(spots(3)).toEqual(["3,1", "2,1"]);
    expect(placementSpots("2x2", 9, { hex: hex(3, 1), elevation: 1, rotation: 0 }, ctx)).toHaveLength(4);
    expect(placementSpots("3x1", 9, { hex: hex(3, 1), elevation: 1, rotation: 0 }, ctx)).toHaveLength(3);
  });

  it("may straddle one level but not more", () => {
    const ctx = makeCtx(rowMap([["grass", 1], ["rock", 2], ["rock", 4]]));
    expect(placementSpots("2x1", 9, { hex: hex(0, 0), elevation: 1, rotation: 0 }, ctx)!.map((s) => s.elevation)).toEqual([1, 2]);
    expect(placementSpots("2x1", 9, { hex: hex(1, 0), elevation: 2, rotation: 0 }, ctx)).toBeNull();
  });
});

describe("multi-hex deployment", () => {
  it("offers every facing that fits in the zone, and checks the whole footprint", () => {
    const ctx = makeCtx(fieldMap(), CARDS);
    const { state } = createGame(setup(2, { mapId: "test-field", armies: { p1: ["big"], p2: ["hero"] } }), ctx);
    const options = deploymentPlacements(state, "p1", big, ctx);
    const zone = new Set(ctx.board.startZone(0).map(hexKey));
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) expect(o.spots.every((s) => zone.has(hexKey(s.hex)))).toBe(true);
    const good = options[0]!;
    const cmd = {
      type: "deployUnit" as const,
      player: "p1",
      unitId: "p1:0",
      placements: [{ figureId: "p1:0#1", ...good.placement }],
    };
    const r = apply(state, cmd, ctx);
    expect(r.state.units[0]!.figures[0]!.position).toMatchObject(good.placement);
    // Facing out of the zone is refused.
    const outward = { ...good.placement, rotation: (good.placement.rotation + 3) % 6 };
    const bad = applyCommand(state, { ...cmd, placements: [{ figureId: "p1:0#1", ...outward }] }, ctx);
    if (!options.some((o) => placementKey(o.placement) === placementKey(outward))) {
      expect(bad.ok).toBe(false);
    }
  });
});

describe("multi-hex movement", () => {
  it("moves one hex at a time keeping its shape, and can turn in place for free", () => {
    const { ctx, state } = bigGame({ "p1:0#1": { q: 5, r: 1, elevation: 1 } });
    const options = moveOptions(state, "p1:0#1", ctx);
    const turn = options.get(placementKey({ hex: hex(5, 1), elevation: 1, rotation: 1 }))!;
    expect(turn.cost).toBe(0);
    const shifted = options.get(placementKey({ hex: hex(7, 1), elevation: 1, rotation: 0 }))!;
    expect(shifted.cost).toBe(2);
    expect(shifted.spots.map((s) => hexKey(s.hex))).toEqual(["7,1", "8,1"]);
    const r = apply(state, { type: "move", player: "p1", figureId: "p1:0#1", path: shifted.path }, ctx);
    expect(r.state.units[0]!.figures[0]!.position).toMatchObject({ hex: hex(7, 1), rotation: 0 });
  });

  it("blocks other figures from both of its hexes and cannot overlap enemies", () => {
    const { ctx, state } = bigGame({ "p1:0#1": { q: 5, r: 1, elevation: 1 }, "p2:0#1": { q: 8, r: 1, elevation: 1 } });
    const options = moveOptions(state, "p1:0#1", ctx);
    // Front at 7 would put the rear... front at 7 covers 7 and 8: the enemy is on 8.
    expect(options.has(placementKey({ hex: hex(7, 1), elevation: 1, rotation: 0 }))).toBe(false);
    // The enemy cannot step onto the big figure's rear hex either.
    const enemyTurn = turnState(state, "p2:0", {
      "p1:0#1": { q: 5, r: 1, elevation: 1 },
      "p2:0#1": { q: 8, r: 1, elevation: 1 },
    });
    expect(moveOptions(enemyTurn, "p2:0#1", ctx).has(placementKey({ hex: hex(6, 1), elevation: 1 }))).toBe(false);
  });

  it("is engaged through any of its hexes", () => {
    const { ctx, state } = bigGame({ "p1:0#1": { q: 5, r: 1, elevation: 1 }, "p2:0#1": { q: 7, r: 1, elevation: 1 } });
    const spots = placementSpots("2x1", 9, { hex: hex(5, 1), elevation: 1, rotation: 0 }, ctx)!;
    expect(engagedEnemies(state, "p1", spots, 9, ctx).map((o) => o.figure.id)).toEqual(["p2:0#1"]);
  });

  it("rolls for each lava hex it enters but never slips on ice", () => {
    const columns: [string, number][] = [...flatRow(3), ["lava", 1], ["ice", 1], ...flatRow(3)];
    const map = rowMap(columns);
    const { ctx, state } = bigGame({ "p1:0#1": { q: 1, r: 0, elevation: 1 } }, "advanced", map);
    const path = [2, 3, 4, 5].map((q) => ({ hex: hex(q, 0), elevation: 1, rotation: 0 }));
    for (let seed = 1; seed < 40; seed++) {
      const r = applyCommand({ ...state, rng: seed }, { type: "move", player: "p1", figureId: "p1:0#1", path }, ctx);
      if (!r.ok) throw new Error(r.error);
      const terrain = r.events.filter((e) => e.type === "terrainRoll").map((e) => (e.type === "terrainRoll" ? e.terrain : ""));
      expect(terrain.every((t) => t === "lava")).toBe(true);
      expect(terrain.length).toBeGreaterThan(0);
    }
  });
});

describe("multi-hex line of sight", () => {
  it("sees a big figure if any of its hexes is visible", () => {
    const map = rowMap([["grass", 1], ["rock", 12], ["grass", 1]], [
      { id: "x1", shape: "single", terrain: "grass", origin: hex(0, 1), rotation: 0, layer: 0 },
      { id: "x2", shape: "single", terrain: "grass", origin: hex(0, 2), rotation: 0, layer: 0 },
    ]);
    const board = Board.fromMap(map).board;
    const viewer: Token = { hex: hex(0, 0), elevation: 1, height: 5 };
    const hidden: Token = { hex: hex(2, 0), elevation: 1, height: 5 };
    const open: Token = { hex: hex(0, 2), elevation: 1, height: 5 };
    expect(hasLineOfSight(board, viewer, [hidden], { strict: false })).toBe(false);
    expect(hasLineOfSight(board, viewer, [hidden, open], { strict: false })).toBe(true);
  });
});
