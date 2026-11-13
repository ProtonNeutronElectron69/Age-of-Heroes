import type { Footprint } from "@aoh/rules";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { baseParts } from "./base";
import type { FigureModel, Part, UnitModel } from "./types";
import { ASHEN } from "./units/ashen";
import { CONCORD } from "./units/concord";
import { DAWNHOLD } from "./units/dawnhold";
import { KAGERO } from "./units/kagero";
import { NEXUS } from "./units/nexus";
import { VERDANT } from "./units/verdant";

export { baseFrame, measure, HEIGHT_TOLERANCE, OVERHANG_LIMITS, TRIANGLE_BUDGET, type BaseFrame, type Fit } from "./measure";
export { BASE_BEVEL, BASE_RADIUS, baseParts } from "./base";
export { BASE_HEIGHT } from "./build";
export { BASE_COLOR, COLOR_SCHEMES, figureColors, type ColorScheme } from "./colors";
export type { FigureModel, Part, Role, UnitModel } from "./types";

/**
 * Figure models by card id. Stage 1 gives each unit its size and shape in a
 * single colour; a unit with no model here is still drawn as a token.
 */
export const UNIT_MODELS: Readonly<Record<string, UnitModel>> = { ...CONCORD, ...KAGERO, ...VERDANT, ...NEXUS, ...ASHEN, ...DAWNHOLD };

/** The model for figure number `index` of a unit: a squad's figures take its poses in turn. */
export function figureModel(unit: UnitModel, index: number): FigureModel {
  return unit.figures[index % unit.figures.length]!;
}

function geometry(parts: readonly Part[]): BufferGeometry {
  const out = new BufferGeometry();
  out.setAttribute("position", new Float32BufferAttribute(parts.flatMap((p) => p.tris), 3));
  // Corners are not shared between faces, so every face gets its own normal.
  out.computeVertexNormals();
  return out;
}

/** One flat-shaded mesh for a whole figure, without its base. The caller disposes of it. */
export function figureGeometry(model: FigureModel): BufferGeometry {
  return geometry(model.parts);
}

/**
 * The meshes for the base under a figure with this footprint: its top, and
 * the bevelled edge that takes a colour. The caller disposes of them.
 */
export function baseGeometry(footprint: Footprint): { top: BufferGeometry; rim: BufferGeometry } {
  const parts = baseParts(footprint);
  return { top: geometry(parts.filter((p) => p.role === "base")), rim: geometry(parts.filter((p) => p.role === "rim")) };
}
