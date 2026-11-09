import { terrainTable, type TerrainRules } from "@aoh/rules";

/**
 * Terrain types and their rules. Colours are flat placeholders until art
 * exists. See docs/RULES.md for how each effect plays.
 */
export const TERRAIN: readonly TerrainRules[] = [
  // Standard terrain: no special rules.
  { id: "grass", name: "Grass", category: "standard", color: "#6aa84f" },
  { id: "sand", name: "Sand", category: "standard", color: "#e0c97f" },
  { id: "rock", name: "Rock", category: "standard", color: "#9b968e" },
  { id: "snow", name: "Snow", category: "standard", color: "#eef3f6" },
  { id: "forest", name: "Forest", category: "standard", color: "#2f6e3a" },

  // Special terrain.
  {
    id: "water",
    name: "Water",
    category: "special",
    color: "#3d80c8",
    stopGroup: "wet",
    moveCost: 2,
  },
  {
    id: "swamp",
    name: "Swamp",
    category: "special",
    color: "#6b6b3a",
    stopGroup: "wet",
    moveCost: 2,
    endTurnSelfAttack: { attackDice: 1, defenseDice: 0 },
  },
  {
    id: "lava",
    name: "Lava",
    category: "special",
    color: "#e4561e",
    entryDestroyOnOrBelow: 12,
  },
  {
    id: "road",
    name: "Road",
    category: "special",
    color: "#6b5440",
    stayOnBonusMove: 3,
  },
  {
    id: "ice",
    name: "Ice",
    category: "special",
    color: "#a8dcef",
    slip: { onOrBelow: 5, slideHexes: 1 },
  },
];

export const TERRAIN_TABLE = terrainTable(TERRAIN);
