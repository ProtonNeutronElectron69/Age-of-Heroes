import type { Paint } from "./paint";

/** A point or a size: x, y, z. */
export type V3 = readonly [number, number, number];

/**
 * What a part of a model is.
 * - `body`: the figure itself, with what it wears. It sets the figure's height
 *   and must fit its base.
 * - `gear`: what it holds (a sabre, a bow). Gear may reach over the base and
 *   above the figure's Height.
 * - `base`: the top of the base the figure stands on.
 * - `rim`: the bevelled edge of the base, which carries a colour.
 * - `stand`: a flight stand, the post that holds a flying figure over its base.
 * Later stages will add roles that pick colours, as the unit drawings do.
 */
export type Role = "body" | "gear" | "base" | "rim" | "stand";

/** One solid piece of a model: a closed, flat-faced shape. */
export interface Part {
  readonly role: Role;
  /** Triangles as x, y, z triples: 9 numbers each, wound counter-clockwise seen from outside. */
  readonly tris: readonly number[];
  /** What the part is painted as, on a detailed model (`paint.ts`). Classic models have none: one colour. */
  readonly paint?: Paint;
  /**
   * A fine detail drawn only at high graphics quality (the ground on a base, a faction's trim).
   * Low leaves it out, so Low draws the figures as they always were. It counts towards the
   * triangle budget, which is for High.
   */
  readonly high?: boolean;
}

/**
 * One figure, in world units: it stands on top of its base, over the middle
 * of it, and faces +z. Its left is +x. The base itself comes from the card's
 * footprint (`baseParts`).
 */
export interface FigureModel {
  readonly parts: readonly Part[];
}

/** The figures of a unit card. A hero has one; a squad's figures take the poses in turn. */
export interface UnitModel {
  readonly figures: readonly FigureModel[];
}
