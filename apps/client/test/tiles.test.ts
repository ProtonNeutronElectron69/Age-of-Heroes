import { describe, expect, it } from "vitest";
import { BoxGeometry, CylinderGeometry } from "three";
import { boulderGeometry, worldUV } from "../src/scene/sceneryArt";
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

describe("the scenery's shapes", () => {
  it("gives stone one texture size on faces of any size", () => {
    const box = new BoxGeometry(3, 1, 0.5);
    worldUV(box, 1.5);
    const uv = box.getAttribute("uv");
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    // The long faces span 3 units: 2 textures across.
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(2);
  });

  it("makes the same lumpy boulder each time, within its size", () => {
    const a = boulderGeometry(0.7);
    expect(boulderGeometry(0.7)).toBe(a);
    const pos = a.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
      expect(d).toBeGreaterThan(0.7 * 0.8);
      expect(d).toBeLessThan(0.7 * 1.21);
    }
  });
});
