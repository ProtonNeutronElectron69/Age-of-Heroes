import { CARD_CATALOG, CARDS } from "@aoh/content";
import { HEX_SIZE, LEVEL_HEIGHT, isSquad } from "@aoh/rules";
import { describe, expect, it } from "vitest";
import {
  BASE_HEIGHT,
  BASE_RADIUS,
  HEIGHT_TOLERANCE,
  TRIANGLE_BUDGET,
  UNIT_MODELS,
  baseFrame,
  baseGeometry,
  baseParts,
  figureColors,
  figureGeometry,
  figureModel,
  measure,
} from "../src/models";
import { box, figure, squad } from "../src/models/build";
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

    it("stands on its base and is as tall as the card's Height", () => {
      const heights = unit.figures.map((model) => measure(model, card.footprint).height);
      for (const model of unit.figures) {
        const ys = model.parts.flatMap((p) => p.tris.filter((_, i) => i % 3 === 1));
        expect(Math.min(...ys)).toBeCloseTo(BASE_HEIGHT, 5);
      }
      // The tallest pose stands the full Height; a crouching pose may be shorter, never taller.
      expect(Math.abs(Math.max(...heights) - card.height)).toBeLessThanOrEqual(HEIGHT_TOLERANCE);
      for (const height of heights) expect(height).toBeGreaterThan(card.height * 0.6);
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
  // A Height 5 box, written at its final size: `figure` only lifts it onto its base.
  const tall = 5 * LEVEL_HEIGHT - BASE_HEIGHT;
  const slab = (w: number, d: number) => figure([box([w, tall, d], [0, tall / 2, 0])], 5);

  it("sizes a figure and its base to its Height", () => {
    expect(measure(slab(0.5, 0.5), "1").height).toBeCloseTo(5);
    const ys = slab(0.5, 0.5).parts.flatMap((p) => p.tris.filter((_, i) => i % 3 === 1));
    expect(Math.max(...ys)).toBeCloseTo(5 * LEVEL_HEIGHT);
    expect(Math.min(...ys)).toBeCloseTo(BASE_HEIGHT);
  });

  it("sizes a squad's poses to one scale", () => {
    const [standing, crouching] = squad([[box([0.3, 1, 0.3], [0, 0.5, 0])], [box([0.3, 0.7, 0.3], [0, 0.35, 0])]], 5);
    expect(measure(standing!, "1").height).toBeCloseTo(5);
    const scale = (5 * LEVEL_HEIGHT - BASE_HEIGHT) / 1;
    expect(measure(crouching!, "1").height).toBeCloseTo((0.7 * scale + BASE_HEIGHT) / LEVEL_HEIGHT);
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

describe("bases and colours", () => {
  const corners = (footprint: "1" | "2x1" | "3x1" | "2x2") => {
    const t = baseParts(footprint).flatMap((p) => p.tris);
    return Array.from({ length: t.length / 3 }, (_, i) => ({ x: t[i * 3]!, y: t[i * 3 + 1]!, z: t[i * 3 + 2]! }));
  };

  it("gives a single-hex figure a circle a little smaller than its hex", () => {
    const inradius = (Math.sqrt(3) / 2) * HEX_SIZE;
    expect(BASE_RADIUS).toBeLessThan(inradius);
    expect(BASE_RADIUS).toBeGreaterThan(inradius * 0.85);
    const points = corners("1");
    expect(Math.max(...points.map((p) => Math.hypot(p.x, p.z)))).toBeCloseTo(BASE_RADIUS);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(BASE_HEIGHT);
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(0);
  });

  it("gives a larger footprint one base over all its hexes", () => {
    for (const footprint of ["2x1", "3x1", "2x2"] as const) {
      const frame = baseFrame(footprint);
      const points = corners(footprint);
      // The base reaches one base radius past the outermost hex centres, ahead and to each side.
      const local = frame.cells.map((cell) => {
        const dx = Math.sqrt(3) * HEX_SIZE * (cell.q + cell.r / 2) - frame.x;
        const dz = 1.5 * HEX_SIZE * cell.r - frame.z;
        return { x: dx * Math.cos(frame.yaw) - dz * Math.sin(frame.yaw), z: dx * Math.sin(frame.yaw) + dz * Math.cos(frame.yaw) };
      });
      expect(Math.max(...points.map((p) => p.z))).toBeCloseTo(Math.max(...local.map((c) => c.z)) + BASE_RADIUS, 1);
      expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(Math.max(...local.map((c) => c.x)) + BASE_RADIUS, 1);
      expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(Math.min(...local.map((c) => c.x)) - BASE_RADIUS, 1);
      expect(baseGeometry(footprint).getAttribute("position").count).toBe(points.length);
    }
  });

  it("swaps the model and base colours between the two schemes", () => {
    expect(figureColors("faction", "#234573", "#e53935")).toEqual({ model: "#234573", base: "#e53935" });
    expect(figureColors("player", "#234573", "#e53935")).toEqual({ model: "#e53935", base: "#234573" });
  });
});
