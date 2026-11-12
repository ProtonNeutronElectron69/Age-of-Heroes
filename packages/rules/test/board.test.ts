import { describe, expect, it } from "vitest";
import { Board, SHAPES, hex, hexKey, isAdjacent, shapeCells, type MapDefinition, type PlacedPiece } from "../src";

function map(
  pieces: PlacedPiece[],
  startZones: MapDefinition["startZones"] = [],
  layouts: MapDefinition["layouts"] = {},
): MapDefinition {
  return { formatVersion: 1, id: "t", name: "Test", description: "", pieces, scenery: [], startZones, layouts };
}

function piece(id: string, shape: PlacedPiece["shape"], q: number, r: number, layer: number, terrain = "grass"): PlacedPiece {
  return { id, shape, terrain, origin: hex(q, r), rotation: 0, layer };
}

describe("shapes", () => {
  it("have the advertised sizes", () => {
    const sizes = Object.values(SHAPES).map((s) => s.cells.length);
    expect(sizes).toEqual([1, 2, 3, 3, 4, 7, 24]);
  });

  it("are connected and unique, at every rotation", () => {
    for (const s of Object.values(SHAPES)) {
      for (let rot = 0; rot < 6; rot++) {
        const cells = shapeCells(s.id, hex(0, 0), rot);
        expect(new Set(cells.map(hexKey)).size).toBe(cells.length);
        const seen = new Set([hexKey(cells[0]!)]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const c of cells) {
            if (!seen.has(hexKey(c)) && cells.some((o) => seen.has(hexKey(o)) && isAdjacent(o, c))) {
              seen.add(hexKey(c));
              grew = true;
            }
          }
        }
        expect(seen.size).toBe(cells.length);
      }
    }
  });

  it("makes the triangle and 2x2 mutually adjacent where expected", () => {
    const [a, b, c] = SHAPES.triangle3.cells;
    expect(isAdjacent(a!, b!) && isAdjacent(b!, c!) && isAdjacent(a!, c!)).toBe(true);
  });
});

describe("board", () => {
  it("stacks pieces and reports surfaces", () => {
    const { board, issues } = Board.fromMap(map([piece("a", "flower7", 0, 0, 0), piece("b", "single", 0, 0, 1, "rock")]));
    expect(issues).toEqual([]);
    expect(board.hexes()).toHaveLength(7);
    expect(board.topSurface(hex(0, 0))).toMatchObject({ elevation: 2, terrain: "rock", clearance: Infinity });
    expect(board.topSurface(hex(1, 0))).toMatchObject({ elevation: 1, terrain: "grass" });
    expect(board.surfaces(hex(0, 0))).toHaveLength(1); // the grass cell below is buried
    expect(board.maxElevation()).toBe(2);
  });

  it("supports bridges with clearance underneath", () => {
    const pieces = [
      piece("base", "line3", 0, 0, 0),
      piece("pillarA1", "single", 0, 0, 1, "rock"),
      piece("pillarA2", "single", 0, 0, 2, "rock"),
      piece("pillarB1", "single", 2, 0, 1, "rock"),
      piece("pillarB2", "single", 2, 0, 2, "rock"),
      piece("bridge", "line3", 0, 0, 3, "road"),
    ];
    const { board, issues } = Board.fromMap(map(pieces));
    expect(issues).toEqual([]);
    const middle = board.surfaces(hex(1, 0));
    expect(middle.map((s) => s.elevation)).toEqual([1, 4]);
    expect(middle[0]!.clearance).toBe(2);
    expect(board.surfaceAt(hex(1, 0), 4)?.terrain).toBe("road");
  });

  it("reports overlaps, floating pieces and duplicate ids", () => {
    const { issues } = Board.fromMap(
      map([
        piece("a", "double", 0, 0, 0),
        piece("b", "single", 1, 0, 0),
        piece("float", "single", 5, 5, 2),
        piece("a", "single", 9, 9, 0),
      ]),
    );
    expect(issues.map((i) => i.code).sort()).toEqual(["duplicatePieceId", "overlap", "unsupported"]);
  });

  it("treats a chain of support as supported", () => {
    const { issues } = Board.fromMap(
      map([piece("a", "double", 0, 0, 0), piece("b", "double", 0, 0, 1), piece("c", "single", 1, 0, 2)]),
    );
    expect(issues).toEqual([]);
    // A 2-hex piece needs both hexes held: on one single it tips over.
    const tipped = Board.fromMap(map([piece("a", "single", 0, 0, 0), piece("b", "double", 0, 0, 1)])).issues;
    expect(tipped.map((i) => [i.code, i.pieceId])).toEqual([["unsupported", "b"]]);
  });

  it("validates start zones", () => {
    const { issues } = Board.fromMap(
      map(
        [piece("a", "line3", 0, 0, 0)],
        [
          { seat: 0, hexes: [hex(0, 0), hex(1, 0)] },
          { seat: 1, hexes: [hex(1, 0), hex(7, 7)] },
          { seat: 1, hexes: [hex(2, 0)] },
        ],
      ),
    );
    expect(issues.map((i) => i.code).sort()).toEqual(["duplicateSeat", "startZoneOffBoard", "startZoneOverlap"]);
  });

  it("validates and applies start zone layouts", () => {
    const zones = [0, 1, 2].map((seat) => ({ seat, hexes: [hex(seat, 0)] }));
    const good = Board.fromMap(map([piece("a", "line3", 0, 0, 0)], zones, { "2": [0, 2] }));
    expect(good.issues).toEqual([]);
    expect([good.board.zoneFor(0, 2), good.board.zoneFor(1, 2), good.board.zoneFor(1, 3)]).toEqual([0, 2, 1]);
    for (const bad of [{ "2": [0] }, { "2": [1, 1] }, { "2": [0, 5] }]) {
      const { issues } = Board.fromMap(map([piece("a", "line3", 0, 0, 0)], zones, bad));
      expect(issues.map((i) => i.code)).toEqual(["badLayout"]);
    }
  });

  it("flags unknown terrain when given a terrain table", () => {
    const table = new Map([["grass", { id: "grass", name: "Grass", category: "standard" as const, color: "#0f0" }]]);
    const { issues } = Board.fromMap(map([piece("a", "single", 0, 0, 0, "mud")]), table);
    expect(issues.map((i) => i.code)).toEqual(["unknownTerrain"]);
  });
});
