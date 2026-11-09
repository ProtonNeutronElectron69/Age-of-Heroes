import { describe, expect, it } from "vitest";
import {
  Board,
  createGame,
  deploymentSpots,
  hasLineOfSight,
  hex,
  moveOptions,
  sceneryTable,
  stepKey,
  type MapDefinition,
  type SceneryPlacement,
  type Token,
} from "../src";
import { makeCtx, rowMap, setup, turnState } from "./fixtures";

const SCENERY = sceneryTable([
  { id: "tree", name: "Tree", height: 9, shape: "cylinder", radius: 0.6, color: "#2a5" },
  { id: "wall", name: "Wall", height: 3, shape: "prism", color: "#999" },
]);

const tree = (q: number, elevation = 1, id = `t${q}`): SceneryPlacement => ({ id, kind: "tree", hex: hex(q, 0), elevation });
const flat = (n: number): [string, number][] => Array.from({ length: n }, () => ["grass", 1]);
const withScenery = (map: MapDefinition, scenery: SceneryPlacement[]): MapDefinition => ({ ...map, scenery });
const token = (q: number, elevation = 1, height = 5): Token => ({ hex: hex(q, 0), elevation, height });

describe("scenery on the board", () => {
  it("is found by spot and by hex", () => {
    const { board, issues } = Board.fromMap(withScenery(rowMap(flat(3)), [tree(1)]), undefined, SCENERY);
    expect(issues).toEqual([]);
    expect(board.sceneryAt(hex(1, 0), 1)?.rules.name).toBe("Tree");
    expect(board.sceneryAt(hex(1, 0), 2)).toBeUndefined();
    expect(board.sceneryIn(hex(1, 0))).toHaveLength(1);
  });

  it("reports unknown kinds, missing ground, overlaps, duplicate ids and low headroom", () => {
    const bridge: MapDefinition = rowMap(flat(3), [
      { id: "deck", shape: "single", terrain: "rock", origin: hex(1, 0), rotation: 0, layer: 4 },
      { id: "pillar1", shape: "single", terrain: "rock", origin: hex(1, 0), rotation: 0, layer: 1 },
      { id: "pillar2", shape: "single", terrain: "rock", origin: hex(1, 0), rotation: 0, layer: 2 },
      { id: "pillar3", shape: "single", terrain: "rock", origin: hex(1, 0), rotation: 0, layer: 3 },
    ]);
    const codes = (scenery: SceneryPlacement[], map = rowMap(flat(3))) =>
      Board.fromMap(withScenery(map, scenery), undefined, SCENERY).issues.map((i) => i.code).sort();
    expect(codes([{ ...tree(0), kind: "statue" }])).toEqual(["unknownScenery"]);
    expect(codes([tree(0, 3)])).toEqual(["sceneryOffBoard"]);
    expect(codes([tree(0), tree(0, 1, "other")])).toEqual(["sceneryOverlap"]);
    expect(codes([tree(0), tree(2, 1, "t0")])).toEqual(["duplicateSceneryId"]);
    // An overhang resting on a 2-level pillar leaves only 2 levels of room: too low for a 9-level tree.
    const lowGap = rowMap(flat(3), [
      { id: "pillar1", shape: "single", terrain: "rock", origin: hex(0, 0), rotation: 0, layer: 1 },
      { id: "pillar2", shape: "single", terrain: "rock", origin: hex(0, 0), rotation: 0, layer: 2 },
      { id: "ledge", shape: "double", terrain: "rock", origin: hex(0, 0), rotation: 0, layer: 3 },
    ]);
    expect(codes([], bridge)).toEqual([]);
    expect(codes([tree(1, 1)], lowGap)).toEqual(["sceneryTooTall"]);
  });

  it("blocks line of sight in both rule sets", () => {
    const { board } = Board.fromMap(withScenery(rowMap(flat(3)), [tree(1)]), undefined, SCENERY);
    expect(hasLineOfSight(board, token(0), token(2), { strict: false })).toBe(false);
    expect(hasLineOfSight(board, token(0), token(2), { strict: true })).toBe(false);
    // A low wall does not block tall figures.
    const walled = Board.fromMap(
      withScenery(rowMap(flat(3)), [{ id: "w", kind: "wall", hex: hex(1, 0), elevation: 1 }]),
      undefined,
      SCENERY,
    ).board;
    expect(hasLineOfSight(walled, token(0, 1, 9), token(2, 1, 9), { strict: false })).toBe(true);
    expect(hasLineOfSight(walled, token(0, 1, 2), token(2, 1, 2), { strict: false })).toBe(false);
  });

  it("cannot be entered or deployed on", () => {
    const map = withScenery(rowMap(flat(5)), [tree(2), { id: "z", kind: "tree", hex: hex(0, 3), elevation: 1 }]);
    const ctx = { ...makeCtx(map), board: Board.fromMap(map, undefined, SCENERY).board };
    const base = createGame(setup(2, { mapId: "test-row", mode: "basic", armies: { p1: ["hero"], p2: ["hero"] } }), ctx).state;
    expect(deploymentSpots(base, "p1", 5, ctx).map((s) => s.hex)).not.toContainEqual(hex(0, 3));
    const state = turnState(base, "p1:0", { "p1:0#1": { q: 0, r: 0, elevation: 1 } });
    const options = moveOptions(state, "p1:0#1", ctx);
    expect(options.has(stepKey({ hex: hex(1, 0), elevation: 1 }))).toBe(true);
    expect(options.has(stepKey({ hex: hex(2, 0), elevation: 1 }))).toBe(false);
    expect(options.has(stepKey({ hex: hex(3, 0), elevation: 1 }))).toBe(false); // the row is cut by the tree
  });
});

describe("player counts", () => {
  it("lists counts that have a start zone for every player", () => {
    const zones = (seats: number[]) => seats.map((seat) => ({ seat, hexes: [hex(seat, 0)] }));
    const base = rowMap(flat(6));
    expect(Board.fromMap({ ...base, startZones: zones([0, 1, 2]) }).board.playerCounts()).toEqual([2, 3]);
    expect(Board.fromMap({ ...base, startZones: zones([0, 3]) }).board.playerCounts()).toEqual([]);
    expect(Board.fromMap({ ...base, startZones: zones([0, 3]), layouts: { "2": [0, 3] } }).board.playerCounts()).toEqual([2]);
  });
});
