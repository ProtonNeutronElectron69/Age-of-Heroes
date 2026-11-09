import { Board, type MapDefinition, type MapIssue, type RulesContext } from "@aoh/rules";
import { CARD_CATALOG } from "./cards";
import { SCENERY_TABLE } from "./scenery";
import { TERRAIN_TABLE } from "./terrain";

/** Build and check a map with the bundled terrain and scenery. */
export function buildBoard(map: MapDefinition): { board: Board; issues: MapIssue[] } {
  return Board.fromMap(map, TERRAIN_TABLE, SCENERY_TABLE);
}

/** Everything the rules engine needs to play on a map with the bundled cards, terrain and scenery. */
export function contextFor(map: MapDefinition): { ctx: RulesContext; issues: MapIssue[] } {
  const { board, issues } = buildBoard(map);
  return { ctx: { cards: CARD_CATALOG, board, terrain: TERRAIN_TABLE }, issues };
}
