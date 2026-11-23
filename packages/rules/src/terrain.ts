import type { Footprint } from "./shapes";

/**
 * Terrain rules are data. The engine reads these fields; the actual table of
 * terrain types lives in @aoh/content so it can be tuned without code changes.
 */

export type TerrainCategory = "standard" | "special";

export interface TerrainRules {
  readonly id: string;
  readonly name: string;
  readonly category: TerrainCategory;
  /** Flat display colour used until real art exists. */
  readonly color: string;
  /** Movement points to move into a hex of this terrain (default 1). */
  readonly moveCost?: number;
  /**
   * Entering a hex of this group from a hex outside the group ends the
   * figure's movement (water and swamp share the "wet" group).
   */
  readonly stopGroup?: string;
  /** Ending a turn here makes the figure roll this attack against itself. */
  readonly endTurnSelfAttack?: { readonly attackDice: number; readonly defenseDice: number };
  /**
   * Games with `swampRoll: "d20"`: ending a turn here rolls a d20 instead; at or below
   * `woundOnOrBelow` the figure takes `wounds` wounds.
   */
  readonly endTurnRoll?: { readonly woundOnOrBelow: number; readonly wounds: number };
  /** Entering this hex triggers a d20 roll; at or below the value, destroyed. */
  readonly entryDestroyOnOrBelow?: number;
  /** Entering this hex triggers a d20 roll; at or below the value, the figure slips. */
  readonly slip?: { readonly onOrBelow: number; readonly slideHexes: number };
  /** Bonus move if the figure starts, moves and ends its turn on this terrain. */
  readonly stayOnBonusMove?: number;
}

export type TerrainTable = ReadonlyMap<string, TerrainRules>;

export function terrainTable(list: readonly TerrainRules[]): TerrainTable {
  const map = new Map<string, TerrainRules>();
  for (const t of list) {
    if (map.has(t.id)) throw new Error(`Duplicate terrain id: ${t.id}`);
    map.set(t.id, t);
  }
  return map;
}

export function moveCostOf(t: TerrainRules | undefined): number {
  return t?.moveCost ?? 1;
}

/**
 * Scenery stands on the terrain and fills one hex, or several (`footprint`): no figure can
 * enter or stand there, and it blocks line of sight.
 */
export interface SceneryRules {
  readonly id: string;
  readonly name: string;
  /** Height in levels. */
  readonly height: number;
  /** Shape used for line of sight in each hex it fills: a full hex prism (walls) or a cylinder (trees, boulders). */
  readonly shape: "prism" | "cylinder";
  /** Cylinder radius as a fraction of the hex size. */
  readonly radius?: number;
  /** Display colour. */
  readonly color: string;
  /** The hexes it fills when bigger than one, turned with the placement's rotation. */
  readonly footprint?: Footprint;
  /** Extra defense dice for a figure next to it against an attack from range across it (low walls). */
  readonly cover?: number;
  /**
   * Figures that walk can climb across it (low walls): entering one of its hexes costs this many
   * extra move points. No figure may end its move on it.
   */
  readonly climb?: number;
}

export type SceneryTable = ReadonlyMap<string, SceneryRules>;

export function sceneryTable(list: readonly SceneryRules[]): SceneryTable {
  const map = new Map<string, SceneryRules>();
  for (const s of list) {
    if (map.has(s.id)) throw new Error(`Duplicate scenery id: ${s.id}`);
    map.set(s.id, s);
  }
  return map;
}

/** Used when a map names scenery the table does not know. */
export const DEFAULT_SCENERY: SceneryRules = {
  id: "unknown",
  name: "Unknown scenery",
  height: 4,
  shape: "prism",
  color: "#777777",
};
