import type { DieFace } from "@aoh/rules";
import { IcosahedronGeometry, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { cubeTopFace } from "../src/scene/dice3d";
import {
  CUBE_NORMALS,
  D20_RADIUS,
  DIE_SIZE,
  FRAME_RATE,
  WALL_HEIGHT,
  d20Faces,
  restingOf,
  throwD20s,
  throwDice,
  trayFor,
  type PlayedDie,
  type Tray,
} from "../src/scene/diceRoll";

/**
 * The 3D dice only show results the rules have rolled, so each must come to
 * rest showing exactly that result. Browser tests run with reduced motion and
 * cannot read faces off the canvas, so the throws are checked here.
 */

const at = (d: PlayedDie, frame: number) => {
  const f = Math.min(frame, d.frames.length / 7 - 1) * 7;
  return { x: new Vector3(d.frames[f]!, d.frames[f + 1]!, d.frames[f + 2]!), q: new Quaternion(d.frames[f + 3]!, d.frames[f + 4]!, d.frames[f + 5]!, d.frames[f + 6]!) };
};

/** The die's corners, in its own space. */
const CUBE_CORNERS = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z) => new Vector3(x, y, z).multiplyScalar(DIE_SIZE / 2))));
const D20_CORNERS = (() => {
  const p = new IcosahedronGeometry(D20_RADIUS, 0).getAttribute("position");
  const out: Vector3[] = [];
  for (let i = 0; i < p.count; i++) {
    const v = new Vector3().fromBufferAttribute(p, i);
    if (!out.some((o) => o.distanceTo(v) < 1e-4)) out.push(v);
  }
  return out;
})();

/**
 * A thrown die comes in over its wall without touching it: until it is well inside, any corner
 * over the wall or outside the tray is above the wall's top. It moves towards the middle as it comes in.
 */
function expectClearsWall(die: PlayedDie, corners: readonly Vector3[], reach: number, tray: Tray, from: -1 | 1) {
  const start = at(die, die.thrown).x;
  expect(Math.sign(start.x)).toBe(from);
  expect(Math.abs(start.x)).toBeGreaterThan(tray.halfX);
  expect(Math.sign(at(die, die.thrown + 6).x.x - start.x)).toBe(-from);
  for (let f = die.thrown; f <= die.landed; f++) {
    const { x, q } = at(die, f);
    if (Math.abs(x.x) < tray.halfX - reach) break;
    for (const c of corners) {
      const p = c.clone().applyQuaternion(q).add(x);
      if (Math.abs(p.x) > tray.halfX) expect(p.y).toBeGreaterThan(WALL_HEIGHT);
    }
  }
}

describe("a throw of the dice", () => {
  const faces = (n: number, seed: number, marks: DieFace): DieFace[] => Array.from({ length: n }, (_, i) => ((i * 7 + seed) % 3 === 0 ? "blank" : marks));
  const cases: [number, number][] = [[1, 0], [0, 2], [3, 2], [4, 4], [6, 5], [8, 8], [10, 7], [12, 10]];

  /** Attack dice the defense dice pushed after they had landed, over every case. */
  let knocked = 0;

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
        const top = Math.max(...CUBE_NORMALS.map((n) => n.clone().applyQuaternion(rest.q).y));
        expect(top).toBeGreaterThan(0.98);
        expect(rest.x.y).toBeLessThan(DIE_SIZE * 0.56);
        expect(Math.abs(rest.x.x)).toBeLessThan(t.tray.halfX);
        expect(Math.abs(rest.x.z)).toBeLessThan(t.tray.halfZ);
        // Attack dice come in over the left wall (-x), defense dice over the right.
        expectClearsWall(die, CUBE_CORNERS, DIE_SIZE * 0.6, t.tray, die.kind === "attack" ? -1 : 1);
        // Thrown before it lands, and attack dice land before the defense dice are thrown.
        expect(die.landed).toBeGreaterThanOrEqual(die.thrown);
        if (die.kind === "attack" && d > 0) expect(die.landed).toBeLessThanOrEqual(t.defenseThrown);
        // Once landed it may be knocked about, but it keeps the rolled face on top.
        const first = at(die, die.landed);
        expect(cubeTopFace(die.kind, first.q.clone().multiply(die.remap))).toBe(die.face);
        if (die.kind === "attack" && first.x.distanceTo(rest.x) > 0.05) knocked++;
      }
      // No two dice overlap: cubes that do not overlap have their middles at least an edge apart.
      for (let i = 0; i < t.dice.length; i++) {
        for (let j = i + 1; j < t.dice.length; j++) expect(at(t.dice[i]!, end).x.distanceTo(at(t.dice[j]!, end).x)).toBeGreaterThan(DIE_SIZE * 0.97);
      }
      // A throw settles within a few seconds.
      expect(t.frameCount / FRAME_RATE).toBeLessThan(12);
    }
  });

  it("lets the defense dice knock the attack dice about", () => {
    expect(knocked).toBeGreaterThan(20);
  });

  it("is repeatable", () => {
    const one = throwDice(["skull", "blank", "skull"], ["shield", "blank"], 42);
    const two = throwDice(["skull", "blank", "skull"], ["shield", "blank"], 42);
    expect(Array.from(two.dice[3]!.frames)).toEqual(Array.from(one.dice[3]!.frames));
  });
});

describe("the d20", () => {
  const faces = d20Faces();

  it("has 20 outward faces, each pointing a different way, with one opposite each", () => {
    expect(faces).toHaveLength(20);
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) expect(faces[i]!.normal.dot(faces[j]!.normal)).toBeLessThan(0.99);
      expect(faces.some((f) => f.normal.dot(faces[i]!.normal) < -0.999)).toBe(true);
    }
    // Outward: every corner lies behind every face's plane.
    const inradius = Math.min(...faces.map((f) => Math.max(...D20_CORNERS.map((c) => c.dot(f.normal)))));
    expect(inradius).toBeGreaterThan(D20_RADIUS * 0.79);
  });

  /** The value on top of a d20 drawn with this turn, and how upright its number reads to the camera in front. */
  const shownBy = (q: Quaternion) => {
    let best = 0;
    for (let i = 1; i < faces.length; i++) if (faces[i]!.normal.clone().applyQuaternion(q).y > faces[best]!.normal.clone().applyQuaternion(q).y) best = i;
    const top = faces[best]!;
    return { value: best + 1, flat: top.normal.clone().applyQuaternion(q).y, upright: -top.up.clone().applyQuaternion(q).z };
  };

  it.each([1, 2, 3, 4, 5, 6])("%i players' d20s land on their values, flat, apart, inside the tray and readable", (players) => {
    const tray = trayFor(players * 2);
    for (let seed = 1; seed <= 10; seed++) {
      const dice = Array.from({ length: players }, (_, i) => ({ value: ((seed * 7 + i * 11) % 20) + 1, from: (i % 2 === 0 ? -1 : 1) as -1 | 1 }));
      const t = throwD20s(dice, tray, seed * 31 + players);
      expect(t.dice).toHaveLength(players);
      const end = t.frameCount - 1;
      t.dice.forEach((die, i) => {
        expect(die.frames.length / 7).toBe(t.frameCount);
        expect(die.frames.every(Number.isFinite)).toBe(true);
        const rest = at(die, end);
        const shown = shownBy(rest.q.clone().multiply(die.remap));
        expect(shown.value).toBe(dice[i]!.value);
        expect(shown.flat).toBeGreaterThan(0.98);
        // Of the three ways round, the number is turned no more than 60 degrees from upright.
        expect(shown.upright).toBeGreaterThan(0.49);
        expect(rest.x.y).toBeLessThan(D20_RADIUS * 0.85);
        expect(Math.abs(rest.x.x)).toBeLessThan(tray.halfX);
        expect(Math.abs(rest.x.z)).toBeLessThan(tray.halfZ);
        expectClearsWall(die, D20_CORNERS, D20_RADIUS * 0.88, tray, dice[i]!.from);
        // Knocked about or not, it keeps its value on top from the moment it lands.
        expect(shownBy(at(die, die.landed).q.clone().multiply(die.remap)).value).toBe(dice[i]!.value);
      });
      for (let i = 0; i < t.dice.length; i++) {
        for (let j = i + 1; j < t.dice.length; j++) expect(at(t.dice[i]!, end).x.distanceTo(at(t.dice[j]!, end).x)).toBeGreaterThan(D20_RADIUS * 1.5);
      }
      expect(t.frameCount / FRAME_RATE).toBeLessThan(8);
    }
  });

  it("remaps by one of the d20's own turns, so the drawing matches the shape that rolled", () => {
    const tray = trayFor(4);
    const t = throwD20s([{ value: 17, from: -1 }, { value: 3, from: 1 }], tray, 5);
    for (const die of t.dice) {
      for (const c of D20_CORNERS) {
        const moved = c.clone().applyQuaternion(die.remap);
        expect(D20_CORNERS.some((o) => o.distanceTo(moved) < 1e-3)).toBe(true);
      }
    }
  });

  it("is thrown around the dice already lying in the tray, which do not move", () => {
    const tray = trayFor(6);
    for (let seed = 1; seed <= 8; seed++) {
      const first = throwD20s([{ value: 12, from: -1 }, { value: 5, from: 1 }], tray, seed);
      const lying = first.dice.map(restingOf);
      const second = throwD20s([{ value: 20, from: -1 }], tray, seed + 100, lying);
      const die = second.dice[0]!;
      const rest = at(die, second.frameCount - 1);
      expect(shownBy(rest.q.clone().multiply(die.remap)).value).toBe(20);
      for (const l of lying) expect(rest.x.distanceTo(l.at)).toBeGreaterThan(D20_RADIUS * 1.5);
    }
  });
});
