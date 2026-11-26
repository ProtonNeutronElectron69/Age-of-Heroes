import type { Footprint } from "@aoh/rules";
import { BufferGeometry, Color, Float32BufferAttribute } from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { baseParts } from "./base";
import { DETAILED_MODELS } from "./detailed";
import { groundParts } from "./ground";
import { paintLook, type Paint, type PaintContext } from "./paint";
import type { FigureModel, Part, UnitModel } from "./types";
import { ASHEN } from "./units/ashen";
import { CONCORD } from "./units/concord";
import { DAWNHOLD } from "./units/dawnhold";
import { HIVE } from "./units/hive";
import { KAGERO } from "./units/kagero";
import { NEXUS } from "./units/nexus";
import { VERDANT } from "./units/verdant";

export { baseFrame, measure, HEIGHT_TOLERANCE, OVERHANG_LIMITS, TRIANGLE_BUDGET, type BaseFrame, type Fit } from "./measure";
export { BASE_BEVEL, BASE_RADIUS, baseParts } from "./base";
export { BASE_HEIGHT } from "./build";
export { BASE_COLOR, COLOR_SCHEMES, MODEL_GREY, figureColors, type ColorScheme } from "./colors";
export type { FigureModel, Part, Role, UnitModel } from "./types";
export { DETAILED_MODELS } from "./detailed";
export { groundParts, seedOf } from "./ground";
export { paintLook, type Paint, type PaintContext, type PaintLook } from "./paint";

/**
 * Figure models by card id: every unit card has one. Stage 1 gives each unit
 * its size and shape in a single colour.
 */
export const UNIT_MODELS: Readonly<Record<string, UnitModel>> = { ...CONCORD, ...KAGERO, ...VERDANT, ...NEXUS, ...ASHEN, ...DAWNHOLD, ...HIVE };

/**
 * A unit's model for a look: its detailed model in the detailed look where it has one, and
 * otherwise its classic model. Undefined for a card without a model.
 */
export function unitModel(cardId: string, detailed: boolean): UnitModel | undefined {
  return (detailed ? DETAILED_MODELS[cardId] : undefined) ?? UNIT_MODELS[cardId];
}

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
export function baseGeometry(footprint: Footprint, high = false): { top: BufferGeometry; rim: BufferGeometry } {
  const parts = baseParts(footprint, high);
  return { top: geometry(parts.filter((p) => p.role === "base")), rim: geometry(parts.filter((p) => p.role === "rim")) };
}

/**
 * A figure as one mesh per paint, for a detailed model; a classic model's parts have no paint and
 * come back as one "coat" mesh in the model colour. The caller disposes of the geometries.
 */
export function paintedGeometry(model: FigureModel): { paint: Paint; geometry: BufferGeometry }[] {
  const byPaint = new Map<Paint, Part[]>();
  for (const part of model.parts) {
    const p = part.paint ?? "coat";
    const list = byPaint.get(p);
    if (list) list.push(part);
    else byPaint.set(p, [part]);
  }
  return [...byPaint].map(([paint, parts]) => ({ paint, geometry: geometry(parts) }));
}

/** The sharpest bend shaded smooth at high quality, in radians: gentler bends (round limbs, heads) look round. */
export const CREASE = (50 * Math.PI) / 180;

/**
 * A figure with the ground on its base (`ground.ts`), for high quality: the model's parts and its
 * faction's pieces, all in one model so they bake into one mesh. Kept, so each is made once.
 */
export function withGround(model: FigureModel, faction: string, footprint: Footprint, seed: number): FigureModel {
  let byKey = grounded.get(model);
  if (!byKey) grounded.set(model, (byKey = new Map()));
  const key = `${faction}|${footprint}|${seed}`;
  let found = byKey.get(key);
  if (!found) byKey.set(key, (found = { parts: [...model.parts, ...groundParts(faction, footprint, seed)] }));
  return found;
}
const grounded = new WeakMap<FigureModel, Map<string, FigureModel>>();

/** A figure that has acted this turn is drawn darker, as a spent token is drawn faded. */
export const SPENT_SHADE = "#30343a";

/** A figure's painted meshes: its solid parts, and the parts that glow (eyes, fire), if any. */
export interface BakedFigure {
  readonly solid: BufferGeometry;
  readonly glow: BufferGeometry | null;
}

/**
 * A figure as at most two meshes, its paints baked into vertex colours, so a detailed figure takes
 * no more draw calls than a classic one: the solid parts, and the glowing ones. `spent` darkens
 * it. At high quality (`high`) it keeps its high-only parts and is shaded smooth across gentle
 * bends (`CREASE`), so round parts look round while edges stay sharp; Low leaves those parts out
 * and keeps every face flat. The caller disposes of the geometries.
 */
export function bakedGeometry(model: FigureModel, context: PaintContext, spent = false, high = false): BakedFigure {
  const shade = new Color(SPENT_SHADE);
  const solid: number[] = [], solidColors: number[] = [], glow: number[] = [], glowColors: number[] = [];
  for (const part of model.parts) {
    if (part.high && !high) continue;
    const look = paintLook(part.paint ?? "coat", context);
    const c = new Color(look.color);
    if (spent) c.lerp(shade, 0.45);
    const [tris, colors] = look.glow ? [glow, glowColors] : [solid, solidColors];
    for (let i = 0; i < part.tris.length; i += 3) {
      tris.push(part.tris[i]!, part.tris[i + 1]!, part.tris[i + 2]!);
      colors.push(c.r, c.g, c.b);
    }
  }
  const make = (tris: number[], colors: number[]) => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(tris, 3));
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    if (!high) {
      g.computeVertexNormals();
      return g;
    }
    const smooth = toCreasedNormals(g, CREASE);
    if (smooth !== g) g.dispose();
    return smooth;
  };
  return { solid: make(solid, solidColors), glow: glow.length ? make(glow, glowColors) : null };
}
