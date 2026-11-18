import { sceneryTable, type SceneryRules } from "@aoh/rules";

/**
 * Scenery kinds. They block movement and line of sight. Most fill one hex or more; walls
 * `between` hexes stand on the edges between two rows of hexes and leave the hexes open.
 */
export const SCENERY: readonly SceneryRules[] = [
  { id: "tree", name: "Tree", height: 9, shape: "cylinder", radius: 0.55, color: "#2e7d32" },
  { id: "wall", name: "Ruined wall", height: 3, shape: "prism", color: "#9e968a" },
  { id: "boulder", name: "Boulder", height: 2, shape: "cylinder", radius: 0.7, color: "#7d776d" },
  // A tall conifer on a base of four hexes.
  { id: "large-tree", name: "Large tree", height: 12, shape: "cylinder", radius: 0.8, color: "#2f7a3b", footprint: "2x2" },
  // A broken castle wall three hexes long.
  { id: "large-wall", name: "Large wall", height: 7, shape: "prism", color: "#b8ad90", footprint: "3x1" },
  // A stretch of ruined wall standing between two rows of hexes.
  { id: "small-ruin", name: "Small ruined wall", height: 5, shape: "prism", color: "#b3a98d", between: 2 },
  // A low stone wall between two rows of hexes; figures behind it are harder to hit from range.
  { id: "low-wall", name: "Low wall", height: 3, shape: "prism", color: "#8f8b80", between: 3, cover: 1 },
];

export const SCENERY_TABLE = sceneryTable(SCENERY);
