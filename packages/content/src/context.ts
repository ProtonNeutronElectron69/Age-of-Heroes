import { Board, type MapDefinition, type MapIssue, type RulesContext } from "@aoh/rules";
import { CARD_CATALOG } from "./cards";
import { TERRAIN_TABLE } from "./terrain";

/** Everything the rules engine needs to play on a map with the bundled cards and terrain. */
export function contextFor(map: MapDefinition): { ctx: RulesContext; issues: MapIssue[] } {
  const { board, issues } = Board.fromMap(map, TERRAIN_TABLE);
  return { ctx: { cards: CARD_CATALOG, board, terrain: TERRAIN_TABLE }, issues };
}
