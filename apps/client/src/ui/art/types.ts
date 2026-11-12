/**
 * Unit drawings. Each figure is a list of flat shapes, back to front, in a box
 * 200 wide and 250 tall with the feet on y = 244. A shape's role says what it
 * is, so one drawing is painted from a palette and also serves as the hit zone
 * picture. A unit's drawing places one or more figures in a box of the same size.
 */

export type Role =
  | "hair"
  | "skin"
  | "bone"
  | "helmet"
  | "crest"
  | "jewel"
  | "glow"
  | "armor"
  | "plate"
  | "metal"
  | "cloth"
  | "cape"
  | "sash"
  | "wood"
  | "leather"
  | "blade"
  | "hilt"
  | "boot";

export interface Part {
  role: Role;
  /** The outline. */
  d: string;
  /** Lines drawn inside the shape: lacing, plate edges, folds. */
  lines?: string;
}

export interface Figure {
  parts: readonly Part[];
  /** Top of the head and soles of the feet. The hit band is measured between them. */
  top: number;
  bottom: number;
  /** Roles that are gear, not body: never part of the hit zone. */
  gear: readonly Role[];
  /** Colours for this figure in place of the palette's: a hair colour, a skin tone, a painted shield. */
  tint?: Partial<Record<Role, string>>;
}

/** Where a figure stands in a drawing: local (x, y) lands on (dx + scale * x, dy + scale * y). */
export interface Placed {
  figure: Figure;
  dx: number;
  dy: number;
  scale: number;
}

/**
 * A unit's drawing: its figures, back to front, arranged two ways. `tall` fits
 * the narrow art window of the Advanced side and the hit zone window; `wide`
 * spreads out across the Basic side. Both are laid out in the 200 by 250 box.
 */
export interface Drawing {
  tall: readonly Placed[];
  wide: readonly Placed[];
}
