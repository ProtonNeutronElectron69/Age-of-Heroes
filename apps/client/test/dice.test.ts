import type { DieFace } from "@aoh/rules";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { cubeLanding, cubeTopFace, d20Landing, d20Shape, type DieKind } from "../src/scene/dice3d";

/**
 * The 3D dice only show results the rules have rolled, so each must come to
 * rest showing exactly that result. Browser tests run with reduced motion and
 * cannot read faces off the canvas, so the landing turns are checked here.
 */

describe("cube dice", () => {
  const cases: [DieKind, DieFace][] = [
    ["attack", "skull"],
    ["attack", "blank"],
    ["defense", "shield"],
    ["defense", "blank"],
  ];
  it.each(cases)("a %s die lands with %s on top, whatever its seed", (kind, face) => {
    for (let seed = 0; seed < 40; seed++) expect(cubeTopFace(kind, cubeLanding(kind, face, seed))).toBe(face);
  });
});

describe("the d20", () => {
  const { faces } = d20Shape();

  it("has 20 faces, each pointing a different way", () => {
    expect(faces).toHaveLength(20);
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) expect(faces[i]!.normal.dot(faces[j]!.normal)).toBeLessThan(0.99);
    }
  });

  it("lands with the rolled number facing the camera, upright", () => {
    for (const toward of [new Vector3(0, 0.15, 1), new Vector3(-0.3, 0.2, 1), new Vector3(0.4, 0.1, 1)]) {
      const view = toward.clone().normalize();
      for (let value = 1; value <= 20; value++) {
        const q = d20Landing(faces, value, toward);
        const face = faces[value - 1]!;
        // The rolled face points at the camera, closer than any other face.
        const facing = face.normal.clone().applyQuaternion(q).dot(view);
        expect(facing).toBeGreaterThan(0.999);
        for (const other of faces) if (other !== face) expect(other.normal.clone().applyQuaternion(q).dot(view)).toBeLessThan(facing);
        // Its number reads upright: the number's top points up the screen.
        expect(face.up.clone().applyQuaternion(q).y).toBeGreaterThan(0.9);
      }
    }
  });
});
