/** A point or a size: x, y, z. */
export type V3 = readonly [number, number, number];

/**
 * What a part of a model is.
 * - `body`: the figure itself, with what it wears. It sets the figure's height
 *   and must fit its base.
 * - `gear`: what it holds (a sabre, a bow). Gear may reach over the base and
 *   above the figure's Height.
 * Later stages will add roles that pick colours, as the unit drawings do.
 */
export type Role = "body" | "gear";

/** One solid piece of a model: a closed, flat-faced shape. */
export interface Part {
  readonly role: Role;
  /** Triangles as x, y, z triples: 9 numbers each, wound counter-clockwise seen from outside. */
  readonly tris: readonly number[];
}

/**
 * One figure, in world units: it stands on y = 0 at the middle of its base
 * and faces +z. Its left is +x.
 */
export interface FigureModel {
  readonly parts: readonly Part[];
}

/** The figures of a unit card. A hero has one; a squad's figures take the poses in turn. */
export interface UnitModel {
  readonly figures: readonly FigureModel[];
}
