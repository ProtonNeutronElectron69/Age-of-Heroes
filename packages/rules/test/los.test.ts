import { describe, expect, it } from "vitest";
import { Board, hasLineOfSight, hex, segmentHitsCylinder, segmentHitsHexPrism, type Token } from "../src";
import { rowMap } from "./fixtures";

const board = (columns: [string, number][]) => Board.fromMap(rowMap(columns)).board;
const token = (q: number, elevation: number, height = 5): Token => ({ hex: hex(q, 0), elevation, height });
const forgiving = { strict: false };

describe("segment tests", () => {
  it("detects a segment crossing a hex prism", () => {
    expect(segmentHitsHexPrism({ x: -2, y: 0.5, z: 0 }, { x: 2, y: 0.5, z: 0 }, 0, 0, 0, 1)).toBe(true);
    expect(segmentHitsHexPrism({ x: -2, y: 1.5, z: 0 }, { x: 2, y: 1.5, z: 0 }, 0, 0, 0, 1)).toBe(false);
    expect(segmentHitsHexPrism({ x: -2, y: 0.5, z: 2 }, { x: 2, y: 0.5, z: 2 }, 0, 0, 0, 1)).toBe(false);
  });

  it("detects a segment crossing a cylinder", () => {
    expect(segmentHitsCylinder({ x: -2, y: 0.5, z: 0 }, { x: 2, y: 0.5, z: 0 }, 0, 0, 0.5, 0, 1)).toBe(true);
    expect(segmentHitsCylinder({ x: -2, y: 0.5, z: 0.6 }, { x: 2, y: 0.5, z: 0.6 }, 0, 0, 0.5, 0, 1)).toBe(false);
    expect(segmentHitsCylinder({ x: -2, y: 2, z: 0 }, { x: 2, y: 2, z: 0 }, 0, 0, 0.5, 0, 1)).toBe(false);
  });
});

describe("line of sight", () => {
  it("is clear across flat ground", () => {
    const b = board([["grass", 1], ["grass", 1], ["grass", 1], ["grass", 1]]);
    expect(hasLineOfSight(b, token(0, 1), token(3, 1), forgiving)).toBe(true);
  });

  it("is blocked by a tall wall and clear over a low one", () => {
    const tall = board([["grass", 1], ["rock", 9], ["grass", 1]]);
    expect(hasLineOfSight(tall, token(0, 1), token(2, 1), forgiving)).toBe(false);
    const low = board([["grass", 1], ["rock", 3], ["grass", 1]]);
    expect(hasLineOfSight(low, token(0, 1), token(2, 1), forgiving)).toBe(true);
  });

  it("lets a figure on a cliff see a figure at its foot", () => {
    const b = board([["rock", 10], ["grass", 1]]);
    expect(hasLineOfSight(b, token(0, 10), token(1, 1), forgiving)).toBe(true);
    expect(hasLineOfSight(b, token(1, 1), token(0, 10), forgiving)).toBe(true);
  });

  it("is symmetric-ish over a ridge: a taller figure sees more", () => {
    const b = board([["grass", 1], ["rock", 5], ["grass", 1]]);
    expect(hasLineOfSight(b, token(0, 1, 3), token(2, 1, 3), forgiving)).toBe(false);
    expect(hasLineOfSight(b, token(0, 1, 9), token(2, 1, 9), forgiving)).toBe(true);
  });

  it("ignores figures in the Basic game but not in the Advanced game", () => {
    const b = board([["grass", 1], ["grass", 1], ["grass", 1]]);
    const blocker = token(1, 1, 9);
    expect(hasLineOfSight(b, token(0, 1), token(2, 1), { strict: false, blockers: [blocker] })).toBe(true);
    expect(hasLineOfSight(b, token(0, 1), token(2, 1), { strict: true, blockers: [blocker] })).toBe(false);
  });
});
