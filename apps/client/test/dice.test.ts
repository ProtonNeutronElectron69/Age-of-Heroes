import type { DieFace } from "@aoh/rules";
import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { cubeLanding, cubeTopFace, d20Landing, d20Shape, type DieKind } from "../src/scene/dice3d";
import { DIE_SIZE, FRAME_RATE, throwDice, type DiePath } from "../src/scene/diceRoll";

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

describe("a throw of the dice", () => {
  const faces = (n: number, seed: number, marks: DieFace): DieFace[] => Array.from({ length: n }, (_, i) => ((i * 7 + seed) % 3 === 0 ? "blank" : marks));
  const at = (d: DiePath, frame: number) => {
    const f = Math.min(frame, d.frames.length / 7 - 1) * 7;
    return { x: new Vector3(d.frames[f]!, d.frames[f + 1]!, d.frames[f + 2]!), q: new Quaternion(d.frames[f + 3]!, d.frames[f + 4]!, d.frames[f + 5]!, d.frames[f + 6]!) };
  };
  const cases: [number, number][] = [[1, 0], [3, 2], [4, 4], [6, 5], [8, 8], [10, 7], [12, 10]];

  it.each(cases)("%i attack and %i defense dice land on the rolled faces, flat, apart and inside the tray", (a, d) => {
    for (let seed = 1; seed <= 12; seed++) {
      const t = throwDice(faces(a, seed, "skull"), faces(d, seed + 1, "shield"), seed * 101 + a);
      expect(t.dice).toHaveLength(a + d);
      const end = t.frameCount - 1;
      for (const die of t.dice) {
        expect(die.frames.length / 7).toBe(t.frameCount);
        expect(die.frames.every(Number.isFinite)).toBe(true);
        const rest = at(die, end);
        // The drawing is turned by the remap, then by the body.
        const shown = rest.q.clone().multiply(die.remap);
        expect(cubeTopFace(die.kind, shown)).toBe(die.face);
        // Flat on the felt, and inside the walls.
        const top = Math.max(...[0, 1, 2, 3, 4, 5].map((i) => new Vector3(...[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][i]! as [number, number, number]).applyQuaternion(rest.q).y));
        expect(top).toBeGreaterThan(0.98);
        expect(rest.x.y).toBeLessThan(DIE_SIZE * 0.56);
        expect(Math.abs(rest.x.x)).toBeLessThan(t.tray.halfX);
        expect(Math.abs(rest.x.z)).toBeLessThan(t.tray.halfZ);
        // Thrown before it lands, and attack dice land before the defense dice are thrown.
        expect(die.landed).toBeGreaterThanOrEqual(die.thrown);
        if (die.kind === "attack" && d > 0) expect(die.landed).toBeLessThanOrEqual(t.defenseThrown);
        // Once landed it stays put.
        expect(at(die, die.landed).x.distanceTo(rest.x)).toBeLessThan(1e-3);
      }
      // No two dice overlap: cubes that do not overlap have their middles at least an edge apart.
      for (let i = 0; i < t.dice.length; i++) {
        for (let j = i + 1; j < t.dice.length; j++) expect(at(t.dice[i]!, end).x.distanceTo(at(t.dice[j]!, end).x)).toBeGreaterThan(DIE_SIZE * 0.97);
      }
      // A throw settles within a few seconds.
      expect(t.frameCount / FRAME_RATE).toBeLessThan(8);
    }
  });

  it("is repeatable", () => {
    const one = throwDice(["skull", "blank", "skull"], ["shield", "blank"], 42);
    const two = throwDice(["skull", "blank", "skull"], ["shield", "blank"], 42);
    expect(Array.from(two.dice[3]!.frames)).toEqual(Array.from(one.dice[3]!.frames));
  });
});
