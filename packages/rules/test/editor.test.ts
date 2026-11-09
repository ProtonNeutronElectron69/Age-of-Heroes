import { describe, expect, it } from "vitest";
import {
  Board,
  addPiece,
  addScenery,
  blankMap,
  hex,
  landingLayer,
  mapStats,
  overlappingCells,
  removePiece,
  removeScenery,
  setLayout,
  shapeCells,
  toggleZoneHex,
} from "../src";

const piece = (shape: "single" | "line3" | "flower7", q: number, layer: number, terrain = "grass") => ({
  shape,
  terrain,
  origin: hex(q, 0),
  rotation: 0,
  layer,
});

describe("map editing", () => {
  it("starts blank", () => {
    const m = blankMap("mine", "Mine");
    expect(m).toMatchObject({ id: "mine", name: "Mine", pieces: [], scenery: [], startZones: [], layouts: {} });
  });

  it("drops pieces on top of whatever is under them, which makes bridges", () => {
    let m = blankMap("m", "M");
    m = addPiece(m, piece("line3", 0, 0)).map;
    const board = () => Board.fromMap(m).board;
    expect(landingLayer(board(), [hex(0, 0)])).toBe(1);
    m = addPiece(m, piece("single", 0, 1, "rock")).map;
    m = addPiece(m, piece("single", 2, 1, "rock")).map;
    const deck = shapeCells("line3", hex(0, 0));
    expect(landingLayer(board(), deck)).toBe(2);
    m = addPiece(m, piece("line3", 0, 2, "road")).map;
    const b = board();
    expect(b.surfaces(hex(1, 0)).map((s) => s.elevation)).toEqual([1, 3]);
    expect(Board.fromMap(m).issues).toEqual([]);
    expect(overlappingCells(b, deck, 2)).toHaveLength(3);
    expect(overlappingCells(b, deck, 3)).toHaveLength(0);
  });

  it("gives every piece and scenery a fresh id", () => {
    let m = blankMap("m", "M");
    const a = addPiece(m, piece("single", 0, 0));
    const b = addPiece(a.map, piece("single", 1, 0));
    expect([a.id, b.id]).toEqual(["p1", "p2"]);
    m = removePiece(b.map, "p1");
    expect(addPiece(m, piece("single", 2, 0)).id).toBe("p1");
    m = addScenery(m, "tree", hex(1, 0), 1);
    m = addScenery(m, "tree", hex(1, 0), 1);
    expect(m.scenery.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(removeScenery(m, "s1").scenery.map((s) => s.id)).toEqual(["s2"]);
  });

  it("removes scenery left without ground when a piece goes", () => {
    let m = addPiece(blankMap("m", "M"), piece("single", 0, 0)).map;
    m = addPiece(m, piece("single", 0, 1)).map;
    m = addScenery(m, "tree", hex(0, 0), 2);
    m = addScenery(m, "tree", hex(5, 5), 1); // already floating; kept out too
    const after = removePiece(m, "p2");
    expect(after.scenery).toEqual([]);
  });

  it("paints start zones, one zone per hex", () => {
    let m = addPiece(blankMap("m", "M"), piece("line3", 0, 0)).map;
    m = toggleZoneHex(m, 0, hex(0, 0));
    m = toggleZoneHex(m, 0, hex(1, 0));
    m = toggleZoneHex(m, 2, hex(1, 0)); // moves to seat 2
    expect(m.startZones).toEqual([
      { seat: 0, hexes: [hex(0, 0)] },
      { seat: 2, hexes: [hex(1, 0)] },
    ]);
    m = setLayout(m, 2, [0, 2]);
    expect(Board.fromMap(m).board.playerCounts()).toEqual([2]);
    // Removing the last hex of a zone drops it, and layouts that used it.
    m = toggleZoneHex(m, 2, hex(1, 0));
    expect(m.startZones.map((z) => z.seat)).toEqual([0]);
    expect(m.layouts).toEqual({});
    expect(toggleZoneHex(m, 9, hex(0, 0))).toBe(m);
  });

  it("sets and clears layouts", () => {
    const m = setLayout(blankMap("m", "M"), 3, [0, 2, 4]);
    expect(m.layouts).toEqual({ "3": [0, 2, 4] });
    expect(setLayout(m, 3, null).layouts).toEqual({});
  });

  it("summarises a map", () => {
    let m = addPiece(blankMap("m", "M"), piece("flower7", 0, 0)).map;
    m = addPiece(m, piece("single", 0, 1)).map;
    m = toggleZoneHex(m, 1, hex(1, 0));
    expect(mapStats(m, Board.fromMap(m).board)).toEqual({
      pieces: 2,
      hexes: 7,
      maxElevation: 2,
      scenery: 0,
      zones: [{ seat: 1, size: 1 }],
    });
  });
});
