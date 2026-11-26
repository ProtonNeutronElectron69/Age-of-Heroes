import { describe, expect, it } from "vitest";
import {
  Board,
  decodeHitShape,
  hasLineOfSight,
  hex,
  placeShape,
  placedSamples,
  segmentHitsBox,
  shapeFrame,
  shareInSight,
  type HitShape,
  type ShapedTarget,
  type Token,
} from "../src";
import { rowMap } from "./fixtures";

const board = (columns: [string, number][]) => Board.fromMap(rowMap(columns)).board;
const flat = (n: number) => board(Array.from({ length: n }, () => ["grass", 1] as [string, number]));
const token = (q: number, elevation = 1, height = 5): Token => ({ hex: hex(q, 0), elevation, height });

/** A box in the stored form: kind (0 body, 1 gear), centre and half sizes in thousandths, unturned. */
const box = (kind: 0 | 1, c: [number, number, number], h: [number, number, number]) => [kind, ...c, ...h, 0, 0, 0, 1000];

/** A figure 1.5 high (Height 5): a torso and two legs with a gap between them. */
const person: HitShape = decodeHitShape([
  ...box(0, [0, 1100, 0], [200, 400, 120]),
  ...box(0, [-130, 350, 0], [70, 350, 70]),
  ...box(0, [130, 350, 0], [70, 350, 70]),
]);

/** The same figure with a tall shield held before it (on its +z side). */
const shielded: HitShape = decodeHitShape([
  ...box(0, [0, 1100, 0], [200, 400, 120]),
  ...box(0, [-130, 350, 0], [70, 350, 70]),
  ...box(0, [130, 350, 0], [70, 350, 70]),
  ...box(1, [0, 800, 300], [300, 700, 20]),
]);

function target(shape: HitShape, q: number, facing: number, elevation = 1): ShapedTarget {
  const spots = [{ hex: hex(q, 0), elevation }];
  const frame = shapeFrame(spots, facing);
  return { tokens: spots.map((s) => ({ ...s, height: 5 })), shape: placeShape(shape, frame), samples: placedSamples(shape, frame) };
}

describe("hit shape geometry", () => {
  it("finds a segment through a turned box", () => {
    const [b] = placeShape(decodeHitShape(box(0, [0, 500, 0], [100, 100, 500])), { x: 0, y: 0, z: 0, facing: 90 }).boxes;
    // Turned to face +x, the long box now lies along x.
    expect(segmentHitsBox({ x: -1, y: 0.5, z: 0.3 }, { x: 1, y: 0.5, z: 0.3 }, b!)).toBe(false);
    expect(segmentHitsBox({ x: 0.4, y: 0.5, z: -1 }, { x: 0.4, y: 0.5, z: 1 }, b!)).toBe(true);
    expect(segmentHitsBox({ x: 0, y: 0.5, z: 0.15 }, { x: 0, y: 0.5, z: 1 }, b!)).toBe(false);
  });

  it("stands a figure on its ground, in the middle of its hexes", () => {
    const frame = shapeFrame([{ hex: hex(0, 0), elevation: 2 }, { hex: hex(1, 0), elevation: 3 }], 0);
    expect(frame.y).toBeCloseTo(0.9);
    expect(frame.x).toBeCloseTo(Math.sqrt(3) / 2);
  });
});

describe("the share of a body in sight", () => {
  it("is the whole body across open ground", () => {
    expect(shareInSight(flat(5), token(0), target(person, 4, 0))).toBeCloseTo(1);
  });

  it("falls when another figure stands in the way, and stops at the share asked for", () => {
    const b = flat(5);
    const wall = placeShape(decodeHitShape(box(1, [0, 750, 0], [400, 750, 400])), shapeFrame([{ hex: hex(2, 0), elevation: 1 }], 0));
    const share = shareInSight(b, token(0), target(person, 4, 0), { shapes: [wall] });
    expect(share).toBeLessThan(0.2);
    // A low blocker hides only the legs.
    const low = placeShape(decodeHitShape(box(1, [0, 450, 0], [400, 450, 400])), shapeFrame([{ hex: hex(3, 0), elevation: 1 }], 0));
    const part = shareInSight(b, token(0), target(person, 4, 0), { shapes: [low] });
    expect(part).toBeGreaterThan(0.4);
    expect(part).toBeLessThan(1);
    expect(shareInSight(b, token(0), target(person, 4, 0), { shapes: [low] }, 0.2)).toBeGreaterThanOrEqual(0.2);
  });

  it("is hidden by the target's own shield from the front, not from behind", () => {
    const b = flat(5);
    // Facing 270 turns its front (+z) towards -x, where the viewer is.
    const front = shareInSight(b, token(0, 1, 2), target(shielded, 4, 270));
    const back = shareInSight(b, token(0, 1, 2), target(shielded, 4, 90));
    expect(front).toBeLessThan(back);
    expect(back).toBeCloseTo(1);
  });

  it("lets the view through a gap a token would fill", () => {
    const b = flat(7);
    // A figure facing across the line, its legs apart, stands between a low viewer and a low target.
    const legs = placeShape(person, shapeFrame([{ hex: hex(3, 0), elevation: 1 }], 90));
    const crouched = decodeHitShape(box(0, [0, 120, 0], [100, 100, 100]));
    const t = target(crouched, 6, 0);
    const viewer = token(0, 1, 1);
    expect(shareInSight(b, viewer, t, { shapes: [legs] })).toBeGreaterThan(0);
    // As tokens, the figure in the middle hides it.
    expect(hasLineOfSight(b, viewer, { hex: hex(6, 0), elevation: 1, height: 1 }, { blockers: [token(3)] })).toBe(false);
  });
});
