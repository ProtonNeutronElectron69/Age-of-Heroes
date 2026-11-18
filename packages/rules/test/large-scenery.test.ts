import { describe, expect, it } from "vitest";
import {
  Board,
  applyCommand,
  canStep,
  coverFrom,
  createGame,
  moveOptions,
  placementKey,
  hasLineOfSight,
  hex,
  hexKey,
  populateScenery,
  populateTerrain,
  Rng,
  sceneryTable,
  terrainTable,
  type MapDefinition,
  type PlacedPiece,
  type RulesContext,
  type SceneryPlacement,
} from "../src";
import { CARDS, TERRAIN, setup, turnState } from "./fixtures";

const KINDS = sceneryTable([
  { id: "low-wall", name: "Low wall", height: 3, shape: "prism", color: "#888", footprint: "3x1", cover: 1, climb: 1 },
  { id: "ruin", name: "Small ruined wall", height: 5, shape: "prism", color: "#999", footprint: "2x1" },
  { id: "big-tree", name: "Large tree", height: 12, shape: "cylinder", radius: 0.8, color: "#2a5", footprint: "2x2" },
  { id: "big-wall", name: "Large wall", height: 7, shape: "prism", color: "#aaa", footprint: "3x1" },
]);

/** A flat field of grass, q from -3 to 4 and r from -3 to 2, one level high. */
function field(scenery: SceneryPlacement[]): MapDefinition {
  const pieces: PlacedPiece[] = [];
  for (let q = -3; q <= 4; q++) {
    for (let r = -3; r <= 2; r++) pieces.push({ id: `g${q}_${r}`, shape: "single", terrain: "grass", origin: hex(q, r), rotation: 0, layer: 0 });
  }
  const startZones = [
    // Along the bottom row, out of the way of the scenery the tests place.
    { seat: 0, hexes: [hex(-3, 2), hex(-2, 2), hex(-1, 2), hex(0, 2)] },
    { seat: 1, hexes: [hex(1, 2), hex(2, 2), hex(3, 2), hex(4, 2)] },
  ];
  return { formatVersion: 1, id: "big", name: "Big scenery", description: "", pieces, scenery, startZones, layouts: {} };
}

function context(scenery: SceneryPlacement[]): { ctx: RulesContext; codes: string[] } {
  const terrain = terrainTable(TERRAIN);
  const { board, issues } = Board.fromMap(field(scenery), terrain, KINDS);
  return { ctx: { cards: new Map(CARDS.map((c) => [c.id, c])), board, terrain }, codes: issues.map((i) => i.code) };
}

/** A low wall filling (0,-1), (1,-1) and (2,-1). */
const lowWall: SceneryPlacement = { id: "w", kind: "low-wall", hex: hex(0, -1), elevation: 1, rotation: 0 };
const at = (q: number, r: number, elevation = 1) => ({ hex: hex(q, r), elevation });

describe("the editor's random scenery fill", () => {
  it("places every kind, bigger ones turned at random, without problems", () => {
    const kinds = sceneryTable([...KINDS.values(), { id: "tree", name: "Tree", height: 9, shape: "cylinder", radius: 0.55, color: "#2a5" }]);
    const placed = new Set<string>();
    const turns = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const { map } = populateScenery(field([]), 1, new Rng(seed), terrainTable(TERRAIN), kinds);
      expect(Board.fromMap(map, terrainTable(TERRAIN), kinds).issues.filter((i) => i.sceneryId)).toEqual([]);
      for (const s of map.scenery) {
        placed.add(s.kind);
        turns.add(s.rotation ?? 0);
      }
    }
    expect([...placed].sort()).toEqual(["big-tree", "big-wall", "low-wall", "ruin", "tree"]);
    expect(turns.size).toBeGreaterThan(2);
  });

  it("keeps clear of every hex of bigger scenery", () => {
    const kinds = sceneryTable([...KINDS.values(), { id: "tree", name: "Tree", height: 9, shape: "cylinder", radius: 0.55, color: "#2a5" }]);
    for (let seed = 1; seed <= 20; seed++) {
      const { map } = populateScenery(field([lowWall]), 1, new Rng(seed), terrainTable(TERRAIN), kinds);
      expect(Board.fromMap(map, terrainTable(TERRAIN), kinds).issues.filter((i) => i.sceneryId)).toEqual([]);
    }
  });
});

describe("scenery bigger than one hex", () => {
  it("fills every hex of its footprint, turned with its rotation", () => {
    const { ctx, codes } = context([
      { id: "t", kind: "big-tree", hex: hex(-2, -2), elevation: 1 },
      { id: "l", kind: "big-wall", hex: hex(0, 1), elevation: 1, rotation: 0 },
      { id: "r", kind: "ruin", hex: hex(3, -3), elevation: 1, rotation: 4 },
      lowWall,
    ]);
    expect(codes).toEqual([]);
    for (const h of [hex(-2, -2), hex(-1, -2), hex(-2, -1), hex(-1, -1)]) expect(ctx.board.sceneryAt(h, 1)?.rules.name).toBe("Large tree");
    for (const h of [hex(0, 1), hex(1, 1), hex(2, 1)]) expect(ctx.board.sceneryAt(h, 1)?.rules.name).toBe("Large wall");
    // Turned toward the south-west, the ruin's second hex is (2,-2).
    for (const h of [hex(3, -3), hex(2, -2)]) expect(ctx.board.sceneryAt(h, 1)?.rules.name).toBe("Small ruined wall");
    for (const h of [hex(0, -1), hex(1, -1), hex(2, -1)]) expect(ctx.board.sceneryAt(h, 1)?.rules.name).toBe("Low wall");
    expect(ctx.board.scenery()).toHaveLength(4);
    expect(canStep(at(0, 0), at(1, 1), 5, ctx)).toBe(false);
    expect(canStep(at(1, 0), at(1, -1), 5, ctx)).toBe(false);
    expect(canStep(at(0, 0), at(1, 0), 5, ctx)).toBe(true);
  });

  it("reports pieces that overlap or overhang the edge", () => {
    expect(context([{ id: "t", kind: "big-tree", hex: hex(0, 0), elevation: 1 }, { id: "x", kind: "big-wall", hex: hex(1, 1), elevation: 1 }]).codes).toEqual([
      "sceneryOverlap",
    ]);
    expect(context([{ id: "l", kind: "big-wall", hex: hex(3, 0), elevation: 1 }]).codes).toEqual(["sceneryOffBoard"]);
  });

  it("blocks line of sight below its top", () => {
    const low = (q: number, r: number) => ({ hex: hex(q, r), elevation: 1, height: 1 });
    expect(hasLineOfSight(context([]).ctx.board, low(1, 0), low(1, -2))).toBe(true);
    expect(hasLineOfSight(context([lowWall]).ctx.board, low(1, 0), low(1, -2))).toBe(false);
    // Tall figures see over a low wall.
    const tall = (q: number, r: number) => ({ hex: hex(q, r), elevation: 1, height: 6 });
    expect(hasLineOfSight(context([lowWall]).ctx.board, tall(1, 0), tall(1, -2))).toBe(true);
  });
});

describe("climbing across a low wall", () => {
  const { ctx } = context([lowWall]);
  /** The hero at (1,0), south of the wall's middle hex (1,-1); everyone else off the board. */
  const game = () => turnState(createGame(setup(2, { mapId: "big" }), ctx).state, "p1:0", { "p1:0#1": { q: 1, r: 0, elevation: 1 } });

  it("costs one extra move, and leaves the figure on the far side", () => {
    const options = moveOptions(game(), "p1:0#1", ctx);
    // Straight over: onto the wall (1 + 1 to climb), then down the far side (1).
    expect(options.get(placementKey({ hex: hex(1, -2), elevation: 1, rotation: 0 }))?.cost).toBe(3);
    // No move ends on the wall itself.
    for (const h of [hex(0, -1), hex(1, -1), hex(2, -1)]) expect(options.has(placementKey({ hex: h, elevation: 1, rotation: 0 }))).toBe(false);
  });

  it("refuses a move that would end on the wall", () => {
    const r = applyCommand(game(), { type: "move", player: "p1", figureId: "p1:0#1", path: [{ hex: hex(1, -1), elevation: 1 }] }, ctx);
    expect(!r.ok && r.error).toMatch(/cannot end its move on a wall/);
  });

  it("is not allowed over the other walls or trees", () => {
    const ruins = context([{ id: "r", kind: "ruin", hex: hex(1, -1), elevation: 1 }, { id: "t", kind: "big-tree", hex: hex(-2, -2), elevation: 1 }]).ctx;
    expect(canStep(at(1, 0), at(1, -1), 5, ruins, true)).toBe(false);
    expect(canStep(at(-2, 0), at(-2, -1), 5, ruins, true)).toBe(false);
    // Only while passing over it; a figure never stands on a low wall.
    expect(canStep(at(1, 0), at(1, -1), 5, ctx, true)).toBe(true);
    expect(canStep(at(1, 0), at(1, -1), 5, ctx)).toBe(false);
  });
});

describe("low wall cover", () => {
  const { ctx } = context([lowWall]);
  it("gives a figure next to it an extra defense die against an attack from range across it", () => {
    expect(coverFrom([at(1, -3)], [at(1, 0)], ctx)).toEqual({ dice: 1, name: "Low wall" });
  });

  it("gives none against a neighbour, from its own side, away from the wall, or above it", () => {
    expect(coverFrom([at(1, 1)], [at(1, 0)], ctx)).toBeNull();
    expect(coverFrom([at(1, 2)], [at(1, 0)], ctx)).toBeNull();
    // Two hexes from the wall, the defender is not behind it.
    expect(coverFrom([at(1, -3)], [at(1, 1)], ctx)).toBeNull();
    expect(coverFrom([at(1, -3)], [at(1, 0, 4)], ctx)).toBeNull();
  });

  it("is only given by scenery with cover", () => {
    const ruin = context([{ id: "r", kind: "ruin", hex: hex(1, -1), elevation: 1 }]).ctx;
    expect(coverFrom([at(1, -3)], [at(1, 0)], ruin)).toBeNull();
  });
});

describe("the editor's random terrain fill", () => {
  it("leaves every hex of bigger scenery alone", () => {
    const scenery: SceneryPlacement[] = [lowWall, { id: "t", kind: "big-tree", hex: hex(-2, -2), elevation: 1 }];
    const kept = new Set([hex(0, -1), hex(1, -1), hex(2, -1), hex(-2, -2), hex(-1, -2), hex(-2, -1), hex(-1, -1)].map(hexKey));
    for (let seed = 1; seed <= 5; seed++) {
      const { map } = populateTerrain(field(scenery), 2, new Rng(seed), terrainTable(TERRAIN), KINDS);
      expect(map.pieces.some((p) => p.layer === 1)).toBe(true);
      const { board, issues } = Board.fromMap(map, terrainTable(TERRAIN), KINDS);
      expect(issues.filter((i) => i.sceneryId)).toEqual([]);
      for (const k of kept) expect(board.column({ q: Number(k.split(",")[0]), r: Number(k.split(",")[1]) })).toHaveLength(1);
    }
  });
});
