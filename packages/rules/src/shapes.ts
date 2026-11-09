import { hex, hexAdd, hexRotate, type Hex } from "./hex";

/**
 * Shapes shared by map pieces and multi-hex figure footprints.
 * Cells are offsets from the shape's origin hex (always the first cell).
 */
export type ShapeId =
  | "single"
  | "double"
  | "line3"
  | "triangle3"
  | "rhombus4"
  | "flower7"
  | "slab24";

export interface ShapeDefinition {
  readonly id: ShapeId;
  readonly name: string;
  readonly cells: readonly Hex[];
}

function slab24(): Hex[] {
  // A 6 x 4 block with a zig-zag edge, so slabs tile into rectangles.
  const cells: Hex[] = [];
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 6; i++) cells.push(hex(i - Math.floor(r / 2), r));
  }
  return cells;
}

export const SHAPES: Readonly<Record<ShapeId, ShapeDefinition>> = {
  single: { id: "single", name: "1-hex", cells: [hex(0, 0)] },
  double: { id: "double", name: "2-hex", cells: [hex(0, 0), hex(1, 0)] },
  line3: { id: "line3", name: "3-hex line", cells: [hex(0, 0), hex(1, 0), hex(2, 0)] },
  triangle3: {
    id: "triangle3",
    name: "3-hex triangle",
    cells: [hex(0, 0), hex(1, 0), hex(0, 1)],
  },
  rhombus4: {
    id: "rhombus4",
    name: "2x2 (4-hex)",
    cells: [hex(0, 0), hex(1, 0), hex(0, 1), hex(1, 1)],
  },
  flower7: {
    id: "flower7",
    name: "7-hex",
    cells: [hex(0, 0), hex(1, 0), hex(1, -1), hex(0, -1), hex(-1, 0), hex(-1, 1), hex(0, 1)],
  },
  slab24: { id: "slab24", name: "24-hex", cells: slab24() },
};

export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[];

/** Place a shape: rotate its offsets by `rotation` x 60 degrees, then translate. */
export function shapeCells(shape: ShapeId, origin: Hex, rotation = 0): Hex[] {
  return SHAPES[shape].cells.map((c) => hexAdd(origin, hexRotate(c, rotation)));
}

/** Figure footprints, as printed on unit cards. */
export type Footprint = "1" | "2x1" | "3x1" | "2x2";

export const FOOTPRINT_SHAPES: Readonly<Record<Footprint, ShapeId>> = {
  "1": "single",
  "2x1": "double",
  "3x1": "line3",
  "2x2": "rhombus4",
};

export function footprintCells(footprint: Footprint, origin: Hex, rotation = 0): Hex[] {
  return shapeCells(FOOTPRINT_SHAPES[footprint], origin, rotation);
}
