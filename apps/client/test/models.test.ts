import { CARD_CATALOG, CARDS } from "@aoh/content";
import { HEX_SIZE, LEVEL_HEIGHT, isSquad } from "@aoh/rules";
import { describe, expect, it } from "vitest";
import { HEIGHT_TOLERANCE, TRIANGLE_BUDGET, UNIT_MODELS, baseFrame, figureGeometry, figureModel, measure } from "../src/models";
import { box, figure } from "../src/models/build";
import type { Part } from "../src/models/types";

function volume(part: Part): number {
  const t = part.tris;
  let v = 0;
  for (let i = 0; i < t.length; i += 9) {
    v +=
      t[i]! * (t[i + 4]! * t[i + 8]! - t[i + 5]! * t[i + 7]!) -
      t[i + 1]! * (t[i + 3]! * t[i + 8]! - t[i + 5]! * t[i + 6]!) +
      t[i + 2]! * (t[i + 3]! * t[i + 7]! - t[i + 4]! * t[i + 6]!);
  }
  return v / 6;
}

const models = Object.entries(UNIT_MODELS)
  .filter(([id]) => CARD_CATALOG.has(id))
  .map(([id, unit]) => ({ id, unit, card: CARD_CATALOG.get(id)! }));

describe("figure models", () => {
  it("belong to cards", () => {
    expect(models.length).toBeGreaterThan(0);
    expect(Object.keys(UNIT_MODELS).filter((id) => !CARD_CATALOG.has(id))).toEqual([]);
    expect(models.length).toBeLessThanOrEqual(CARDS.length);
  });

  it("have one figure for a hero and no more poses than figures for a squad", () => {
    for (const { id, unit, card } of models) {
      expect(unit.figures.length, id).toBeGreaterThan(0);
      expect(unit.figures.length, id).toBeLessThanOrEqual(isSquad(card) ? card.figureCount : 1);
    }
  });

  describe.each(models)("$id", ({ unit, card }) => {
    it("is made of solid parts whose faces point outwards", () => {
      for (const model of unit.figures) {
        for (const part of model.parts) {
          expect(part.tris.length % 9).toBe(0);
          expect(part.tris.every(Number.isFinite)).toBe(true);
          expect(volume(part)).toBeGreaterThan(0);
        }
      }
    });

    it("stands on the ground and is as tall as the card's Height", () => {
      for (const model of unit.figures) {
        const ys = model.parts.flatMap((p) => p.tris.filter((_, i) => i % 3 === 1));
        expect(Math.min(...ys)).toBeGreaterThan(-0.02);
        expect(Math.min(...ys)).toBeLessThan(0.02);
        expect(Math.abs(measure(model, card.footprint).height - card.height)).toBeLessThanOrEqual(HEIGHT_TOLERANCE);
      }
    });

    it("fits the base on its card", () => {
      // A model that fails here needs a slimmer pose, or a larger footprint on its card.
      for (const model of unit.figures) expect(measure(model, card.footprint).fits).toBe(true);
    });

    it("stays low polygon", () => {
      for (const model of unit.figures) {
        const { triangles } = measure(model, card.footprint);
        expect(triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);
        expect(figureGeometry(model).getAttribute("position").count).toBe(triangles * 3);
      }
    });
  });

  it("gives a squad's figures its poses in turn", () => {
    const unit = UNIT_MODELS["glade-wardens"]!;
    expect(figureModel(unit, 0)).toBe(unit.figures[0]);
    expect(figureModel(unit, unit.figures.length)).toBe(unit.figures[0]);
  });
});

describe("measuring a model against its base", () => {
  const width = Math.sqrt(3) * HEX_SIZE;
  // A Height 5 box, written at its final size: `figure` leaves it as it is.
  const slab = (w: number, d: number) => figure([box([w, 5 * LEVEL_HEIGHT, d], [0, 2.5 * LEVEL_HEIGHT, 0])], 5);

  it("sizes a figure to its Height", () => {
    expect(measure(slab(0.5, 0.5), "1").height).toBeCloseTo(5);
    const ys = slab(0.5, 0.5).parts.flatMap((p) => p.tris.filter((_, i) => i % 3 === 1));
    expect(Math.max(...ys)).toBeCloseTo(5 * LEVEL_HEIGHT);
  });

  it("finds nothing off the base for a figure inside its hex", () => {
    const fit = measure(slab(0.4, 0.4), "1");
    expect(fit.reach).toBe(0);
    expect(fit.outside).toBe(0);
    expect(fit.fits).toBe(true);
  });

  it("measures how far a long body reaches past a single hex", () => {
    // A single-hex figure faces a flat side, so its length runs from flat to flat.
    const fit = measure(slab(0.1, 1.6 * width), "1");
    expect(fit.reach).toBeCloseTo(0.3, 1);
    expect(fit.fits).toBe(false);
  });

  it("lets the same body fit a 2x1 base", () => {
    expect(measure(slab(0.1, 1.6 * width), "2x1").fits).toBe(true);
    expect(measure(slab(0.1, 1.6 * width), "3x1").fits).toBe(true);
  });

  it("faces a figure on several hexes towards its front hex", () => {
    for (const footprint of ["2x1", "3x1", "2x2"] as const) {
      const frame = baseFrame(footprint);
      const front = { x: 0, z: 0 };
      const ahead = { x: Math.sin(frame.yaw), z: Math.cos(frame.yaw) };
      const toFront = { x: front.x - frame.x, z: front.z - frame.z };
      const length = Math.hypot(toFront.x, toFront.z);
      expect((ahead.x * toFront.x + ahead.z * toFront.z) / length).toBeCloseTo(1);
    }
  });
});
