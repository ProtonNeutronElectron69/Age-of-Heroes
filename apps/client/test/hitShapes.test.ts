import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CARDS, HIT_SHAPES } from "@aoh/content";
import { HIT_BOX_NUMBERS, bodySamples, decodeHitShape } from "@aoh/rules";
import { describe, expect, it } from "vitest";
import { unitModel } from "../src/models";
import { encodeModel, modelBoxes } from "../src/models/hitShape";
import { DRAWINGS } from "../src/ui/art/drawings";

/**
 * The hit shapes the rules use (`hitShapes.json` in `@aoh/content`) are made from the detailed
 * models. When a model changes, write them again with
 * `HIT_SHAPES_WRITE=1 pnpm --filter @aoh/client exec vitest run hitShapes`; that changes line of
 * sight for that unit in games with hit zones, so say so in the pull request.
 */
const FILE = fileURLToPath(new URL("../../../packages/content/src/hitShapes.json", import.meta.url));

function fromModels(): Record<string, number[][]> {
  const out: Record<string, number[][]> = {};
  for (const card of CARDS) {
    const unit = unitModel(card.id, true);
    if (unit) out[card.id] = unit.figures.map(encodeModel);
  }
  return out;
}

describe("hit shapes", () => {
  const made = fromModels();
  if (process.env.HIT_SHAPES_WRITE) {
    // One pose a line keeps the file readable in a diff.
    const lines = Object.entries(made).map(
      ([id, poses]) => `  ${JSON.stringify(id)}: [\n${poses.map((p) => `    ${JSON.stringify(p)}`).join(",\n")}\n  ]`,
    );
    writeFileSync(FILE, `{\n${lines.join(",\n")}\n}\n`);
  }

  it("match the models (write them again when a model changes)", () => {
    const stored = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, number[][]>;
    expect(Object.keys(stored).sort()).toEqual(Object.keys(made).sort());
    for (const [id, poses] of Object.entries(made)) {
      expect(stored[id]!.length, id).toBe(poses.length);
      poses.forEach((pose, i) => {
        const old = stored[id]![i]!;
        expect(old.length, `${id} pose ${i}`).toBe(pose.length);
        // Within a thousandth or two: the models' sums can differ in their last digits between machines.
        const worst = Math.max(0, ...pose.map((n, k) => Math.abs(n - old[k]!)));
        expect(worst, `${id} pose ${i}`).toBeLessThanOrEqual(2);
      });
    }
  });

  it("give every unit a body to hit, sampled well", () => {
    for (const card of CARDS) {
      const poses = HIT_SHAPES.get(card.id);
      expect(poses, card.id).toBeDefined();
      for (const shape of poses!) {
        expect(shape.some((b) => b.kind === "body"), card.id).toBe(true);
        const samples = bodySamples(shape).length;
        expect(samples, card.id).toBeGreaterThanOrEqual(40);
        expect(samples, card.id).toBeLessThanOrEqual(200);
      }
    }
  });

  it("keep shields and weapons out of the body", () => {
    // Dame Rowena's sun shield and sword are gear; so is a flight stand.
    const rowena = modelBoxes(unitModel("dame-rowena", true)!.figures[0]!);
    expect(rowena.some((b) => b.kind === "gear")).toBe(true);
    const sprites = decodeHitShape(HIT_SHAPES_RAW("briar-sprites"));
    expect(sprites.some((b) => b.kind === "gear")).toBe(true);
  });

  it("read back as boxes round the parts", () => {
    for (const [id, poses] of Object.entries(made)) {
      for (const pose of poses) {
        expect(pose.length % HIT_BOX_NUMBERS, id).toBe(0);
        const shape = decodeHitShape(pose);
        for (const b of shape) {
          // The axes stay square to each other after rounding.
          expect(Math.abs(b.axes[0].x * b.axes[1].x + b.axes[0].y * b.axes[1].y + b.axes[0].z * b.axes[1].z)).toBeLessThan(0.01);
          expect(b.centre.y, id).toBeGreaterThan(-0.05);
        }
      }
    }
  });
});

describe("the card's hit zone picture", () => {
  it("greys gear wherever the unit's model has gear", () => {
    // The picture is the unit drawing, body red and gear grey; gear is marked part by part to match
    // the model (see docs/CONTENT.md). A unit whose every pose holds gear draws every figure with some.
    // Flying units are left out: a flight stand is gear, but the drawings show them hovering without one.
    for (const card of CARDS) {
      const poses = HIT_SHAPES.get(card.id);
      const drawing = DRAWINGS[card.id];
      if (!poses || !drawing || card.abilities.some((a) => a.id === "flying")) continue;
      if (!poses.every((shape) => shape.some((b) => b.kind === "gear"))) continue;
      for (const { figure } of drawing.tall) expect(figure.parts.some((p) => p.gear), `${card.id}: a figure draws no gear`).toBe(true);
    }
  });
});

function HIT_SHAPES_RAW(id: string): number[] {
  return (JSON.parse(readFileSync(FILE, "utf8")) as Record<string, number[][]>)[id]![0]!;
}
