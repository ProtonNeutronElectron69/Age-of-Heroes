import { BufferGeometry, Float32BufferAttribute } from "three";
import type { FigureModel, UnitModel } from "./types";
import { CONCORD } from "./units/concord";
import { VERDANT } from "./units/verdant";

export { baseFrame, measure, HEIGHT_TOLERANCE, OVERHANG_LIMITS, TRIANGLE_BUDGET, type BaseFrame, type Fit } from "./measure";
export type { FigureModel, Part, Role, UnitModel } from "./types";

/**
 * Figure models by card id. Stage 1 gives each unit its size and shape in a
 * single colour; a unit with no model here is still drawn as a token.
 */
export const UNIT_MODELS: Readonly<Record<string, UnitModel>> = { ...CONCORD, ...VERDANT };

/** The model for figure number `index` of a unit: a squad's figures take its poses in turn. */
export function figureModel(unit: UnitModel, index: number): FigureModel {
  return unit.figures[index % unit.figures.length]!;
}

/** One flat-shaded mesh for a whole figure. The caller disposes of it. */
export function figureGeometry(model: FigureModel): BufferGeometry {
  const positions = model.parts.flatMap((p) => p.tris);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  // Corners are not shared between faces, so every face gets its own normal.
  geometry.computeVertexNormals();
  return geometry;
}
