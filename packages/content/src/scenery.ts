import { sceneryTable, type SceneryRules } from "@aoh/rules";

/** Scenery kinds. They block movement and line of sight; colours are placeholders until art exists. */
export const SCENERY: readonly SceneryRules[] = [
  { id: "tree", name: "Tree", height: 9, shape: "cylinder", radius: 0.55, color: "#2e7d32" },
  { id: "wall", name: "Ruined wall", height: 3, shape: "prism", color: "#9e968a" },
  { id: "boulder", name: "Boulder", height: 2, shape: "cylinder", radius: 0.7, color: "#7d776d" },
];

export const SCENERY_TABLE = sceneryTable(SCENERY);
