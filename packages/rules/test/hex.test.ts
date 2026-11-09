import { describe, expect, it } from "vitest";
import {
  DIRECTIONS,
  hex,
  hexDistance,
  hexKey,
  hexLine,
  hexNeighbors,
  hexRing,
  hexRotate,
  hexSpiral,
  hexToWorld,
  isAdjacent,
  parseHexKey,
  worldToHex,
} from "../src";

describe("hex math", () => {
  it("normalises negative zero", () => {
    expect(Object.is(hex(-0, -0).q, 0)).toBe(true);
    expect(hexKey(hex(-0, 3))).toBe("0,3");
  });

  it("round-trips keys", () => {
    const h = hex(-4, 7);
    expect(parseHexKey(hexKey(h))).toEqual(h);
    expect(() => parseHexKey("nope")).toThrow();
  });

  it("measures distance", () => {
    expect(hexDistance(hex(0, 0), hex(0, 0))).toBe(0);
    expect(hexDistance(hex(0, 0), hex(3, -1))).toBe(3);
    expect(hexDistance(hex(-2, 2), hex(2, -2))).toBe(4);
    for (const d of DIRECTIONS) expect(hexDistance(hex(0, 0), d)).toBe(1);
  });

  it("finds six distinct neighbours", () => {
    const n = hexNeighbors(hex(2, 3));
    expect(new Set(n.map(hexKey)).size).toBe(6);
    expect(n.every((h) => isAdjacent(h, hex(2, 3)))).toBe(true);
  });

  it("rotates one direction step at a time and six steps is identity", () => {
    for (let i = 0; i < 6; i++) {
      expect(hexRotate(DIRECTIONS[i]!, 1)).toEqual(DIRECTIONS[(i + 1) % 6]);
    }
    const h = hex(3, -1);
    expect(hexRotate(h, 6)).toEqual(h);
    expect(hexRotate(hexRotate(h, 2), -2)).toEqual(h);
    expect(hexDistance(hex(0, 0), hexRotate(h, 1))).toBe(hexDistance(hex(0, 0), h));
  });

  it("draws contiguous lines", () => {
    const line = hexLine(hex(0, 0), hex(4, -2));
    expect(line).toHaveLength(5);
    for (let i = 1; i < line.length; i++) expect(isAdjacent(line[i - 1]!, line[i]!)).toBe(true);
  });

  it("builds rings and spirals", () => {
    expect(hexRing(hex(0, 0), 2)).toHaveLength(12);
    expect(hexSpiral(hex(0, 0), 2)).toHaveLength(19);
    expect(hexRing(hex(1, 1), 3).every((h) => hexDistance(h, hex(1, 1)) === 3)).toBe(true);
  });

  it("converts to and from world space", () => {
    for (const h of hexSpiral(hex(0, 0), 4)) {
      const w = hexToWorld(h, 1.3);
      expect(worldToHex(w.x, w.z, 1.3)).toEqual(h);
    }
  });
});
