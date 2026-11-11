import { describe, expect, it } from "vitest";
import {
  Board,
  Rng,
  addPiece,
  addScenery,
  blankMap,
  clearStartZones,
  hex,
  hexKey,
  hexNeighbors,
  populateScenery,
  populateTerrain,
  removeItems,
  removeProblems,
  sceneryTable,
  shapeCells,
  sidePlacement,
  terrainTable,
  toggleZoneHex,
  type MapDefinition,
  type PlacedPiece,
} from "../src";
import { TERRAIN, fieldMap } from "./fixtures";

const terrain = terrainTable(TERRAIN);
const scenery = sceneryTable([
  { id: "tree", name: "Tree", height: 9, shape: "cylinder", radius: 0.3, color: "#0f0" },
  { id: "boulder", name: "Boulder", height: 2, shape: "cylinder", radius: 0.5, color: "#888" },
]);

const at = (q: number, layer: number, shape: PlacedPiece["shape"] = "single", terrainId = "rock") => ({
  shape,
  terrain: terrainId,
  origin: hex(q, 0),
  rotation: 0,
  layer,
});

function build(pieces: Omit<PlacedPiece, "id">[]): MapDefinition {
  let m = blankMap("m", "M");
  for (const p of pieces) m = addPiece(m, p).map;
  return m;
}

const floating = (m: MapDefinition) =>
  Board.fromMap(m)
    .issues.filter((i) => i.code === "unsupported")
    .map((i) => i.pieceId);

/** Two pillars two levels tall at q = 0 and q = 4. */
const pillars = () => [at(0, 0), at(0, 1), at(4, 0), at(4, 1)];

describe("bridges held at both ends", () => {
  it("holds up a run of singles joined between two pillars, and draws it as one span", () => {
    const m = build([...pillars(), at(1, 1), at(2, 1), at(3, 1)]);
    expect(floating(m)).toEqual([]);
    const board = Board.fromMap(m).board;
    expect(["p5", "p6", "p7"].every((id) => board.isSpanPiece(id))).toBe(true);
    expect(board.isSpanPiece("p1")).toBe(false);
  });

  it("holds up a mix of 2-hex and single pieces", () => {
    expect(floating(build([...pillars(), at(1, 1, "double"), at(3, 1)]))).toEqual([]);
  });

  it("lets a run that touches only one pillar fall", () => {
    expect(floating(build([...pillars(), at(1, 1), at(2, 1)]))).toEqual(["p5", "p6"]);
  });

  it("does not count two touches on the same side", () => {
    // A 7-hex block two levels tall, and a single beside it touching two of its hexes.
    const m = build([at(0, 0, "flower7"), at(0, 1, "flower7"), { ...at(0, 1), origin: hex(2, -1) }]);
    expect(floating(m)).toEqual(["p3"]);
  });

  it("still allows overhangs that rest on something with one hex", () => {
    expect(floating(build([at(0, 0), at(0, 1, "line3")]))).toEqual([]);
  });

  it("holds pieces stacked on a bridge", () => {
    const m = build([...pillars(), at(1, 1, "line3"), at(2, 2)]);
    expect(floating(m)).toEqual([]);
    // A single bridging piece is not a joined span.
    expect(Board.fromMap(m).board.isSpanPiece("p5")).toBe(false);
  });
});

describe("removing problems", () => {
  it("removes floating pieces and the scenery on them, and keeps bridges", () => {
    let m = build([...pillars(), at(1, 1), at(2, 1), at(3, 1), at(8, 3), at(10, 0)]);
    m = addScenery(m, "boulder", hex(8, 0), 4);
    m = addScenery(m, "boulder", hex(10, 0), 1);
    const result = removeProblems(m, terrain, scenery);
    expect(result.pieces).toBe(1);
    expect(result.scenery).toBe(1);
    expect(result.map.pieces.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p9"]);
    expect(Board.fromMap(result.map, terrain, scenery).issues).toEqual([]);
  });

  it("removes scenery that does not fit", () => {
    let m = build([at(0, 0), at(1, 0), at(1, 3), at(1, 1), at(1, 2)]);
    m = addScenery(m, "tree", hex(0, 0), 1);
    m = { ...m, pieces: [...m.pieces, { id: "roof", ...at(0, 3) }] };
    const result = removeProblems(m, terrain, scenery);
    expect(result.map.scenery).toEqual([]);
  });

  it("erases several pieces and scenery at once", () => {
    let m = build([at(0, 0), at(1, 0), at(2, 0)]);
    m = addScenery(m, "boulder", hex(1, 0), 1);
    m = addScenery(m, "boulder", hex(2, 0), 1);
    const after = removeItems(m, ["p1", "p2"], ["s2"]);
    expect(after.pieces.map((p) => p.id)).toEqual(["p3"]);
    expect(after.scenery).toEqual([]);
  });
});

describe("start zones and side placement", () => {
  it("clears every start zone and layout", () => {
    let m = fieldMap();
    m = { ...m, layouts: { "2": [0, 1] } };
    expect(clearStartZones(m)).toMatchObject({ startZones: [], layouts: {} });
    expect(toggleZoneHex(clearStartZones(m), 0, hex(0, 0)).startZones).toHaveLength(1);
  });

  it("puts a piece on the side of a hex nearest the pointer", () => {
    expect(sidePlacement(hex(0, 0), { x: 1, z: 0 })).toEqual({ origin: hex(1, 0), direction: 0 });
    expect(sidePlacement(hex(0, 0), { x: -1, z: 0 })).toEqual({ origin: hex(-1, 0), direction: 3 });
    const down = sidePlacement(hex(2, 2), { x: 2 * Math.sqrt(3) + Math.sqrt(3) + 0.4, z: 3 + 1 });
    expect(down.origin).toEqual(hex(2, 3));
  });
});

describe("random fill", () => {
  const base = (): MapDefinition => {
    const m = fieldMap();
    // Water along one end, so the fill has special terrain to leave alone.
    return addPiece(m, { shape: "rhombus4", terrain: "water", origin: hex(20, -2), rotation: 0, layer: 0 }).map;
  };

  it("adds a light scatter of small pieces matching the terrain under them", () => {
    const m = base();
    const { map, added } = populateTerrain(m, 2, new Rng(7), terrain);
    expect(added).toBeGreaterThan(0);
    const board = Board.fromMap(map, terrain).board;
    expect(Board.fromMap(map, terrain).issues).toEqual([]);
    const fresh = map.pieces.slice(m.pieces.length);
    let hexes = 0;
    for (const p of fresh) {
      expect(p.layer).toBe(1);
      expect(["single", "double", "line3", "triangle3", "rhombus4"]).toContain(p.shape);
      for (const h of shapeCells(p.shape, p.origin, p.rotation)) {
        expect(board.cellAt(h, 0)?.terrain).toBe(p.terrain);
        expect(p.terrain).toBe("grass");
        hexes += 1;
      }
    }
    // Light: around a tenth of the 48 grass hexes.
    expect(hexes).toBeGreaterThanOrEqual(4);
    expect(hexes).toBeLessThanOrEqual(12);
  });

  it("adds more each time and is repeatable from a seed", () => {
    const once = populateTerrain(base(), 2, new Rng(3), terrain).map;
    expect(populateTerrain(base(), 2, new Rng(3), terrain).map).toEqual(once);
    const twice = populateTerrain(once, 2, new Rng(4), terrain).map;
    expect(twice.pieces.length).toBeGreaterThan(once.pieces.length);
    expect(Board.fromMap(twice, terrain).issues).toEqual([]);
  });

  it("does nothing on level 1 or where there is nothing to build on", () => {
    expect(populateTerrain(base(), 1, new Rng(1), terrain).added).toBe(0);
    expect(populateTerrain(base(), 3, new Rng(1), terrain).added).toBe(0);
  });

  it("keeps the space under a bridge open", () => {
    const m = build([...pillars(), at(1, 1, "line3", "rock"), at(1, 0, "line3", "grass")]);
    const { map } = populateTerrain(m, 2, new Rng(9), terrain);
    const board = Board.fromMap(map, terrain).board;
    for (const q of [1, 2, 3]) expect(board.cellAt(hex(q, 0), 1)?.pieceId).toBe("p5");
  });

  it("scatters scenery on standard terrain, outside start zones and apart from each other", () => {
    const m = base();
    const { map, added } = populateScenery(m, 1, new Rng(5), terrain, scenery);
    expect(added).toBeGreaterThan(0);
    expect(Board.fromMap(map, terrain, scenery).issues).toEqual([]);
    const zone = new Set(m.startZones.flatMap((z) => z.hexes.map(hexKey)));
    const spots = new Set(map.scenery.map((s) => hexKey(s.hex)));
    for (const s of map.scenery) {
      expect(zone.has(hexKey(s.hex))).toBe(false);
      expect(hexNeighbors(s.hex).some((h) => spots.has(hexKey(h)))).toBe(false);
      expect(s.elevation).toBe(1);
    }
  });
});
