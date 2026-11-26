import { Board, hex, placeShape, placedSamples, shapeFrame, shareInSight, type MapDefinition, type PlacedPiece, type ShapedTarget } from "@aoh/rules";
import { describe, expect, it } from "vitest";
import { CARD_CATALOG, HIT_SHAPES, SCENERY_TABLE, TERRAIN_TABLE } from "../src";

/** A straight row of flat grass hexes. */
function row(n: number): Board {
  const pieces: PlacedPiece[] = Array.from({ length: n }, (_, q) => ({ id: `c${q}`, shape: "single", terrain: "grass", origin: hex(q, 0), rotation: 0, layer: 0 }));
  const pad = Array.from({ length: 8 }, (_, q) => hex(q, 3));
  pad.forEach((h, i) => pieces.push({ id: `pad${i}`, shape: "single", terrain: "grass", origin: h, rotation: 0, layer: 0 }));
  const map: MapDefinition = {
    formatVersion: 1,
    id: "row",
    name: "Row",
    description: "",
    pieces,
    startZones: [
      { seat: 0, hexes: pad.slice(0, 4) },
      { seat: 1, hexes: pad.slice(4, 8) },
    ],
    layouts: {},
    scenery: [],
  };
  return Board.fromMap(map, TERRAIN_TABLE, SCENERY_TABLE).board;
}

function target(cardId: string, q: number, facing: number): ShapedTarget {
  const shape = HIT_SHAPES.get(cardId)![0]!;
  const spots = [{ hex: hex(q, 0), elevation: 1 }];
  const frame = shapeFrame(spots, facing);
  const height = CARD_CATALOG.get(cardId)!.height;
  return { tokens: spots.map((s) => ({ ...s, height })), shape: placeShape(shape, frame), samples: placedSamples(shape, frame) };
}

describe("hit zones with the real units", () => {
  const board = row(6);
  const eye = { hex: hex(0, 0), elevation: 1, height: 5 };

  it("shows every unit's whole body, near enough, across open ground", () => {
    for (const id of HIT_SHAPES.keys()) {
      if (CARD_CATALOG.get(id)!.footprint !== "1") continue;
      expect(shareInSight(board, eye, target(id, 4, 90)), id).toBeGreaterThan(0.6);
    }
  });

  it("lets a shield hide part of the figure carrying it from the front", () => {
    // Facing 270 turns the figure's front towards the viewer, at q 0.
    const front = shareInSight(board, eye, target("dame-rowena", 4, 270));
    const back = shareInSight(board, eye, target("dame-rowena", 4, 90));
    expect(front).toBeLessThan(back);
  });

  it("hides a figure behind a large one", () => {
    const big = placeShape(HIT_SHAPES.get("mossback-treefolk")![0]!, shapeFrame([{ hex: hex(1, 0), elevation: 1 }], 270));
    const low = { hex: hex(0, 0), elevation: 1, height: 4 };
    expect(shareInSight(board, low, target("hive-spawn", 3, 270), { shapes: [big] })).toBeLessThan(shareInSight(board, low, target("hive-spawn", 3, 270)));
  });
});
