import { z } from "zod";

/** Limits shared across the engine. */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_LAYER = 40;

export const hexSchema = z.object({
  q: z.number().int(),
  r: z.number().int(),
});

export const shapeIdSchema = z.enum([
  "single",
  "double",
  "line3",
  "triangle3",
  "rhombus4",
  "flower7",
  "slab24",
]);

export const placedPieceSchema = z.object({
  id: z.string().min(1),
  shape: shapeIdSchema,
  terrain: z.string().min(1),
  origin: hexSchema,
  rotation: z.number().int().min(0).max(5),
  /** Layer 0 sits on the table; a figure on top of a layer-L piece stands at elevation L + 1. */
  layer: z.number().int().min(0).max(MAX_LAYER),
});

export const startZoneSchema = z.object({
  /** Seat index 0..5; seat order is also "to the left" turn order. */
  seat: z.number().int().min(0).max(MAX_PLAYERS - 1),
  hexes: z.array(hexSchema).min(1),
});

export const sceneryPlacementSchema = z.object({
  id: z.string().min(1),
  /** Scenery kind, e.g. "tree"; its size and look come from the scenery table. */
  kind: z.string().min(1),
  hex: hexSchema,
  /** Elevation of the surface it stands on. */
  elevation: z.number().int().min(1).max(MAX_LAYER + 1),
});

export const mapSchema = z.object({
  formatVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  pieces: z.array(placedPieceSchema).min(1),
  /** Trees, walls and other objects standing on the terrain. */
  scenery: z.array(sceneryPlacementSchema).default([]),
  startZones: z.array(startZoneSchema).max(MAX_PLAYERS),
  /**
   * Which start zone each player uses, by player count (e.g. "2": [0, 3] puts
   * two players in opposite corners). List zones clockwise so turn order goes
   * round the table. Player counts not listed use zones 0, 1, 2...
   */
  layouts: z.record(z.string(), z.array(z.number().int().min(0).max(MAX_PLAYERS - 1))).default({}),
});

export type PlacedPiece = z.infer<typeof placedPieceSchema>;
export type SceneryPlacement = z.infer<typeof sceneryPlacementSchema>;
export type StartZone = z.infer<typeof startZoneSchema>;
export type MapDefinition = z.infer<typeof mapSchema>;

export const unitTypeSchema = z.enum(["uniqueHero", "commonHero", "uniqueSquad", "commonSquad"]);
export type UnitType = z.infer<typeof unitTypeSchema>;

export const sizeSchema = z.enum(["small", "medium", "large", "huge"]);
export type SizeCategory = z.infer<typeof sizeSchema>;

export const footprintSchema = z.enum(["1", "2x1", "3x1", "2x2"]);

export const abilitySchema = z.object({
  /** Engine hook id; abilities are implemented in code and referenced here. */
  id: z.string().min(1),
  name: z.string().min(1),
  text: z.string().min(1),
});

const stat = z.number().int().min(0);

export const unitCardSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** 1 to 3 characters shown on the figure's token. */
    tokenLabel: z.string().min(1).max(3),
    faction: z.string().min(1),
    unitType: unitTypeSchema,
    /** 1 for heroes; the number of figures for squads. */
    figureCount: z.number().int().min(1).max(12),
    species: z.string().min(1),
    unitClass: z.string().min(1),
    personality: z.string().min(1),
    size: sizeSchema,
    height: z.number().int().min(1).max(30),
    footprint: footprintSchema,
    /** Front of the card: the Basic game. */
    basic: z.object({
      move: stat,
      range: z.number().int().min(1),
      attack: stat,
      defense: stat,
    }),
    /** Back of the card: the Advanced game. */
    advanced: z.object({
      life: z.number().int().min(1),
      move: stat,
      range: z.number().int().min(1),
      attack: stat,
      defense: stat,
      points: z.number().int().min(1),
      abilities: z.array(abilitySchema),
    }),
  })
  .superRefine((card, ctx) => {
    const isHero = card.unitType === "uniqueHero" || card.unitType === "commonHero";
    if (isHero && card.figureCount !== 1) {
      ctx.addIssue({ code: "custom", message: "Heroes must have exactly 1 figure", path: ["figureCount"] });
    }
    if (!isHero && card.figureCount < 2) {
      ctx.addIssue({ code: "custom", message: "Squads must have at least 2 figures", path: ["figureCount"] });
    }
  });

export type UnitCard = z.infer<typeof unitCardSchema>;
export type Ability = z.infer<typeof abilitySchema>;

export function isUnique(card: UnitCard): boolean {
  return card.unitType === "uniqueHero" || card.unitType === "uniqueSquad";
}

export function isSquad(card: UnitCard): boolean {
  return card.unitType === "uniqueSquad" || card.unitType === "commonSquad";
}
