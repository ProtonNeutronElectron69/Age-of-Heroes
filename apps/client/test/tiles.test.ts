import { describe, expect, it } from "vitest";
import { CylinderGeometry } from "three";
import { tileGeometry } from "../src/scene/tileMaterials";

describe("the tile geometry", () => {
  it("draws in two parts, the sides and bottom then the top, with every triangle kept", () => {
    const g = tileGeometry();
    const plain = new CylinderGeometry(1, 1, 1, 6);
    expect(g.groups.map((x) => x.materialIndex)).toEqual([0, 1]);
    expect(g.groups[0]!.start).toBe(0);
    expect(g.groups[1]!.start).toBe(g.groups[0]!.count);
    expect(g.groups[0]!.count + g.groups[1]!.count).toBe(plain.getIndex()!.count);
    expect(g.getIndex()!.count).toBe(plain.getIndex()!.count);
    // The second part is the top cap: all of its points are on the top face.
    const pos = g.getAttribute("position");
    const index = g.getIndex()!;
    const top = Math.max(...Array.from({ length: pos.count }, (_, i) => pos.getY(i)));
    for (let i = g.groups[1]!.start; i < g.groups[1]!.start + g.groups[1]!.count; i++) {
      expect(pos.getY(index.getX(i))).toBeCloseTo(top);
    }
  });
});
