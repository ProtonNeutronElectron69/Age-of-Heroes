import { describe, expect, it } from "vitest";
import {
  Board,
  canStep,
  coverFrom,
  hasLineOfSight,
  hex,
  hexKey,
  placementSpots,
  populateTerrain,
  Rng,
  sceneryTable,
  terrainTable,
  wallLine,
  type MapDefinition,
  type PlacedPiece,
  type RulesContext,
  type SceneryPlacement,
} from "../src";
import { CARDS, TERRAIN } from "./fixtures";

const KINDS = sceneryTable([
  { id: "low-wall", name: "Low wall", height: 3, shape: "prism", color: "#888", between: 2, cover: 1 },
  { id: "ruin", name: "Small ruined wall", height: 5, shape: "prism", color: "#999", between: 2 },
  { id: "big-tree", name: "Large tree", height: 12, shape: "cylinder", radius: 0.8, color: "#2a5", footprint: "2x2" },
  { id: "big-wall", name: "Large wall", height: 7, shape: "prism", color: "#aaa", footprint: "3x1" },
]);

/** A flat field of grass, q from -3 to 4 and r from -3 to 2, one level high. */
function field(scenery: SceneryPlacement[]): MapDefinition {
  const pieces: PlacedPiece[] = [];
  for (let q = -3; q <= 4; q++) {
    for (let r = -3; r <= 2; r++) pieces.push({ id: `g${q}_${r}`, shape: "single", terrain: "grass", origin: hex(q, r), rotation: 0, layer: 0 });
  }
  return { formatVersion: 1, id: "walls", name: "Walls", description: "", pieces, scenery, startZones: [], layouts: {} };
}

function context(scenery: SceneryPlacement[]): { ctx: RulesContext; codes: string[] } {
  const terrain = terrainTable(TERRAIN);
  const { board, issues } = Board.fromMap(field(scenery), terrain, KINDS);
  return { ctx: { cards: new Map(CARDS.map((c) => [c.id, c])), board, terrain }, codes: issues.map((i) => i.code) };
}

/** A low wall along the north side of (0,0) and (1,0). */
const lowWall: SceneryPlacement = { id: "w", kind: "low-wall", hex: hex(0, 0), elevation: 1, rotation: 0 };
const at = (q: number, r: number, elevation = 1) => ({ hex: hex(q, r), elevation });

describe("walls between hexes", () => {
  it("stand on the edges on one side of their row", () => {
    const w = wallLine(hex(0, 0), 0, 2);
    expect(w.row).toEqual([hex(0, 0), hex(1, 0)]);
    expect(w.edges).toEqual([
      [hex(0, 0), hex(1, -1)],
      [hex(0, 0), hex(0, -1)],
      [hex(1, 0), hex(2, -1)],
      [hex(1, 0), hex(1, -1)],
    ]);
    // Straight, halfway between the two rows, one hex width per hex of length.
    expect(w.from.z).toBeCloseTo(w.to.z);
    expect(w.to.x - w.from.x).toBeCloseTo(2 * Math.sqrt(3) * 1, 5);
  });

  it("leave the hexes open but stop a step across them, unless the figure is above the wall", () => {
    const { ctx, codes } = context([lowWall]);
    expect(codes).toEqual([]);
    expect(ctx.board.sceneryAt(hex(0, 0), 1)).toBeUndefined();
    expect(ctx.board.scenery()).toHaveLength(1);
    expect(canStep(at(0, 0), at(0, -1), 5, ctx)).toBe(false);
    expect(canStep(at(1, -1), at(1, 0), 5, ctx)).toBe(false);
    // Along the row, and around the wall's end, are open.
    expect(canStep(at(0, 0), at(1, 0), 5, ctx)).toBe(true);
    expect(canStep(at(0, 0), at(-1, 0), 5, ctx)).toBe(true);
    expect(canStep(at(-1, 0), at(0, -1), 5, ctx)).toBe(true);
    // Above its top on both sides, a step passes over it.
    expect(ctx.board.wallBetween(at(0, 0, 4), at(0, -1, 4))).toBeUndefined();
    expect(ctx.board.wallBetween(at(0, 0, 3), at(0, -1, 4))).toBeDefined();
  });

  it("keep a larger figure from standing astride them", () => {
    const { ctx } = context([lowWall]);
    expect(placementSpots("2x1", 5, { hex: hex(0, 0), elevation: 1, rotation: 0 }, ctx)).not.toBeNull();
    // Turned toward the north-west, its second hex is across the wall.
    expect(placementSpots("2x1", 5, { hex: hex(0, 0), elevation: 1, rotation: 2 }, ctx)).toBeNull();
  });

  it("block line of sight below their top", () => {
    const low = (q: number, r: number) => ({ hex: hex(q, r), elevation: 1, height: 1 });
    expect(hasLineOfSight(context([]).ctx.board, low(0, 0), low(0, -2))).toBe(true);
    expect(hasLineOfSight(context([lowWall]).ctx.board, low(0, 0), low(0, -2))).toBe(false);
    // Tall figures see over a low wall.
    const tall = (q: number, r: number) => ({ hex: hex(q, r), elevation: 1, height: 6 });
    expect(hasLineOfSight(context([lowWall]).ctx.board, tall(0, 0), tall(0, -2))).toBe(true);
  });

  it("report walls that cross each other or lack level ground", () => {
    expect(context([lowWall, { ...lowWall, id: "w2", kind: "ruin", hex: hex(1, 0) }]).codes).toEqual(["sceneryOverlap"]);
    expect(context([{ ...lowWall, hex: hex(4, 0) }]).codes).toEqual(["sceneryOffBoard"]);
  });
});

describe("low wall cover", () => {
  const { ctx } = context([lowWall]);
  it("gives a figure behind it an extra defense die against an attack from range across it", () => {
    expect(coverFrom([at(0, -3)], [at(0, 0)], ctx)).toEqual({ dice: 1, name: "Low wall" });
  });

  it("gives none against a neighbour, from its own side, or to a figure above it", () => {
    expect(coverFrom([at(0, -1)], [at(0, 0)], ctx)).toBeNull();
    expect(coverFrom([at(0, 2)], [at(0, 0)], ctx)).toBeNull();
    expect(coverFrom([at(0, -3)], [at(0, 0, 4)], ctx)).toBeNull();
  });

  it("is only given by walls with cover", () => {
    const ruin = context([{ ...lowWall, kind: "ruin" }]).ctx;
    expect(coverFrom([at(0, -3)], [at(0, 0)], ruin)).toBeNull();
  });
});

describe("the editor's random terrain fill", () => {
  it("leaves the hexes under a wall and under bigger scenery alone", () => {
    const scenery: SceneryPlacement[] = [lowWall, { id: "t", kind: "big-tree", hex: hex(-2, -2), elevation: 1 }];
    const kept = new Set([hex(0, 0), hex(1, 0), hex(-2, -2), hex(-1, -2), hex(-2, -1), hex(-1, -1)].map(hexKey));
    for (let seed = 1; seed <= 5; seed++) {
      const { map } = populateTerrain(field(scenery), 2, new Rng(seed), terrainTable(TERRAIN), KINDS);
      const raised = map.pieces.filter((p) => p.layer === 1);
      expect(raised.length).toBeGreaterThan(0);
      const { issues } = Board.fromMap(map, terrainTable(TERRAIN), KINDS);
      expect(issues.filter((i) => i.sceneryId)).toEqual([]);
      for (const p of raised) expect(kept.has(hexKey(p.origin)) && p.shape === "single").toBe(false);
    }
  });
});

describe("scenery bigger than one hex", () => {
  it("fills every hex of its footprint, turned with its rotation", () => {
    const { ctx, codes } = context([
      { id: "t", kind: "big-tree", hex: hex(-2, -2), elevation: 1 },
      { id: "l", kind: "big-wall", hex: hex(0, 1), elevation: 1, rotation: 0 },
    ]);
    expect(codes).toEqual([]);
    for (const h of [hex(-2, -2), hex(-1, -2), hex(-2, -1), hex(-1, -1)]) expect(ctx.board.sceneryAt(h, 1)?.rules.name).toBe("Large tree");
    for (const h of [hex(0, 1), hex(1, 1), hex(2, 1)]) expect(ctx.board.sceneryAt(h, 1)?.rules.name).toBe("Large wall");
    expect(ctx.board.scenery()).toHaveLength(2);
    expect(canStep(at(0, 0), at(1, 1), 5, ctx)).toBe(false);
  });

  it("reports pieces that overlap or overhang the edge", () => {
    expect(context([{ id: "t", kind: "big-tree", hex: hex(0, 0), elevation: 1 }, { id: "x", kind: "big-wall", hex: hex(1, 1), elevation: 1 }]).codes).toEqual([
      "sceneryOverlap",
    ]);
    expect(context([{ id: "l", kind: "big-wall", hex: hex(3, 0), elevation: 1 }]).codes).toEqual(["sceneryOffBoard"]);
  });
});
