import { HEX_SIZE, hexToWorld, type Board, type GameState, type RulesContext } from "@aoh/rules";
import type { TableUnit } from "./Table";
import { layoutTable, type Bounds, type TableLayout } from "./tableLayout";

/** The box round every hex of the board, in board coordinates. */
export function boardBounds(board: Board): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const half = (Math.sqrt(3) / 2) * HEX_SIZE;
  for (const h of board.hexes()) {
    const { x, z } = hexToWorld(h, HEX_SIZE);
    minX = Math.min(minX, x - half);
    maxX = Math.max(maxX, x + half);
    minZ = Math.min(minZ, z - HEX_SIZE);
    maxZ = Math.max(maxZ, z + HEX_SIZE);
  }
  return Number.isFinite(minX) ? { minX, maxX, minZ, maxZ } : { minX: -6, maxX: 6, minZ: -6, maxZ: 6 };
}

/**
 * The table for a game: each player's cards go on the side nearest the start
 * zone the map gave them. It depends only on who plays and which units they
 * drafted, so it stays put for the whole game.
 */
export function tableFor(state: GameState, ctx: RulesContext): TableLayout {
  const players = state.players.map((p) => {
    const zone = ctx.board.startZone(p.zone).map((h) => hexToWorld(h, HEX_SIZE));
    return {
      id: p.id,
      home: zone.length > 0 ? { x: zone.reduce((n, c) => n + c.x, 0) / zone.length, z: zone.reduce((n, c) => n + c.z, 0) / zone.length } : null,
      units: state.units.filter((u) => u.owner === p.id).map((u) => u.id),
    };
  });
  return layoutTable(boardBounds(ctx.board), players);
}

/** A key that changes only when `tableFor` would give a different table. */
export function tableKey(state: GameState): string {
  return state.players.map((p) => `${p.id}@${p.zone}:${state.units.filter((u) => u.owner === p.id).map((u) => u.id).join(",")}`).join("|");
}

/**
 * What lies on each unit's card: figures still to be deployed stand on it and
 * destroyed figures lie on it. `placing` lists figures being placed on the
 * board right now, which have left their card.
 */
export function tableUnits(state: GameState, ctx: RulesContext, colorOf: (player: string) => string, placing: ReadonlySet<string> = new Set()): TableUnit[] {
  return state.units.map((unit) => ({
    unitId: unit.id,
    card: ctx.cards.get(unit.cardId)!,
    color: colorOf(unit.owner),
    figures: unit.figures.length,
    waiting: unit.figures.flatMap((f, i) => (!f.destroyed && !f.position && !placing.has(f.id) ? [i] : [])),
    destroyed: unit.figures.flatMap((f, i) => (f.destroyed ? [i] : [])),
  }));
}
