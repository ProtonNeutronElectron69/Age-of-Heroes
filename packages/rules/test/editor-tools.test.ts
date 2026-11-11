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

/** A floor along q = 0..4, and a pillar two levels high at each end (pieces p1 to p6). */
const pillars = () => [at(0, 0, "line3"), at(3, 0, "double"), at(0, 1), at(0, 2), at(4, 1), at(4, 2)];

const issues = (m: MapDefinition) => Board.fromMap(m, terrain, scenery).issues;

describe("pieces held up by balance", () => {
  it("holds up a run of singles joined between two pillars, and draws it as one span", () => {
    const m = build([...pillars(), at(1, 2), at(2, 2), at(3, 2)]);
    expect(issues(m)).toEqual([]);
    const board = Board.fromMap(m).board;
    expect(["p7", "p8", "p9"].every((id) => board.isSpanPiece(id))).toBe(true);
    expect(board.isSpanPiece("p3")).toBe(false);
  });

  it("holds up a mix of 2-hex and single pieces", () => {
    expect(floating(build([...pillars(), at(1, 2, "double"), at(3, 2)]))).toEqual([]);
  });

  it("lets a run that touches only one pillar fall", () => {
    expect(floating(build([...pillars(), at(1, 2), at(2, 2)]))).toEqual(["p7", "p8"]);
  });

  it("does not count touches along one side", () => {
    // A 7-hex block two levels tall, and a single beside it touching two of its hexes.
    const m = build([at(0, 0, "flower7"), at(0, 1, "flower7"), { ...at(0, 1), origin: hex(2, -1) }]);
    expect(floating(m)).toEqual(["p3"]);
  });

  it("needs at least 2 points under a multi-hex piece, with its middle between them", () => {
    // A 3-hex line on one single tips over, even balanced on its middle.
    expect(floating(build([at(1, 0), at(0, 1, "line3")]))).toEqual(["p2"]);
    // On a 2-hex piece its middle sits over the edge of the support: it stays.
    expect(floating(build([at(0, 0, "double"), at(0, 1, "line3")]))).toEqual([]);
    // Across two ends, like a bridge.
    expect(floating(build([at(0, 0), at(2, 0), at(0, 1, "line3")]))).toEqual([]);
  });

  it("does not hold a big slab up by two points at one edge", () => {
    // The 24-hex slab's left edge runs down (0,0), (0,1), (-1,2), (-1,3).
    const edge = build([at(0, 0), { ...at(0, 0), origin: hex(-1, 3) }, { ...at(0, 1, "slab24") }]);
    expect(floating(edge)).toEqual(["p3"]);
    // On four corner posts it stands.
    const posts = build([
      at(0, 0),
      at(5, 0),
      { ...at(0, 0), origin: hex(-1, 3) },
      { ...at(0, 0), origin: hex(4, 3) },
      at(0, 1, "slab24"),
    ]);
    expect(floating(posts)).toEqual([]);
  });

  it("allows a cave, but not a sealed space", () => {
    // A 7-hex floor, walls on five of the six hexes around the middle, and a 7-hex roof.
    const ring = [hex(1, 0), hex(1, -1), hex(0, -1), hex(-1, 0), hex(-1, 1), hex(0, 1)];
    const walls = (n: number) => ring.slice(0, n).map((h) => ({ ...at(0, 1), origin: h }));
    const cave = build([at(0, 0, "flower7"), ...walls(5), at(0, 2, "flower7")]);
    expect(issues(cave)).toEqual([]);
    const sealed = build([at(0, 0, "flower7"), ...walls(6), at(0, 2, "flower7")]);
    expect(issues(sealed).map((i) => [i.code, hexKey(i.hex!), i.layer])).toEqual([["void", "0,0", 1]]);
    expect(Board.fromMap(sealed).board.sealedGaps()).toEqual([{ hex: hex(0, 0), layer: 1 }]);
  });

  it("reports pieces that touch nothing else", () => {
    const m = build([at(0, 0, "line3"), at(6, 0)]);
    expect(issues(m).map((i) => [i.code, i.pieceId])).toEqual([["detached", "p2"]]);
    // Joined by a bridge, two islands are one map.
    const joined = build([at(0, 0), at(0, 1), at(4, 0), at(4, 1), at(1, 1, "line3")]);
    expect(issues(joined).filter((i) => i.code === "detached")).toEqual([]);
  });

  it("keeps start zones off special terrain and scenery", () => {
    let m = build([at(0, 0, "line3", "grass"), at(3, 0, "single", "lava")]);
    m = { ...m, startZones: [{ seat: 0, hexes: [hex(0, 0), hex(3, 0)] }, { seat: 1, hexes: [hex(1, 0), hex(2, 0)] }] };
    m = addScenery(m, "boulder", hex(2, 0), 1);
    expect(
      issues(m)
        .map((i) => [i.code, hexKey(i.hex!)])
        .sort(),
    ).toEqual([
      ["startZoneTerrain", "2,0"],
      ["startZoneTerrain", "3,0"],
    ]);
    const board = Board.fromMap(m, terrain, scenery).board;
    expect(board.zoneProblem(hex(0, 0))).toBeNull();
    expect(board.zoneProblem(hex(3, 0))).toMatch(/lava/);
  });
});

describe("fixing problems", () => {
  it("removes pieces that are not held up or detached, and the scenery on them, and keeps bridges", () => {
    let m = build([...pillars(), at(1, 2), at(2, 2), at(3, 2), at(2, 4), at(9, 0)]);
    m = addScenery(m, "boulder", hex(2, 0), 5);
    m = addScenery(m, "boulder", hex(9, 0), 1);
    const result = removeProblems(m, terrain, scenery);
    expect(result).toMatchObject({ pieces: 2, scenery: 2, zoneHexes: 0, filled: 0 });
    expect(result.map.pieces.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]);
    expect(issues(result.map)).toEqual([]);
  });

  it("fills sealed spaces and drops start zone hexes that cannot be used", () => {
    const ring = [hex(1, 0), hex(1, -1), hex(0, -1), hex(-1, 0), hex(-1, 1), hex(0, 1)];
    let m = build([at(0, 0, "flower7"), ...ring.map((h) => ({ ...at(0, 1), origin: h })), at(0, 2, "flower7")]);
    m = addPiece(m, { ...at(2, 0, "single", "lava"), origin: hex(2, -1) }).map;
    m = { ...m, startZones: [{ seat: 0, hexes: [hex(2, -1), hex(0, 0)] }, { seat: 1, hexes: [hex(2, -1)] }], layouts: { "2": [0, 1] } };
    const result = removeProblems(m, terrain, scenery);
    expect(result).toMatchObject({ pieces: 0, filled: 1, zoneHexes: 1 });
    expect(result.map.startZones).toEqual([{ seat: 0, hexes: [hex(0, 0)] }]);
    expect(result.map.layouts).toEqual({});
    expect(issues(result.map)).toEqual([]);
  });

  it("removes scenery that does not fit", () => {
    let m = build([...pillars(), at(1, 2, "line3")]);
    m = addScenery(m, "tree", hex(2, 0), 1);
    expect(removeProblems(m, terrain, scenery).map.scenery).toEqual([]);
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
    return addPiece(m, { shape: "rhombus4", terrain: "water", origin: hex(12, 0), rotation: 0, layer: 0 }).map;
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
    const m = build([...pillars(), at(1, 2, "line3", "rock")]);
    const { map } = populateTerrain(m, 2, new Rng(9), terrain);
    const board = Board.fromMap(map, terrain).board;
    for (const q of [1, 2, 3]) expect(board.cellAt(hex(q, 0), 1)).toBeUndefined();
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
